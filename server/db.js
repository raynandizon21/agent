import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 6000),
  jwtSecret: required('JWT_SECRET'),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'agent_telegram_inbox',
  },
  // Only the *initial* seed for the `bot_config` DB table (see
  // botConfigModel.ensureTable) — after first boot, the DB row is the real
  // source of truth and this .env value is ignored. Optional now: it's
  // fine for a fresh install to set the token via the Telegram API admin
  // page instead of .env.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  // When set (a public https base URL), the bot runs in webhook mode instead
  // of long-polling. e.g. https://inbox.example.com  ->  POST /api/telegram/webhook
  telegramWebhookUrl: (process.env.TELEGRAM_WEBHOOK_URL || '').replace(/\/+$/, ''),
  telegramWebhookSecret:
    process.env.TELEGRAM_WEBHOOK_SECRET || process.env.JWT_SECRET,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Renames a column (e.g. migrating old_name -> NEW_NAME on a table that
// already has data/live foreign keys) — idempotent: a no-op once newName
// already exists, and a no-op on a fresh install where oldName never
// existed (CREATE TABLE already used the new name). `typeDdl` is the full
// column definition (type + NULL/DEFAULT/AUTO_INCREMENT/PRIMARY KEY/etc);
// InnoDB updates any FK metadata pointing at a renamed column automatically.
export async function renameColumn(table, oldName, newName, typeDdl) {
  // `SHOW COLUMNS ... LIKE` matches case-insensitively, which is useless
  // here since a rename is often *only* a case change (name -> NAME) —
  // information_schema + BINARY gives an exact, case-sensitive check.
  const already = await query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND BINARY COLUMN_NAME = :newName`,
    { table, newName }
  );
  if (already.length > 0) return;
  const old = await query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND BINARY COLUMN_NAME = :oldName`,
    { table, oldName }
  );
  if (old.length === 0) return;
  await query(`ALTER TABLE \`${table}\` CHANGE COLUMN \`${oldName}\` \`${newName}\` ${typeDdl}`);
}

// TRUNCATE the given tables on a single connection with FK checks disabled,
// so child/parent order doesn't matter and AUTO_INCREMENT resets to 1.
export async function truncateTables(tables) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}
