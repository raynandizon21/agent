import { createWorker } from 'tesseract.js';
import { config } from '../db.js';
import * as agentModel from '../models/agentModel.js';
import * as messageModel from '../models/messageModel.js';
import * as settlementModel from '../models/settlementModel.js';
import { bus, Events } from './events.js';
import { parseSettlement } from './settlementParse.js';

const API = `https://api.telegram.org/bot${config.telegramBotToken}`;
const FILE_API = `https://api.telegram.org/file/bot${config.telegramBotToken}`;

let offset = 0;
let running = false;
let ocrWorker = null;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

function isBotCommand(text) {
  // Skip Telegram commands: /start, /help, /start@BotName, etc.
  return /^\//.test(text.trim());
}

function isStartCommand(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(String(text || '').trim());
}

function agentDisplayName(from) {
  const full = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (from?.username) return from.username;
  return `tg_${from?.id ?? 'unknown'}`;
}

async function ensureAgentFromStart(from) {
  if (!from?.id) return null;

  const existingId = await agentModel.findIdByTelegramId(from.id);
  if (existingId) return { id: existingId, created: false };

  try {
    const result = await agentModel.create(agentDisplayName(from), from.id);
    return { id: result.insertId, created: true };
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      const id = await agentModel.findIdByTelegramId(from.id);
      return { id, created: false };
    }
    throw err;
  }
}

async function handleStartCommand(msg) {
  const chatId = msg.chat?.id;
  const from = msg.from;
  if (!chatId || !from?.id) return;

  const agent = await ensureAgentFromStart(from);
  const name = agentDisplayName(from);

  if (agent?.created) {
    console.log(`[telegram] agent created from /start: ${name} (${from.id})`);
    await tg('sendMessage', {
      chat_id: chatId,
      text: `Registered as agent: ${name}`,
    });
  } else {
    console.log(`[telegram] /start existing agent: ${name} (${from.id})`);
    await tg('sendMessage', {
      chat_id: chatId,
      text: `Welcome back, ${name}.`,
    });
  }
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  // eng + kor for reports like END GAME (English labels + Korean)
  ocrWorker = await createWorker('eng+kor');
  console.log('[telegram] OCR worker ready (eng+kor)');
  return ocrWorker;
}

async function downloadTelegramFile(fileId) {
  const file = await tg('getFile', { file_id: fileId });
  if (!file.file_path) {
    throw new Error('Telegram file_path missing');
  }
  const res = await fetch(`${FILE_API}/${file.file_path}`);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function ocrPhoto(msg) {
  const photos = msg.photo;
  if (!Array.isArray(photos) || photos.length === 0) return '';

  // Largest size is last in Telegram's photo array
  const best = photos[photos.length - 1];
  const buffer = await downloadTelegramFile(best.file_id);
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer);
  return (data.text || '').trim();
}

async function resolveMessageText(msg) {
  const captionOrText = (msg.text || msg.caption || '').trim();
  let ocrText = '';

  if (msg.photo?.length) {
    try {
      console.log('[telegram] OCR starting…');
      ocrText = await ocrPhoto(msg);
      console.log(`[telegram] OCR done (${ocrText.length} chars)`);
    } catch (err) {
      console.error('[telegram] OCR failed', err.message || err);
      ocrText = '[OCR failed]';
    }
  }

  if (captionOrText && ocrText) {
    return `${captionOrText}\n\n--- OCR ---\n${ocrText}`;
  }
  return captionOrText || ocrText;
}

async function saveIncomingMessage(msg) {
  const rawText = (msg.text || msg.caption || '').trim();

  // /start or Restart → auto-register agent (do not log as message)
  if (!msg.photo?.length && isStartCommand(rawText)) {
    try {
      await handleStartCommand(msg);
    } catch (err) {
      console.error('[telegram] /start handler failed', err.message || err);
    }
    return;
  }

  const text = await resolveMessageText(msg);
  if (!text.trim()) return;
  // Only skip pure command messages (not photo OCR results)
  if (!msg.photo?.length && isBotCommand(text)) return;

  const chatId = msg.chat?.id;
  const userId = msg.from?.id ?? null;
  const username = msg.from?.username ?? null;
  const agentId = userId
    ? await agentModel.findActiveIdByTelegramId(userId)
    : null;

  const messageId = await messageModel.createIncoming({
    agentId,
    chatId,
    userId,
    username,
    text,
    messageId: msg.message_id ?? null,
  });

  console.log(
    `[telegram] saved from ${username || userId} chat=${chatId} agent=${agentId ?? 'unmatched'}`
  );

  bus.emit(Events.MESSAGE, { id: messageId, agentId });

  try {
    const parsed = parseSettlement(text);
    if (parsed && parsed.junket === 'democage') {
      // Step-by-step game: merge into the open row for this account+game#.
      await settlementModel.upsertStep(parsed, { messageId, agentId, raw_text: text });
      console.log(
        `[telegram] democage ${parsed.step} account=${parsed.account_no} game=${parsed.game_no}`
      );
      bus.emit(Events.SETTLEMENT, { messageId, agentId, junket: parsed.junket, step: parsed.step });
    } else if (parsed) {
      await settlementModel.create({
        ...parsed,
        messageId,
        agentId,
        raw_text: text,
      });
      console.log(
        `[telegram] settlement ${parsed.junket} account=${parsed.account_no || '?'}`
      );
      bus.emit(Events.SETTLEMENT, { messageId, agentId, junket: parsed.junket });
    }
  } catch (err) {
    console.error('[telegram] settlement parse/save failed', err.message || err);
  }
}

async function processUpdate(update) {
  if (update?.message) {
    try {
      await saveIncomingMessage(update.message);
    } catch (err) {
      console.error('[telegram] save failed', err);
    }
  }
}

async function pollOnce() {
  const updates = await tg('getUpdates', {
    offset,
    timeout: 25,
    allowed_updates: ['message'],
  });

  for (const update of updates) {
    offset = update.update_id + 1;
    await processUpdate(update);
  }
}

function warmOcr() {
  getOcrWorker().catch((err) => {
    console.error('[telegram] OCR init failed', err.message || err);
  });
}

function startLongPolling() {
  console.log('[telegram] long polling started');
  const loop = async () => {
    while (running) {
      try {
        await pollOnce();
      } catch (err) {
        console.error('[telegram] poll error', err.message || err);
        await new Promise((r) => setTimeout(r, config.telegramPollMs));
      }
    }
  };
  loop();
}

async function startWebhookMode() {
  const url = `${config.telegramWebhookUrl}/api/telegram/webhook`;
  await tg('setWebhook', {
    url,
    secret_token: config.telegramWebhookSecret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  console.log(`[telegram] webhook registered -> ${url}`);
}

// Express handler for POST /api/telegram/webhook. Telegram signs each request
// with the secret token we passed to setWebhook.
export async function telegramWebhookHandler(req, res) {
  if (
    req.get('x-telegram-bot-api-secret-token') !== config.telegramWebhookSecret
  ) {
    return res.sendStatus(401);
  }
  // Ack immediately; process asynchronously so Telegram never retries on slow OCR.
  res.sendStatus(200);
  processUpdate(req.body).catch((err) =>
    console.error('[telegram] webhook processing failed', err)
  );
}

export function startTelegram() {
  if (running) return;
  running = true;

  warmOcr(); // warm OCR in background so first photo is faster

  if (config.telegramWebhookUrl) {
    startWebhookMode().catch((err) => {
      console.error('[telegram] webhook setup failed, falling back to polling', err.message || err);
      tg('deleteWebhook', {}).catch(() => {});
      startLongPolling();
    });
  } else {
    // Ensure no stale webhook blocks getUpdates, then poll.
    tg('deleteWebhook', {})
      .catch(() => {})
      .finally(startLongPolling);
  }
}

// Backwards-compatible alias.
export const startTelegramPolling = startTelegram;
