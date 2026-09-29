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
}

const TRIP_COLUMNS = `
  t.IDNo AS id, t.GUEST_ID AS guest_id, g.GUEST_NAME AS guest_name,
  g.GUEST_CODE AS guest_code, g.AGENT_ID AS agent_id, a.NAME AS agent_name,
  DATE_FORMAT(t.ARRIVAL_DATE, '%Y-%m-%d') AS arrival_date,
  DATE_FORMAT(t.DEPARTURE_DATE, '%Y-%m-%d') AS departure_date,
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
  sql += ` ORDER BY t.ARRIVAL_DATE ASC, g.GUEST_NAME ASC`;
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
       (GUEST_ID, ARRIVAL_DATE, DEPARTURE_DATE, ARRIVAL_FLIGHT, DEPARTURE_FLIGHT, HOTEL, ROOM_NO, NOTES, ENCODED_BY)
     VALUES
       (:guestId, :arrivalDate, :departureDate, :arrivalFlight, :departureFlight, :hotel, :roomNo, :notes, :encodedBy)`,
    fields
  );
}

export async function update(id, fields) {
  return query(
    `UPDATE guest_trips
        SET GUEST_ID = :guestId,
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

export async function createExchange(fields) {
  return query(
    `INSERT INTO trip_exchanges
       (TRIP_ID, EXCHANGE_DT, FROM_CURRENCY, FROM_AMOUNT, TO_CURRENCY, TO_AMOUNT, RATE, NOTES, ENCODED_BY)
     VALUES
       (:tripId, :exchangeDt, :fromCurrency, :fromAmount, :toCurrency, :toAmount, :rate, :notes, :encodedBy)`,
    fields
  );
}

export async function removeExchange(tripId, exchangeId) {
  return query('DELETE FROM trip_exchanges WHERE IDNo = :exchangeId AND TRIP_ID = :tripId', {
    tripId,
    exchangeId,
  });
}
