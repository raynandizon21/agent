import * as botConfigModel from '../models/botConfigModel.js';
import { setBotToken } from './telegram.js';

// File maintenance for the bot token, backed by the `bot_config` DB table
// (server/models/botConfigModel.js) — not .env. Writing here also applies
// the change live to the running poller (setBotToken), so it takes effect
// immediately with no server restart.
export async function readTelegramConfig() {
  const row = await botConfigModel.get();
  return { token: row?.bot_token || '' };
}

export async function writeTelegramConfig({ token }) {
  await botConfigModel.update({ botToken: token || null });
  setBotToken(token);
}
