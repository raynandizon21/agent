import { query } from '../db.js';

// Column names are ALL_CAPS with the primary key as IDNo, matching this
// org's usual DB convention — see agentModel.js. API/JS-facing shapes are
// unchanged: every query below aliases back to lowercase keys.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS guests (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      TELEGRAM_ID BIGINT NULL,
      GUEST_CODE VARCHAR(64) NULL,
      GUEST_NAME VARCHAR(120) NOT NULL,
      ENCODED_BY VARCHAR(64) NOT NULL,
      ENCODED_DT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      EDITED_BY VARCHAR(64) NULL,
      EDITED_DT TIMESTAMP NULL,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_guests_code (GUEST_CODE),
      UNIQUE KEY uq_guests_telegram_id (TELEGRAM_ID)
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before GUEST_CODE became optional.
  try {
    await query('ALTER TABLE guests MODIFY COLUMN GUEST_CODE VARCHAR(64) NULL');
  } catch {
    /* already nullable */
  }
}

export async function listAll() {
  return query(`
    SELECT IDNo AS id, TELEGRAM_ID AS telegram_id, GUEST_CODE AS guest_code,
           GUEST_NAME AS guest_name, ENCODED_BY AS encoded_by,
           ENCODED_DT AS encoded_dt, EDITED_BY AS edited_by,
           EDITED_DT AS edited_dt, ACTIVE AS active
    FROM guests
    ORDER BY GUEST_NAME ASC
  `);
}

export async function create({ telegramId, guestCode, guestName, encodedBy }) {
  return query(
    `INSERT INTO guests (TELEGRAM_ID, GUEST_CODE, GUEST_NAME, ENCODED_BY)
     VALUES (:telegramId, :guestCode, :guestName, :encodedBy)`,
    { telegramId, guestCode, guestName, encodedBy }
  );
}

export async function update(id, { telegramId, guestCode, guestName, active, editedBy }) {
  return query(
    `UPDATE guests
        SET TELEGRAM_ID = :telegramId,
            GUEST_CODE = :guestCode,
            GUEST_NAME = :guestName,
            ACTIVE = :active,
            EDITED_BY = :editedBy,
            EDITED_DT = CURRENT_TIMESTAMP
      WHERE IDNo = :id`,
    { id, telegramId, guestCode, guestName, active: active ? 1 : 0, editedBy }
  );
}

export async function remove(id) {
  return query('DELETE FROM guests WHERE IDNo = :id', { id });
}
