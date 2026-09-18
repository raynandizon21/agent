import { readTelegramConfig, writeTelegramConfig } from '../services/telegramConfig.js';

export async function getConfig(_req, res) {
  try {
    return res.json(await readTelegramConfig());
  } catch (err) {
    console.error('telegram config read error', err);
    return res.status(500).json({ error: 'Failed to read Telegram config' });
  }
}

export async function updateConfig(req, res) {
  const tokenStr = String(req.body?.token ?? '').trim();
  if (!tokenStr) return res.status(400).json({ error: 'Bot token is required' });

  try {
    await writeTelegramConfig({ token: tokenStr });
    // Applied live in writeTelegramConfig() (setBotToken) — no restart needed.
    return res.json({ ok: true, applied: true });
  } catch (err) {
    console.error('telegram config write error', err);
    return res.status(500).json({ error: 'Failed to update Telegram config' });
  }
}
