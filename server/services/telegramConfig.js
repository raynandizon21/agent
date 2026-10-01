import * as botConfigModel from '../models/botConfigModel.js';
import { setApiKeys } from './apiKeys.js';
import { setBotToken } from './telegram.js';

// File maintenance for the bot token and the OCR/vision API keys, backed by
// the `bot_config` DB table (server/models/botConfigModel.js) — not .env.
// Writing here also applies the change live (setBotToken / setApiKeys), so
// it takes effect immediately with no server restart.
export async function readTelegramConfig() {
  const row = await botConfigModel.get();
  return {
    token: row?.bot_token || '',
    googleVisionKey: row?.google_vision_api_key || '',
    anthropicKey: row?.anthropic_api_key || '',
  };
}

export async function writeTelegramConfig({ token, googleVisionKey, anthropicKey }) {
  await botConfigModel.update({ botToken: token || null, googleVisionKey, anthropicKey });
  setBotToken(token);
  setApiKeys({ googleVision: googleVisionKey, anthropic: anthropicKey });
}
