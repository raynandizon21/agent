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

export default function SettlementsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [junket, setJunket] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

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
            <option value="infinitycage">Infinity Cage</option>
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
              <th>Junket</th>
              <th>Status</th>
              <th>Agent</th>
              <th>Account No.</th>
              <th>Account Name</th>
              <th>Player Name</th>
              <th>Game No.</th>
              <th>Buy-in</th>
              <th>Cashout</th>
              <th>Win/Loss</th>
              <th>Rolling</th>
              <th>Commission</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={14} className="empty">
                  No settlements yet.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{formatWhen(s.settled_at || s.created_at)}</td>
                  <td>
                    <span className={`badge junket-${s.junket}`}>{s.junket}</span>
                  </td>
                  <td>
                    <span className={`badge status-${s.status}`}>
                      {s.status === 'open' ? s.step || 'open' : 'settled'}
                    </span>
                  </td>
                  <td>
                    {s.agent_name || (
                      <span className="badge warn">Unmatched</span>
                    )}
                  </td>
                  <td className="mono">{s.account_no || '—'}</td>
                  <td>{s.account_name || '—'}</td>
                  <td>{s.player_name || '—'}</td>
                  <td className="mono">{s.game_no || '—'}</td>
                  <td className="mono num">{formatAmount(s.buy_in)}</td>
                  <td className="mono num">{formatAmount(s.cashout)}</td>
                  <td className="mono num">{formatAmount(s.win_loss)}</td>
                  <td className="mono num">{formatAmount(s.rolling)}</td>
                  <td className="mono num">{formatAmount(s.commission)}</td>
                  <td className="mono num">{formatAmount(s.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="totals-row">
                <td colSpan={8}>Total</td>
                <td className="mono num">{formatAmount(totals.buy_in)}</td>
                <td className="mono num">{formatAmount(totals.cashout)}</td>
                <td className="mono num">{formatAmount(totals.win_loss)}</td>
                <td className="mono num">{formatAmount(totals.rolling)}</td>
                <td className="mono num">{formatAmount(totals.commission)}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
