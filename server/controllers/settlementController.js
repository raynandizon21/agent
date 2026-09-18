import * as settlementModel from '../models/settlementModel.js';
import { bus, Events } from '../services/events.js';

export async function list(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const q = String(req.query.q || '').trim();
    const junket = String(req.query.junket || '').trim().toLowerCase();
    const agentId = req.user?.agentId ?? null;
    const settlements = await settlementModel.list({ limit, q, junket, agentId });
    return res.json({ settlements });
  } catch (err) {
    console.error('settlements error', err);
    return res.status(500).json({ error: 'Failed to load settlements' });
  }
}

// Distinct real accounts for one junket — powers the Guests page's
// junket-to-account picker. A scoped agent only sees accounts from their own
// settlements; an admin sees every agent's.
export async function accounts(req, res) {
  try {
    const junket = String(req.query.junket || '').trim().toLowerCase();
    if (!junket) return res.status(400).json({ error: 'junket required' });
    const agentId = req.user?.agentId ?? null;
    const accounts = await settlementModel.listAccounts({ junket, agentId });
    return res.json({ accounts });
  } catch (err) {
    console.error('settlements accounts error', err);
    return res.status(500).json({ error: 'Failed to load accounts' });
  }
}

// Dev/maintenance: wipe settlements AND the message log.
// Admin-only (route also gated by requireAdmin) — account-wide, not scoped
// to one agent, so a scoped login must never reach it.
export async function clear(_req, res) {
  try {
    await settlementModel.deleteAll();
    bus.emit(Events.SETTLEMENT, { cleared: true });
    bus.emit(Events.MESSAGE, { cleared: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error('settlements clear error', err);
    return res.status(500).json({ error: 'Failed to clear settlements' });
  }
}
