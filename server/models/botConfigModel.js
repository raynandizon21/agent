import { query, renameColumn } from '../db.js';

async function dropColumnIfExists(table, column) {
  try {
    await query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (err) {
    // 1091 = ER_CANT_DROP_FIELD_OR_KEY — the column is already gone.
    if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw err;
  }
}

// Singleton row (IDNo=1) — there's only ever one bot, and only the token.
// Column names are ALL_CAPS with IDNo as the primary key, matching this
// org's DB convention. poll_ms/webhook_url/webhook_secret were dropped:
// this project only ever runs long-polling on a local/LAN address (no
// public domain for a webhook), and the poll retry delay is now a fixed
// constant in telegram.js — configurable knobs nobody used, just noise.
export async function ensureTable(seed = {}) {
  await query(`
    CREATE TABLE IF NOT EXISTS bot_config (
      IDNo TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      BOT_TOKEN VARCHAR(255) NULL,
      UPDATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before this ALL_CAPS rename.
  await renameColumn('bot_config', 'id', 'IDNo', 'TINYINT UNSIGNED DEFAULT 1');
  await renameColumn('bot_config', 'bot_token', 'BOT_TOKEN', 'VARCHAR(255) NULL');
  await renameColumn(
    'bot_config',
    'updated_at',
    'UPDATED_AT',
    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  );

  // Migrate a table created before the poll/webhook cleanup.
  await dropColumnIfExists('bot_config', 'poll_ms');
  await dropColumnIfExists('bot_config', 'webhook_url');
  await dropColumnIfExists('bot_config', 'webhook_secret');
  await dropColumnIfExists('bot_config', 'POLL_MS');
  await dropColumnIfExists('bot_config', 'WEBHOOK_URL');
  await dropColumnIfExists('bot_config', 'WEBHOOK_SECRET');

  // One-time seed from .env, so moving the token into this table doesn't
  // lose a value that's already working. Only runs the first time this
  // table is created (row 1 not existing yet).
  const existing = await query('SELECT IDNo AS id FROM bot_config WHERE IDNo = 1');
  if (existing.length === 0) {
    await query('INSERT INTO bot_config (IDNo, BOT_TOKEN) VALUES (1, :botToken)', {
      botToken: seed.botToken || null,
    });
  }
}

export async function get() {
  const rows = await query('SELECT BOT_TOKEN AS bot_token FROM bot_config WHERE IDNo = 1');
  return rows[0] ?? null;
}

export async function update({ botToken }) {
  await query('UPDATE bot_config SET BOT_TOKEN = :botToken WHERE IDNo = 1', {
    botToken: botToken || null,
  });
}
