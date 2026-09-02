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

const isBool = (v) => v === true || v === 'true';

export default function SettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState({ configured: true, hasCreds: true });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/forwarder/config');
      setForm({ ...EMPTY, ...(data.values || {}) });
      setMeta({ configured: !!data.configured, hasCreds: !!data.hasCreds });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      await api('/forwarder/config', { method: 'PUT', body: JSON.stringify(form) });
      setOk('Saved. The forwarder picks up changes automatically within a few seconds.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Forwarder settings</h1>
          <p className="muted">
            Routing for the Telegram forwarder. API credentials and login stay in
            the one-time <code>npm run setup:forwarder</code>.
          </p>
        </div>
      </header>

      {!meta.configured ? (
        <p className="error">
          <code>telegram-forwarder\.env</code> not found. Run{' '}
          <code>npm run setup:forwarder</code> once, then reload this page.
        </p>
      ) : !meta.hasCreds ? (
        <p className="error">
          API credentials not set yet — run <code>npm run setup:forwarder</code>{' '}
          to finish the Telegram login.
        </p>
      ) : null}

      <form className="settings-form" onSubmit={onSubmit}>
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
