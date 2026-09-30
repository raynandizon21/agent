import { FileText, Loader2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import CopyImageButton from '../components/common/CopyImageButton';
import Select from '../components/common/Select';
import { effectiveCommission, effectiveRate } from '../lib/commission';
import { renderStatementImage } from '../lib/statementImage';
import { JUNKET_BADGE, JUNKET_LABELS, formatAmount, formatRate, formatSigned, toDateStr, todayStr } from '../lib/trips';
import { useRealtime } from '../useRealtime';

// Period presets, resolved to inclusive 'YYYY-MM-DD' bounds in local time.
// null bound = open-ended.
const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

function periodRange(period, custom) {
  const now = new Date();
  const today = todayStr();
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return { from: toDateStr(d), to: today };
  }
  if (period === 'month') return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (period === 'lastmonth') {
    return {
      from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (period === 'custom') return { from: custom.from || null, to: custom.to || null };
  return { from: null, to: null };
}

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function periodLabel({ from, to }) {
  if (!from && !to) return 'All time';
  if (from && to && from === to) return fmtDate(from);
  return `${from ? fmtDate(from) : 'Start'} – ${to ? fmtDate(to) : 'Today'}`;
}

function fmtWhen(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

const wlTone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-200');

function sumRows(rows) {
  return rows.reduce(
    (t, r) => ({
      games: t.games + 1,
      buy_in: t.buy_in + (Number(r.buy_in) || 0),
      cashout: t.cashout + (Number(r.cashout) || 0),
      rolling: t.rolling + (Number(r.eff.rolling) || 0),
      commission: t.commission + (Number(r.eff.commission) || 0),
      win_loss: t.win_loss + (Number(r.win_loss) || 0),
    }),
    { games: 0, buy_in: 0, cashout: 0, rolling: 0, commission: 0, win_loss: 0 }
  );
}

function Tile({ label, value, tone = 'text-slate-100' }) {
  return (
    <div className="bg-slate-950 px-2 py-1.5 sm:px-3 sm:py-2 min-w-0">
      <div className="text-[10px] sm:text-[11px] uppercase font-semibold tracking-wide text-slate-500 truncate">{label}</div>
      <div className={`font-mono-num font-bold text-[13px] sm:text-base truncate ${tone}`}>{value}</div>
    </div>
  );
}

// Statements — a per-guest, per-period summary the agent can hand to the
// guest (copy into Telegram, native share, or print/save as PDF). Numbers
// are the Guests page's *shown* figures (effectiveCommission(), display-only
// — see CLAUDE.md); nothing here writes to settlements.
export default function StatementsPage() {
  const { user } = useAuth();
  const isAdmin = user?.agentId == null;
  const [params, setParams] = useSearchParams();
  const guestId = params.get('guest') || '';

  const [guests, setGuests] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [includeGames, setIncludeGames] = useState(true);

  useEffect(() => {
    api('/guests')
      .then((d) => setGuests(d.guests || []))
      .catch((err) => setError(err.message || 'Failed to load guests'));
  }, []);

  const guest = guests.find((g) => String(g.id) === String(guestId)) || null;

  const loadRecords = useCallback(async () => {
    if (!guestId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api(`/guests/${guestId}/settlements`);
      setRecords(data.settlements || []);
    } catch (err) {
      setError(err.message || 'Failed to load game records');
    } finally {
      setLoading(false);
    }
  }, [guestId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useRealtime(
    useCallback(
      (evt) => {
        if (evt.type === 'settlement') loadRecords();
      },
      [loadRecords]
    )
  );

  const range = periodRange(period, custom);

  const rows = useMemo(() => {
    const links = {};
    for (const j of guest?.junkets || []) if (j.account_no) links[`${j.junket}|${j.account_no}`] = j;
    return records
      .filter((r) => {
        const day = toDateStr(new Date(r.created_at));
        if (range.from && day < range.from) return false;
        if (range.to && day > range.to) return false;
        return true;
      })
      .map((r) => {
        const entry = links[`${r.junket}|${r.account_no}`];
        return { ...r, eff: effectiveCommission(r, entry), rate: effectiveRate(r, entry) ?? r.game_rate };
      });
  }, [records, guest, range.from, range.to]);

  const totals = useMemo(() => sumRows(rows), [rows]);

  const byJunket = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.junket}|${r.account_no}`;
      if (!map.has(key)) map.set(key, { junket: r.junket, account_no: r.account_no, rows: [] });
      map.get(key).rows.push(r);
    }
    return [...map.values()].map((b) => ({ ...b, totals: sumRows(b.rows) }));
  }, [rows]);

  function makeImage() {
    return renderStatementImage({ guest, periodText: periodLabel(range), totals, byJunket, rows, includeGames });
  }

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-200 focus:outline-hidden focus:border-blue-500 [color-scheme:dark]';

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="print:hidden">
        <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          Statements
        </h1>
        <p className="hidden sm:block text-sm text-slate-400 mt-0.5">
          Summary of a guest's play for a period — send it to them on Telegram as an image.
        </p>
      </div>

      {/* Filter bar — stacked on phones, one row on desktop. */}
      <div className="p-2 sm:p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:contents">
          <Select
            value={guestId}
            onChange={(v) => setParams(v ? { guest: v } : {}, { replace: true })}
            options={[
              { value: '', label: guests.length ? 'Choose a guest…' : 'No guests yet' },
              ...guests.map((g) => ({
                value: String(g.id),
                label: `${g.guest_name}${g.guest_code ? ` · ${g.guest_code}` : ''}${isAdmin && g.agent_name ? ` — ${g.agent_name}` : ''}`,
              })),
            ]}
            aria-label="Guest"
            className="w-full lg:w-72 bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-sm text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
          <label className="flex items-center gap-1.5 text-[13px] text-slate-300 cursor-pointer px-1 whitespace-nowrap lg:order-last lg:ml-auto">
            <input
              type="checkbox"
              checked={includeGames}
              onChange={(e) => setIncludeGames(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 w-4 h-4 cursor-pointer"
            />
            <span className="sm:hidden">Games</span>
            <span className="hidden sm:inline">Include each game</span>
          </label>
        </div>

        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 lg:mx-0 lg:px-0">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[12px] sm:text-[13px] font-semibold border transition cursor-pointer ${
                period === p.value
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
            <label className="text-[11px] uppercase font-semibold text-slate-500 space-y-1 lg:space-y-0 lg:flex lg:items-center lg:gap-1.5">
              <span>From</span>
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="text-[11px] uppercase font-semibold text-slate-500 space-y-1 lg:space-y-0 lg:flex lg:items-center lg:gap-1.5">
              <span>To</span>
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}

      {!guest ? (
        <div className="py-16 px-6 text-center rounded-lg bg-slate-900 border border-slate-800 space-y-2">
          <Users className="w-7 h-7 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">Pick a guest above to build their statement.</p>
        </div>
      ) : (
        <>
          <CopyImageButton
            makeImage={makeImage}
            disabled={loading}
            onError={setError}
            copiedLabel="Copied — paste in Telegram"
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition cursor-pointer active:scale-95 disabled:opacity-55"
          />

          <article className="statement-doc rounded-lg bg-slate-900 border border-slate-800 p-2.5 sm:p-5 space-y-3 sm:space-y-4">
            <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-3 pb-2.5 sm:pb-3 border-b border-slate-800">
              <div className="min-w-0">
                <div className="text-[11px] uppercase font-bold tracking-widest text-slate-500">Player statement</div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 truncate">{guest.guest_name}</h2>
                <div className="text-sm text-slate-400 font-mono-num">
                  {guest.guest_code ? <span className="text-blue-400 font-bold">{guest.guest_code}</span> : null}
                  {guest.guest_code && guest.agent_name ? ' · ' : ''}
                  {guest.agent_name ? <span className="font-sans">Agent {guest.agent_name}</span> : null}
                </div>
              </div>
              <div className="sm:text-right text-sm">
                <div className="hidden sm:block text-[11px] uppercase font-semibold text-slate-500">Period</div>
                <div className="font-semibold text-slate-200">{periodLabel(range)}</div>
                <div className="text-[11px] text-slate-500">Generated {new Date().toLocaleDateString()}</div>
              </div>
            </header>

            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading games…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-px rounded-lg bg-slate-800 border border-slate-800 overflow-hidden">
                  <Tile label="Games" value={totals.games} />
                  <Tile label="Buy-in" value={formatAmount(totals.buy_in)} />
                  <Tile label="Cashout" value={formatAmount(totals.cashout)} />
                  <Tile label="Rolling" value={formatAmount(totals.rolling)} />
                  <Tile label="Commission" value={formatAmount(totals.commission)} tone="text-amber-400" />
                  <Tile label="Win / Loss" value={formatSigned(totals.win_loss)} tone={wlTone(totals.win_loss)} />
                </div>

                {byJunket.length > 1 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-[11px] uppercase font-semibold tracking-wide text-slate-500">By account</h3>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {byJunket.map((b) => (
                        <div
                          key={`${b.junket}|${b.account_no}`}
                          className="rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-2 flex items-center justify-between gap-2 min-w-0"
                        >
                          <div className="min-w-0">
                            <span
                              className={`inline-block uppercase font-bold text-[10px] px-1.5 py-0.5 rounded border ${
                                JUNKET_BADGE[b.junket] || 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {JUNKET_LABELS[b.junket] || b.junket}
                            </span>
                            <span className="ml-1.5 font-mono-num text-[13px] text-slate-300 break-all">{b.account_no}</span>
                            <div className="text-[11px] text-slate-500">{b.totals.games} games</div>
                          </div>
                          <div className="text-right font-mono-num text-[13px] leading-snug">
                            <div className="text-slate-100">{formatAmount(b.totals.rolling)}</div>
                            <div className="text-amber-400">{formatAmount(b.totals.commission)}</div>
                            <div className={wlTone(b.totals.win_loss)}>{formatSigned(b.totals.win_loss)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {includeGames ? (
                  <section className="space-y-1.5">
                    <h3 className="text-[11px] uppercase font-semibold tracking-wide text-slate-500">Games</h3>
                    {rows.length === 0 ? (
                      <p className="text-sm text-slate-500 py-6 text-center rounded-lg bg-slate-950 border border-slate-800">
                        No games in this period.
                      </p>
                    ) : (
                      <>
                        {/* Phones: stacked rows. */}
                        <ul className="sm:hidden divide-y divide-slate-800 rounded-lg bg-slate-950 border border-slate-800">
                          <li className="px-2.5 py-1.5 flex justify-between text-[10px] uppercase font-semibold text-slate-500">
                            <span>Game</span>
                            <span>
                              Roll · <span className="text-amber-400/80">Com</span> · Win/Loss
                            </span>
                          </li>
                          {rows.map((r) => (
                            <li key={r.id} className="px-2.5 py-2 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[13px] text-slate-200">{fmtWhen(r.created_at)}</div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {JUNKET_LABELS[r.junket] || r.junket} · {r.account_no} · {formatRate(r.rate)}
                                </div>
                              </div>
                              <div className="text-right font-mono-num text-[12px] leading-snug shrink-0">
                                <div className="text-slate-100">{formatAmount(r.eff.rolling)}</div>
                                <div className="text-amber-400">{formatAmount(r.eff.commission)}</div>
                                <div className={wlTone(Number(r.win_loss) || 0)}>{formatSigned(Number(r.win_loss) || 0)}</div>
                              </div>
                            </li>
                          ))}
                        </ul>

                        {/* Desktop / print: full table. */}
                        <div className="hidden sm:block rounded-lg border border-slate-800 overflow-x-auto">
                          <table className="w-full text-[13px] border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 text-[11px] font-bold uppercase text-left">
                                <th className="py-2 px-2.5">Date</th>
                                <th className="py-2 px-2.5">Account</th>
                                <th className="py-2 px-2.5 text-right">Buy-in</th>
                                <th className="py-2 px-2.5 text-right">Cashout</th>
                                <th className="py-2 px-2.5 text-right">Rolling</th>
                                <th className="py-2 px-2.5 text-right">Rate</th>
                                <th className="py-2 px-2.5 text-right">Commission</th>
                                <th className="py-2 px-2.5 text-right">Win/Loss</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono-num">
                              {rows.map((r) => (
                                <tr key={r.id}>
                                  <td className="py-1.5 px-2.5 whitespace-nowrap text-slate-400">{fmtWhen(r.created_at)}</td>
                                  <td className="py-1.5 px-2.5 whitespace-nowrap text-slate-300">
                                    <span className="font-sans font-bold text-[11px] uppercase text-slate-500 mr-1">{r.junket}</span>
                                    {r.account_no}
                                  </td>
                                  <td className="py-1.5 px-2.5 text-right text-slate-200">{formatAmount(r.buy_in)}</td>
                                  <td className="py-1.5 px-2.5 text-right text-slate-200">{formatAmount(r.cashout)}</td>
                                  <td className="py-1.5 px-2.5 text-right text-slate-100">{formatAmount(r.eff.rolling)}</td>
                                  <td className="py-1.5 px-2.5 text-right text-slate-400">{formatRate(r.rate)}</td>
                                  <td className="py-1.5 px-2.5 text-right text-amber-400">{formatAmount(r.eff.commission)}</td>
                                  <td className={`py-1.5 px-2.5 text-right ${wlTone(Number(r.win_loss) || 0)}`}>
                                    {formatSigned(Number(r.win_loss) || 0)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-slate-700 bg-slate-950 font-bold font-mono-num">
                                <td className="py-2 px-2.5 font-sans text-slate-400" colSpan={2}>
                                  TOTAL
                                </td>
                                <td className="py-2 px-2.5 text-right text-slate-100">{formatAmount(totals.buy_in)}</td>
                                <td className="py-2 px-2.5 text-right text-slate-100">{formatAmount(totals.cashout)}</td>
                                <td className="py-2 px-2.5 text-right text-slate-100">{formatAmount(totals.rolling)}</td>
                                <td />
                                <td className="py-2 px-2.5 text-right text-amber-400">{formatAmount(totals.commission)}</td>
                                <td className={`py-2 px-2.5 text-right ${wlTone(totals.win_loss)}`}>
                                  {formatSigned(totals.win_loss)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </article>
        </>
      )}
    </div>
  );
}
