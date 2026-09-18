import { query, renameColumn, truncateTables } from '../db.js';

// Column names are ALL_CAPS with IDNo as the primary key and the AGENT_ID
// foreign key right after it, matching this org's DB convention. API/JS
// shapes are unchanged — every query aliases back to the original
// lowercase keys, so no controller/frontend code needed to change.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS message_logs (
      IDNo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      AGENT_ID INT UNSIGNED NULL,
      TELEGRAM_CHAT_ID BIGINT NOT NULL,
      TELEGRAM_USER_ID BIGINT NULL,
      TELEGRAM_USERNAME VARCHAR(64) NULL,
      MESSAGE_TEXT TEXT NOT NULL,
      TELEGRAM_MESSAGE_ID BIGINT NULL,
      RECEIVED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_received_at (RECEIVED_AT),
      INDEX idx_chat_id (TELEGRAM_CHAT_ID),
      CONSTRAINT fk_message_agent
        FOREIGN KEY (AGENT_ID) REFERENCES agents(IDNo)
        ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before this ALL_CAPS rename.
  await renameColumn('message_logs', 'id', 'IDNo', 'BIGINT UNSIGNED AUTO_INCREMENT');
  await renameColumn('message_logs', 'agent_id', 'AGENT_ID', 'INT UNSIGNED NULL');
  await renameColumn('message_logs', 'telegram_chat_id', 'TELEGRAM_CHAT_ID', 'BIGINT NOT NULL');
  await renameColumn('message_logs', 'telegram_user_id', 'TELEGRAM_USER_ID', 'BIGINT NULL');
  await renameColumn(
    'message_logs',
    'telegram_username',
    'TELEGRAM_USERNAME',
    'VARCHAR(64) NULL'
  );
  await renameColumn('message_logs', 'message_text', 'MESSAGE_TEXT', 'TEXT NOT NULL');
  await renameColumn(
    'message_logs',
    'telegram_message_id',
    'TELEGRAM_MESSAGE_ID',
    'BIGINT NULL'
  );
  await renameColumn(
    'message_logs',
    'received_at',
    'RECEIVED_AT',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );

  // A restart mid-poll (or a webhook retry) can hand us the same Telegram
  // update twice — the long-poll `offset` in telegram.js lives in memory
  // only. This unique index makes a second insert of the same (chat,
  // message) a no-op instead of a duplicate row. NULL
  // TELEGRAM_MESSAGE_ID values (e.g. some business messages) are exempt
  // from uniqueness, same as any other MySQL unique index.
  try {
    await query(
      `ALTER TABLE message_logs
        ADD UNIQUE KEY uq_message_logs_chat_msg (TELEGRAM_CHAT_ID, TELEGRAM_MESSAGE_ID)`
    );
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') return; // already applied
    if (err.code === 'ER_DUP_ENTRY') {
      console.warn(
        '[messageModel] Could not add uq_message_logs_chat_msg — duplicate ' +
          '(chat_id, message_id) rows already exist. Remove them, then restart ' +
          'to enable duplicate-message protection.'
      );
      return;
    }
    throw err;
  }
}

// `agentId` scopes the results to one agent's own messages — pass the
// logged-in user's agentId (null for an admin login, which sees everything).
export async function list({ limit = 100, q = '', agentId = null } = {}) {
  let sql = `
    SELECT
      m.IDNo AS id,
      m.AGENT_ID AS agent_id,
      a.NAME AS agent_name,
      m.TELEGRAM_CHAT_ID AS telegram_chat_id,
      m.TELEGRAM_USER_ID AS telegram_user_id,
      m.TELEGRAM_USERNAME AS telegram_username,
      m.MESSAGE_TEXT AS message_text,
      m.TELEGRAM_MESSAGE_ID AS telegram_message_id,
      m.RECEIVED_AT AS received_at
    FROM message_logs m
    LEFT JOIN agents a ON a.IDNo = m.AGENT_ID
    WHERE 1=1
  `;
  const params = {};

  if (agentId != null) {
    sql += ` AND m.AGENT_ID = :agentId`;
    params.agentId = agentId;
  }

  if (q) {
    sql += `
      AND (
        m.MESSAGE_TEXT LIKE :q
        OR m.TELEGRAM_USERNAME LIKE :q
        OR a.NAME LIKE :q
        OR CAST(m.TELEGRAM_CHAT_ID AS CHAR) LIKE :q
      )
    `;
    params.q = `%${q}%`;
  }

  sql += ` ORDER BY m.RECEIVED_AT DESC LIMIT ${limit}`;
  return query(sql, params);
}

export async function deleteAll() {
  // settlements.MESSAGE_ID -> message_logs.IDNo (FK), so truncate both
  // together with FK checks off. Resets AUTO_INCREMENT on both tables.
  await truncateTables(['settlements', 'message_logs']);
}

// Returns { id, duplicate }. `duplicate: true` means this exact
// (chatId, messageId) was already logged — the existing row's id is
// returned instead of inserting a second copy (see ensureTable above).
export async function createIncoming({
  agentId,
  chatId,
  userId,
  username,
  text,
  messageId,
}) {
  try {
    const result = await query(
      `INSERT INTO message_logs
        (AGENT_ID, TELEGRAM_CHAT_ID, TELEGRAM_USER_ID, TELEGRAM_USERNAME, MESSAGE_TEXT, TELEGRAM_MESSAGE_ID)
       VALUES
        (:agentId, :chatId, :userId, :username, :text, :messageId)`,
      { agentId, chatId, userId, username, text, messageId }
    );
    return { id: result.insertId, duplicate: false };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && messageId != null) {
      const [existing] = await query(
        `SELECT IDNo AS id FROM message_logs
          WHERE TELEGRAM_CHAT_ID = :chatId AND TELEGRAM_MESSAGE_ID = :messageId
          LIMIT 1`,
        { chatId, messageId }
      );
      return { id: existing?.id ?? null, duplicate: true };
    }
    throw err;
  }
}
