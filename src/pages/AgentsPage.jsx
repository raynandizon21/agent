import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [name, setName] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/agents');
      setAgents(data.agents || []);
    } catch (err) {
      setError(err.message || 'Failed to load agents');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      await api('/agents', {
        method: 'POST',
        body: JSON.stringify({ name, telegram_id: telegramId }),
      });
      setName('');
      setTelegramId('');
      setOk('Agent added');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add agent');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Agents</h1>
          <p className="muted">
            Register Telegram IDs so inbound messages are matched
          </p>
        </div>
      </header>

      <form className="agent-form" onSubmit={onSubmit}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Telegram ID
          <input
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="e.g. 123456789"
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add agent'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Telegram ID</th>
              <th>Active</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No agents yet.
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="mono">{a.telegram_id}</td>
                  <td>{a.is_active ? 'Yes' : 'No'}</td>
                  <td className="mono">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
