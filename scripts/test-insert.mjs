import dotenv from 'dotenv';
dotenv.config();
import { pool } from '../server/db.js';
import * as settlementModel from '../server/models/settlementModel.js';
import { parseSettlement } from '../server/services/settlementParse.js';

await settlementModel.ensureTable();

const text = `*종료 /  (박은새)
어카운트 :  WN 480-8
바이인 :  300,000
캐시아웃 :  410,000
윈로스 :  +110,000
롤링 :  1,191,000
커미션 :  17,860`;

const parsed = parseSettlement(text);
const id = await settlementModel.create({
  ...parsed,
  messageId: null,
  agentId: null,
  raw_text: text,
});
console.log('inserted', id);
console.log(await settlementModel.list({ limit: 5 }));
await pool.end();
