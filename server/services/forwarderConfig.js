import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FWD_DIR = path.resolve(__dirname, '../../telegram-forwarder');
const ENV_PATH = path.join(FWD_DIR, '.env');
const ENV_EXAMPLE = path.join(FWD_DIR, '.env.example');

// The ONLY keys this module will read or write. Secrets (TELEGRAM_API_ID,
// TELEGRAM_API_HASH, TELEGRAM_PHONE, SESSION_NAME, TELEGRAM_BOT_TOKEN) are
// deliberately excluded — they stay in the one-time CLI setup.
export const MANAGED_KEYS = [
  'DESTINATION_GROUP_ID',
  'SOURCE_CHAT_ID',
  'SOURCE_WHITELIST',
  'FORWARD_MODE',
  'FORWARD_OWN_MESSAGES',
  'DISCOVERY_MODE',
];

// Credentials the UI may WRITE (never read back). Kept separate from
// MANAGED_KEYS so routing reads can never accidentally include them.
export const SECRET_KEYS = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_PHONE'];

const DEFAULTS = {
  DESTINATION_GROUP_ID: '',
  SOURCE_CHAT_ID: '',
  SOURCE_WHITELIST: '',
  FORWARD_MODE: 'forward',
  FORWARD_OWN_MESSAGES: 'false',
  DISCOVERY_MODE: 'false',
};

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function readForwarderConfig() {
  if (!existsSync(ENV_PATH)) {
    return { configured: false, hasCreds: false, values: { ...DEFAULTS } };
  }
  const env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
  const values = { ...DEFAULTS };
  for (const k of MANAGED_KEYS) if (env[k] != null && env[k] !== '') values[k] = env[k];
  // presence only — never expose the secret values themselves
  const secretsSet = {
    TELEGRAM_API_ID: Boolean(env.TELEGRAM_API_ID),
    TELEGRAM_API_HASH: Boolean(env.TELEGRAM_API_HASH),
    TELEGRAM_PHONE: Boolean(env.TELEGRAM_PHONE),
  };
  const hasCreds = secretsSet.TELEGRAM_API_ID && secretsSet.TELEGRAM_API_HASH;
  return { configured: true, hasCreds, secretsSet, values };
}

// Write only the credential keys that were actually supplied (non-empty).
// A blank field means "keep the current value", so loading + saving the page
// can never wipe a secret the UI could not display.
export function writeForwarderSecrets(updates) {
  const filtered = {};
  for (const k of SECRET_KEYS) {
    const v = updates[k];
    if (v != null && String(v).trim() !== '') filtered[k] = String(v).trim();
  }
  if (Object.keys(filtered).length === 0) return;

  let text = '';
  if (existsSync(ENV_PATH)) text = readFileSync(ENV_PATH, 'utf8');
  else if (existsSync(ENV_EXAMPLE)) text = readFileSync(ENV_EXAMPLE, 'utf8');

  const lines = text.split(/\r?\n/);
  for (const [key, val] of Object.entries(filtered)) {
    const re = new RegExp(`^\\s*${key}\\s*=.*$`);
    const idx = lines.findIndex((l) => re.test(l));
    if (idx >= 0) lines[idx] = `${key}=${val}`;
    else lines.push(`${key}=${val}`);
  }
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  writeFileSync(ENV_PATH, out, 'utf8');
}

export function writeForwarderConfig(updates) {
  let text = '';
  if (existsSync(ENV_PATH)) text = readFileSync(ENV_PATH, 'utf8');
  else if (existsSync(ENV_EXAMPLE)) text = readFileSync(ENV_EXAMPLE, 'utf8');

  const lines = text.split(/\r?\n/);
  for (const [key, rawVal] of Object.entries(updates)) {
    if (!MANAGED_KEYS.includes(key)) continue; // hard guard: never touch other keys
    const val = String(rawVal ?? '');
    const re = new RegExp(`^\\s*${key}\\s*=.*$`);
    const idx = lines.findIndex((l) => re.test(l));
    if (idx >= 0) lines[idx] = `${key}=${val}`;
    else lines.push(`${key}=${val}`);
  }
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  writeFileSync(ENV_PATH, out, 'utf8');
}
