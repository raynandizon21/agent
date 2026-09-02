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
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  telegramPollMs: Number(process.env.TELEGRAM_POLL_MS || 2000),
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
