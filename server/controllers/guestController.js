import * as guestModel from '../models/guestModel.js';
import * as settlementModel from '../models/settlementModel.js';
import { bus, Events } from '../services/events.js';
import { parseSettlement } from '../services/settlementParse.js';

const KNOWN_JUNKETS = ['win9', 'galaxy', 'democage', 'infinity'];

// value is [{ junket, account_no, commission_rate }, ...] from the client.
// commission_rate is a percentage (e.g. 1.43 for 1.43%), clamped to a sane
// 0–100 range — bad input is dropped (left null) rather than rejecting the
// whole save.
function cleanJunkets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const junket = item?.junket;
    if (!KNOWN_JUNKETS.includes(junket) || seen.has(junket)) continue;
    seen.add(junket);
    const accountNo =
      item.account_no == null || item.account_no === '' ? null : String(item.account_no).trim();
    const rateNum = item.commission_rate == null || item.commission_rate === '' ? NaN : Number(item.commission_rate);
    const commissionRate = Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100 ? rateNum : null;
    out.push({ junket, account_no: accountNo, commission_rate: commissionRate });
  }
  return out;
}

// For every linked junket that has both an account and a commission rate,
// recompute COMMISSION on all of that account's existing settlement rows —
// "auto recomputation" when the guest form is saved. Emits one realtime
// SETTLEMENT event afterward so any open Settlements tab refreshes.
async function recomputeForJunkets(junkets) {
  let touched = 0;
  for (const j of junkets) {
    if (!j.account_no || j.commission_rate == null) continue;
    touched += await settlementModel.recomputeCommission({
      junket: j.junket,
      account_no: j.account_no,
      rate: j.commission_rate,
    });
  }
  if (touched > 0) bus.emit(Events.SETTLEMENT, { recomputed: true });
}

// Scoped agents only ever see/touch their own guests; an admin login
// (agentId null) sees and can manage all — same convention as settlements.
async function authorizeGuestAccess(req, id) {
  const scopeAgentId = req.user?.agentId ?? null;
  if (scopeAgentId == null) return { ok: true };

  const ownerId = await guestModel.getAgentId(id);
  if (ownerId === undefined) return { ok: false, status: 404, error: 'Guest not found' };
  if (ownerId !== scopeAgentId) return { ok: false, status: 403, error: 'Not your guest' };
  return { ok: true };
}

export async function list(req, res) {
  try {
    const agentId = req.user?.agentId ?? null;
    const guests = await guestModel.listAll({ agentId });
    return res.json({ guests });
  } catch (err) {
    console.error('guests list error', err);
    return res.status(500).json({ error: 'Failed to load guests' });
  }
}

// The guest's linked junket accounts plus their settlement/game history for
// those accounts — powers the Guests page's row-click detail view.
export async function settlements(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const authz = await authorizeGuestAccess(req, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const agentId = req.user?.agentId ?? null;
    const junkets = await guestModel.getJunketLinks(id);
    const settlements = await settlementModel.listByAccounts(junkets, { agentId });

    // COMMISSION gets overwritten in place whenever a custom commission_rate
    // is saved for a linked account (see recomputeForJunkets below), so the
    // rate the junket itself originally applied isn't stored anywhere. Best
    // we can do is re-derive it from the raw settlement message. Junket
    // commission is rolling-based (a % of turnover), not buy-in-based —
    // verified against Infinity Cage's own account panel, where the same
    // commission/rolling ratio matches its displayed RATE exactly.
    for (const s of settlements) {
      // parseSettlement's return shape isn't consistent across junkets —
      // Infinity/Win9/DemoCage nest values under `.fields`, Galaxy returns
      // them flat — so check both.
      const original = parseSettlement(s.raw_text);
      const originalFields = original ? original.fields ?? original : null;
      const originalCommission = originalFields?.commission ?? null;
      const originalRolling = originalFields?.rolling ?? s.rolling ?? null;
      s.original_commission = originalCommission;
      s.game_rate =
        originalCommission != null && originalRolling ? (originalCommission / originalRolling) * 100 : null;
      delete s.raw_text;
    }

    return res.json({ junkets, settlements });
  } catch (err) {
    console.error('guest settlements error', err);
    return res.status(500).json({ error: 'Failed to load guest settlements' });
  }
}

export async function create(req, res) {
  try {
    const { telegram_id, guest_code, guest_name, agent_id } = req.body || {};
    if (!guest_name) {
      return res.status(400).json({ error: 'guest_name required' });
    }

    const telegramId =
      telegram_id == null || telegram_id === '' ? null : Number(telegram_id);
    const guestCode =
      guest_code == null || guest_code === '' ? null : String(guest_code).trim();

    // A scoped agent always owns what they create — never trust a client-
    // supplied agent_id for that case. Only an admin may pick/skip an owner.
    const scopeAgentId = req.user?.agentId ?? null;
    const agentId =
      scopeAgentId != null
        ? scopeAgentId
        : agent_id == null || agent_id === ''
        ? null
        : Number(agent_id);

    const junkets = cleanJunkets(req.body?.junkets);
    const conflicts = await guestModel.findJunketConflicts(junkets);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      return res.status(409).json({
        error: `Account ${c.account_no} (${c.junket}) is already linked to guest "${c.guest_name}"`,
      });
    }

    const result = await guestModel.create({
      telegramId,
      guestCode,
      guestName: String(guest_name).trim(),
      encodedBy: req.user.username,
      agentId,
      junkets,
    });

    await recomputeForJunkets(junkets);

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'guest_code or telegram_id already registered' });
    }
    console.error('guests create error', err);
    return res.status(500).json({ error: 'Failed to create guest' });
  }
}

export async function update(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const authz = await authorizeGuestAccess(req, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const { telegram_id, guest_code, guest_name, active, agent_id } = req.body || {};
    if (!guest_name) {
      return res.status(400).json({ error: 'guest_name required' });
    }

    const telegramId =
      telegram_id == null || telegram_id === '' ? null : Number(telegram_id);
    const guestCode =
      guest_code == null || guest_code === '' ? null : String(guest_code).trim();

    // Only an admin may reassign ownership; a scoped agent can't touch it —
    // leaving agentId undefined tells the model to keep it as-is.
    const scopeAgentId = req.user?.agentId ?? null;
    const agentId =
      scopeAgentId != null || agent_id === undefined
        ? undefined
        : agent_id == null || agent_id === ''
        ? null
        : Number(agent_id);

    const junkets = cleanJunkets(req.body?.junkets);
    const conflicts = await guestModel.findJunketConflicts(junkets, id);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      return res.status(409).json({
        error: `Account ${c.account_no} (${c.junket}) is already linked to guest "${c.guest_name}"`,
      });
    }

    await guestModel.update(id, {
      telegramId,
      guestCode,
      guestName: String(guest_name).trim(),
      active: active !== false && active !== 0 && active !== '0',
      editedBy: req.user.username,
      agentId,
      junkets,
    });

    await recomputeForJunkets(junkets);

    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'guest_code or telegram_id already registered' });
    }
    console.error('guests update error', err);
    return res.status(500).json({ error: 'Failed to update guest' });
  }
}

export async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const authz = await authorizeGuestAccess(req, id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    await guestModel.remove(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('guests delete error', err);
    return res.status(500).json({ error: 'Failed to delete guest' });
  }
}
