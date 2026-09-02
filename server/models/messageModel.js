import { query, truncateTables } from '../db.js';

export async function list({ limit = 100, q = '' } = {}) {
  let sql = `
    SELECT
      m.id,
      m.agent_id,
      a.name AS agent_name,
      m.telegram_chat_id,
      m.telegram_user_id,
      m.telegram_username,
      m.message_text,
      m.telegram_message_id,
      m.received_at
    FROM message_logs m
    LEFT JOIN agents a ON a.id = m.agent_id
  `;
  const params = {};

  if (q) {
    sql += `
      WHERE m.message_text LIKE :q
         OR m.telegram_username LIKE :q
         OR a.name LIKE :q
         OR CAST(m.telegram_chat_id AS CHAR) LIKE :q
    `;
    params.q = `%${q}%`;
  }

  sql += ` ORDER BY m.received_at DESC LIMIT ${limit}`;
  return query(sql, params);
}

export async function deleteAll() {
  // settlements.message_id -> message_logs.id (FK), so truncate both together
  // with FK checks off. Resets AUTO_INCREMENT on both tables.
  await truncateTables(['settlements', 'message_logs']);
}

export async function createIncoming({
  agentId,
  chatId,
  userId,
  username,
  text,
  messageId,
}) {
  const result = await query(
    `INSERT INTO message_logs
      (agent_id, telegram_chat_id, telegram_user_id, telegram_username, message_text, telegram_message_id)
     VALUES
      (:agentId, :chatId, :userId, :username, :text, :messageId)`,
    { agentId, chatId, userId, username, text, messageId }
  );
  return result.insertId;
}
