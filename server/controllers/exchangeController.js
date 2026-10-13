import * as guestModel from '../models/guestModel.js';
import * as tripModel from '../models/tripModel.js';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

// Validates an exchange form body. Returns { fields } or { error }. Shared
// by the guest-level endpoints below and the trip detail's /trips/:id ones.
export function parseExchange(b = {}) {
  const fromCurrency = String(b.from_currency || '').trim().toUpperCase();
  const toCurrency = String(b.to_currency || '').trim().toUpperCase();
  const fromAmount = Number(b.from_amount);
  const toAmount = Number(b.to_amount);
  const rate = b.rate == null || b.rate === '' ? null : Number(b.rate);

  if (!DATETIME_RE.test(b.exchange_dt || '')) return { error: 'exchange_dt required (YYYY-MM-DDTHH:mm)' };
  if (!CURRENCY_RE.test(fromCurrency) || !CURRENCY_RE.test(toCurrency)) return { error: 'Currencies must be 3-letter codes' };
  if (fromCurrency === toCurrency) return { error: 'From and To currency are the same' };
  if (!(fromAmount > 0) || !(toAmount > 0)) return { error: 'Amounts must be greater than 0' };
  if (rate != null && !(rate > 0)) return { error: 'Rate must be greater than 0' };

  const notes = b.notes == null ? null : String(b.notes).trim().slice(0, 255) || null;
  return {
    fields: {
      exchangeDt: `${b.exchange_dt.replace('T', ' ')}:00`,
      fromCurrency,
      fromAmount,
      toCurrency,
      toAmount,
      rate,
      notes,
    },
  };
}

// Same scoping as guests/trips: a scoped agent only touches its own guests.
async function authorizedGuestId(req, res) {
  const guestId = Number(req.params.id);
  if (!guestId) {
    res.status(400).json({ error: 'invalid id' });
    return null;
  }
  const ownerId = await guestModel.getAgentId(guestId);
  if (ownerId === undefined) {
    res.status(404).json({ error: 'Guest not found' });
    return null;
  }
  const scope = req.user?.agentId ?? null;
  if (scope != null && ownerId !== scope) {
    res.status(403).json({ error: 'Not your guest' });
    return null;
  }
  return guestId;
}

export async function list(req, res) {
  try {
    const guestId = await authorizedGuestId(req, res);
    if (!guestId) return;
    return res.json({ exchanges: await tripModel.listGuestExchanges(guestId) });
  } catch (err) {
    console.error('guest exchanges list error', err);
    return res.status(500).json({ error: 'Failed to load exchanges' });
  }
}

// Logged any time; tagged with the guest's trip on that date when there is one.
export async function create(req, res) {
  try {
    const guestId = await authorizedGuestId(req, res);
    if (!guestId) return;
    const parsed = parseExchange(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const tripId = await tripModel.findTripOn(guestId, req.body.exchange_dt.slice(0, 10));
    const result = await tripModel.createExchange({
      ...parsed.fields,
      guestId,
      tripId,
      encodedBy: req.user.username,
    });
    return res.status(201).json({ id: result.insertId, trip_id: tripId });
  } catch (err) {
    console.error('guest exchange create error', err);
    return res.status(500).json({ error: 'Failed to save exchange' });
  }
}

// Edit keeps the original timestamp unless the body sends a new one.
export async function update(req, res) {
  try {
    const guestId = await authorizedGuestId(req, res);
    if (!guestId) return;
    const exchangeId = Number(req.params.exchangeId);
    if (!exchangeId) return res.status(400).json({ error: 'invalid exchange id' });
    const parsed = parseExchange(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const tripId = await tripModel.findTripOn(guestId, req.body.exchange_dt.slice(0, 10));
    const result = await tripModel.updateGuestExchange(guestId, exchangeId, { ...parsed.fields, tripId });
    if (!result.affectedRows) return res.status(404).json({ error: 'Exchange not found' });
    return res.json({ ok: true, trip_id: tripId });
  } catch (err) {
    console.error('guest exchange update error', err);
    return res.status(500).json({ error: 'Failed to update exchange' });
  }
}

export async function remove(req, res) {
  try {
    const guestId = await authorizedGuestId(req, res);
    if (!guestId) return;
    const exchangeId = Number(req.params.exchangeId);
    if (!exchangeId) return res.status(400).json({ error: 'invalid exchange id' });
    await tripModel.removeGuestExchange(guestId, exchangeId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('guest exchange delete error', err);
    return res.status(500).json({ error: 'Failed to delete exchange' });
  }
}
