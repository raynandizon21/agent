import { query, renameColumn } from '../db.js';

async function dropColumnIfExists(table, column) {
  try {
    await query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (err) {
    // 1091 = ER_CANT_DROP_FIELD_OR_KEY — the column is already gone.
    if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw err;
  }
}

// Column names are ALL_CAPS with the primary key as IDNo, matching this
// org's usual DB convention (see e.g. the junket system's own tables) —
// every table's columns are instantly recognizable regardless of which
// database you're looking at. API/JS-facing shapes are unchanged: every
// query below aliases back to the original lowercase keys (id, name,
// telegram_id, ...) so no controller or frontend code needed to change.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS agents (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      NAME VARCHAR(120) NOT NULL,
      TELEGRAM_ID BIGINT NOT NULL UNIQUE,
      IS_ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before this ALL_CAPS rename.
  // Already PRIMARY KEY on the existing column — restating it here would
  // read as defining a *second* primary key and MariaDB rejects that.
  await renameColumn('agents', 'id', 'IDNo', 'INT UNSIGNED AUTO_INCREMENT');
  await renameColumn('agents', 'name', 'NAME', 'VARCHAR(120) NOT NULL');
  await renameColumn('agents', 'telegram_id', 'TELEGRAM_ID', 'BIGINT NOT NULL UNIQUE');
  await renameColumn('agents', 'is_active', 'IS_ACTIVE', 'TINYINT(1) NOT NULL DEFAULT 1');
  await renameColumn(
    'agents',
    'created_at',
    'CREATED_AT',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );

  // ROLE (sender/receiver) never had any behavior attached to it — every
  // agent was always effectively "sender" — so it was dropped rather than
  // kept as a decorative field.
  await dropColumnIfExists('agents', 'role');
  await dropColumnIfExists('agents', 'ROLE');
}

export async function listAll() {
  return query(`
    SELECT IDNo AS id, NAME AS name, TELEGRAM_ID AS telegram_id,
           IS_ACTIVE AS is_active, CREATED_AT AS created_at
    FROM agents
    ORDER BY NAME ASC
  `);
}

export async function create(name, telegramId) {
  return query(
    `INSERT INTO agents (NAME, TELEGRAM_ID)
     VALUES (:name, :telegramId)`,
    { name, telegramId }
  );
}

export async function update(id, { name, telegramId, isActive }) {
  return query(
    `UPDATE agents
        SET NAME = :name,
            TELEGRAM_ID = :telegramId,
            IS_ACTIVE = :isActive
      WHERE IDNo = :id`,
    { id, name, telegramId, isActive: isActive ? 1 : 0 }
  );
}

export async function remove(id) {
  // agents.IDNo is referenced by message_logs.AGENT_ID / settlements.AGENT_ID
  // with ON DELETE SET NULL, so history is preserved as "Unmatched".
  return query('DELETE FROM agents WHERE IDNo = :id', { id });
}

export async function findIdByTelegramId(telegramId) {
  const rows = await query(
    'SELECT IDNo AS id FROM agents WHERE TELEGRAM_ID = :telegramId LIMIT 1',
    { telegramId }
  );
  return rows[0]?.id ?? null;
}

export async function findActiveIdByTelegramId(telegramId) {
  const rows = await query(
    'SELECT IDNo AS id FROM agents WHERE TELEGRAM_ID = :telegramId AND IS_ACTIVE = 1 LIMIT 1',
    { telegramId }
  );
  return rows[0]?.id ?? null;
}
