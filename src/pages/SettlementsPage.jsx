import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const PAGE_SIZE = 12;

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
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Settlements</h1>
          <p className="muted">
            <span className={live ? 'ok' : 'muted'}>
              {live ? 'live' : 'reconnecting…'}
            </span>
          </p>
        </div>
        <div className="search-row">
          <select
            value={junket}
            onChange={(e) => setJunket(e.target.value)}
            aria-label="Junket filter"
          >
            <option value="">All junkets</option>
            <option value="win9">Win9</option>
            <option value="galaxy">Galaxy</option>
            <option value="democage">Demo Cage</option>
            <option value="infinity">Infinity</option>
          </select>
          <input
            placeholder="Search account, player, game no…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="danger"
            onClick={() => setConfirmOpen(true)}
            disabled={clearing}
            title="Delete all settlements and messages"
          >
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all data?"
        message="This deletes ALL settlements and messages. This cannot be undone."
        confirmLabel="Delete everything"
        busy={clearing}
        onConfirm={onClearConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      {error ? <p className="error">{error}</p> : null}
      {loading && rows.length === 0 ? <p className="muted">Loading…</p> : null}

      <div className="table-wrap">
        <table className="settlements-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Junket</th>
              <th>Game No.</th>
              <th>Account No.</th>
              <th>Player Name</th>
              <th>Agent</th>
              <th>Buy-in</th>
              <th>Cashout</th>
              <th>Rolling</th>
              <th>Commission</th>
              <th>Win/Loss</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={13} className="empty">
                  No settlements yet.
                </td>
              </tr>
            ) : (
              pagedRows.map((s) => (
                <tr key={s.id}>
                  <td className="mono" data-label="Date">{formatWhen(s.settled_at || s.created_at)}</td>
                  <td data-label="Status">
                    <span className={`badge status-${s.status}`}>
                      {s.status === 'open' ? s.step || 'open' : 'settled'}
                    </span>
                  </td>
                  <td data-label="Junket">
                    <span className={`badge junket-${s.junket}`}>{s.junket}</span>
                  </td>
                  <td className="mono" data-label="Game No.">{s.game_no || '—'}</td>
                  <td className="mono" data-label="Account No.">
                    <div style={{ whiteSpace: 'nowrap' }}>{s.account_no || '—'}</div>
                    {s.account_name ? (
                      <div className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {s.account_name}
                      </div>
                    ) : null}
                  </td>
                  <td data-label="Player Name">{s.player_name || '—'}</td>
                  <td data-label="Agent">
                    {s.agent_name || (
                      <span className="badge warn">Unmatched</span>
                    )}
                  </td>
                  <td className="mono num" data-label="Buy-in">{formatAmount(s.buy_in)}</td>
                  <td className="mono num" data-label="Cashout">{formatAmount(s.cashout)}</td>
                  <td className="mono num" data-label="Rolling">{formatAmount(s.rolling)}</td>
                  <td className="mono num" data-label="Commission">{formatAmount(s.commission)}</td>
                  <td className="mono num" data-label="Win/Loss">{formatAmount(s.win_loss)}</td>
                  <td className="mono num" data-label="Balance">{formatAmount(s.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="totals-row">
                <td colSpan={7} data-label="Total">Total</td>
                <td className="mono num" data-label="Buy-in">{formatAmount(totals.buy_in)}</td>
                <td className="mono num" data-label="Cashout">{formatAmount(totals.cashout)}</td>
                <td className="mono num" data-label="Rolling">{formatAmount(totals.rolling)}</td>
                <td className="mono num" data-label="Commission">{formatAmount(totals.commission)}</td>
                <td className="mono num" data-label="Win/Loss">{formatAmount(totals.win_loss)}</td>
                <td data-label="Balance"></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {rows.length > 0 ? (
        <div className="pager">
          <button
            type="button"
            className="ghost"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
