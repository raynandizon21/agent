import express from 'express';
import os from 'node:os';
import cors from 'cors';
import { ensureAdminUser } from './controllers/authController.js';
import { config, pool } from './db.js';
import * as settlementModel from './models/settlementModel.js';
import routes from './routes/index.js';
import { attachRealtime } from './realtime.js';
import { startTelegram } from './services/telegram.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', routes);

async function main() {
  await pool.query('SELECT 1');
  await settlementModel.ensureTable();
  await ensureAdminUser();
  startTelegram();

  const host = '0.0.0.0';
  const lanIp = Object.values(os.networkInterfaces())
    .flat()
    .find((ni) => ni && ni.family === 'IPv4' && !ni.internal)?.address ?? 'localhost';
  const server = app.listen(config.port, host, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`API network  http://${lanIp}:${config.port}`);
  });
  attachRealtime(server);
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
