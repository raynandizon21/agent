import {
  ArrowRightLeft,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Dices,
  ExternalLink,
  Loader2,
  PieChart,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Modal from '../common/Modal';
import { effectiveCommission, effectiveRate } from '../../lib/commission';
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
  toDateStr,
  todayStr,
  tripStatus,
} from '../../lib/trips';
import { ExchangeTab } from '../../pages/TripDetailPage';

// Guest board — one row per guest, four columns:
//   Commission (guest)  ·  Share (games)  ·  Expenses (schedule)  ·  Profit (money exchange)
// Every cell is a button that opens a popup with the detail for that guest.
//
// Commission here is the guest-facing view: the Guests page's display-only
// custom Rolling %/Com % applied via lib/commission (never written back —
// see CLAUDE.md). The Commission popup also shows the junket-reported
// number next to it so the two are never confused.

const ROW_LIMIT = 8;

function gameDay(s) {
  const v = s.game_start || s.settled_at || s.created_at;
  return v ? toDateStr(new Date(v)) : null;
}

const compact = (v) => (Number(v) || 0).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const wlTone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');

function JunketBadge({ junket }) {
  return (
    <span
      className={`shrink-0 text-[10px] uppercase font-bold tracking-wider px-1.5 py-px rounded border ${
        JUNKET_BADGE[junket] || 'bg-slate-700 text-slate-300 border-slate-600'
      }`}
    >
      {JUNKET_LABELS[junket] || junket}
    </span>
  );
}

function Empty({ children }) {
  return <p className="text-sm text-slate-500 text-center py-8">{children}</p>;
}

// Settlement row -> guest-view numbers, using the guest's link for that account.
function withGuestView(s, guest) {
  const entry = (guest.junkets || []).find((j) => j.junket === s.junket && j.account_no === s.account_no);
  const r = { ...s, game_rate: s.rate };
  return { ...s, eff: effectiveCommission(r, entry), shownRate: effectiveRate(r, entry) ?? s.rate, entry };
}

function totalsOf(rows) {
  return rows.reduce(
    (t, r) => ({
      games: t.games + 1,
      buy_in: t.buy_in + (Number(r.buy_in) || 0),
      cashout: t.cashout + (Number(r.cashout) || 0),
      win_loss: t.win_loss + (Number(r.win_loss) || 0),
      rolling: t.rolling + (Number(r.eff.rolling) || 0),
      commission: t.commission + (Number(r.eff.commission) || 0),
      reported: t.reported + (Number(r.commission) || 0),
    }),
    { games: 0, buy_in: 0, cashout: 0, win_loss: 0, rolling: 0, commission: 0, reported: 0 }
  );
}

// Lazily loads /trips/:id for each of a guest's trips (exchanges + flights
// live there). Only runs while a Schedule / Money Exchange popup is open.
function useTripDetails(trips, enabled) {
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = trips.map((t) => t.id).join(',');

  const load = useCallback(async () => {
    if (!key) {
      setDetails([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await Promise.all(key.split(',').map((id) => api(`/trips/${id}`)));
      setDetails(res);
    } catch (err) {
      setError(err.message || 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { details, loading, error, reload: load };
}

// ---------- Commission popup ----------

function CommissionPopup({ row, periodLabel, onClose }) {
  const { guest, games } = row;
  const byAccount = useMemo(() => {
    const m = new Map();
    for (const j of guest.junkets || []) {
      if (!j.account_no) continue;
      m.set(`${j.junket}|${j.account_no}`, { link: j, rows: [] });
    }
    for (const g of games) m.get(`${g.junket}|${g.account_no}`)?.rows.push(g);
    return [...m.values()].map((a) => ({ ...a, t: totalsOf(a.rows) }));
  }, [guest, games]);
  const t = totalsOf(games);
  const custom = byAccount.some((a) => a.link.commission_rate != null || a.link.commission_percent != null);

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Commission`} icon={Coins} maxWidth="max-w-2xl"
      headerActions={
        <Link to={`/guests?view=${guest.id}`} title="Open guest" className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800">
          <ExternalLink className="w-4 h-4" />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile label={`Rolling · ${periodLabel}`} value={formatAmount(t.rolling)} />
        <Tile label="Guest commission" value={formatAmount(t.commission)} tone="text-amber-400" />
        <Tile label="Junket reported" value={formatAmount(t.reported)} tone="text-slate-300" />
      </div>

      {byAccount.length === 0 ? (
        <Empty>No junket accounts linked to this guest.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 text-[11px] font-bold uppercase tracking-wide">
                <th className="py-2 px-2.5 text-left">Account</th>
                <th className="py-2 px-2.5 text-left">Mode</th>
                <th className="py-2 px-2.5 text-right">Games</th>
                <th className="py-2 px-2.5 text-right">Rolling</th>
                <th className="py-2 px-2.5 text-right">Rate</th>
                <th className="py-2 px-2.5 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono-num">
              {byAccount.map(({ link, rows, t: a }) => (
                <tr key={`${link.junket}|${link.account_no}`}>
                  <td className="py-2 px-2.5">
                    <div className="flex items-center gap-1.5">
                      <JunketBadge junket={link.junket} />
                      <span className="font-bold text-slate-100">{link.account_no}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2.5 text-[11px] text-slate-400 whitespace-nowrap">{modeLabel(link)}</td>
                  <td className="py-2 px-2.5 text-right text-slate-300">{a.games}</td>
                  <td className="py-2 px-2.5 text-right text-slate-100">{formatAmount(a.rolling)}</td>
                  <td className="py-2 px-2.5 text-right text-slate-300">{rows[0] ? formatRate(rows[0].shownRate) : '—'}</td>
                  <td className="py-2 px-2.5 text-right font-bold text-amber-400">{formatAmount(a.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {custom
          ? 'Guest commission uses this guest’s custom Rolling % / Com % (display only). “Junket reported” is the untouched figure from the junket’s own reports.'
          : 'No custom Rolling % / Com % set — guest commission equals what the junket reported.'}
      </p>
    </Modal>
  );
}

function modeLabel(link) {
  const r = link.commission_percent;
  const c = link.commission_rate;
  if (r != null && c != null) return `Hybrid · R ${r}% · C ${c}%`;
  if (r != null) return `Rolling ${r}%`;
  if (c != null) return `Com ${c}%`;
  return 'Original';
}

function Tile({ label, value, tone = 'text-slate-100', sub }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 truncate">{label}</div>
      <div className={`font-mono-num font-bold text-sm sm:text-base truncate ${tone}`}>{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 truncate">{sub}</div> : null}
    </div>
  );
}

// ---------- Game (share) popup ----------

// Junket-vs-junket comparison: each metric shows the amount and that
// junket's share of the guest's total, with a TOP pill on the biggest.
const METRICS = [
  { key: 'buy_in', label: 'Buy-in' },
  { key: 'cashout', label: 'Cashout' },
  { key: 'rolling', label: 'Rolling' },
  { key: 'commission', label: 'Commission' },
  { key: 'win_loss', label: 'Win/Loss', signed: true },
];

function GamePopup({ row, periodLabel, onClose }) {
  const { guest, games } = row;
  const [showAll, setShowAll] = useState(false);
  const total = totalsOf(games);
  const junkets = useMemo(() => {
    const m = new Map();
    for (const g of games) m.set(g.junket, [...(m.get(g.junket) || []), g]);
    return [...m.entries()].map(([junket, rows]) => ({ junket, t: totalsOf(rows) })).sort((a, b) => b.t.rolling - a.t.rolling);
  }, [games]);
  const recent = useMemo(() => [...games].sort((a, b) => (gameDay(b) || '').localeCompare(gameDay(a) || '')), [games]);
  const shown = showAll ? recent : recent.slice(0, 10);

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Games`} icon={Dices} maxWidth="max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label={`Games · ${periodLabel}`} value={total.games} />
        <Tile label="Buy-in" value={formatAmount(total.buy_in)} />
        <Tile label="Rolling" value={formatAmount(total.rolling)} />
        <Tile label="Win/Loss" value={formatSigned(Math.round(total.win_loss))} tone={wlTone(total.win_loss)} />
      </div>

      {junkets.length === 0 ? (
        <Empty>No games in this period.</Empty>
      ) : (
        <>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <PieChart className="w-3.5 h-3.5" /> Share by junket
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-950/60 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2 px-2.5 text-left">Metric</th>
                  {junkets.map((j) => (
                    <th key={j.junket} className="py-2 px-2.5 text-right">
                      <JunketBadge junket={j.junket} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-num">
                {METRICS.map((m) => {
                  const values = junkets.map((j) => j.t[m.key]);
                  const best = m.signed ? Math.max(...values) : Math.max(...values.map(Math.abs));
                  const base = junkets.reduce((s, j) => s + Math.abs(j.t[m.key]), 0);
                  return (
                    <tr key={m.key}>
                      <td className="py-2 px-2.5 text-[12px] font-semibold text-slate-300 font-sans">{m.label}</td>
                      {junkets.map((j) => {
                        const v = j.t[m.key];
                        const top = junkets.length > 1 && v !== 0 && (m.signed ? v === best : Math.abs(v) === best);
                        return (
                          <td key={j.junket} className="py-2 px-2.5 text-right align-top">
                            <div className="flex items-center justify-end gap-1.5">
                              {top ? <span className="text-[9px] font-bold px-1.5 rounded-full bg-indigo-500/20 text-indigo-300">TOP</span> : null}
                              <span className={`font-bold ${m.signed ? wlTone(v) : 'text-slate-100'}`}>
                                {m.signed ? formatSigned(Math.round(v)) : formatAmount(v)}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">{base ? `${((Math.abs(v) / base) * 100).toFixed(1)}%` : '—'}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Games</h4>
          <ul className="divide-y divide-slate-800/70 rounded-xl border border-slate-800">
            {shown.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-[11px] text-slate-500">{formatDay(gameDay(g))}</span>
                <JunketBadge junket={g.junket} />
                <span className="font-mono-num text-slate-300 truncate flex-1 min-w-0">
                  {g.account_no}
                  {g.game_no ? <span className="text-slate-500"> #{g.game_no}</span> : null}
                </span>
                <span className="font-mono-num text-[12px] text-slate-400 hidden sm:inline">R {compact(g.eff.rolling)}</span>
                <span className={`font-mono-num font-bold w-24 text-right ${wlTone(Number(g.win_loss))}`}>
                  {formatSigned(Math.round(Number(g.win_loss) || 0))}
                </span>
              </li>
            ))}
          </ul>
          {recent.length > 10 ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-[12px] font-semibold text-blue-300 hover:text-blue-200 cursor-pointer">
              {showAll ? 'Show less' : `Show all ${recent.length} games`}
            </button>
          ) : null}
        </>
      )}
    </Modal>
  );
}

// ---------- Schedule (calendar) popup ----------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: toDateStr(d), inMonth: d.getMonth() === month, day: d.getDate() };
  });
}

function SchedulePopup({ row, allGames, onClose }) {
  const { guest, trips } = row;
  const today = todayStr();
  const { details, loading } = useTripDetails(trips, true);

  // Open on the current/next trip's month, else today.
  const focusTrip =
    trips.find((t) => tripStatus(t, today) === 'staying') || trips.find((t) => tripStatus(t, today) === 'coming') || trips[trips.length - 1];
  const initial = focusTrip && tripStatus(focusTrip, today) !== 'finished' ? focusTrip.arrival_date : today;
  const [cursor, setCursor] = useState(() => ({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  const byDay = useMemo(() => {
    const m = {};
    const at = (d) => (m[d] ||= { trips: [], games: [], exchanges: [], events: [] });
    for (const t of trips) {
      const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
      for (let d = t.arrival_date; d <= t.departure_date; ) {
        at(d).trips.push({ trip: t, st });
        const n = new Date(`${d}T00:00:00`);
        n.setDate(n.getDate() + 1);
        d = toDateStr(n);
      }
      at(t.arrival_date).events.push({ icon: PlaneLanding, text: `Arrival${t.arrival_flight ? ` · ${t.arrival_flight}` : ''}` });
      if (t.hotel) at(t.arrival_date).events.push({ icon: BedDouble, text: `Check-in · ${t.hotel}${t.room_no ? ` #${t.room_no}` : ''}` });
      at(t.departure_date).events.push({ icon: PlaneTakeoff, text: `Departure${t.departure_flight ? ` · ${t.departure_flight}` : ''}` });
    }
    for (const g of allGames) {
      const d = gameDay(g);
      if (d) at(d).games.push(g);
    }
    for (const det of details) for (const x of det.exchanges || []) at(x.exchange_dt.slice(0, 10)).exchanges.push(x);
    return m;
  }, [trips, allGames, details, today]);

  const move = (delta) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => {
    setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
  };

  const info = byDay[selected];
  const dayWL = (info?.games || []).reduce((s, g) => s + (Number(g.win_loss) || 0), 0);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Schedule`} icon={CalendarDays} maxWidth="max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => move(-1)} label="Previous month"><ChevronLeft className="w-4 h-4" /></NavBtn>
          <button type="button" onClick={goToday} className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer">
            Today
          </button>
          <NavBtn onClick={() => move(1)} label="Next month"><ChevronRight className="w-4 h-4" /></NavBtn>
        </div>
        <span className="text-sm font-bold text-slate-100">{monthLabel}</span>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <span className="w-4" />}
      </div>

      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden bg-slate-800 border border-slate-800">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`bg-slate-950 py-1 text-center text-[10px] font-bold uppercase ${i >= 5 ? 'text-sky-400/80' : 'text-slate-500'}`}>
            {w}
          </div>
        ))}
        {cells.map((c) => {
          const d = byDay[c.date];
          const wl = (d?.games || []).reduce((s, g) => s + (Number(g.win_loss) || 0), 0);
          const trip = d?.trips[0];
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => setSelected(c.date)}
              className={`relative min-h-[3.75rem] sm:min-h-[4.5rem] p-1 text-left flex flex-col gap-0.5 cursor-pointer transition ${
                c.date === selected ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-500/60' : c.inMonth ? 'bg-slate-900 hover:bg-slate-800/70' : 'bg-slate-950/80 hover:bg-slate-900'
              }`}
            >
              <span className={`text-[11px] font-semibold ${c.date === today ? 'text-blue-300' : c.inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                {c.day}
              </span>
              {trip ? (
                <span className={`h-1.5 rounded-full ${trip.st.dot} ${trip.trip.arrival_date === c.date ? 'ml-1' : '-ml-1'} ${trip.trip.departure_date === c.date ? 'mr-1' : '-mr-1'}`} />
              ) : null}
              {d?.games.length ? (
                <span className={`font-mono-num text-[10px] leading-none truncate ${wlTone(wl)}`}>{formatSigned(Math.round(wl / 1000))}k</span>
              ) : null}
              {d?.exchanges.length ? <ArrowRightLeft className="absolute top-1 right-1 w-3 h-3 text-amber-400" /> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {TRIP_STATUSES.map((s) => (
          <span key={s.value} className="flex items-center gap-1"><span className={`w-2.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}</span>
        ))}
        <span className="flex items-center gap-1"><span className="text-emerald-400 font-mono-num">+k</span> day win/loss</span>
        <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3 text-amber-400" /> exchange</span>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-1.5">
        <div className="text-sm font-semibold text-slate-100">
          {formatDay(selected, { weekday: 'long', month: 'short', day: 'numeric' })}
          {info?.trips.length ? (
            <span className="text-[11px] text-slate-500 font-normal">
              {' '}· Day {daysBetween(info.trips[0].trip.arrival_date, selected) + 1} of trip
            </span>
          ) : null}
        </div>
        {info && (info.events.length || info.games.length || info.exchanges.length) ? (
          <ul className="space-y-1 text-xs text-slate-300">
            {info.events.map((e) => (
              <li key={e.text} className="flex items-center gap-1.5"><e.icon className="w-3.5 h-3.5 text-slate-400" /> {e.text}</li>
            ))}
            {info.games.length ? (
              <li className="flex items-center gap-1.5">
                <Dices className="w-3.5 h-3.5 text-slate-400" />
                {info.games.length} game{info.games.length > 1 ? 's' : ''} ·{' '}
                <span className={`font-mono-num font-semibold ${wlTone(dayWL)}`}>{formatSigned(Math.round(dayWL))}</span>
              </li>
            ) : null}
            {info.exchanges.map((x) => (
              <li key={x.id} className="flex items-center gap-1.5 font-mono-num">
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                {formatAmount(x.from_amount)} {x.from_currency} → {formatAmount(x.to_amount)} {x.to_currency}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Nothing scheduled.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {trips.length === 0 ? <span className="text-[12px] text-slate-500">No trips registered for this guest.</span> : null}
        {trips.map((t) => {
          const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
          return (
            <Link key={t.id} to={`/trips/${t.id}`} className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${st.badge} hover:brightness-125`}>
              {formatRange(t)}
            </Link>
          );
        })}
        <Link to="/trips" className="text-[11px] font-semibold px-2 py-1 rounded-md border border-dashed border-slate-700 text-blue-300 hover:bg-slate-800">
          + Plan trip
        </Link>
      </div>
    </Modal>
  );
}

function NavBtn({ onClick, label, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer">
      {children}
    </button>
  );
}

// ---------- Money exchange popup ----------

function ExchangePopup({ row, onClose }) {
  const { guest, trips } = row;
  const today = todayStr();
  const { details, loading, error, reload } = useTripDetails(trips, true);
  const defaultTrip =
    trips.find((t) => tripStatus(t, today) === 'staying') || trips.find((t) => tripStatus(t, today) === 'coming') || trips[trips.length - 1];
  const [tripId, setTripId] = useState(defaultTrip?.id ?? null);
  const [calc, setCalc] = useState('');

  const all = useMemo(() => details.flatMap((d) => d.exchanges || []), [details]);

  // Per currency pair: total given / received and the weighted average rate.
  const pairs = useMemo(() => {
    const m = new Map();
    for (const x of [...all].sort((a, b) => b.exchange_dt.localeCompare(a.exchange_dt))) {
      const k = `${x.from_currency}→${x.to_currency}`;
      const cur = m.get(k) || { from: x.from_currency, to: x.to_currency, given: 0, got: 0, count: 0, last: x };
      cur.given += Number(x.from_amount) || 0;
      cur.got += Number(x.to_amount) || 0;
      cur.count += 1;
      m.set(k, cur);
    }
    return [...m.values()];
  }, [all]);

  const current = details.find((d) => d.trip.id === tripId);
  const lastPair = pairs[0];
  const lastRate = lastPair?.last.rate != null ? Number(lastPair.last.rate) : lastPair ? lastPair.got / lastPair.given : null;

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Money exchange`} icon={Wallet} maxWidth="max-w-xl">
      {pairs.length ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {pairs.map((p) => (
            <div key={`${p.from}${p.to}`} className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">
                {p.from} → {p.to} · {p.count}×
              </div>
              <div className="font-mono-num text-sm text-slate-100">
                {formatAmount(p.given)} <span className="text-slate-500">{p.from}</span>
              </div>
              <div className="font-mono-num text-sm font-bold text-amber-400">
                {formatAmount(p.got)} <span className="text-slate-500 font-normal">{p.to}</span>
              </div>
              <div className="text-[11px] text-slate-500">avg rate {(p.got / p.given).toFixed(4)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {lastPair && lastRate ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5 flex items-center gap-2 text-sm">
          <span className="text-[11px] text-slate-500 shrink-0">Quick calc</span>
          <input
            inputMode="decimal"
            value={calc}
            onChange={(e) => setCalc(e.target.value)}
            placeholder={`${lastPair.from} amount`}
            className="min-w-0 flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg px-2.5 py-1.5 font-mono-num text-slate-100 outline-none"
          />
          <span className="font-mono-num font-bold text-amber-400 shrink-0">
            = {formatAmount(Math.round((Number(calc) || 0) * lastRate * 100) / 100)} {lastPair.to}
          </span>
        </div>
      ) : null}

      {trips.length === 0 ? (
        <Empty>
          Exchanges are logged per trip — this guest has none yet.{' '}
          <Link to="/trips" className="text-blue-300 hover:text-blue-200">Plan a trip</Link>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {trips.map((t) => {
              const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
              const n = details.find((d) => d.trip.id === t.id)?.exchanges.length;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTripId(t.id)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-md border cursor-pointer ${
                    t.id === tripId ? st.active : 'border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {formatRange(t)}
                  {n ? <span className="ml-1 opacity-70">({n})</span> : null}
                </button>
              );
            })}
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {loading && !current ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
          ) : current ? (
            <ExchangeTab tripId={current.trip.id} exchanges={current.exchanges} onChanged={reload} />
          ) : null}
        </>
      )}
    </Modal>
  );
}

// ---------- Board ----------

export default function GuestBoard({ guests, settled, inPeriod, trips, periodLabel, onShowAllTime }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [popup, setPopup] = useState(null); // { kind, guestId }
  const today = todayStr();

  const rows = useMemo(() => {
    const owner = new Map();
    for (const g of guests) for (const j of g.junkets || []) owner.set(`${j.junket}|${j.account_no}`, g);
    const per = new Map(guests.map((g) => [g.id, { guest: g, games: [], allGames: [], trips: [] }]));
    for (const s of settled) {
      const g = owner.get(`${s.junket}|${s.account_no}`);
      if (g) per.get(g.id).allGames.push(withGuestView(s, g));
    }
    const periodIds = new Set(inPeriod.map((s) => s.id));
    for (const r of per.values()) r.games = r.allGames.filter((s) => periodIds.has(s.id));
    for (const t of trips) per.get(t.guest_id)?.trips.push(t);

    return [...per.values()]
      .map((r) => {
        const active = r.trips.find((t) => tripStatus(t, today) === 'staying') ||
          r.trips.find((t) => tripStatus(t, today) === 'coming' && daysBetween(today, t.arrival_date) <= 14);
        return { ...r, t: totalsOf(r.games), active };
      })
      .filter((r) => r.guest.active !== 0 && r.guest.active !== false)
      .sort((a, b) => b.t.rolling - a.t.rolling || a.guest.guest_name.localeCompare(b.guest.guest_name));
  }, [guests, settled, inPeriod, trips, today]);

  const filtered = query.trim()
    ? rows.filter((r) => `${r.guest.guest_name} ${r.guest.guest_code || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;
  const visible = showAll || query ? filtered : filtered.slice(0, ROW_LIMIT);
  const open = popup && rows.find((r) => r.guest.id === popup.guestId);
  const close = () => setPopup(null);

  return (
    <section className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 sm:p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100 min-w-0 truncate">
          Guest board {periodLabel ? <span className="font-normal text-slate-500">· {periodLabel}</span> : null}
        </h2>
        <label className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find guest"
            className="w-32 sm:w-48 bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg pl-7 pr-2 py-1.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>
      </div>

      {onShowAllTime ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          <span>No games {periodLabel ? periodLabel.toLowerCase() : 'in this period'} — values are 0.</span>
          <button type="button" onClick={onShowAllTime} className="shrink-0 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-semibold text-amber-100 cursor-pointer">
            Show All time
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-6">{query ? 'No guest matches.' : 'No guests yet — add one on the Guests page.'}</p>
      ) : null}

      {/* One standalone card per guest: name + commission on top (opens the
          Commission popup), then its own Game / Schedule / Money Exchange. */}
      <div className="grid gap-2 sm:gap-2.5">
        {visible.map((r) => (
          <GuestCard key={r.guest.id} row={r} today={today} onOpen={(kind) => setPopup({ kind, guestId: r.guest.id })} />
        ))}
      </div>

      {!query && filtered.length > ROW_LIMIT ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-[12px] font-semibold text-blue-300 hover:text-blue-200 cursor-pointer">
          {showAll ? 'Show less' : `Show all ${filtered.length} guests`}
        </button>
      ) : null}

      {open && popup.kind === 'commission' ? <CommissionPopup row={open} periodLabel={periodLabel} onClose={close} /> : null}
      {open && popup.kind === 'game' ? <GamePopup row={open} periodLabel={periodLabel} onClose={close} /> : null}
      {open && popup.kind === 'schedule' ? <SchedulePopup row={open} allGames={open.allGames} onClose={close} /> : null}
      {open && popup.kind === 'exchange' ? <ExchangePopup row={open} onClose={close} /> : null}
    </section>
  );
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function GuestCard({ row: r, today, onOpen }) {
  const st = r.active ? TRIP_STATUSES.find((x) => x.value === tripStatus(r.active, today)) : null;
  const accounts = (r.guest.junkets || []).filter((j) => j.account_no);
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 overflow-hidden shadow-sm sm:flex sm:items-stretch">
      <button
        type="button"
        onClick={() => onOpen('commission')}
        className="w-full sm:w-72 xl:w-80 sm:shrink-0 flex items-center gap-2.5 px-3 py-2.5 border-b sm:border-b-0 sm:border-r border-slate-800 hover:bg-blue-500/10 text-left cursor-pointer transition"
      >
        <span className="w-8 h-8 shrink-0 rounded-full bg-blue-600/25 border border-blue-400/30 flex items-center justify-center text-[11px] font-bold text-blue-200">
          {initials(r.guest.guest_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-100 truncate">{r.guest.guest_name}</span>
          <span className="block text-[11px] text-slate-500 truncate">
            {accounts.length
              ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · Rolling ${compact(r.t.rolling)}`
              : 'No linked account'}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">Commission</span>
          <span className="block font-mono-num font-bold text-amber-300">{formatAmount(r.t.commission)}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
      </button>
      <div className="grid grid-cols-3 gap-1.5 p-1.5 sm:flex-1 sm:min-w-0">
        <Cell icon={Dices} title="Game" onClick={() => onOpen('game')}
          value={`${r.t.games} · ${formatSigned(Math.round(r.t.win_loss))}`} valueTone={wlTone(r.t.win_loss)} />
        <Cell icon={CalendarDays} title="Schedule" onClick={() => onOpen('schedule')}
          value={r.active ? st.label : `${r.trips.length} trip${r.trips.length === 1 ? '' : 's'}`} dot={st?.dot} />
        <Cell icon={ArrowRightLeft} title="Exchange" onClick={() => onOpen('exchange')}
          value={r.trips.length ? 'View / add' : 'No trip'} />
      </div>
    </div>
  );
}

function Cell({ icon: Icon, title, value, valueTone = 'text-slate-400', dot, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg sm:rounded-xl bg-blue-500/10 hover:bg-blue-500/25 border border-blue-400/25 hover:border-blue-400/50 px-1 sm:px-2 py-1.5 sm:py-2 text-center min-w-0 transition cursor-pointer active:scale-[0.98]"
    >
      <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm font-semibold text-slate-100 min-w-0">
        {Icon ? <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-blue-300" /> : null}
        <span className="truncate">{title}</span>
      </div>
      <div className={`flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-mono-num truncate ${valueTone}`}>
        {dot ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} /> : null}
        <span className="truncate">{value}</span>
      </div>
    </button>
  );
}
