import { Bot, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';
import { useRealtime } from '../useRealtime';

function formatWhenParts(value) {
  if (!value) return { dateStr: '—', timeStr: '' };
  const d = new Date(value);
  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { dateStr, timeStr };
}

const PAGE_SIZE = 20;

export default function InboxPage() {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);

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
    setPage(1);
    load(q);
  }

  const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pagedMessages = messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    <div className="space-y-3 pb-20 lg:pb-0">
      <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="text-base font-bold text-white flex items-center gap-1.5">
            <Bot className="w-4 h-4 text-blue-400" />
            Message log
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Inbound Telegram messages from agents
            {' · '}
            <span className={live ? 'text-emerald-400' : 'text-slate-500'}>
              {live ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>

        <form className="flex flex-wrap items-center gap-1.5" onSubmit={onSearch}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search text, agent, username, chat id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 min-w-[220px]"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-md transition cursor-pointer"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => load(q)}
            className="px-2.5 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded-md transition cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={clearing}
            title="Delete all messages and settlements"
            className="px-2.5 py-1.5 text-sm font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 rounded-md transition border border-rose-500/20 flex items-center gap-1 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all data?"
        message="This deletes ALL messages and settlements. This cannot be undone."
        confirmLabel="Delete everything"
        busy={clearing}
        onConfirm={onClearConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {loading && messages.length === 0 ? <p className="text-slate-400 text-sm">Loading…</p> : null}

      {messages.length === 0 && !loading ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <Bot className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-200">No messages yet.</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">Have an agent message the bot.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagedMessages.map((m) => {
            const { dateStr, timeStr } = formatWhenParts(m.received_at);
            return (
            <div
              key={m.id}
              className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 hover:border-slate-700 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {m.agent_name ? (
                      <strong className="text-sm font-bold text-white">{m.agent_name}</strong>
                    ) : (
                      <span className="text-[12px] uppercase font-semibold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-500/20">
                        Unmatched
                      </span>
                    )}
                    <span className="text-[13px] text-slate-400 font-mono-num">
                      {m.telegram_username ? `@${m.telegram_username}` : m.telegram_user_id || '—'}
                    </span>
                    <span className="text-[13px] text-slate-500 font-mono-num">Chat: {m.telegram_chat_id}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 leading-tight">
                  <div className="text-[13px] text-slate-400 font-mono-num">{dateStr}</div>
                  {timeStr ? <div className="text-[13px] text-slate-500 font-mono-num mt-0.5">{timeStr}</div> : null}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
                <pre className="text-[14px] font-mono-num text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {m.message_text}
                </pre>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {messages.length > 0 ? (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
