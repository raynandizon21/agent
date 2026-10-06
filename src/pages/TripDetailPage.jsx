import {
  ArrowLeft,
  ArrowRightLeft,
  BarChart3,
  BedDouble,
  CalendarDays,
  Dices,
  Edit2,
  Loader2,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';
import Select from '../components/common/Select';
import TripFormModal from '../components/trips/TripFormModal';
import { effectiveCommission, effectiveRate } from '../lib/commission';
import {
  JUNKET_BADGE,
  JUNKET_LABELS,
  TRIP_STATUSES,
  daysBetween,
  formatAmount,
  formatDay,
  formatRange,
  formatRate,
  formatSigned,
  formatTime,
  toDateStr,
  todayStr,
  tripDays,
  tripProgress,
  tripStatus,
} from '../lib/trips';
import { useRealtime } from '../useRealtime';

const TABS = [
  { value: 'casino', label: 'Casino', icon: Dices },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'exchange', label: 'Exchange', icon: ArrowRightLeft },
  { value: 'analysis', label: 'Analysis', icon: BarChart3 },
];

const CURRENCIES = ['PHP', 'KRW', 'USD', 'CNY', 'HKD', 'JPY', 'SGD', 'TWD', 'THB', 'VND'];
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

const inputCls =
  'w-full bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg px-3 py-2.5 text-base sm:text-sm text-slate-100 outline-none placeholder:text-slate-500';

function winLossCls(n) {
  if (n == null || Number(n) === 0) return 'text-slate-300';
  return Number(n) > 0 ? 'text-emerald-400' : 'text-rose-400';
}

function Stat({ label, value, cls = 'text-slate-100', sub }) {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono-num text-base sm:text-lg font-bold truncate ${cls}`}>{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 truncate">{sub}</div> : null}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm text-slate-500 text-center py-10">{children}</p>;
}

// ---------- Casino ----------

// Totals and stats are always the trip window only; "Show all" just lists the
// guest's other games (dimmed) so a wrongly-dated trip is easy to spot.
function CasinoTab({ games, outsideGames, totals }) {
  const [showAll, setShowAll] = useState(false);
  const listed = showAll
    ? [...games, ...outsideGames].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
    : games;

  const outsideNote = outsideGames.length ? (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40 text-xs text-slate-400">
      <span>
        {outsideGames.length} game{outsideGames.length === 1 ? '' : 's'} outside the trip dates
      </span>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="font-semibold text-blue-300 hover:text-blue-200 cursor-pointer shrink-0"
      >
        {showAll ? 'Hide' : 'Show all'}
      </button>
    </div>
  ) : null;

  if (listed.length === 0) {
    return (
      <div className="space-y-3">
        <Empty>No casino records during this trip yet.</Empty>
        {outsideNote}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {games.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Games" value={games.length} />
          <Stat label="Win / Loss" value={formatSigned(totals.win_loss)} cls={winLossCls(totals.win_loss)} />
          <Stat label="Rolling" value={formatAmount(totals.rolling)} />
          <Stat label="Commission" value={formatAmount(totals.commission)} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center pt-2">No casino records during this trip yet.</p>
      )}

      {outsideNote}

      <div className="space-y-2">
        {listed.map((g) => (
          <div
            key={g.id}
            className={`bg-slate-900/70 border rounded-xl p-3 ${g.in_trip ? 'border-slate-800' : 'border-dashed border-slate-700 opacity-60'}`}
          >
            {!g.in_trip ? (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Outside trip dates</div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold shrink-0 ${JUNKET_BADGE[g.junket] || ''}`}>
                  {JUNKET_LABELS[g.junket] || g.junket}
                </span>
                <span className="text-sm text-slate-200 truncate">
                  {g.account_no}
                  {g.game_no ? <span className="text-slate-500"> · #{g.game_no}</span> : null}
                </span>
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {formatDay(toDateStr(new Date(g.played_at)))} {formatTime(g.played_at)}
              </span>
            </div>

            <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              <div>
                <dt className="text-slate-500">Buy-in</dt>
                <dd className="font-mono-num text-slate-200">{formatAmount(g.buy_in)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cashout</dt>
                <dd className="font-mono-num text-slate-200">{formatAmount(g.cashout)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Win / Loss</dt>
                <dd className={`font-mono-num font-semibold ${winLossCls(g.win_loss)}`}>{formatSigned(g.win_loss)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Rolling</dt>
                <dd className="font-mono-num text-slate-200">{formatAmount(g.eff.rolling)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Rate</dt>
                <dd className="font-mono-num text-slate-200">{formatRate(g.rate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Commission</dt>
                <dd className="font-mono-num text-slate-200">{formatAmount(g.eff.commission)}</dd>
              </div>
            </dl>
            {g.status && g.status !== 'settled' ? (
              <div className="mt-2 text-[11px] font-semibold text-amber-400">In progress · {g.step || g.status}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Calendar ----------

function CalendarTab({ trip, days, byDay }) {
  const today = todayStr();
  const last = days.length - 1;
  return (
    <ol className="relative border-l border-slate-800 ml-2 space-y-3">
      {days.map((d, i) => {
        const info = byDay[d] || { games: [], exchanges: [] };
        const isToday = d === today;
        const winLoss = info.games.reduce((s, g) => s + (Number(g.win_loss) || 0), 0);
        const rolling = info.games.reduce((s, g) => s + (Number(g.eff.rolling) || 0), 0);
        const events = [];
        if (i === 0) {
          events.push({
            icon: PlaneLanding,
            text: `Arrival${trip.arrival_flight ? ` · ${trip.arrival_flight}` : ''}`,
          });
          if (trip.hotel) events.push({ icon: BedDouble, text: `Check-in · ${trip.hotel}${trip.room_no ? ` #${trip.room_no}` : ''}` });
        }
        if (i === last) {
          if (trip.hotel && last > 0) events.push({ icon: BedDouble, text: `Check-out · ${trip.hotel}` });
          events.push({
            icon: PlaneTakeoff,
            text: `Departure${trip.departure_flight ? ` · ${trip.departure_flight}` : ''}`,
          });
        }
        return (
          <li key={d} className="ml-4">
            <span
              className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${
                isToday ? 'bg-blue-400' : d < today ? 'bg-slate-500' : 'bg-slate-700'
              }`}
            />
            <div className={`rounded-xl border p-3 ${isToday ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-100">
                  {formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[11px] text-slate-500">
                  {isToday ? <span className="text-blue-300 font-semibold">Today · </span> : null}Day {i + 1}
                </span>
              </div>

              {events.length || info.games.length || info.exchanges.length ? (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                  {events.map((e) => (
                    <li key={e.text} className="flex items-center gap-1.5">
                      <e.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{e.text}</span>
                    </li>
                  ))}
                  {info.games.length ? (
                    <li className="flex items-center gap-1.5">
                      <Dices className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {info.games.length} game{info.games.length > 1 ? 's' : ''} · Rolling{' '}
                        <span className="font-mono-num">{formatAmount(rolling)}</span> ·{' '}
                        <span className={`font-mono-num font-semibold ${winLossCls(winLoss)}`}>{formatSigned(winLoss)}</span>
                      </span>
                    </li>
                  ) : null}
                  {info.exchanges.map((x) => (
                    <li key={x.id} className="flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono-num truncate">
                        {formatAmount(x.from_amount)} {x.from_currency} → {formatAmount(x.to_amount)} {x.to_currency}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No activity</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Money exchange ----------

function nowLocal() {
  const d = new Date();
  return `${toDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ExchangeTab({ tripId, exchanges, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  function startAdd() {
    setForm({ exchange_dt: nowLocal(), from_currency: 'KRW', from_amount: '', to_currency: 'PHP', rate: '', to_amount: '', notes: '' });
    setError('');
    setOpen(true);
  }

  function set(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Amount × rate fills "receive" automatically; typing "receive"
      // directly back-fills the rate instead, so either can be the input.
      const from = Number(next.from_amount);
      if ((key === 'from_amount' || key === 'rate') && from > 0 && Number(next.rate) > 0) {
        next.to_amount = String(Math.round(from * Number(next.rate) * 100) / 100);
      } else if (key === 'to_amount' && from > 0 && Number(value) > 0) {
        next.rate = String(Math.round((Number(value) / from) * 1e6) / 1e6);
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/trips/${tripId}/exchanges`, { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await api(`/trips/${tripId}/exchanges/${toDelete.id}`, { method: 'DELETE' });
      setToDelete(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          type="button"
          onClick={startAdd}
          className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-sm font-semibold text-blue-300 hover:bg-slate-900 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add exchange
        </button>
      ) : (
        <form onSubmit={submit} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
          <input type="datetime-local" className={inputCls} value={form.exchange_dt} onChange={(e) => set('exchange_dt', e.target.value)} />
          <div className="grid grid-cols-[88px_1fr] gap-2">
            <Select className={inputCls} value={form.from_currency} onChange={(c) => set('from_currency', c)} options={CURRENCY_OPTIONS} />
            <input inputMode="decimal" className={`${inputCls} font-mono-num`} placeholder="Give amount" value={form.from_amount} onChange={(e) => set('from_amount', e.target.value)} />
          </div>
          <input inputMode="decimal" className={`${inputCls} font-mono-num`} placeholder={`Rate (1 ${form.from_currency} = ? ${form.to_currency})`} value={form.rate} onChange={(e) => set('rate', e.target.value)} />
          <div className="grid grid-cols-[88px_1fr] gap-2">
            <Select className={inputCls} value={form.to_currency} onChange={(c) => set('to_currency', c)} options={CURRENCY_OPTIONS} />
            <input inputMode="decimal" className={`${inputCls} font-mono-num`} placeholder="Receive amount" value={form.to_amount} onChange={(e) => set('to_amount', e.target.value)} />
          </div>
          <input className={inputCls} placeholder="Notes (optional)" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-300 bg-slate-800 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 cursor-pointer">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {exchanges.length === 0 ? (
        <Empty>No money exchanges logged for this trip.</Empty>
      ) : (
        <div className="space-y-2">
          {exchanges.map((x) => (
            <div key={x.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono-num text-sm text-slate-100">
                  {formatAmount(x.from_amount)} <span className="text-slate-400">{x.from_currency}</span>
                  <span className="text-slate-500"> → </span>
                  {formatAmount(x.to_amount)} <span className="text-slate-400">{x.to_currency}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {formatDay(x.exchange_dt.slice(0, 10))} {x.exchange_dt.slice(11, 16)}
                  {x.rate != null ? ` · rate ${Number(x.rate)}` : ''}
                  {x.notes ? ` · ${x.notes}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToDelete(x)}
                aria-label="Delete exchange"
                className="p-2 -m-1 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete exchange?"
        message={toDelete ? `${formatAmount(toDelete.from_amount)} ${toDelete.from_currency} → ${formatAmount(toDelete.to_amount)} ${toDelete.to_currency}` : ''}
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// ---------- Analysis ----------

function AnalysisTab({ trip, days, games, totals, byDay, exchanges }) {
  const today = todayStr();
  const elapsed = Math.max(1, Math.min(days.length, daysBetween(trip.arrival_date, today) + 1));
  const playedDays = days.filter((d) => byDay[d]?.games.length).length;

  const byJunket = useMemo(() => {
    const m = new Map();
    for (const g of games) {
      const k = g.junket;
      const cur = m.get(k) || { junket: k, games: 0, win_loss: 0, rolling: 0, commission: 0 };
      cur.games += 1;
      cur.win_loss += Number(g.win_loss) || 0;
      cur.rolling += Number(g.eff.rolling) || 0;
      cur.commission += Number(g.eff.commission) || 0;
      m.set(k, cur);
    }
    return [...m.values()];
  }, [games]);

  const daily = days.map((d) => ({
    day: d,
    win_loss: (byDay[d]?.games || []).reduce((s, g) => s + (Number(g.win_loss) || 0), 0),
    count: byDay[d]?.games.length || 0,
  }));
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d.win_loss)));

  const exchangeTotals = useMemo(() => {
    const m = new Map();
    for (const x of exchanges) {
      const k = `${x.from_currency}→${x.to_currency}`;
      const cur = m.get(k) || { pair: k, from: x.from_currency, to: x.to_currency, fromSum: 0, toSum: 0, count: 0 };
      cur.fromSum += Number(x.from_amount) || 0;
      cur.toSum += Number(x.to_amount) || 0;
      cur.count += 1;
      m.set(k, cur);
    }
    return [...m.values()];
  }, [exchanges]);

  const status = tripStatus(trip, today);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="col-span-2 sm:col-span-3 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trip win / loss</div>
          <div className={`font-mono-num text-2xl font-bold ${winLossCls(totals.win_loss)}`}>{formatSigned(totals.win_loss)}</div>
          <div className="text-xs text-slate-500">
            {games.length} game{games.length === 1 ? '' : 's'} over {playedDays} of {days.length} day{days.length === 1 ? '' : 's'}
          </div>
        </div>
        <Stat label="Buy-in" value={formatAmount(totals.buy_in)} />
        <Stat label="Cashout" value={formatAmount(totals.cashout)} />
        <Stat label="Rolling" value={formatAmount(totals.rolling)} />
        <Stat label="Commission" value={formatAmount(totals.commission)} />
        <Stat
          label="Rolling / day"
          value={formatAmount(Math.round(totals.rolling / (status === 'coming' ? days.length : elapsed)))}
          sub={status === 'staying' ? `over ${elapsed} day${elapsed === 1 ? '' : 's'} so far` : null}
        />
        <Stat label="Avg rolling / game" value={games.length ? formatAmount(Math.round(totals.rolling / games.length)) : '—'} />
      </div>

      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Daily win / loss</h3>
        {games.length === 0 ? (
          <p className="text-xs text-slate-500">No games yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {daily.map((d) => {
              const pct = (Math.abs(d.win_loss) / maxAbs) * 50;
              const pos = d.win_loss >= 0;
              return (
                <li
                  key={d.day}
                  className="grid grid-cols-[56px_1fr_88px] items-center gap-2 text-xs"
                  title={`${formatDay(d.day)} · ${d.count} game${d.count === 1 ? '' : 's'} · ${formatSigned(d.win_loss)}`}
                >
                  <span className="text-slate-400">{formatDay(d.day)}</span>
                  <span className="relative h-4">
                    <span className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700" />
                    {d.win_loss !== 0 ? (
                      <span
                        className={`absolute top-0.5 bottom-0.5 ${pos ? 'bg-emerald-500/80 rounded-r' : 'bg-rose-500/80 rounded-l'}`}
                        style={pos ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                      />
                    ) : null}
                  </span>
                  <span className={`font-mono-num text-right ${d.count ? winLossCls(d.win_loss) : 'text-slate-600'}`}>
                    {d.count ? formatSigned(d.win_loss) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {byJunket.length ? (
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-slate-200 mb-2">By junket</h3>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[340px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left font-semibold px-1 py-1">Junket</th>
                  <th className="text-right font-semibold px-1 py-1">Games</th>
                  <th className="text-right font-semibold px-1 py-1">Win/Loss</th>
                  <th className="text-right font-semibold px-1 py-1">Rolling</th>
                  <th className="text-right font-semibold px-1 py-1">Com</th>
                </tr>
              </thead>
              <tbody className="font-mono-num">
                {byJunket.map((j) => (
                  <tr key={j.junket} className="border-t border-slate-800">
                    <td className="px-1 py-1.5 font-sans text-slate-200">{JUNKET_LABELS[j.junket] || j.junket}</td>
                    <td className="px-1 py-1.5 text-right text-slate-300">{j.games}</td>
                    <td className={`px-1 py-1.5 text-right ${winLossCls(j.win_loss)}`}>{formatSigned(j.win_loss)}</td>
                    <td className="px-1 py-1.5 text-right text-slate-300">{formatAmount(j.rolling)}</td>
                    <td className="px-1 py-1.5 text-right text-slate-300">{formatAmount(j.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {exchangeTotals.length ? (
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-slate-200 mb-2">Money exchanged</h3>
          <ul className="space-y-1.5 text-xs">
            {exchangeTotals.map((x) => (
              <li key={x.pair} className="flex items-center justify-between gap-2">
                <span className="font-mono-num text-slate-200">
                  {formatAmount(x.fromSum)} {x.from} → {formatAmount(Math.round(x.toSum * 100) / 100)} {x.to}
                </span>
                <span className="text-slate-500 shrink-0">
                  avg {Number((x.toSum / x.fromSum).toPrecision(4))} · {x.count}×
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ---------- Page ----------

// One guest trip: header with schedule/flight/hotel, then four modules —
// Casino (games in the trip window), Calendar (day-by-day timeline), Money
// Exchange (logged exchanges) and Analysis (trip totals). The active tab
// lives in the URL (?tab=) so the phone's back button and refresh keep it.
export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'casino';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/trips/${id}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // New settlement reports can land mid-trip — refresh when one arrives.
  useRealtime(
    useCallback(
      (evt) => {
        if (evt.type === 'settlement') load();
      },
      [load]
    )
  );

  const derived = useMemo(() => {
    if (!data) return null;
    const { trip, junkets, settlements, exchanges } = data;
    const linkByAccount = {};
    for (const j of junkets) if (j.account_no) linkByAccount[`${j.junket}|${j.account_no}`] = j;

    const allGames = settlements.map((s) => {
      const entry = linkByAccount[`${s.junket}|${s.account_no}`];
      return { ...s, eff: effectiveCommission(s, entry), rate: effectiveRate(s, entry) ?? s.game_rate };
    });
    // Everything below (totals, calendar, analysis) is the trip window only;
    // outsideGames is just for the Casino tab's "show all" escape hatch.
    const games = allGames.filter((g) => g.in_trip);
    const outsideGames = allGames.filter((g) => !g.in_trip);

    const totals = games.reduce(
      (acc, g) => ({
        buy_in: acc.buy_in + (Number(g.buy_in) || 0),
        cashout: acc.cashout + (Number(g.cashout) || 0),
        win_loss: acc.win_loss + (Number(g.win_loss) || 0),
        rolling: acc.rolling + (Number(g.eff.rolling) || 0),
        commission: acc.commission + (Number(g.eff.commission) || 0),
      }),
      { buy_in: 0, cashout: 0, win_loss: 0, rolling: 0, commission: 0 }
    );

    const days = tripDays(trip);
    const byDay = {};
    for (const d of days) byDay[d] = { games: [], exchanges: [] };
    for (const g of games) byDay[toDateStr(new Date(g.played_at))]?.games.push(g);
    for (const x of exchanges) byDay[x.exchange_dt.slice(0, 10)]?.exchanges.push(x);

    return { trip, junkets, games, outsideGames, totals, days, byDay, exchanges };
  }, [data]);

  function selectTab(value) {
    setParams(value === 'casino' ? {} : { tab: value }, { replace: true });
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api(`/trips/${id}`, { method: 'DELETE' });
      navigate('/trips', { replace: true });
    } catch (err) {
      setError(err.message);
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (!derived) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Trips
        </Link>
        {error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        )}
      </div>
    );
  }

  const { trip, junkets } = derived;
  const status = TRIP_STATUSES.find((s) => s.value === tripStatus(trip));

  return (
    <div className="max-w-3xl lg:max-w-none mx-auto space-y-3 lg:space-y-0 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-x-4 lg:gap-y-3 lg:items-start">
      <div className="flex items-center justify-between lg:col-span-2">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white py-1">
          <ArrowLeft className="w-4 h-4" /> Trips
        </Link>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setEditOpen(true)} aria-label="Edit trip" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <Edit2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setDeleteOpen(true)} aria-label="Delete trip" className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desktop: trip info pinned on the left, modules on the right. */}
      <header className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 space-y-2 lg:sticky lg:top-20">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{trip.guest_name}</h2>
            <p className="text-xs text-slate-400">
              {formatRange(trip)} · {tripProgress(trip)}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold shrink-0 ${status.badge}`}>{status.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
            <PlaneLanding className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{trip.arrival_flight || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
            <PlaneTakeoff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{trip.departure_flight || '—'}</span>
          </div>
          <div className="col-span-2 flex items-center gap-1.5 text-slate-300 min-w-0">
            <BedDouble className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">
              {trip.hotel || '—'}
              {trip.room_no ? ` · Room ${trip.room_no}` : ''}
            </span>
          </div>
        </div>

        {junkets.some((j) => j.account_no) ? (
          <div className="flex flex-wrap gap-1.5">
            {junkets
              .filter((j) => j.account_no)
              .map((j) => (
                <span key={j.junket} className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${JUNKET_BADGE[j.junket] || ''}`}>
                  {JUNKET_LABELS[j.junket] || j.junket} · {j.account_no}
                </span>
              ))}
          </div>
        ) : null}
        {trip.notes ? <p className="text-xs text-slate-400 whitespace-pre-wrap">{trip.notes}</p> : null}
      </header>

      <div className="min-w-0 space-y-3">
      <nav className="grid grid-cols-4 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl" aria-label="Trip modules">
        {TABS.map((t) => {
          const active = tab === t.value;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => selectTab(t.value)}
              aria-current={active ? 'page' : undefined}
              className={`py-2 rounded-lg border flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                active ? 'bg-blue-600/15 text-blue-300 border-blue-500/30' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {tab === 'casino' ? (
        <CasinoTab games={derived.games} outsideGames={derived.outsideGames} totals={derived.totals} />
      ) : null}
      {tab === 'calendar' ? <CalendarTab trip={trip} days={derived.days} byDay={derived.byDay} /> : null}
      {tab === 'exchange' ? <ExchangeTab tripId={trip.id} exchanges={derived.exchanges} onChanged={load} /> : null}
      {tab === 'analysis' ? <AnalysisTab {...derived} /> : null}
      </div>

      <TripFormModal
        open={editOpen}
        trip={trip}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete trip?"
        message={`${trip.guest_name} · ${formatRange(trip)}. Exchanges logged for this trip are deleted too. Casino records are not affected.`}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
