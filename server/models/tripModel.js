import { query } from '../db.js';

// A trip is one visit by a guest: registered ahead of time (schedule, flight,
// hotel), then shown on the Trips board as Coming / Staying / Finished —
// that status is derived from the dates on the client, never stored, so it
// can't go stale. Ownership follows the guest (guests.AGENT_ID) rather than a
// copied column, so reassigning a guest also moves their trips.
//
// Dates are DATE columns and every query formats them back as 'YYYY-MM-DD'
// strings — mysql2 would otherwise turn a DATE into a JS Date at the
// server's local midnight, which shifts a day when the browser's timezone
// differs.
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS guest_trips (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      GUEST_ID INT UNSIGNED NOT NULL,
      ARRIVAL_DATE DATE NOT NULL,
      DEPARTURE_DATE DATE NOT NULL,
      ARRIVAL_FLIGHT VARCHAR(32) NULL,
      DEPARTURE_FLIGHT VARCHAR(32) NULL,
      HOTEL VARCHAR(120) NULL,
      ROOM_NO VARCHAR(32) NULL,
      NOTES VARCHAR(500) NULL,
      ENCODED_BY VARCHAR(64) NOT NULL,
      ENCODED_DT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      EDITED_BY VARCHAR(64) NULL,
      EDITED_DT TIMESTAMP NULL,
      INDEX idx_guest_trips_dates (ARRIVAL_DATE, DEPARTURE_DATE),
      CONSTRAINT fk_guest_trips_guest
        FOREIGN KEY (GUEST_ID) REFERENCES guests(IDNo)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // What the schedule entry is: 'trip' (flights only), 'hotel' (a hotel
  // booking only) or 'hybrid' (both). Rows from before this column default
  // to 'hybrid' since the old form always offered every field.
  try {
    await query(`ALTER TABLE guest_trips ADD COLUMN BOOKING_TYPE VARCHAR(10) NOT NULL DEFAULT 'hybrid' AFTER GUEST_ID`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // Either date may be unknown (arrival only, departure only), but not both
  // — enforced in tripController. Reads COALESCE the missing one from the
  // other so every consumer still sees a full range; has_arrival /
  // has_departure say which were actually entered.
  const dateCols = await query(`
    SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_trips'
       AND COLUMN_NAME IN ('ARRIVAL_DATE', 'DEPARTURE_DATE') AND IS_NULLABLE = 'NO'
  `);
  if (dateCols.length) {
    await query('ALTER TABLE guest_trips MODIFY ARRIVAL_DATE DATE NULL, MODIFY DEPARTURE_DATE DATE NULL');
  }

  // Money exchanges done for the guest during a trip (e.g. KRW -> PHP).
  // TO_AMOUNT is stored as entered rather than recomputed from RATE, since
  // the counter's actual payout is what matters, rounding and all.
  await query(`
    CREATE TABLE IF NOT EXISTS trip_exchanges (
      IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      TRIP_ID INT UNSIGNED NOT NULL,
      EXCHANGE_DT DATETIME NOT NULL,
      FROM_CURRENCY VARCHAR(8) NOT NULL,
      FROM_AMOUNT DECIMAL(18,2) NOT NULL,
      TO_CURRENCY VARCHAR(8) NOT NULL,
      TO_AMOUNT DECIMAL(18,2) NOT NULL,
      RATE DECIMAL(18,6) NULL,
      NOTES VARCHAR(255) NULL,
      ENCODED_BY VARCHAR(64) NOT NULL,
      ENCODED_DT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_trip_exchanges_trip (TRIP_ID),
      CONSTRAINT fk_trip_exchanges_trip
        FOREIGN KEY (TRIP_ID) REFERENCES guest_trips(IDNo)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // Exchanges can be logged any time, with or without a trip: GUEST_ID is
  // the owner and TRIP_ID is optional (set when the exchange falls inside
  // one of the guest's stays). Older rows get GUEST_ID from their trip.
  try {
    await query(`ALTER TABLE trip_exchanges ADD COLUMN GUEST_ID INT UNSIGNED NULL AFTER IDNo, ADD INDEX idx_trip_exchanges_guest (GUEST_ID)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  await query(`
    UPDATE trip_exchanges e
      JOIN guest_trips t ON t.IDNo = e.TRIP_ID
       SET e.GUEST_ID = t.GUEST_ID
     WHERE e.GUEST_ID IS NULL
  `);
  const [col] = await query(`
    SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_exchanges' AND COLUMN_NAME = 'TRIP_ID'
  `);
  if (col?.nullable === 'NO') await query('ALTER TABLE trip_exchanges MODIFY TRIP_ID INT UNSIGNED NULL');
  const fk = await query(`
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trip_exchanges'
       AND CONSTRAINT_NAME = 'fk_trip_exchanges_guest'
  `);
  if (!fk.length) {
    await query(`
      ALTER TABLE trip_exchanges
        ADD CONSTRAINT fk_trip_exchanges_guest FOREIGN KEY (GUEST_ID) REFERENCES guests(IDNo) ON DELETE CASCADE
    `);
  }
}

const TRIP_COLUMNS = `
  t.IDNo AS id, t.GUEST_ID AS guest_id, g.GUEST_NAME AS guest_name,
  g.GUEST_CODE AS guest_code, g.AGENT_ID AS agent_id, a.NAME AS agent_name,
  t.BOOKING_TYPE AS booking_type,
  DATE_FORMAT(COALESCE(t.ARRIVAL_DATE, t.DEPARTURE_DATE), '%Y-%m-%d') AS arrival_date,
  DATE_FORMAT(COALESCE(t.DEPARTURE_DATE, t.ARRIVAL_DATE), '%Y-%m-%d') AS departure_date,
  (t.ARRIVAL_DATE IS NOT NULL) AS has_arrival, (t.DEPARTURE_DATE IS NOT NULL) AS has_departure,
  t.ARRIVAL_FLIGHT AS arrival_flight, t.DEPARTURE_FLIGHT AS departure_flight,
  t.HOTEL AS hotel, t.ROOM_NO AS room_no, t.NOTES AS notes,
  t.ENCODED_BY AS encoded_by, t.ENCODED_DT AS encoded_dt,
  t.EDITED_BY AS edited_by, t.EDITED_DT AS edited_dt
`;

// `agentId` scopes to one agent's own guests' trips (null = admin, all).
export async function listAll({ agentId = null } = {}) {
  let sql = `
    SELECT ${TRIP_COLUMNS}
    FROM guest_trips t
    JOIN guests g ON g.IDNo = t.GUEST_ID
    LEFT JOIN agents a ON a.IDNo = g.AGENT_ID
    WHERE 1=1
  `;
  const params = {};
  if (agentId != null) {
    sql += ` AND g.AGENT_ID = :agentId`;
    params.agentId = agentId;
  }
  sql += ` ORDER BY COALESCE(t.ARRIVAL_DATE, t.DEPARTURE_DATE) ASC, g.GUEST_NAME ASC`;
  return query(sql, params);
}

export async function getById(id) {
  const rows = await query(
    `SELECT ${TRIP_COLUMNS}
       FROM guest_trips t
       JOIN guests g ON g.IDNo = t.GUEST_ID
       LEFT JOIN agents a ON a.IDNo = g.AGENT_ID
      WHERE t.IDNo = :id`,
    { id }
  );
  return rows[0] || null;
}

export async function create(fields) {
  return query(
    `INSERT INTO guest_trips
       (GUEST_ID, BOOKING_TYPE, ARRIVAL_DATE, DEPARTURE_DATE, ARRIVAL_FLIGHT, DEPARTURE_FLIGHT, HOTEL, ROOM_NO, NOTES, ENCODED_BY)
     VALUES
       (:guestId, :bookingType, :arrivalDate, :departureDate, :arrivalFlight, :departureFlight, :hotel, :roomNo, :notes, :encodedBy)`,
    fields
  );
}

export async function update(id, fields) {
  return query(
    `UPDATE guest_trips
        SET GUEST_ID = :guestId,
            BOOKING_TYPE = :bookingType,
            ARRIVAL_DATE = :arrivalDate,
            DEPARTURE_DATE = :departureDate,
            ARRIVAL_FLIGHT = :arrivalFlight,
            DEPARTURE_FLIGHT = :departureFlight,
            HOTEL = :hotel,
            ROOM_NO = :roomNo,
            NOTES = :notes,
            EDITED_BY = :editedBy,
            EDITED_DT = CURRENT_TIMESTAMP
      WHERE IDNo = :id`,
    { id, ...fields }
  );
}

export async function remove(id) {
  return query('DELETE FROM guest_trips WHERE IDNo = :id', { id });
}

export async function listExchanges(tripId) {
  return query(
    `SELECT IDNo AS id, TRIP_ID AS trip_id,
            DATE_FORMAT(EXCHANGE_DT, '%Y-%m-%dT%H:%i') AS exchange_dt,
            FROM_CURRENCY AS from_currency, FROM_AMOUNT AS from_amount,
            TO_CURRENCY AS to_currency, TO_AMOUNT AS to_amount,
            RATE AS rate, NOTES AS notes, ENCODED_BY AS encoded_by
       FROM trip_exchanges
      WHERE TRIP_ID = :tripId
      ORDER BY EXCHANGE_DT DESC, IDNo DESC`,
    { tripId }
  );
}

// `fields.guestId` is required; `fields.tripId` may be null.
export async function createExchange(fields) {
  return query(
    `INSERT INTO trip_exchanges
       (GUEST_ID, TRIP_ID, EXCHANGE_DT, FROM_CURRENCY, FROM_AMOUNT, TO_CURRENCY, TO_AMOUNT, RATE, NOTES, ENCODED_BY)
     VALUES
       (:guestId, :tripId, :exchangeDt, :fromCurrency, :fromAmount, :toCurrency, :toAmount, :rate, :notes, :encodedBy)`,
    fields
  );
}

// Every exchange for one guest, with the trip it falls in (if any).
export async function listGuestExchanges(guestId) {
  return query(
    `SELECT e.IDNo AS id, e.TRIP_ID AS trip_id,
            DATE_FORMAT(e.EXCHANGE_DT, '%Y-%m-%dT%H:%i') AS exchange_dt,
            e.FROM_CURRENCY AS from_currency, e.FROM_AMOUNT AS from_amount,
            e.TO_CURRENCY AS to_currency, e.TO_AMOUNT AS to_amount,
            e.RATE AS rate, e.NOTES AS notes, e.ENCODED_BY AS encoded_by,
            DATE_FORMAT(COALESCE(t.ARRIVAL_DATE, t.DEPARTURE_DATE), '%Y-%m-%d') AS trip_arrival,
            DATE_FORMAT(COALESCE(t.DEPARTURE_DATE, t.ARRIVAL_DATE), '%Y-%m-%d') AS trip_departure
       FROM trip_exchanges e
       LEFT JOIN guest_trips t ON t.IDNo = e.TRIP_ID
      WHERE e.GUEST_ID = :guestId
      ORDER BY e.EXCHANGE_DT DESC, e.IDNo DESC`,
    { guestId }
  );
}

// The guest's stay covering `date` ('YYYY-MM-DD'), if any — used to tag a
// new exchange with its trip automatically.
export async function findTripOn(guestId, date) {
  const rows = await query(
    `SELECT IDNo AS id FROM guest_trips
      WHERE GUEST_ID = :guestId
        AND :date BETWEEN COALESCE(ARRIVAL_DATE, DEPARTURE_DATE) AND COALESCE(DEPARTURE_DATE, ARRIVAL_DATE)
      ORDER BY COALESCE(ARRIVAL_DATE, DEPARTURE_DATE) DESC LIMIT 1`,
    { guestId, date }
  );
  return rows[0]?.id ?? null;
}

export async function updateGuestExchange(guestId, exchangeId, fields) {
  return query(
    `UPDATE trip_exchanges
        SET TRIP_ID = :tripId, EXCHANGE_DT = :exchangeDt,
            FROM_CURRENCY = :fromCurrency, FROM_AMOUNT = :fromAmount,
            TO_CURRENCY = :toCurrency, TO_AMOUNT = :toAmount,
            RATE = :rate, NOTES = :notes
      WHERE IDNo = :exchangeId AND GUEST_ID = :guestId`,
    { ...fields, guestId, exchangeId }
  );
}

export async function removeGuestExchange(guestId, exchangeId) {
  return query('DELETE FROM trip_exchanges WHERE IDNo = :exchangeId AND GUEST_ID = :guestId', {
    guestId,
    exchangeId,
  });
}

export async function removeExchange(tripId, exchangeId) {
  return query('DELETE FROM trip_exchanges WHERE IDNo = :exchangeId AND TRIP_ID = :tripId', {
    tripId,
    exchangeId,
  });
}
