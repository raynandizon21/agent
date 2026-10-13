import {
  ArrowRightLeft,
  BedDouble,
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Dices,
  ExternalLink,
  Loader2,
  Pencil,
  PieChart,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import ConfirmDialog from '../../ConfirmDialog';
import Modal from '../common/Modal';
import ExchangeForm, { blankExchange, exchangeRate } from '../common/ExchangeForm';
import TripFormModal from '../trips/TripFormModal';
import { effectiveCommission, effectiveRate } from '../../lib/commission';
import {
  JUNKET_BADGE,
  JUNKET_LABELS,
  TRIP_STATUSES,
  bookingType,
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

// A guest's money exchanges (any time, trip optional). Only runs while a
// Schedule / Money Exchange popup is open.
function useGuestExchanges(guestId) {
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api(`/guests/${guestId}/exchanges`);
      setExchanges(data.exchanges || []);
    } catch (err) {
      setError(err.message || 'Failed to load exchanges');
    } finally {
      setLoading(false);
    }
  }, [guestId]);

  useEffect(() => {
    load();
  }, [load]);

  return { exchanges, loading, error, reload: load };
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

function SchedulePopup({ row, onClose, onPlanTrip }) {
  const { guest, trips } = row;
  const today = todayStr();

  // Open on the current/next trip's month, else today.
  const focusTrip =
    trips.find((t) => tripStatus(t, today) === 'staying') || trips.find((t) => tripStatus(t, today) === 'coming') || trips[trips.length - 1];
  const initial = focusTrip && tripStatus(focusTrip, today) !== 'finished' ? focusTrip.arrival_date : today;
  const [cursor, setCursor] = useState(() => ({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  const byDay = useMemo(() => {
    const m = {};
    const at = (d) => (m[d] ||= { trips: [], events: [] });
    for (const t of trips) {
      const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
      for (let d = t.arrival_date; d <= t.departure_date; ) {
        at(d).trips.push({ trip: t, st });
        const n = new Date(`${d}T00:00:00`);
        n.setDate(n.getDate() + 1);
        d = toDateStr(n);
      }
      const type = t.booking_type || 'hybrid';
      if (type !== 'hotel') at(t.arrival_date).events.push({ icon: PlaneLanding, text: `Arrival${t.arrival_flight ? ` · ${t.arrival_flight}` : ''}` });
      if (t.hotel) at(t.arrival_date).events.push({ icon: BedDouble, text: `Check-in · ${t.hotel}${t.room_no ? ` #${t.room_no}` : ''}` });
      if (t.hotel) at(t.departure_date).events.push({ icon: BedDouble, text: `Check-out · ${t.hotel}` });
      if (type !== 'hotel') at(t.departure_date).events.push({ icon: PlaneTakeoff, text: `Departure${t.departure_flight ? ` · ${t.departure_flight}` : ''}` });
    }
    return m;
  }, [trips, today]);

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
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Schedule`} icon={CalendarDays} maxWidth="max-w-3xl">
      {/* Month bar */}
      <div className="flex items-center gap-2">
        <NavBtn onClick={() => move(-1)} label="Previous month"><ChevronLeft className="w-4 h-4" /></NavBtn>
        <span className="flex-1 text-center text-sm font-bold text-slate-100">
          {monthLabel}
        </span>
        <NavBtn onClick={() => move(1)} label="Next month"><ChevronRight className="w-4 h-4" /></NavBtn>
        <button type="button" onClick={goToday} className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer">
          Today
        </button>
      </div>

      {/* Calendar */}
      <div>
        <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden bg-slate-800 border border-slate-800">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`bg-slate-950 py-1 text-center text-[10px] font-bold uppercase ${i >= 5 ? 'text-sky-400/80' : 'text-slate-500'}`}>
              {w}
            </div>
          ))}
          {cells.map((c) => {
            const d = byDay[c.date];
            const trip = d?.trips[0];
            return (
              <button
                key={c.date}
                type="button"
                onClick={() => setSelected(c.date)}
                className={`relative min-h-[2.75rem] sm:min-h-[4rem] p-1 text-left flex flex-col gap-0.5 cursor-pointer transition ${
                  c.date === selected ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-500/60' : c.inMonth ? 'bg-slate-900 hover:bg-slate-800/70' : 'bg-slate-950/80 hover:bg-slate-900'
                }`}
              >
                <span className={`text-[11px] font-semibold ${c.date === today ? 'text-blue-300' : c.inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                  {c.day}
                </span>
                {trip ? (
                  <span className={`h-1.5 rounded-full ${trip.st.dot} ${trip.trip.arrival_date === c.date ? 'ml-1' : '-ml-1'} ${trip.trip.departure_date === c.date ? 'mr-1' : '-mr-1'}`} />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-slate-500">
          {TRIP_STATUSES.map((s) => (
            <span key={s.value} className="flex items-center gap-1"><span className={`w-2.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}</span>
          ))}
        </div>
      </div>

      {/* Selected day: what's on it, then book from it */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-slate-100">{formatDay(selected, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          {info?.trips.length ? (
            <span className="text-[11px] text-slate-500">Day {daysBetween(info.trips[0].trip.arrival_date, selected) + 1} of stay</span>
          ) : null}
        </div>
        {info?.events.length ? (
          <ul className="space-y-1 text-xs text-slate-300">
            {info.events.map((e) => (
              <li key={e.text} className="flex items-center gap-1.5"><e.icon className="w-3.5 h-3.5 text-slate-400" /> {e.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Nothing scheduled.</p>
        )}
        <div className="flex items-center gap-1.5 border-t border-slate-800 pt-2">
          <span className="shrink-0 text-[11px] font-semibold text-slate-400">Book:</span>
          {[
            { type: 'trip', label: 'Trip', icon: PlaneTakeoff },
            { type: 'hotel', label: 'Hotel', icon: BedDouble },
            { type: 'hybrid', label: 'Trip + Hotel', icon: CalendarDays },
          ].map((bt) => (
            <button
              key={bt.type}
              type="button"
              onClick={() => onPlanTrip(selected, bt.type)}
              className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-[12px] font-semibold text-blue-200 hover:bg-blue-500/25 cursor-pointer min-w-0"
            >
              <bt.icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{bt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* All of this guest's stays */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Stays{trips.length ? ` (${trips.length})` : ''}</div>
        {trips.length === 0 ? (
          <p className="text-[12px] text-slate-500">None yet — pick a day above and book.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {trips.map((t) => {
              const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
              return (
                <Link key={t.id} to={`/trips/${t.id}`} className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${st.badge} hover:brightness-125`}>
                  {bookingType(t).label} · {formatRange(t)}
                </Link>
              );
            })}
          </div>
        )}
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

function nowLocal() {
  const d = new Date();
  return `${toDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Logged any time — no trip needed. The server tags each exchange with the
// guest's trip on that date when there is one.
function ExchangePopup({ row, onClose }) {
  const { guest } = row;
  const { exchanges, loading, error: loadError, reload } = useGuestExchanges(guest.id);
  const [form, setForm] = useState(blankExchange);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [editing, setEditing] = useState(null); // the history row being edited
  const [toast, setToast] = useState('');

  // Small confirmation popup after save / update / delete.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function startEdit(x) {
    setEditing(x);
    setError('');
    setForm({
      from_currency: x.from_currency,
      from_amount: String(Number(x.from_amount)),
      to_currency: x.to_currency,
      to_amount: String(Number(x.to_amount)),
      notes: x.notes || '',
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm((f) => ({ ...blankExchange(), from_currency: f.from_currency, to_currency: f.to_currency }));
  }

  // Per currency pair: totals and weighted average rate; newest first.
  const pairs = useMemo(() => {
    const m = new Map();
    for (const x of exchanges) {
      const k = `${x.from_currency}>${x.to_currency}`;
      const cur = m.get(k) || { from: x.from_currency, to: x.to_currency, given: 0, got: 0 };
      cur.given += Number(x.from_amount) || 0;
      cur.got += Number(x.to_amount) || 0;
      m.set(k, cur);
    }
    return [...m.values()];
  }, [exchanges]);

  const rate = exchangeRate(form);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (editing) {
        // Editing keeps the exchange's original timestamp.
        await api(`/guests/${guest.id}/exchanges/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, rate: rate ?? '', exchange_dt: editing.exchange_dt }),
        });
      } else {
        await api(`/guests/${guest.id}/exchanges`, { method: 'POST', body: JSON.stringify({ ...form, rate: rate ?? '', exchange_dt: nowLocal() }) });
      }
      setToast(editing ? 'Exchange updated' : 'Exchange saved');
      setEditing(null);
      setForm((f) => ({ ...blankExchange(), from_currency: f.from_currency, to_currency: f.to_currency }));
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await api(`/guests/${guest.id}/exchanges/${toDelete.id}`, { method: 'DELETE' });
      if (editing?.id === toDelete.id) cancelEdit();
      setToDelete(null);
      setToast('Exchange deleted');
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${guest.guest_name} · Money exchange`} icon={Wallet} maxWidth="max-w-xl">
      <ExchangeForm
        form={form}
        setForm={setForm}
        busy={busy}
        error={error}
        submitLabel={editing ? 'Update exchange' : 'Save exchange'}
        onSubmit={submit}
        autoFocus
      >
        {editing ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-200">
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              Editing exchange from {formatDay(editing.exchange_dt.slice(0, 10))} {editing.exchange_dt.slice(11, 16)}
            </span>
            <button type="button" onClick={cancelEdit} className="shrink-0 font-semibold text-amber-100 hover:text-white cursor-pointer">
              Cancel
            </button>
          </div>
        ) : null}
      </ExchangeForm>

      {/* History, with each currency pair's running total in the header. */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">History{exchanges.length ? ` (${exchanges.length})` : ''}</h4>
          {pairs.length > 0 && exchanges.length > 1 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-slate-400">
              {pairs.map((p) => (
                <span key={`${p.from}${p.to}`}>
                  Σ {formatAmount(p.given)} {p.from} → <span className="text-amber-300">{formatAmount(p.got)} {p.to}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {loadError ? <p className="text-sm text-rose-400">{loadError}</p> : null}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
        ) : exchanges.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No exchanges yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/70 rounded-xl border border-slate-800 max-h-64 overflow-y-auto">
            {exchanges.map((x) => (
              <li key={x.id} className={`flex items-center gap-1 px-3 py-2 ${editing?.id === x.id ? 'bg-amber-500/10' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono-num text-sm text-slate-100 truncate">
                    {formatAmount(x.from_amount)} <span className="text-slate-500">{x.from_currency}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="text-amber-300">{formatAmount(x.to_amount)}</span> <span className="text-slate-500">{x.to_currency}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {formatDay(x.exchange_dt.slice(0, 10))} {x.exchange_dt.slice(11, 16)}
                    {x.rate != null ? ` · @${Number(x.rate)}` : ''}
                    {x.trip_id ? ` · Trip ${formatRange({ arrival_date: x.trip_arrival, departure_date: x.trip_departure })}` : ''}
                    {x.notes ? ` · ${x.notes}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => startEdit(x)} aria-label="Edit exchange" title="Edit" className="p-1.5 text-slate-500 hover:text-blue-300 cursor-pointer shrink-0">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setToDelete(x)} aria-label="Delete exchange" title="Delete" className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete exchange?"
        message={toDelete ? `${formatAmount(toDelete.from_amount)} ${toDelete.from_currency} → ${formatAmount(toDelete.to_amount)} ${toDelete.to_currency}` : ''}
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      {toast ? (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-8 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-xl shadow-black/40"
        >
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      ) : null}
    </Modal>
  );
}

// ---------- Board ----------

export default function GuestBoard({ guests, settled, inPeriod, trips, periodLabel, onShowAllTime, onTripsChanged }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [popup, setPopup] = useState(null); // { kind, guestId }
  const [planFor, setPlanFor] = useState(null); // { guestId, date, type } the Register form is open for
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
      {open && popup.kind === 'schedule' ? (
        <SchedulePopup row={open} onClose={close} onPlanTrip={(date, type) => setPlanFor({ guestId: open.guest.id, date, type })} />
      ) : null}
      {open && popup.kind === 'exchange' ? <ExchangePopup row={open} onClose={close} /> : null}

      {/* Opens on top of the popup; saving reloads the Dashboard's trips so
          the popup underneath shows the new trip straight away. */}
      <TripFormModal
        open={planFor != null}
        defaultGuestId={planFor?.guestId}
        defaultDate={planFor?.date}
        defaultType={planFor?.type}
        onClose={() => setPlanFor(null)}
        onSaved={() => {
          setPlanFor(null);
          onTripsChanged?.();
        }}
      />
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
          value="View / add" />
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
