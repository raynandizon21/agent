import { query } from '../db.js';

export async function listAll() {
  return query(`
    SELECT id, name, telegram_id, is_active, created_at
    FROM agents
    ORDER BY name ASC
  `);
}

export async function create(name, telegramId) {
  return query(
    `INSERT INTO agents (name, telegram_id)
     VALUES (:name, :telegramId)`,
    { name, telegramId }
  );
}

export async function findIdByTelegramId(telegramId) {
  const rows = await query(
    'SELECT id FROM agents WHERE telegram_id = :telegramId LIMIT 1',
    { telegramId }
  );
  return rows[0]?.id ?? null;
}

export async function findActiveIdByTelegramId(telegramId) {
  const rows = await query(
    'SELECT id FROM agents WHERE telegram_id = :telegramId AND is_active = 1 LIMIT 1',
    { telegramId }
  );
  return rows[0]?.id ?? null;
}
