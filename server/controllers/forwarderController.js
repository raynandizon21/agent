import {
  readForwarderConfig,
  writeForwarderConfig,
} from '../services/forwarderConfig.js';

const isInt = (v) => /^-?\d+$/.test(String(v).trim());

export function getConfig(_req, res) {
  try {
    return res.json(readForwarderConfig());
  } catch (err) {
    console.error('forwarder config read error', err);
    return res.status(500).json({ error: 'Failed to read forwarder config' });
  }
}

export function updateConfig(req, res) {
  const body = req.body || {};
  const errors = [];

  const destination = String(body.DESTINATION_GROUP_ID ?? '').trim();
  if (!destination || !isInt(destination)) {
    errors.push('Destination ID must be an integer (group id, or bot user id)');
  }

  const source = String(body.SOURCE_CHAT_ID ?? '').trim();
  if (source && !isInt(source)) errors.push('Source chat ID must be an integer or blank');

  let whitelist = '';
  const wlRaw = String(body.SOURCE_WHITELIST ?? '').trim();
  if (wlRaw) {
    const parts = wlRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.every(isInt)) errors.push('Source whitelist must be comma-separated integers');
    whitelist = parts.join(',');
  }

  const mode = String(body.FORWARD_MODE ?? 'forward').trim().toLowerCase();
  if (!['forward', 'copy'].includes(mode)) errors.push("Forward mode must be 'forward' or 'copy'");

  const own = body.FORWARD_OWN_MESSAGES === true || body.FORWARD_OWN_MESSAGES === 'true';
  const discovery = body.DISCOVERY_MODE === true || body.DISCOVERY_MODE === 'true';

  if (!source && !whitelist && !discovery) {
    errors.push('Set a source chat ID or whitelist (or enable Discovery mode)');
  }

  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  try {
    writeForwarderConfig({
      DESTINATION_GROUP_ID: destination,
      SOURCE_CHAT_ID: source,
      SOURCE_WHITELIST: whitelist,
      FORWARD_MODE: mode,
      FORWARD_OWN_MESSAGES: own ? 'true' : 'false',
      DISCOVERY_MODE: discovery ? 'true' : 'false',
    });
    return res.json({ ok: true, ...readForwarderConfig() });
  } catch (err) {
    console.error('forwarder config write error', err);
    return res.status(500).json({ error: 'Failed to write forwarder config' });
  }
}
