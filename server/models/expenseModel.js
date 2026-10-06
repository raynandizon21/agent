import { query } from '../db.js';

// Manual expense totals typed on the Dashboard, one per period (e.g.
// 'week:2026-10-05', 'month:2026-10-01', 'all'). SCOPE_ID is the agent id for
// a scoped agent login and 0 for admins, so each agent keeps its own figures.
// Profit on the Dashboard = real (reported) commission − this amount.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_expenses (
      SCOPE_ID INT UNSIGNED NOT NULL DEFAULT 0,
      PERIOD_KEY VARCHAR(32) NOT NULL,
      AMOUNT DECIMAL(18,2) NOT NULL DEFAULT 0,
      EDITED_BY VARCHAR(64) NOT NULL,
      EDITED_DT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (SCOPE_ID, PERIOD_KEY)
    ) ENGINE=InnoDB
  `);
}

export async function get(scopeId, periodKey) {
  const rows = await query(
    `SELECT AMOUNT AS amount, EDITED_BY AS edited_by, EDITED_DT AS edited_dt
       FROM dashboard_expenses
      WHERE SCOPE_ID = :scopeId AND PERIOD_KEY = :periodKey`,
    { scopeId, periodKey }
  );
  const r = rows[0];
  return r ? { ...r, amount: Number(r.amount) } : { amount: 0, edited_by: null, edited_dt: null };
}

export async function set(scopeId, periodKey, amount, editedBy) {
  return query(
    `INSERT INTO dashboard_expenses (SCOPE_ID, PERIOD_KEY, AMOUNT, EDITED_BY)
     VALUES (:scopeId, :periodKey, :amount, :editedBy)
     ON DUPLICATE KEY UPDATE AMOUNT = VALUES(AMOUNT), EDITED_BY = VALUES(EDITED_BY)`,
    { scopeId, periodKey, amount, editedBy }
  );
}
