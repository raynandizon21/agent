// In-memory copy of the OCR/vision API keys stored in the `bot_config` table
// (botConfigModel). Kept in its own tiny module, not telegramConfig.js, so
// googleVisionExtract.js / visionExtract.js can read it without an import
// cycle through telegram.js. Loaded on boot (telegram.js startTelegram) and
// replaced live on save from the Settings page (telegramConfig.js) — no
// restart needed. .env values are only a fallback when the DB row is empty.
const keys = {
  googleVision: '',
  anthropic: '',
};

export function setApiKeys({ googleVision, anthropic }) {
  if (googleVision !== undefined) keys.googleVision = googleVision || '';
  if (anthropic !== undefined) keys.anthropic = anthropic || '';
}

export function getGoogleVisionKey() {
  return keys.googleVision || process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
}

export function getAnthropicKey() {
  return keys.anthropic || process.env.ANTHROPIC_API_KEY || '';
}
