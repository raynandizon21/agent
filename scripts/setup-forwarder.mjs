/**
 * One-time setup for the Python Telegram forwarder.
 *
 *   npm run setup:forwarder
 *
 * Run it once: it creates telegram-forwarder\.env from the template (first run),
 * then — after you fill in the API credentials — installs the Python deps and
 * walks you through the interactive Telegram login (phone -> code -> 2FA).
 *
 * Override the interpreter with:  set PYTHON=py -3.12
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'telegram-forwarder');
const PY = process.env.PYTHON || 'python';
const say = (m) => console.log(`[setup] ${m}`);

if (spawnSync(PY, ['--version'], { encoding: 'utf8' }).error) {
  console.error('[setup] Python not found on PATH. Install Python 3.10+ or set PYTHON env var.');
  process.exit(1);
}

const envPath = join(DIR, '.env');
if (!existsSync(envPath)) {
  copyFileSync(join(DIR, '.env.example'), envPath);
  say('created telegram-forwarder\\.env from the template.');
  say('');
  say('NEXT: open telegram-forwarder\\.env and set');
  say('   TELEGRAM_API_ID   and   TELEGRAM_API_HASH');
  say('   (get them at https://my.telegram.org -> API development tools)');
  say('');
  say('Then run  npm run setup:forwarder  again to finish.');
  process.exit(0);
}

say('installing Python deps ...');
let r = spawnSync(PY, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
  stdio: 'inherit',
  cwd: DIR,
});
if (r.status !== 0) process.exit(r.status ?? 1);

say('starting interactive Telegram login (phone -> code -> 2FA if enabled) ...');
r = spawnSync(PY, ['main.py', '--login'], { stdio: 'inherit', cwd: DIR });
if (r.status === 0) {
  say('done. Now run  npm run dev  — API + web + forwarder start together.');
}
process.exit(r.status ?? 0);
