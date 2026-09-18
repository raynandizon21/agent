import bcrypt from 'bcryptjs';
import { query, renameColumn } from '../db.js';

// Deliberately weak — meant to be changed by the agent or reset by an admin
// on the Users page. There's no forced-change-on-first-login flow yet.
const DEFAULT_AGENT_PASSWORD = '123';

// Column names are ALL_CAPS with IDNo as the primary key and the AGENT_ID
// foreign key right after it, matching this org's DB convention. API/JS
// shapes are unchanged — every query aliases back to the original
// lowercase keys, so no controller/frontend code needed to change.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      -- NULL = admin login, sees every agent's data. Set = scoped to that
      -- one agent's messages/settlements only. No FK constraint (kept
      -- consistent with the rest of this codebase's self-migration style);
      -- app-layer checks (userController) validate the agent exists.
      AGENT_ID INT UNSIGNED NULL,
      USERNAME VARCHAR(64) NOT NULL UNIQUE,
      PASSWORD_HASH VARCHAR(255) NOT NULL,
      CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before this ALL_CAPS rename. AGENT_ID also
  // moves to right after IDNo (was 4th column before) via the AFTER clause.
  await renameColumn('users', 'id', 'IDNo', 'INT UNSIGNED AUTO_INCREMENT');
  await renameColumn('users', 'username', 'USERNAME', 'VARCHAR(64) NOT NULL UNIQUE');
  await renameColumn('users', 'password_hash', 'PASSWORD_HASH', 'VARCHAR(255) NOT NULL');
  await renameColumn('users', 'agent_id', 'AGENT_ID', 'INT UNSIGNED NULL AFTER IDNo');
  await renameColumn(
    'users',
    'created_at',
    'CREATED_AT',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );
  // Already-renamed tables (AGENT_ID exists but never got repositioned)
  // still get reordered — cheap and idempotent to just always ask.
  try {
    await query('ALTER TABLE users MODIFY COLUMN AGENT_ID INT UNSIGNED NULL AFTER IDNo');
  } catch {
    /* column order is cosmetic — never worth failing boot over */
  }
}

export async function hasAnyUser() {
  const rows = await query('SELECT IDNo AS id FROM users LIMIT 1');
  return rows.length > 0;
}

export async function countAdmins() {
  const rows = await query('SELECT COUNT(*) AS n FROM users WHERE AGENT_ID IS NULL');
  return rows[0]?.n ?? 0;
}

export async function listAll() {
  return query(`
    SELECT u.IDNo AS id, u.USERNAME AS username, u.AGENT_ID AS agent_id,
           a.NAME AS agent_name, u.CREATED_AT AS created_at
    FROM users u
    LEFT JOIN agents a ON a.IDNo = u.AGENT_ID
    ORDER BY u.USERNAME ASC
  `);
}

export async function createUser(username, passwordHash, agentId = null) {
  return query(
    'INSERT INTO users (USERNAME, PASSWORD_HASH, AGENT_ID) VALUES (:username, :passwordHash, :agentId)',
    { username, passwordHash, agentId }
  );
}

export async function updateAgentLink(id, agentId) {
  return query('UPDATE users SET AGENT_ID = :agentId WHERE IDNo = :id', { id, agentId });
}

export async function updatePassword(id, passwordHash) {
  return query('UPDATE users SET PASSWORD_HASH = :passwordHash WHERE IDNo = :id', {
    id,
    passwordHash,
  });
}

export async function remove(id) {
  return query('DELETE FROM users WHERE IDNo = :id', { id });
}

export async function findByUsername(username) {
  const rows = await query(
    `SELECT u.IDNo AS id, u.USERNAME AS username, u.PASSWORD_HASH AS password_hash,
            u.AGENT_ID AS agent_id, a.NAME AS agent_name
       FROM users u
       LEFT JOIN agents a ON a.IDNo = u.AGENT_ID
      WHERE u.USERNAME = :username
      LIMIT 1`,
    { username }
  );
  return rows[0] ?? null;
}

// Auto-provisions a dashboard login for a newly-registered agent, scoped
// to just their own data (see agent_id above) — the point being: an agent
// logs in and only sees what's under their own account, with zero manual
// setup. Username defaults to their Telegram @username; falls back to
// agent_<telegram_id> when they don't have one set (or for agents added
// manually via the Agents page, which doesn't collect a username).
// Returns null (no throw) if that username is already taken — the caller
// decides what to do (e.g. tell the admin to create one by hand instead).
export async function ensureLoginForAgent({ agentId, telegramUsername, telegramId }) {
  const username = telegramUsername || `agent_${telegramId}`;
  const passwordHash = await bcrypt.hash(DEFAULT_AGENT_PASSWORD, 10);
  try {
    const result = await createUser(username, passwordHash, agentId);
    return { id: result.insertId, username, password: DEFAULT_AGENT_PASSWORD };
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return null;
    throw err;
  }
}

export async function findById(id) {
  const rows = await query(
    `SELECT u.IDNo AS id, u.USERNAME AS username, u.AGENT_ID AS agent_id,
            a.NAME AS agent_name
       FROM users u
       LEFT JOIN agents a ON a.IDNo = u.AGENT_ID
      WHERE u.IDNo = :id
      LIMIT 1`,
    { id }
  );
  return rows[0] ?? null;
}
