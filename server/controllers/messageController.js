import * as messageModel from '../models/messageModel.js';
import { bus, Events } from '../services/events.js';

export async function list(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const q = String(req.query.q || '').trim();
    const agentId = req.user?.agentId ?? null;
    const messages = await messageModel.list({ limit, q, agentId });
    return res.json({ messages });
  } catch (err) {
    console.error('messages error', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
}

// Dev/maintenance: wipe the message log (and derived settlements).
// Admin-only (route also gated by requireAdmin) — this is account-wide, not
// scoped to one agent, so a scoped login must never reach it.
export async function clear(_req, res) {
  try {
    await messageModel.deleteAll();
    bus.emit(Events.MESSAGE, { cleared: true });
    bus.emit(Events.SETTLEMENT, { cleared: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error('messages clear error', err);
    return res.status(500).json({ error: 'Failed to clear messages' });
  }
}
