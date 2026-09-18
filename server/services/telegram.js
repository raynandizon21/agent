import { createWorker } from 'tesseract.js';
import { config } from '../db.js';
import * as agentModel from '../models/agentModel.js';
import * as botConfigModel from '../models/botConfigModel.js';
import * as userModel from '../models/userModel.js';
import { ingestMessage } from './ingest.js';

// Mutable — the bot token lives in the `bot_config` DB table
// (server/models/botConfigModel.js), not .env, so the Telegram API admin
// page can change it and have it take effect immediately, no server
// restart needed. Seeded from that table in startTelegram(); a later save
// calls setBotToken() below directly.
let botToken = config.telegramBotToken || '';

// Delay before retrying after a failed getUpdates call (network blip,
// Telegram hiccup, etc). Not configurable — nobody ever needed it to be,
// it was just an unused knob sitting in the database.
const POLL_RETRY_MS = 2000;

function apiBase() {
  return `https://api.telegram.org/bot${botToken}`;
}
function fileApiBase() {
  return `https://api.telegram.org/file/bot${botToken}`;
}

export function setBotToken(token) {
  botToken = token || '';
  console.log('[telegram] bot token updated — applied live, no restart needed');
}

let offset = 0;
let running = false;
let ocrWorker = null;

// business_connection_id -> { id, username } of the owner (the Premium
// account that connected this bot under Settings > Telegram Business >
// Chatbots). Used to (a) tell "the account owner sent this from their phone"
// apart from "someone sent this to the owner's business chat" — both arrive
// as business_message — and (b) attribute business-sourced reports to the
// owner's own agent record rather than the external sender (see
// saveIncomingBusinessMessage).
const businessOwnerCache = new Map();

async function tg(method, body) {
  const res = await fetch(`${apiBase()}/${method}`, {
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

    // Auto-provision a dashboard login scoped to just this agent's own
    // data — the agent's real Telegram @username when they have one,
    // falling back to agent_<telegram_id> otherwise (see ensureLoginForAgent).
    let loginLine = '';
    try {
      const login = await userModel.ensureLoginForAgent({
        agentId: agent.id,
        telegramUsername: from.username ?? null,
        telegramId: from.id,
      });
      if (login) {
        loginLine = `\n\nDashboard login — username: ${login.username}, password: ${login.password} (please change it after logging in).`;
      }
    } catch (err) {
      console.error('[telegram] auto-create login failed', err.message || err);
    }

    await tg('sendMessage', {
      chat_id: chatId,
      text: `Registered as agent: ${name}${loginLine}`,
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
  const res = await fetch(`${fileApiBase()}/${file.file_path}`);
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

// Resolve (and cache) the Business account owner ({ id, username }) for a
// given connection. Populated eagerly from `business_connection` updates;
// falls back to an API call so a bot restart doesn't lose the mapping.
async function getBusinessOwner(connectionId) {
  if (businessOwnerCache.has(connectionId)) return businessOwnerCache.get(connectionId);
  try {
    const conn = await tg('getBusinessConnection', { business_connection_id: connectionId });
    const owner = conn?.user?.id ? { id: conn.user.id, username: conn.user.username ?? null } : null;
    businessOwnerCache.set(connectionId, owner);
    return owner;
  } catch (err) {
    console.error('[telegram] getBusinessConnection failed', err.message || err);
    return null;
  }
}

function handleBusinessConnection(conn) {
  if (!conn?.id || !conn?.user?.id) return;
  businessOwnerCache.set(conn.id, { id: conn.user.id, username: conn.user.username ?? null });
  console.log(
    `[telegram] business connection ${conn.is_enabled ? 'enabled' : 'disabled'} ` +
      `(owner=${conn.user.id}, id=${conn.id})`
  );
}

// A message delivered via a Telegram Business connection (Settings > Telegram
// Business > Chatbots) — reaches the bot with just the bot token, no
// api_id/api_hash/2FA. Covers 1:1 chats with real users only; Telegram never
// delivers a bot-sent message this way.
//
// Attribution: the report is logged under the *connection owner's* own agent
// record (whoever connected the bot to their personal Telegram), not the
// external sender — this is "whatever lands in <owner>'s personal inbox",
// tracked as that owner's own data, same as messages they'd send the bot
// directly. The external sender's id/username aren't a registered agent
// concept in this system.
async function saveIncomingBusinessMessage(msg) {
  const connectionId = msg.business_connection_id;
  const owner = connectionId ? await getBusinessOwner(connectionId) : null;

  // Messages the account owner sends themselves (from their own phone) are
  // also relayed here for UI parity — skip them, we only want inbound data.
  if (owner && msg.from?.id === owner.id) return;

  const text = await resolveMessageText(msg);
  if (!text.trim()) return;
  if (!msg.photo?.length && isBotCommand(text)) return;

  const chatId = msg.chat?.id ?? null;
  const userId = owner?.id ?? null;
  const username = owner?.username ?? null;

  const result = await ingestMessage({
    text,
    chatId,
    userId,
    username,
    messageId: msg.message_id ?? null,
  });

  console.log(
    `[telegram] (business) saved for owner ${username || userId} chat=${chatId} ` +
      `agent=${result.agentId ?? 'unmatched'}${result.matched ? ' (settlement)' : ''}`
  );
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

  const chatId = msg.chat?.id ?? null;
  const userId = msg.from?.id ?? null;
  const username = msg.from?.username ?? null;

  const result = await ingestMessage({
    text,
    chatId,
    userId,
    username,
    messageId: msg.message_id ?? null,
  });

  console.log(
    `[telegram] saved from ${username || userId} chat=${chatId} ` +
      `agent=${result.agentId ?? 'unmatched'}${result.matched ? ' (settlement)' : ''}`
  );
}

async function processUpdate(update) {
  if (update?.message) {
    try {
      await saveIncomingMessage(update.message);
    } catch (err) {
      console.error('[telegram] save failed', err);
    }
  } else if (update?.business_message) {
    try {
      await saveIncomingBusinessMessage(update.business_message);
    } catch (err) {
      console.error('[telegram] business save failed', err);
    }
  } else if (update?.business_connection) {
    handleBusinessConnection(update.business_connection);
  }
}

async function pollOnce() {
  const updates = await tg('getUpdates', {
    offset,
    timeout: 25,
    allowed_updates: ['message', 'business_connection', 'business_message'],
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
        await new Promise((r) => setTimeout(r, POLL_RETRY_MS));
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
    allowed_updates: ['message', 'business_connection', 'business_message'],
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

export async function startTelegram() {
  if (running) return;
  running = true;

  // Load the current token from bot_config — the .env value above is only
  // the first-boot seed (see botConfigModel.ensureTable); this DB row is
  // the real source of truth from here on.
  try {
    const row = await botConfigModel.get();
    if (row?.bot_token) botToken = row.bot_token;
  } catch (err) {
    console.error('[telegram] failed to load bot_config, using .env fallback', err.message || err);
  }

  if (!botToken) {
    console.error(
      '[telegram] no bot token configured (bot_config table is empty and ' +
        'TELEGRAM_BOT_TOKEN is unset) — set one on the Telegram API admin page.'
    );
    running = false;
    return;
  }

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
