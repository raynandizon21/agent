/**
 * Launches the Python Telegram forwarder as part of `npm run dev`.
 *
 * - auto-installs the Python deps the first time (telethon, python-dotenv)
 * - auto-creates telegram-forwarder\.env from the template
 * - gives a clear message (instead of a stack trace) when credentials or the
 *   Telegram session file are missing, since first-time login is interactive
 *   and cannot run inside a concurrently-managed process.
 *
 * Override the interpreter with:  set PYTHON=py -3.12   (or a venv python path)
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'telegram-forwarder');
const PY = process.env.PYTHON || 'python';

const say = (m) => console.log(`[fwd] ${m}`);
const die = (lines) => {
  for (const l of [].concat(lines)) console.error(`[fwd] ${l}`);
  process.exit(1);
};

// 1 — Python available?
if (spawnSync(PY, ['--version'], { encoding: 'utf8' }).error) {
  die([
    'Python not found on PATH.',
    'Install Python 3.10+ (tick "Add to PATH"), or set the PYTHON env var,',
    'e.g.  set PYTHON=py -3.12',
  ]);
}

// 2 — deps installed?
if (spawnSync(PY, ['-c', 'import telethon'], { cwd: DIR }).status !== 0) {
  say('installing Python deps (telethon, python-dotenv) — one time only ...');
  const r = spawnSync(PY, ['-m', 'pip', 'install', '-q', '-r', 'requirements.txt'], {
    stdio: 'inherit',
    cwd: DIR,
  });
  if (r.status !== 0) die('pip install failed — see output above.');
}

// 3 — .env present? Auto-create it from the template on first run.
const envPath = join(DIR, '.env');
if (!existsSync(envPath)) {
  copyFileSync(join(DIR, '.env.example'), envPath);
  say('created telegram-forwarder\\.env from the template.');
}

// 3b — credentials filled in?  (line-based so \s never crosses newlines)
const envLines = readFileSync(envPath, 'utf8').split(/\r?\n/);
const val = (k) => {
  for (const line of envLines) {
    const m = line.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim();
  }
  return '';
};
if (!val('TELEGRAM_API_ID') || !val('TELEGRAM_API_HASH')) {
  die([
    'Telegram API credentials not set yet.',
    'Open  telegram-forwarder\\.env  and fill in:',
    '    TELEGRAM_API_ID=...     (a number)',
    '    TELEGRAM_API_HASH=...   (32 hex chars)',
    'Get both at https://my.telegram.org  ->  API development tools  ->  Create application.',
    'Then run once:   npm run setup:forwarder     (interactive phone/code login)',
  ]);
}

// 4 — session present? (interactive login cannot happen here)
const sessionName = val('SESSION_NAME') || 'user_session';
if (!existsSync(join(DIR, `${sessionName}.session`))) {
  die([
    'No Telegram session yet. First login is interactive and cannot run inside `npm run dev`.',
    'Do this once in its own terminal:',
    '    npm run setup:forwarder',
    'After that, `npm run dev` starts the forwarder automatically.',
  ]);
}

// 5 — run it, forwarding signals so Ctrl+C stops it cleanly.
const child = spawn(PY, ['main.py'], { stdio: 'inherit', cwd: DIR });
const stop = (sig) => child.kill(sig);
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
