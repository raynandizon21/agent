import { query } from './server/db.js';
const rows = await query(
  `SELECT IDNo, ACCOUNT_NO, BUY_IN, CASHOUT, ROLLING, RATE, COMMISSION, WIN_LOSS, SETTLED_AT, MESSAGE_ID, CREATED_AT
   FROM settlements ORDER BY IDNo`
);
console.log('total rows:', rows.length);
console.log(rows);
process.exit(0);
