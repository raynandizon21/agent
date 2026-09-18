import * as agentModel from '../models/agentModel.js';
import * as messageModel from '../models/messageModel.js';
import * as settlementModel from '../models/settlementModel.js';
import { bus, Events } from './events.js';
import { parseSettlement } from './settlementParse.js';

/**
 * Persist one inbound text message and, if it parses as a settlement report,
 * create / update / delete the matching `settlements` row, emitting the same
 * bus events the WebSocket layer fans out to the browser.
 *
 * Shared by both intake paths in server/services/telegram.js: direct Bot API
 * messages and Telegram Business messages.
 *
 * `text` must already be resolved (plain text or OCR result). Callers are
 * responsible for dropping bot commands and empty messages.
 */
export async function ingestMessage({
  text,
  chatId = null,
  userId = null,
  username = null,
  messageId = null,
}) {
  const body = String(text || '').trim();
  if (!body) return { saved: false, reason: 'empty' };

  const agentId = userId
    ? await agentModel.findActiveIdByTelegramId(userId)
    : null;

  const { id: logId, duplicate } = await messageModel.createIncoming({
    agentId,
    chatId,
    userId,
    username,
    text: body,
    messageId,
  });

  if (duplicate) {
    // Same Telegram (chat, message) already logged — e.g. a server restart
    // re-delivered an unconfirmed long-poll update. Don't re-run settlement
    // parsing or re-emit bus events for it.
    return { saved: false, reason: 'duplicate', messageId: logId, agentId };
  }

  bus.emit(Events.MESSAGE, { id: logId, agentId });

  let matched = false;
  try {
    const parsed = parseSettlement(body);
    if (parsed && parsed.step === 'delete') {
      await settlementModel.deleteGame(parsed);
      bus.emit(Events.SETTLEMENT, {
        messageId: logId,
        agentId,
        junket: parsed.junket,
        step: 'delete',
      });
      matched = true;
    } else if (parsed && parsed.step) {
      await settlementModel.upsertStep(parsed, {
        messageId: logId,
        agentId,
        raw_text: body,
      });
      bus.emit(Events.SETTLEMENT, {
        messageId: logId,
        agentId,
        junket: parsed.junket,
        step: parsed.step,
      });
      matched = true;
    } else if (parsed) {
      await settlementModel.create({
        ...parsed,
        messageId: logId,
        agentId,
        raw_text: body,
      });
      bus.emit(Events.SETTLEMENT, { messageId: logId, agentId, junket: parsed.junket });
      matched = true;
    }
  } catch (err) {
    console.error('[ingest] settlement parse/save failed', err.message || err);
  }

  return { saved: true, messageId: logId, agentId, matched };
}
