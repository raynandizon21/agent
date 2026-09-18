import { query, renameColumn, truncateTables } from '../db.js';

// Add a column to an existing table if missing. Safe to call every boot.
async function ensureColumn(table, column, ddl) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

// Column names are ALL_CAPS with IDNo as the primary key and the two
// foreign keys (MESSAGE_ID, AGENT_ID) right after it, matching this org's
// DB convention. API/JS shapes are unchanged — every query aliases back to
// the original lowercase keys, so no controller/frontend code needed to
// change. findLatestGame() below deliberately does NOT use `SELECT *` for
// this reason — upsertStep()'s `latest.xxx` field access all assumes
// lowercase keys.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS settlements (
      IDNo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      MESSAGE_ID BIGINT UNSIGNED NULL,
      AGENT_ID INT UNSIGNED NULL,
      JUNKET VARCHAR(32) NOT NULL,
      ACCOUNT_NO VARCHAR(120) NULL,
      ACCOUNT_NAME VARCHAR(255) NULL,
      PLAYER_NAME VARCHAR(512) NULL,
      GAME_NO VARCHAR(64) NULL,
      BUY_IN BIGINT NULL,
      CASHOUT BIGINT NULL,
      WIN_LOSS BIGINT NULL,
      ROLLING BIGINT NULL,
      COMMISSION BIGINT NULL,
      BALANCE BIGINT NULL,
      SETTLED_AT DATETIME NULL,
      RAW_TEXT MEDIUMTEXT NULL,
      STATUS VARCHAR(16) NOT NULL DEFAULT 'settled',
      STEP VARCHAR(32) NULL,
      CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_settlements_created (CREATED_AT),
      INDEX idx_settlements_junket (JUNKET),
      INDEX idx_settlements_account (ACCOUNT_NO),
      INDEX idx_settlements_open_game (JUNKET, ACCOUNT_NO, GAME_NO, STATUS)
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before this ALL_CAPS rename.
  await renameColumn('settlements', 'id', 'IDNo', 'BIGINT UNSIGNED AUTO_INCREMENT');
  await renameColumn('settlements', 'message_id', 'MESSAGE_ID', 'BIGINT UNSIGNED NULL');
  await renameColumn('settlements', 'agent_id', 'AGENT_ID', 'INT UNSIGNED NULL');
  await renameColumn('settlements', 'junket', 'JUNKET', 'VARCHAR(32) NOT NULL');
  await renameColumn('settlements', 'account_no', 'ACCOUNT_NO', 'VARCHAR(120) NULL');
  await renameColumn('settlements', 'account_name', 'ACCOUNT_NAME', 'VARCHAR(255) NULL');
  await renameColumn('settlements', 'player_name', 'PLAYER_NAME', 'VARCHAR(512) NULL');
  await renameColumn('settlements', 'game_no', 'GAME_NO', 'VARCHAR(64) NULL');
  await renameColumn('settlements', 'buy_in', 'BUY_IN', 'BIGINT NULL');
  await renameColumn('settlements', 'cashout', 'CASHOUT', 'BIGINT NULL');
  await renameColumn('settlements', 'win_loss', 'WIN_LOSS', 'BIGINT NULL');
  await renameColumn('settlements', 'rolling', 'ROLLING', 'BIGINT NULL');
  await renameColumn('settlements', 'commission', 'COMMISSION', 'BIGINT NULL');
  await renameColumn('settlements', 'balance', 'BALANCE', 'BIGINT NULL');
  await renameColumn('settlements', 'settled_at', 'SETTLED_AT', 'DATETIME NULL');
  await renameColumn('settlements', 'raw_text', 'RAW_TEXT', 'MEDIUMTEXT NULL');
  await renameColumn('settlements', 'status', 'STATUS', "VARCHAR(16) NOT NULL DEFAULT 'settled'");
  await renameColumn('settlements', 'step', 'STEP', 'VARCHAR(32) NULL');
  await renameColumn(
    'settlements',
    'created_at',
    'CREATED_AT',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );

  // Migrate pre-existing databases that were created before these columns existed.
  await ensureColumn('settlements', 'BALANCE', 'BIGINT NULL AFTER COMMISSION');
  await ensureColumn(
    'settlements',
    'STATUS',
    "VARCHAR(16) NOT NULL DEFAULT 'settled' AFTER RAW_TEXT"
  );
  await ensureColumn('settlements', 'STEP', 'VARCHAR(32) NULL AFTER STATUS');

  // Junket key rename: 'infinitycage' -> 'infinity'. Idempotent — a no-op
  // once every row has already been updated.
  await query("UPDATE settlements SET JUNKET = 'infinity' WHERE JUNKET = 'infinitycage'");
}

export async function create(row) {
  const result = await query(
    `INSERT INTO settlements
      (MESSAGE_ID, AGENT_ID, JUNKET, ACCOUNT_NO, ACCOUNT_NAME, PLAYER_NAME, GAME_NO,
       BUY_IN, CASHOUT, WIN_LOSS, ROLLING, COMMISSION, BALANCE, SETTLED_AT, RAW_TEXT)
     VALUES
      (:messageId, :agentId, :junket, :accountNo, :accountName, :playerName, :gameNo,
       :buyIn, :cashout, :winLoss, :rolling, :commission, :balance, :settledAt, :rawText)`,
    {
      messageId: row.messageId ?? null,
      agentId: row.agentId ?? null,
      junket: row.junket,
      accountNo: row.account_no ?? null,
      accountName: row.account_name ?? null,
      playerName: row.player_name ?? null,
      gameNo: row.game_no ?? null,
      buyIn: row.buy_in ?? null,
      cashout: row.cashout ?? null,
      winLoss: row.win_loss ?? null,
      rolling: row.rolling ?? null,
      commission: row.commission ?? null,
      balance: row.balance ?? null,
      settledAt: row.settled_at ?? null,
      rawText: row.raw_text ?? null,
    }
  );
  return result.insertId;
}

// --- Step-by-step games (e.g. Demo Cage: Game Start -> Additional Buy-in ->
// Cashout -> Game End/Settlement). Each message updates the same row instead
// of inserting a new one, keyed by (junket, account_no, game_no) while open.

export async function findLatestGame({ junket, account_no, game_no }) {
  const rows = await query(
    `SELECT
       IDNo AS id, MESSAGE_ID AS message_id, AGENT_ID AS agent_id, JUNKET AS junket,
       ACCOUNT_NO AS account_no, ACCOUNT_NAME AS account_name, PLAYER_NAME AS player_name,
       GAME_NO AS game_no, BUY_IN AS buy_in, CASHOUT AS cashout, WIN_LOSS AS win_loss,
       ROLLING AS rolling, COMMISSION AS commission, BALANCE AS balance,
       SETTLED_AT AS settled_at, RAW_TEXT AS raw_text, STATUS AS status, STEP AS step,
       CREATED_AT AS created_at
     FROM settlements
     WHERE JUNKET = :junket AND ACCOUNT_NO = :account_no AND GAME_NO = :game_no
     ORDER BY IDNo DESC
     LIMIT 1`,
    { junket, account_no, game_no }
  );
  return rows[0] || null;
}

/**
 * Merge one step's fields into the row for this game, or start a new one.
 * `fields` values that are null/undefined keep whatever the row already had
 * (a step only reports what changed).
 *
 * - No row yet, or the latest one is already settled and this step is a
 *   fresh "Game Start" -> insert a new row (a new game reusing the number).
 * - Otherwise -> merge into the latest row. This covers the normal open
 *   game case, and also a step (e.g. a repeated/late "Game End") arriving
 *   after settlement — it corrects the same row instead of duplicating it.
 */
export async function upsertStep(
  { junket, account_no, player_name, game_no, step, isFinal, fields },
  { messageId, agentId, raw_text }
) {
  const latest = await findLatestGame({ junket, account_no, game_no });
  const startsFresh = step === 'start' && (!latest || latest.status === 'settled');

  if (latest && !startsFresh) {
    const status = isFinal || latest.status === 'settled' ? 'settled' : 'open';
    await query(
      `UPDATE settlements SET
        PLAYER_NAME = :playerName,
        BUY_IN = :buyIn,
        CASHOUT = :cashout,
        WIN_LOSS = :winLoss,
        ROLLING = :rolling,
        COMMISSION = :commission,
        BALANCE = :balance,
        SETTLED_AT = :settledAt,
        STATUS = :status,
        STEP = :step,
        MESSAGE_ID = :messageId,
        AGENT_ID = :agentId,
        RAW_TEXT = :rawText
       WHERE IDNo = :id`,
      {
        playerName: player_name ?? latest.player_name,
        buyIn: fields.buy_in ?? latest.buy_in,
        cashout: fields.cashout ?? latest.cashout,
        winLoss: fields.win_loss ?? latest.win_loss,
        rolling: fields.rolling ?? latest.rolling,
        commission: fields.commission ?? latest.commission,
        balance: fields.balance ?? latest.balance,
        settledAt: fields.settled_at ?? latest.settled_at,
        status,
        step,
        messageId: messageId ?? latest.message_id,
        agentId: agentId ?? latest.agent_id,
        rawText: raw_text ?? latest.raw_text,
        id: latest.id,
      }
    );
    return latest.id;
  }

  const status = isFinal ? 'settled' : 'open';

  const result = await query(
    `INSERT INTO settlements
      (MESSAGE_ID, AGENT_ID, JUNKET, ACCOUNT_NO, ACCOUNT_NAME, PLAYER_NAME, GAME_NO,
       BUY_IN, CASHOUT, WIN_LOSS, ROLLING, COMMISSION, BALANCE, SETTLED_AT, RAW_TEXT,
       STATUS, STEP)
     VALUES
      (:messageId, :agentId, :junket, :accountNo, NULL, :playerName, :gameNo,
       :buyIn, :cashout, :winLoss, :rolling, :commission, :balance, :settledAt, :rawText,
       :status, :step)`,
    {
      messageId: messageId ?? null,
      agentId: agentId ?? null,
      junket,
      accountNo: account_no,
      playerName: player_name ?? null,
      gameNo: game_no,
      buyIn: fields.buy_in ?? null,
      cashout: fields.cashout ?? null,
      winLoss: fields.win_loss ?? null,
      rolling: fields.rolling ?? null,
      commission: fields.commission ?? null,
      balance: fields.balance ?? null,
      settledAt: fields.settled_at ?? null,
      rawText: raw_text ?? null,
      status,
      step,
    }
  );
  return result.insertId;
}

// Remove the row for one game (e.g. Infinity Cage "게임삭제 / Delete Game").
export async function deleteGame({ junket, account_no, game_no }) {
  const result = await query(
    `DELETE FROM settlements
     WHERE JUNKET = :junket AND ACCOUNT_NO = :account_no AND GAME_NO = :game_no`,
    { junket, account_no, game_no }
  );
  return result.affectedRows || 0;
}

export async function deleteAll() {
  // "Clear data" wipes everything: settlements AND the message log they came
  // from. FK checks off so order doesn't matter; AUTO_INCREMENT resets.
  await truncateTables(['settlements', 'message_logs']);
}

// `agentId` scopes the results to one agent's own settlements — pass the
// logged-in user's agentId (null for an admin login, which sees everything).
export async function list({ limit = 100, q = '', junket = '', agentId = null } = {}) {
  let sql = `
    SELECT
      s.IDNo AS id,
      s.MESSAGE_ID AS message_id,
      s.AGENT_ID AS agent_id,
      a.NAME AS agent_name,
      s.JUNKET AS junket,
      s.ACCOUNT_NO AS account_no,
      s.ACCOUNT_NAME AS account_name,
      s.PLAYER_NAME AS player_name,
      s.GAME_NO AS game_no,
      s.BUY_IN AS buy_in,
      s.CASHOUT AS cashout,
      s.WIN_LOSS AS win_loss,
      s.ROLLING AS rolling,
      s.COMMISSION AS commission,
      s.BALANCE AS balance,
      s.SETTLED_AT AS settled_at,
      s.STATUS AS status,
      s.STEP AS step,
      s.CREATED_AT AS created_at
    FROM settlements s
    LEFT JOIN agents a ON a.IDNo = s.AGENT_ID
    WHERE 1=1
  `;
  const params = {};

  if (agentId != null) {
    sql += ` AND s.AGENT_ID = :agentId`;
    params.agentId = agentId;
  }

  if (junket) {
    sql += ` AND s.JUNKET = :junket`;
    params.junket = junket;
  }

  if (q) {
    sql += `
      AND (
        s.ACCOUNT_NO LIKE :q
        OR s.ACCOUNT_NAME LIKE :q
        OR s.PLAYER_NAME LIKE :q
        OR s.GAME_NO LIKE :q
        OR a.NAME LIKE :q
      )
    `;
    params.q = `%${q}%`;
  }

  sql += ` ORDER BY s.CREATED_AT DESC LIMIT ${Number(limit) || 100}`;
  return query(sql, params);
}
