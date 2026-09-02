import { useEffect, useState } from 'react';
import { api } from '../api';

const EMPTY = {
  DESTINATION_GROUP_ID: '',
  SOURCE_CHAT_ID: '',
  SOURCE_WHITELIST: '',
  FORWARD_MODE: 'forward',
  FORWARD_OWN_MESSAGES: 'false',
  DISCOVERY_MODE: 'false',
};

// Credentials are write-only: the server never returns their values.
const EMPTY_CREDS = { TELEGRAM_API_ID: '', TELEGRAM_API_HASH: '', TELEGRAM_PHONE: '' };

const isBool = (v) => v === true || v === 'true';

export default function SettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [creds, setCreds] = useState(EMPTY_CREDS);
  const [meta, setMeta] = useState({ configured: true, hasCreds: true, secretsSet: {} });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/forwarder/config');
      setForm({ ...EMPTY, ...(data.values || {}) });
      setCreds(EMPTY_CREDS);
      setMeta({
        configured: !!data.configured,
        hasCreds: !!data.hasCreds,
        secretsSet: data.secretsSet || {},
      });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCred = (k, v) => setCreds((c) => ({ ...c, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      await api('/forwarder/config', {
        method: 'PUT',
        body: JSON.stringify({ ...form, ...creds }),
      });
      setOk('Saved. The forwarder picks up routing changes automatically within a few seconds.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  const credState = (k) => (meta.secretsSet[k] ? 'set' : 'not set');

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Forwarder settings</h1>
          <p className="muted">
            Routing and API credentials for the Telegram forwarder. After setting
            the credentials, run <code>npm run setup:forwarder</code> once to
            enter the login code (phone verification can't be done here).
          </p>
        </div>
      </header>

      {!meta.hasCreds ? (
        <p className="error">
          API credentials not set yet. Fill in API ID + API hash below, save, then
          run <code>npm run setup:forwarder</code> for the one-time login code.
        </p>
      ) : null}

      <form className="settings-form" onSubmit={onSubmit}>
        <fieldset>
          <legend>Telegram API credentials</legend>
          <label>
            <span>API ID — {credState('TELEGRAM_API_ID')}</span>
            <input
              value={creds.TELEGRAM_API_ID}
              onChange={(e) => setCred('TELEGRAM_API_ID', e.target.value)}
              placeholder={
                meta.secretsSet.TELEGRAM_API_ID
                  ? 'leave blank to keep current'
                  : 'from my.telegram.org, e.g. 31353680'
              }
              autoComplete="off"
            />
          </label>
          <label>
            <span>API hash — {credState('TELEGRAM_API_HASH')}</span>
            <input
              type="password"
              value={creds.TELEGRAM_API_HASH}
              onChange={(e) => setCred('TELEGRAM_API_HASH', e.target.value)}
              placeholder={
                meta.secretsSet.TELEGRAM_API_HASH
                  ? 'leave blank to keep current'
                  : '32 hex characters'
              }
              autoComplete="off"
            />
          </label>
          <label>
            <span>Phone — {credState('TELEGRAM_PHONE')}</span>
            <input
              value={creds.TELEGRAM_PHONE}
              onChange={(e) => setCred('TELEGRAM_PHONE', e.target.value)}
              placeholder={
                meta.secretsSet.TELEGRAM_PHONE
                  ? 'leave blank to keep current'
                  : '+639171234567'
              }
              autoComplete="off"
            />
            <small className="muted">
              Optional. If set, <code>setup:forwarder</code> won't ask for it.
            </small>
          </label>
        </fieldset>

        <label>
          <span>Destination ID</span>
          <input
            value={form.DESTINATION_GROUP_ID}
            onChange={(e) => set('DESTINATION_GROUP_ID', e.target.value)}
            placeholder="-1001234567890 (group) or 8372574481 (bot DM)"
            required
          />
          <small className="muted">
            Where messages are delivered. A group id, or the system bot's user id
            for a direct message.
          </small>
        </label>

        <label>
          <span>Source chat ID</span>
          <input
            value={form.SOURCE_CHAT_ID}
            onChange={(e) => set('SOURCE_CHAT_ID', e.target.value)}
            placeholder="e.g. 5391350212"
          />
          <small className="muted">The main chat to forward FROM.</small>
        </label>

        <label>
          <span>Source whitelist</span>
          <input
            value={form.SOURCE_WHITELIST}
            onChange={(e) => set('SOURCE_WHITELIST', e.target.value)}
            placeholder="111,222,333"
          />
          <small className="muted">
            Extra source chat ids, comma-separated. Merged with the source chat ID.
          </small>
        </label>

        <label>
          <span>Forward mode</span>
          <select
            value={form.FORWARD_MODE}
            onChange={(e) => set('FORWARD_MODE', e.target.value)}
          >
            <option value="forward">forward — native, keeps “Forwarded from”</option>
            <option value="copy">copy — re-send as a new message</option>
          </select>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isBool(form.FORWARD_OWN_MESSAGES)}
            onChange={(e) =>
              set('FORWARD_OWN_MESSAGES', e.target.checked ? 'true' : 'false')
            }
          />
          <span>Also forward messages I send in the source chats</span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isBool(form.DISCOVERY_MODE)}
            onChange={(e) =>
              set('DISCOVERY_MODE', e.target.checked ? 'true' : 'false')
            }
          />
          <span>
            Discovery mode — log incoming chat ids in the forwarder console,
            forward nothing
          </span>
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}
    </section>
  );
}
