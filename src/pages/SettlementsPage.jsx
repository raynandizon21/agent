import { Gamepad2, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function formatAmount(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString();
}

function sumField(rows, key) {
  return rows.reduce((sum, row) => {
    const n = Number(row[key]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

const JUNKET_BADGE = {
  win9: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  galaxy: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  democage: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  infinity: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const PAGE_SIZE = 20;

export default function SettlementsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [junket, setJunket] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Filters changed — start back at page 1 instead of showing a stale/empty page.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, junket]);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
      if (junket) params.set('junket', junket);
      const data = await api(`/settlements?${params}`);
      setRows(data.settlements || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, junket]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  // Realtime push: a new settlement (or any inbound message) triggers a refetch.
  const live = useRealtime(
    useCallback((evt) => {
      if (evt.type === 'settlement' || evt.type === 'message') loadRef.current();
    }, [])
  );

  // On (re)connect, refetch once to catch up on anything missed while offline.
  useEffect(() => {
    if (live) loadRef.current();
  }, [live]);

  async function onClearConfirmed() {
    setClearing(true);
    setError('');
    try {
      await api('/settlements', { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to clear');
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  }

  const totals = useMemo(
    () => ({
      buy_in: sumField(rows, 'buy_in'),
      cashout: sumField(rows, 'cashout'),
      win_loss: sumField(rows, 'win_loss'),
      rolling: sumField(rows, 'rolling'),
      commission: sumField(rows, 'commission'),
    }),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // A refetch can shrink the row count (e.g. after Clear data) — keep the
  // current page from pointing past the end.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Settlements</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            <span className={live ? 'text-emerald-400' : 'text-slate-500'}>
              {live ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
            Buy-in
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-100 font-mono-num tracking-tight block mt-0.5 truncate">
            {formatAmount(totals.buy_in)}
          </span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
            Cashout
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-100 font-mono-num tracking-tight block mt-0.5 truncate">
            {formatAmount(totals.cashout)}
          </span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
            Rolling
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-100 font-mono-num tracking-tight block mt-0.5 truncate">
            {formatAmount(totals.rolling)}
          </span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[13px] font-semibold text-amber-400/90 uppercase tracking-wider block truncate">
            Commission
          </span>
          <span className="text-sm sm:text-base font-bold text-amber-400 font-mono-num tracking-tight block mt-0.5 truncate">
            {formatAmount(totals.commission)}
          </span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
            Win / Loss
          </span>
          <span
            className={`text-sm sm:text-base font-bold font-mono-num tracking-tight block mt-0.5 truncate ${
              totals.win_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totals.win_loss >= 0 ? '+' : ''}
            {formatAmount(totals.win_loss)}
          </span>
        </div>
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search account, player, game no…"
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <select
            value={junket}
            onChange={(e) => setJunket(e.target.value)}
            aria-label="Junket filter"
            className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="">All junkets</option>
            <option value="win9">Win9</option>
            <option value="galaxy">Galaxy</option>
            <option value="democage">Demo Cage</option>
            <option value="infinity">Infinity</option>
          </select>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={clearing}
            title="Delete all settlements and messages"
            className="px-2.5 py-1.5 text-sm font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 rounded-md transition border border-rose-500/20 flex items-center gap-1 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all data?"
        message="This deletes ALL settlements and messages. This cannot be undone."
        confirmLabel="Delete everything"
        busy={clearing}
        onConfirm={onClearConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {loading && rows.length === 0 ? <p className="text-slate-400 text-sm">Loading…</p> : null}

      {rows.length === 0 && !loading ? (
        <div className="p-8 text-center rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
          <Gamepad2 className="w-6 h-6 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No settlements yet.</h3>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-slate-900 border border-slate-800 shadow-xs">
          <table className="w-full text-left text-sm border-collapse min-w-[1100px]">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[13px] font-bold tracking-wider border-b border-slate-800 select-none sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Junket</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Game No.</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Account No.</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Player Name</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Agent</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Buy-in</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Cashout</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Rolling</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Commission</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Win/Loss</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {pagedRows.map((s) => {
                const { dateStr, timeStr } = formatWhenParts(s.settled_at || s.created_at);
                return (
                <tr key={s.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-sm leading-tight">
                    <div className="text-slate-200">{dateStr}</div>
                    {timeStr ? <div className="text-slate-400 text-[14px] mt-0.5">{timeStr}</div> : null}
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap font-sans">
                    <span
                      className={`text-[12px] uppercase font-semibold px-2 py-0.5 rounded border ${
                        s.status === 'open'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      }`}
                    >
                      {s.status === 'open' ? s.step || 'open' : 'settled'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap font-sans">
                    <span
                      className={`text-[12px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-sm border ${
                        JUNKET_BADGE[s.junket] || 'bg-slate-700 text-slate-300 border-slate-600'
                      }`}
                    >
                      {s.junket}
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap font-mono-num text-slate-300">{s.game_no || '—'}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                    <div className="font-bold text-white font-mono-num text-sm">{s.account_no || '—'}</div>
                    {s.account_name ? (
                      <div className="text-[14px] text-slate-400 mt-0.5">{s.account_name}</div>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-sans text-slate-200">
                    {s.player_name || '—'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                    {s.agent_name ? (
                      <span className="font-medium text-slate-200">{s.agent_name}</span>
                    ) : (
                      <span className="text-[12px] uppercase font-semibold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-500/20">
                        Unmatched
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-slate-200">
                    {formatAmount(s.buy_in)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-slate-200">
                    {formatAmount(s.cashout)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-slate-100">
                    {formatAmount(s.rolling)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-amber-400">
                    {formatAmount(s.commission)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right whitespace-nowrap font-bold ${
                      Number(s.win_loss) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatAmount(s.win_loss)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-slate-200 font-mono-num">
                    {formatAmount(s.balance)}
                  </td>
                </tr>
                );
              })}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-800 bg-slate-950/70 font-bold">
                  <td colSpan={7} className="py-3 px-3 text-slate-300">
                    Total
                  </td>
                  <td className="py-3 px-3 text-right text-slate-100">{formatAmount(totals.buy_in)}</td>
                  <td className="py-3 px-3 text-right text-slate-100">{formatAmount(totals.cashout)}</td>
                  <td className="py-3 px-3 text-right text-slate-100">{formatAmount(totals.rolling)}</td>
                  <td className="py-3 px-3 text-right text-amber-400">{formatAmount(totals.commission)}</td>
                  <td
                    className={`py-3 px-3 text-right ${
                      totals.win_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatAmount(totals.win_loss)}
                  </td>
                  <td className="py-3 px-3"></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {rows.length > 0 ? (
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
