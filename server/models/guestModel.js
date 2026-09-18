import { query } from '../db.js';

// Add a column to an existing table if missing. Safe to call every boot.
async function ensureColumn(table, column, ddl) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

// Column names are ALL_CAPS with the primary key as IDNo, matching this
// org's usual DB convention — see agentModel.js. API/JS-facing shapes are
// unchanged: every query below aliases back to lowercase keys.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS guests (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      AGENT_ID INT UNSIGNED NULL,
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

  // Migrate a table created before guests were owned by an agent. The agent
  // who onboards a guest is tracked relationally now (not just ENCODED_BY's
  // username string) so a scoped login can be filtered to their own guests.
  await ensureColumn('guests', 'AGENT_ID', 'INT UNSIGNED NULL AFTER IDNo');
  const fkExists = await query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND CONSTRAINT_NAME = 'fk_guest_agent'`
  );
  if (fkExists.length === 0) {
    await query(`
      ALTER TABLE guests
        ADD CONSTRAINT fk_guest_agent
        FOREIGN KEY (AGENT_ID) REFERENCES agents(IDNo)
        ON DELETE SET NULL
    `);
  }

  // A guest can play across several junkets (e.g. Win9 and Galaxy both), so
  // this is a many-to-many join table rather than a column on guests.
  // ACCOUNT_NO links to that junket's real account (from settlements),
  // picked per (guest, junket) — optional since a guest may be tagged to a
  // junket before their account number is known.
  await query(`
    CREATE TABLE IF NOT EXISTS guest_junkets (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      GUEST_ID INT UNSIGNED NOT NULL,
      JUNKET VARCHAR(32) NOT NULL,
      ACCOUNT_NO VARCHAR(120) NULL,
      UNIQUE KEY uq_guest_junkets_pair (GUEST_ID, JUNKET),
      CONSTRAINT fk_guest_junkets_guest
        FOREIGN KEY (GUEST_ID) REFERENCES guests(IDNo)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // Migrate a table created before ACCOUNT_NO existed.
  try {
    await query('ALTER TABLE guest_junkets ADD COLUMN ACCOUNT_NO VARCHAR(120) NULL');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // Migrate a table created before per-account commission rates existed.
  await ensureColumn('guest_junkets', 'COMMISSION_RATE', 'DECIMAL(6,3) NULL');

  // Migrate a table created before IDNo became the primary key (it started
  // as a composite PRIMARY KEY (GUEST_ID, JUNKET), matching this org's usual
  // IDNo convention now — see agents/guests above).
  const idnoExists = await query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_junkets' AND BINARY COLUMN_NAME = 'IDNo'`
  );
  if (idnoExists.length === 0) {
    // Must be one ALTER TABLE — doing DROP PRIMARY KEY as a separate
    // statement briefly leaves GUEST_ID with no index at all, which InnoDB
    // rejects (errno 150) since fk_guest_junkets_guest requires one.
    await query(`
      ALTER TABLE guest_junkets
        DROP PRIMARY KEY,
        ADD COLUMN IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY FIRST,
        ADD UNIQUE KEY uq_guest_junkets_pair (GUEST_ID, JUNKET)
    `);
  }
}

// `agentId` scopes the results to one agent's own guests — pass the
// logged-in user's agentId (null for an admin login, which sees everything).
export async function listAll({ agentId = null } = {}) {
  let sql = `
    SELECT g.IDNo AS id, g.AGENT_ID AS agent_id, a.NAME AS agent_name,
           g.TELEGRAM_ID AS telegram_id, g.GUEST_CODE AS guest_code,
           g.GUEST_NAME AS guest_name, g.ENCODED_BY AS encoded_by,
           g.ENCODED_DT AS encoded_dt, g.EDITED_BY AS edited_by,
           g.EDITED_DT AS edited_dt, g.ACTIVE AS active
    FROM guests g
    LEFT JOIN agents a ON a.IDNo = g.AGENT_ID
    WHERE 1=1
  `;
  const params = {};
  if (agentId != null) {
    sql += ` AND g.AGENT_ID = :agentId`;
    params.agentId = agentId;
  }
  sql += ` ORDER BY g.GUEST_NAME ASC`;

  const guests = await query(sql, params);
  if (guests.length === 0) return guests;

  const links = await query(`
    SELECT GUEST_ID AS guest_id, JUNKET AS junket, ACCOUNT_NO AS account_no,
           COMMISSION_RATE AS commission_rate
    FROM guest_junkets
  `);
  const byGuest = new Map();
  for (const l of links) {
    if (!byGuest.has(l.guest_id)) byGuest.set(l.guest_id, []);
    byGuest.get(l.guest_id).push({
      junket: l.junket,
      account_no: l.account_no,
      commission_rate: l.commission_rate == null ? null : Number(l.commission_rate),
    });
  }

  return guests.map((g) => ({ ...g, junkets: byGuest.get(g.id) || [] }));
}

// A real junket account belongs to one player, so it should never be linked
// to two different guest records. Returns the entries in `junkets` that are
// already claimed by some other guest (excludeGuestId lets an update ignore
// the guest's own existing links to itself).
export async function findJunketConflicts(junkets, excludeGuestId = null) {
  const conflicts = [];
  for (const { junket, account_no } of junkets || []) {
    if (!account_no) continue;
    const rows = await query(
      `SELECT gj.GUEST_ID AS guest_id, g.GUEST_NAME AS guest_name
         FROM guest_junkets gj
         JOIN guests g ON g.IDNo = gj.GUEST_ID
        WHERE gj.JUNKET = :junket AND gj.ACCOUNT_NO = :accountNo
          ${excludeGuestId ? 'AND gj.GUEST_ID <> :excludeGuestId' : ''}`,
      { junket, accountNo: account_no, ...(excludeGuestId ? { excludeGuestId } : {}) }
    );
    if (rows.length > 0) {
      conflicts.push({ junket, account_no, guest_id: rows[0].guest_id, guest_name: rows[0].guest_name });
    }
  }
  return conflicts;
}

// `junkets` is [{ junket, account_no, commission_rate }, ...].
async function setJunkets(guestId, junkets) {
  await query('DELETE FROM guest_junkets WHERE GUEST_ID = :guestId', { guestId });
  for (const { junket, account_no, commission_rate } of junkets || []) {
    await query(
      `INSERT INTO guest_junkets (GUEST_ID, JUNKET, ACCOUNT_NO, COMMISSION_RATE)
       VALUES (:guestId, :junket, :accountNo, :commissionRate)`,
      { guestId, junket, accountNo: account_no || null, commissionRate: commission_rate ?? null }
    );
  }
}

export async function create({ telegramId, guestCode, guestName, encodedBy, agentId, junkets }) {
  const result = await query(
    `INSERT INTO guests (AGENT_ID, TELEGRAM_ID, GUEST_CODE, GUEST_NAME, ENCODED_BY)
     VALUES (:agentId, :telegramId, :guestCode, :guestName, :encodedBy)`,
    { agentId: agentId ?? null, telegramId, guestCode, guestName, encodedBy }
  );
  await setJunkets(result.insertId, junkets);
  return result;
}

// `agentId` here is left `undefined` to leave ownership untouched (the
// normal case) — only an admin reassigning a guest passes an explicit
// value (a number, or null to unassign).
export async function update(
  id,
  { telegramId, guestCode, guestName, active, editedBy, agentId, junkets }
) {
  const reassign = agentId !== undefined;
  const result = await query(
    `UPDATE guests
        SET TELEGRAM_ID = :telegramId,
            GUEST_CODE = :guestCode,
            GUEST_NAME = :guestName,
            ACTIVE = :active,
            EDITED_BY = :editedBy,
            EDITED_DT = CURRENT_TIMESTAMP
            ${reassign ? ', AGENT_ID = :agentId' : ''}
      WHERE IDNo = :id`,
    {
      id,
      telegramId,
      guestCode,
      guestName,
      active: active ? 1 : 0,
      editedBy,
      ...(reassign ? { agentId } : {}),
    }
  );
  await setJunkets(id, junkets);
  return result;
}

export async function remove(id) {
  return query('DELETE FROM guests WHERE IDNo = :id', { id });
}

// Returns the owning agent id (null = unowned), or `undefined` if the guest
// doesn't exist — used to authorize a scoped agent's edit/delete to only
// their own guests.
export async function getAgentId(id) {
  const rows = await query('SELECT AGENT_ID AS agent_id FROM guests WHERE IDNo = :id', { id });
  return rows.length ? rows[0].agent_id : undefined;
}

// This one guest's linked junket accounts — powers the row-click detail
// view (which junkets/accounts, then their settlement history for those).
export async function getJunketLinks(guestId) {
  return query(
    `SELECT JUNKET AS junket, ACCOUNT_NO AS account_no, COMMISSION_RATE AS commission_rate
       FROM guest_junkets WHERE GUEST_ID = :guestId`,
    { guestId }
  );
}
