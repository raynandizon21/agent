import * as guestModel from '../models/guestModel.js';
import * as settlementModel from '../models/settlementModel.js';
import * as tripModel from '../models/tripModel.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function optionalText(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s.slice(0, max);
}

// Scoped agents only ever see/touch trips of guests they own; an admin login
// (agentId null) sees all — the same rule guestController applies to guests.
function canAccessGuest(req, guestAgentId) {
  const scopeAgentId = req.user?.agentId ?? null;
  return scopeAgentId == null || guestAgentId === scopeAgentId;
}

async function loadAuthorizedTrip(req, res) {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid id' });
    return null;
  }
  const trip = await tripModel.getById(id);
  if (!trip) {
    res.status(404).json({ error: 'Trip not found' });
    return null;
  }
  if (!canAccessGuest(req, trip.agent_id)) {
    res.status(403).json({ error: 'Not your guest' });
    return null;
  }
  return trip;
}

// Validates the registration form body. Returns { fields } or { error }.
async function cleanTripBody(req) {
  const b = req.body || {};
  const guestId = Number(b.guest_id);
  if (!guestId) return { error: 'guest_id required' };

  const ownerId = await guestModel.getAgentId(guestId);
  if (ownerId === undefined) return { error: 'Guest not found', status: 404 };
  if (!canAccessGuest(req, ownerId)) return { error: 'Not your guest', status: 403 };

  if (!DATE_RE.test(b.arrival_date || '')) return { error: 'arrival_date required (YYYY-MM-DD)' };
  if (!DATE_RE.test(b.departure_date || '')) return { error: 'departure_date required (YYYY-MM-DD)' };
  if (b.departure_date < b.arrival_date) return { error: 'Departure date is before arrival date' };

  return {
    fields: {
      guestId,
      arrivalDate: b.arrival_date,
      departureDate: b.departure_date,
      arrivalFlight: optionalText(b.arrival_flight, 32)?.toUpperCase() ?? null,
      departureFlight: optionalText(b.departure_flight, 32)?.toUpperCase() ?? null,
      hotel: optionalText(b.hotel, 120),
      roomNo: optionalText(b.room_no, 32),
      notes: optionalText(b.notes, 500),
    },
  };
}

export async function list(req, res) {
  try {
    const agentId = req.user?.agentId ?? null;
    const trips = await tripModel.listAll({ agentId });
    return res.json({ trips });
  } catch (err) {
    console.error('trips list error', err);
    return res.status(500).json({ error: 'Failed to load trips' });
  }
}

// Everything the trip detail screen needs in one round trip: the trip, the
// guest's linked junket accounts (with their display-only custom commission
// settings), the settlements for those accounts that fall inside the trip's
// dates, and the money exchanges logged for it.
export async function detail(req, res) {
  try {
    const trip = await loadAuthorizedTrip(req, res);
    if (!trip) return;

    const agentId = req.user?.agentId ?? null;
    const junkets = await guestModel.getJunketLinks(trip.guest_id);
    const all = await settlementModel.listByAccounts(junkets, { agentId });

    // Arrival 00:00 through the end of departure day, in the server's local
    // time — the same clock the settlements' DATETIME columns were written in.
    const start = new Date(`${trip.arrival_date}T00:00:00`);
    const end = new Date(`${trip.departure_date}T00:00:00`);
    end.setDate(end.getDate() + 1);

    // Games outside the trip window are returned too, flagged in_trip=false,
    // so the Casino tab can say "N games outside these dates" instead of a
    // bare empty state — the usual cause is dates registered wrong, or the
    // Guests page showing the message's received time (CREATED_AT) while
    // this uses the actual game time.
    const settlements = [];
    for (const s of all) {
      const when = s.game_start || s.settled_at || s.created_at;
      s.in_trip = !!when && when >= start && when < end;
      // Same shape as guestController.settlements(): RATE is the junket's
      // original rate; the custom Rolling %/Com % are applied display-only
      // on the client (src/lib/commission.js), never written anywhere.
      s.played_at = when;
      s.game_rate = s.rate;
      s.original_commission =
        s.rate != null && s.rolling != null ? Math.round((s.rate / 100) * s.rolling) : null;
      delete s.rate;
      delete s.raw_text;
      settlements.push(s);
    }

    const exchanges = await tripModel.listExchanges(trip.id);
    return res.json({ trip, junkets, settlements, exchanges });
  } catch (err) {
    console.error('trip detail error', err);
    return res.status(500).json({ error: 'Failed to load trip' });
  }
}

export async function create(req, res) {
  try {
    const cleaned = await cleanTripBody(req);
    if (cleaned.error) return res.status(cleaned.status || 400).json({ error: cleaned.error });

    const result = await tripModel.create({ ...cleaned.fields, encodedBy: req.user.username });
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('trips create error', err);
    return res.status(500).json({ error: 'Failed to register trip' });
  }
}

export async function update(req, res) {
  try {
    const trip = await loadAuthorizedTrip(req, res);
    if (!trip) return;

    const cleaned = await cleanTripBody(req);
    if (cleaned.error) return res.status(cleaned.status || 400).json({ error: cleaned.error });

    await tripModel.update(trip.id, { ...cleaned.fields, editedBy: req.user.username });
    return res.json({ ok: true });
  } catch (err) {
    console.error('trips update error', err);
    return res.status(500).json({ error: 'Failed to update trip' });
  }
}

export async function remove(req, res) {
  try {
    const trip = await loadAuthorizedTrip(req, res);
    if (!trip) return;

    await tripModel.remove(trip.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('trips delete error', err);
    return res.status(500).json({ error: 'Failed to delete trip' });
  }
}

export async function addExchange(req, res) {
  try {
    const trip = await loadAuthorizedTrip(req, res);
    if (!trip) return;

    const b = req.body || {};
    const fromCurrency = String(b.from_currency || '').trim().toUpperCase();
    const toCurrency = String(b.to_currency || '').trim().toUpperCase();
    const fromAmount = Number(b.from_amount);
    const toAmount = Number(b.to_amount);
    const rate = b.rate == null || b.rate === '' ? null : Number(b.rate);

    if (!DATETIME_RE.test(b.exchange_dt || '')) {
      return res.status(400).json({ error: 'exchange_dt required (YYYY-MM-DDTHH:mm)' });
    }
    if (!CURRENCY_RE.test(fromCurrency) || !CURRENCY_RE.test(toCurrency)) {
      return res.status(400).json({ error: 'Currencies must be 3-letter codes' });
    }
    if (fromCurrency === toCurrency) {
      return res.status(400).json({ error: 'From and To currency are the same' });
    }
    if (!(fromAmount > 0) || !(toAmount > 0)) {
      return res.status(400).json({ error: 'Amounts must be greater than 0' });
    }
    if (rate != null && !(rate > 0)) {
      return res.status(400).json({ error: 'Rate must be greater than 0' });
    }

    const result = await tripModel.createExchange({
      tripId: trip.id,
      exchangeDt: `${b.exchange_dt.replace('T', ' ')}:00`,
      fromCurrency,
      fromAmount,
      toCurrency,
      toAmount,
      rate,
      notes: optionalText(b.notes, 255),
      encodedBy: req.user.username,
    });
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('trip exchange create error', err);
    return res.status(500).json({ error: 'Failed to save exchange' });
  }
}

export async function removeExchange(req, res) {
  try {
    const trip = await loadAuthorizedTrip(req, res);
    if (!trip) return;

    const exchangeId = Number(req.params.exchangeId);
    if (!exchangeId) return res.status(400).json({ error: 'invalid exchange id' });

    await tripModel.removeExchange(trip.id, exchangeId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('trip exchange delete error', err);
    return res.status(500).json({ error: 'Failed to delete exchange' });
  }
}
