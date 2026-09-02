import { query, truncateTables } from '../db.js';

// Add a column to an existing table if missing. Safe to call every boot.
async function ensureColumn(table, column, ddl) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      message_id BIGINT UNSIGNED NULL,
      agent_id INT UNSIGNED NULL,
      junket VARCHAR(32) NOT NULL,
      account_no VARCHAR(120) NULL,
      account_name VARCHAR(255) NULL,
      player_name VARCHAR(512) NULL,
      game_no VARCHAR(64) NULL,
      buy_in BIGINT NULL,
      cashout BIGINT NULL,
      win_loss BIGINT NULL,
      rolling BIGINT NULL,
      commission BIGINT NULL,
      balance BIGINT NULL,
      settled_at DATETIME NULL,
      raw_text MEDIUMTEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'settled',
      step VARCHAR(32) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_settlements_created (created_at),
      INDEX idx_settlements_junket (junket),
      INDEX idx_settlements_account (account_no),
      INDEX idx_settlements_open_game (junket, account_no, game_no, status)
    ) ENGINE=InnoDB
  `);

  // Migrate pre-existing databases that were created before these columns existed.
  await ensureColumn('settlements', 'balance', 'BIGINT NULL AFTER commission');
  await ensureColumn(
    'settlements',
    'status',
    "VARCHAR(16) NOT NULL DEFAULT 'settled' AFTER raw_text"
  );
  await ensureColumn('settlements', 'step', 'VARCHAR(32) NULL AFTER status');
}

export async function create(row) {
  const result = await query(
    `INSERT INTO settlements
      (message_id, agent_id, junket, account_no, account_name, player_name, game_no,
       buy_in, cashout, win_loss, rolling, commission, balance, settled_at, raw_text)
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
    `SELECT * FROM settlements
     WHERE junket = :junket AND account_no = :account_no AND game_no = :game_no
     ORDER BY id DESC
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
        player_name = :playerName,
        buy_in = :buyIn,
        cashout = :cashout,
        win_loss = :winLoss,
        rolling = :rolling,
        commission = :commission,
        balance = :balance,
        settled_at = :settledAt,
        status = :status,
        step = :step,
        message_id = :messageId,
        agent_id = :agentId,
        raw_text = :rawText
       WHERE id = :id`,
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
      (message_id, agent_id, junket, account_no, account_name, player_name, game_no,
       buy_in, cashout, win_loss, rolling, commission, balance, settled_at, raw_text,
       status, step)
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

export async function deleteAll() {
  // "Clear data" wipes everything: settlements AND the message log they came
  // from. FK checks off so order doesn't matter; AUTO_INCREMENT resets.
  await truncateTables(['settlements', 'message_logs']);
}

export async function list({ limit = 100, q = '', junket = '' } = {}) {
  let sql = `
    SELECT
      s.id,
      s.message_id,
      s.agent_id,
      a.name AS agent_name,
      s.junket,
      s.account_no,
      s.account_name,
      s.player_name,
      s.game_no,
      s.buy_in,
      s.cashout,
      s.win_loss,
      s.rolling,
      s.commission,
      s.balance,
      s.settled_at,
      s.status,
      s.step,
      s.created_at
    FROM settlements s
    LEFT JOIN agents a ON a.id = s.agent_id
    WHERE 1=1
  `;
  const params = {};

  if (junket) {
    sql += ` AND s.junket = :junket`;
    params.junket = junket;
  }

  if (q) {
    sql += `
      AND (
        s.account_no LIKE :q
        OR s.account_name LIKE :q
        OR s.player_name LIKE :q
        OR s.game_no LIKE :q
        OR a.name LIKE :q
      )
    `;
    params.q = `%${q}%`;
  }

  sql += ` ORDER BY s.created_at DESC LIMIT ${Number(limit) || 100}`;
  return query(sql, params);
}
