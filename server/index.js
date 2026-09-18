import express from 'express';
import os from 'node:os';
import cors from 'cors';
import { ensureAdminUser } from './controllers/authController.js';
import { config, pool } from './db.js';
import * as agentModel from './models/agentModel.js';
import * as botConfigModel from './models/botConfigModel.js';
import * as messageModel from './models/messageModel.js';
import * as settlementModel from './models/settlementModel.js';
import * as userModel from './models/userModel.js';
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bind, retrying briefly on EADDRINUSE. `node --watch` restarting *this same*
// process (on a file change) kills the old instance and starts the new one
// fast enough that Windows/Node can still be releasing the old listener when
// the new one tries to bind — a false-positive EADDRINUSE from your own
// predecessor, not a real second instance. A short bounded retry absorbs
// that race; a genuinely stuck duplicate instance is still alive at the end
// of it and the bind fails for real.
async function bindServer(port, host, { attempts = 8, delayMs = 300 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const s = app.listen(port, host);
        s.once('listening', () => resolve(s));
        s.once('error', reject);
      });
    } catch (err) {
      if (err?.code !== 'EADDRINUSE' || i === attempts) throw err;
      await sleep(delayMs);
    }
  }
}

async function main() {
  await pool.query('SELECT 1');
  await agentModel.ensureTable();
  await botConfigModel.ensureTable({ botToken: config.telegramBotToken });
  await userModel.ensureTable();
  await messageModel.ensureTable();
  await settlementModel.ensureTable();
  await ensureAdminUser();

  const host = '0.0.0.0';
  const lanIp = Object.values(os.networkInterfaces())
    .flat()
    .find((ni) => ni && ni.family === 'IPv4' && !ni.internal)?.address ?? 'localhost';

  // Bind first, and don't start the Telegram poller until that succeeds.
  // Two instances running at once (a stray terminal + a fresh `npm run dev`)
  // used to cause a split-brain bug: the loser's app.listen() failed
  // silently while its startTelegram() kept polling anyway, so it could
  // still win Telegram's getUpdates race and process a message into MySQL
  // — but its bus.emit() had no attached WebSocket clients (those were on
  // the winner's process), so the dashboard needed a manual refresh to see
  // data that was, in fact, already saved. Binding first turns that into a
  // loud, immediate exit instead of a confusing "works but not live" bug.
  const server = await bindServer(config.port, host);
  console.log(`API listening on http://localhost:${config.port}`);
  console.log(`API network  http://${lanIp}:${config.port}`);
  // Port 6000 is on Chromium's restricted-port list (ERR_UNSAFE_PORT), so
  // this API URL will never load in a browser directly. The dashboard is
  // served by Vite in dev — point people there instead.
  console.log(`Dashboard    http://${lanIp}:6001  (open this one — ${config.port} is blocked by browsers)`);
  attachRealtime(server);
  startTelegram();
}

main().catch((err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Failed to start server: port ${config.port} is already in use — ` +
        `another instance of this API is already running (look for a stray ` +
        `"npm run dev" / "node server/index.js" process and stop it). ` +
        `Refusing to start a second Telegram poller alongside it.`
    );
  } else {
    console.error('Failed to start server', err);
  }
  process.exit(1);
});
