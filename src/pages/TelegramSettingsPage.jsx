import { useEffect, useState } from 'react';
import { api } from '../api';

// There's only ever one bot (a singleton row in the bot_config table, not
// a list), so this is a one-row table with Edit — no "create", nothing to add.
export default function TelegramSettingsPage() {
  const [form, setForm] = useState({ token: '' });
  const [editing, setEditing] = useState(false);
  const [draftToken, setDraftToken] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/telegram-config');
      setForm({ token: data.token || '' });
    } catch (err) {
      setError(err.message || 'Failed to load Telegram config');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit() {
    setDraftToken(form.token);
    setEditing(true);
    setError('');
    setOk('');
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const data = await api('/telegram-config', {
        method: 'PUT',
        body: JSON.stringify({ ...form, token: draftToken }),
      });
      setEditing(false);
      setOk(data.applied ? 'Saved and applied — live, no restart needed.' : 'Saved.');
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
          <h1>Telegram API</h1>
          <p className="muted">
            Stored in the database. Saving applies it immediately — no server restart needed.
          </p>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bot Token</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {editing ? (
                <>
                  <td>
                    <input
                      className="mono"
                      value={draftToken}
                      onChange={(e) => setDraftToken(e.target.value)}
                      placeholder="from @BotFather"
                      autoComplete="off"
                    />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={saveEdit} disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="ghost" onClick={cancelEdit} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="mono">{form.token || <span className="muted">not set</span>}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="ghost" onClick={startEdit}>
                        Edit
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}
    </section>
  );
}
