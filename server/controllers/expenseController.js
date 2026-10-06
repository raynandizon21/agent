import * as expenseModel from '../models/expenseModel.js';

// 'all' or '<today|week|month>:YYYY-MM-DD' (the period's start date).
const PERIOD_RE = /^(all|(today|week|month):\d{4}-\d{2}-\d{2})$/;

const scopeOf = (req) => req.user?.agentId ?? 0;

export async function get(req, res) {
  const period = String(req.query.period || '');
  if (!PERIOD_RE.test(period)) return res.status(400).json({ error: 'invalid period' });
  try {
    return res.json(await expenseModel.get(scopeOf(req), period));
  } catch (err) {
    console.error('expenses get error', err);
    return res.status(500).json({ error: 'Failed to load expenses' });
  }
}

export async function set(req, res) {
  const period = String(req.body?.period || '');
  const amount = Number(req.body?.amount);
  if (!PERIOD_RE.test(period)) return res.status(400).json({ error: 'invalid period' });
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e15) {
    return res.status(400).json({ error: 'Amount must be a number ≥ 0' });
  }
  try {
    await expenseModel.set(scopeOf(req), period, Math.round(amount * 100) / 100, req.user.username);
    return res.json(await expenseModel.get(scopeOf(req), period));
  } catch (err) {
    console.error('expenses set error', err);
    return res.status(500).json({ error: 'Failed to save expenses' });
  }
}
