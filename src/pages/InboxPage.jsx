import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';
import { useRealtime } from '../useRealtime';

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function InboxPage() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async (search = q) => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) params.set('q', search.trim());
      const data = await api(`/messages?${params}`);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [q]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load('');
  }, []);

  // Realtime push: refetch when the server reports a new inbound message.
  const live = useRealtime(
    useCallback((evt) => {
      if (evt.type === 'message') loadRef.current(q);
    }, [q])
  );

  // On (re)connect, refetch once to catch up on anything missed while offline.
  useEffect(() => {
    if (live) loadRef.current(q);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(e) {
    e.preventDefault();
    load(q);
  }

  async function onClearConfirmed() {
    setClearing(true);
    setError('');
    try {
      await api('/messages', { method: 'DELETE' });
      await load(q);
    } catch (err) {
      setError(err.message || 'Failed to clear');
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Message log</h1>
          <p className="muted">
            Inbound Telegram messages from agents
            {' · '}
            <span className={live ? 'ok' : 'muted'}>
              {live ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>
        <form className="search-row" onSubmit={onSearch}>
          <input
            placeholder="Search text, agent, username, chat id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit">Search</button>
          <button type="button" className="ghost" onClick={() => load(q)}>
            Refresh
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => setConfirmOpen(true)}
            disabled={clearing}
            title="Delete all messages and settlements"
          >
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
        </form>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all data?"
        message="This deletes ALL messages and settlements. This cannot be undone."
        confirmLabel="Delete everything"
        busy={clearing}
        onConfirm={onClearConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      {error ? <p className="error">{error}</p> : null}
      {loading && messages.length === 0 ? <p className="muted">Loading…</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Agent</th>
              <th>From</th>
              <th>Chat ID</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="empty">
                  No messages yet. Have an agent message the bot.
                </td>
              </tr>
            ) : (
              messages.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{formatWhen(m.received_at)}</td>
                  <td>
                    {m.agent_name || (
                      <span className="badge warn">Unmatched</span>
                    )}
                  </td>
                  <td className="mono">
                    {m.telegram_username
                      ? `@${m.telegram_username}`
                      : m.telegram_user_id || '—'}
                  </td>
                  <td className="mono">{m.telegram_chat_id}</td>
                  <td className="msg">{m.message_text}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
