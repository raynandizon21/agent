import * as settlementModel from '../models/settlementModel.js';
import { bus, Events } from '../services/events.js';

export async function list(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const q = String(req.query.q || '').trim();
    const junket = String(req.query.junket || '').trim().toLowerCase();
    const settlements = await settlementModel.list({ limit, q, junket });
    return res.json({ settlements });
  } catch (err) {
    console.error('settlements error', err);
    return res.status(500).json({ error: 'Failed to load settlements' });
  }
}

// Dev/maintenance: wipe settlements AND the message log.
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
