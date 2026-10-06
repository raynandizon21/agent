import { Check, ChevronDown, ChevronRight, Coins, LayoutDashboard, PiggyBank, Receipt, Wallet, Pencil, Link2Off, Loader2, Plane, Trophy, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import GuestBoard from '../components/dashboard/GuestBoard';
import { effectiveCommission } from '../lib/commission';
import {
  JUNKET_BADGE,
  JUNKET_LABELS,
  TRIP_STATUSES,
  daysBetween,
  formatAmount,
  formatRange,
  formatSigned,
  toDateStr,
  todayStr,
  tripProgress,
  tripStatus,
} from '../lib/trips';
import { useRealtime } from '../useRealtime';

// Dashboard — one screen answering "what needs my attention?":
//   - Totals cards, then the Guest board. Totals for the period:
//     Commission (guest-facing, each guest's display-only custom
//     Com/Rolling % applied), Share (the real reported commission),
//     Expenses (a manual total per period, saved via /expenses) and
//     Profit = Share - Expenses.
//   - Unlinked accounts: accounts in the reports that no guest owns yet,
//     each with a one-tap "Add guest" that opens the Guests form prefilled
//   - Top guests for the period and trips staying now / arriving soon.
// Built entirely from existing endpoints (/settlements, /guests, /trips).

const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];
const SETTLEMENT_LIMIT = 500;

function periodStart(period) {
  const d = new Date();
  if (period === 'today') return todayStr();
  if (period === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return toDateStr(d);
  }
  if (period === 'month') return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  return null;
}

// Same date the Settlements "Game Start" column shows.
function gameDay(s) {
  const v = s.game_start || s.settled_at || s.created_at;
  return v ? toDateStr(new Date(v)) : null;
}

function formatCompact(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

const wlTone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-200');

function sum(rows) {
  return rows.reduce(
    (t, r) => ({
      games: t.games + 1,
      buy_in: t.buy_in + (Number(r.buy_in) || 0),
      cashout: t.cashout + (Number(r.cashout) || 0),
      rolling: t.rolling + (Number(r.rolling) || 0),
      commission: t.commission + (Number(r.commission) || 0),
      win_loss: t.win_loss + (Number(r.win_loss) || 0),
    }),
    { games: 0, buy_in: 0, cashout: 0, rolling: 0, commission: 0, win_loss: 0 }
  );
}

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

// `collapsed` + `onToggle` turn the header into a dropdown toggle.
function Card({ icon: Icon, iconClass, title, count, action, collapsed = false, onToggle, children }) {
  const Head = onToggle ? 'button' : 'div';
  return (
    <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <header className={`flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 ${collapsed ? '' : 'border-b border-slate-800'}`}>
        <Head
          {...(onToggle ? { type: 'button', onClick: onToggle, 'aria-expanded': !collapsed } : {})}
          className={`flex items-center gap-2 text-sm font-bold text-slate-100 min-w-0 ${onToggle ? 'cursor-pointer hover:text-white' : ''}`}
        >
          {onToggle ? (
            <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          ) : null}
          <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
          <span className="truncate">{title}</span>
          {count != null ? (
            <span className="text-[11px] font-mono-num font-bold px-1.5 rounded-full bg-slate-800 text-slate-300">{count}</span>
          ) : null}
        </Head>
        {action}
      </header>
      {collapsed ? null : children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

// The four totals cards at the top of the Dashboard:
// Commission (guest view) · Share (real) · Expenses (editable) · Profit.
const TOTAL_TONES = {
  amber: { card: 'border-amber-500/30 from-amber-500/10', label: 'text-amber-300' },
  violet: { card: 'border-violet-500/30 from-violet-500/10', label: 'text-violet-300' },
  rose: { card: 'border-rose-500/30 from-rose-500/10', label: 'text-rose-300' },
  emerald: { card: 'border-emerald-500/30 from-emerald-500/10', label: 'text-emerald-300' },
};

function TotalCard({ icon: Icon, label, tone, action, sub, children }) {
  const t = TOTAL_TONES[tone];
  return (
    <div className={`rounded-lg sm:rounded-xl border bg-slate-900 bg-gradient-to-br to-slate-900 ${t.card} px-1.5 py-2 sm:px-5 sm:py-4 min-w-0`}>
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        <span className={`flex items-center gap-1 sm:gap-1.5 text-[9px] min-[400px]:text-[10px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wide ${t.label} min-w-0`}>
          <Icon className="hidden sm:block w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {action}
      </div>
      <div className="mt-0.5 sm:mt-2 min-w-0">{children}</div>
      <div className="hidden sm:block mt-0.5 text-xs text-slate-400 truncate">{sub}</div>
    </div>
  );
}

const TOTAL_VALUE = 'block font-mono-num font-bold text-sm sm:text-3xl truncate';

// Full number on desktop, compact (135.7K) on phones.
function Amount({ full, short }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

function ExpenseValue({ expense, onSave, editing, setEditing }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) setDraft(expense.amount ? String(expense.amount) : '');
  }, [editing, expense.amount]);

  async function submit(e) {
    e.preventDefault();
    const n = Number(String(draft).replace(/,/g, '') || 0);
    if (!Number.isFinite(n) || n < 0) return;
    setBusy(true);
    if (await onSave(n)) setEditing(false);
    setBusy(false);
  }

  return editing ? (
    <form onSubmit={submit} className="flex items-center gap-1 sm:gap-1.5">
      <input
        autoFocus
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        placeholder="0"
        className="min-w-0 w-full flex-1 bg-slate-950 border border-rose-400/40 focus:border-rose-400 rounded-md px-1 sm:px-2 py-0.5 sm:py-1 font-mono-num text-base sm:text-xl text-slate-100 outline-none"
      />
      <button type="submit" disabled={busy} title="Save" className="p-1 sm:p-1.5 shrink-0 rounded-md bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 disabled:opacity-60 cursor-pointer">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
    </form>
  ) : (
    <button type="button" onClick={() => setEditing(true)} title="Edit expenses" className={`${TOTAL_VALUE} text-left w-full text-slate-50 cursor-pointer`}>
      <Amount full={formatAmount(expense.amount || 0)} short={formatCompact(expense.amount || 0)} />
    </button>
  );
}

function TotalsRow({ total, share, expense, expenseError, onSaveExpense, periodLabel }) {
  const [editing, setEditing] = useState(false);
  const profit = share - (Number(expense.amount) || 0);
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
      <TotalCard icon={Coins} label="Commission" tone="amber" sub="Total · guest view (custom %)">
        <span className={`${TOTAL_VALUE} text-amber-300`}><Amount full={formatAmount(total)} short={formatCompact(total)} /></span>
      </TotalCard>
      <TotalCard icon={Wallet} label="Share" tone="violet" sub="Real · from junket reports">
        <span className={`${TOTAL_VALUE} text-violet-300`}><Amount full={formatAmount(share)} short={formatCompact(share)} /></span>
      </TotalCard>
      <TotalCard
        icon={Receipt}
        label="Expenses"
        tone="rose"
        sub={expenseError ? <span className="text-rose-400">{expenseError}</span> : expense.edited_by ? `${periodLabel} · by ${expense.edited_by}` : `Manual · ${periodLabel}`}
        action={
          !editing ? (
            <button type="button" onClick={() => setEditing(true)} title="Edit expenses" className="p-1 -m-1 text-rose-300/70 hover:text-rose-200 cursor-pointer shrink-0">
              <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          ) : null
        }
      >
        <ExpenseValue expense={expense} onSave={onSaveExpense} editing={editing} setEditing={setEditing} />
      </TotalCard>
      <TotalCard icon={PiggyBank} label="Profit" tone="emerald" sub="Share − Expenses">
        <span className={`${TOTAL_VALUE} ${profit < 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
          <Amount full={formatSigned(Math.round(profit))} short={`${profit > 0 ? '+' : ''}${formatCompact(profit)}`} />
        </span>
      </TotalCard>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('all');
  const [settlements, setSettlements] = useState([]);
  const [guests, setGuests] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, g, t] = await Promise.all([
        api(`/settlements?limit=${SETTLEMENT_LIMIT}`),
        api('/guests'),
        api('/trips').catch(() => ({ trips: [] })),
      ]);
      setSettlements(s.settlements || []);
      setGuests(g.guests || []);
      setTrips(t.trips || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    load();
  }, [load]);

  const live = useRealtime(
    useCallback((evt) => {
      if (evt.type === 'settlement') loadRef.current();
    }, [])
  );
  useEffect(() => {
    if (live) loadRef.current();
  }, [live]);

  const periodKey = period === 'all' ? 'all' : `${period}:${periodStart(period)}`;
  const [expense, setExpense] = useState({ amount: 0, edited_by: null });
  const [expenseError, setExpenseError] = useState('');
  useEffect(() => {
    let alive = true;
    setExpenseError('');
    api(`/expenses?period=${encodeURIComponent(periodKey)}`)
      .then((e) => alive && setExpense(e))
      .catch((err) => alive && setExpenseError(err.message || 'Failed to load expenses'));
    return () => {
      alive = false;
    };
  }, [periodKey]);

  async function saveExpense(amount) {
    setExpenseError('');
    try {
      setExpense(await api('/expenses', { method: 'PUT', body: JSON.stringify({ period: periodKey, amount }) }));
      return true;
    } catch (err) {
      setExpenseError(err.message || 'Failed to save expenses');
      return false;
    }
  }

  const choosePeriod = setPeriod;

  // Only finished games count toward money totals (an open step-by-step game
  // has partial numbers).
  const settled = useMemo(() => settlements.filter((s) => !s.status || s.status === 'settled'), [settlements]);

  const inPeriod = useMemo(() => {
    const from = periodStart(period);
    return from ? settled.filter((s) => (gameDay(s) || '') >= from) : settled;
  }, [settled, period]);

  const totals = useMemo(() => sum(inPeriod), [inPeriod]);

  // "junket|account" -> guest
  const guestByAccount = useMemo(() => {
    const m = new Map();
    for (const g of guests) for (const j of g.junkets || []) m.set(`${j.junket}|${j.account_no}`, g);
    return m;
  }, [guests]);

  // Total Commission: each game's commission as the guest sees it (custom
  // Com/Rolling % applied, display-only). Share Commission is the real
  // reported commission (totals.commission). Neither is written anywhere.
  const guestCommission = useMemo(() => {
    const links = new Map();
    for (const g of guests) for (const j of g.junkets || []) links.set(`${j.junket}|${j.account_no}`, j);
    return inPeriod.reduce((t, s) => {
      const eff = effectiveCommission({ ...s, game_rate: s.rate }, links.get(`${s.junket}|${s.account_no}`));
      return t + (Number(eff.commission) || 0);
    }, 0);
  }, [inPeriod, guests]);

  // Accounts seen in the reports (any period) that aren't linked to a guest.
  const unlinked = useMemo(() => {
    const m = new Map();
    for (const s of settled) {
      if (!s.account_no) continue;
      const key = `${s.junket}|${s.account_no}`;
      if (guestByAccount.has(key)) continue;
      const cur = m.get(key) || {
        key,
        junket: s.junket,
        account_no: s.account_no,
        player_name: null,
        guest: null,
        games: 0,
        rolling: 0,
        last: '',
      };
      cur.games += 1;
      cur.rolling += Number(s.rolling) || 0;
      cur.player_name = cur.player_name || s.player_name || s.account_name || null;
      cur.guest = cur.guest || s.guest || null;
      const day = gameDay(s) || '';
      if (day > cur.last) cur.last = day;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.rolling - a.rolling);
  }, [settled, guestByAccount]);

  const topGuests = useMemo(() => {
    const m = new Map();
    for (const s of inPeriod) {
      const g = guestByAccount.get(`${s.junket}|${s.account_no}`);
      if (!g) continue;
      const cur = m.get(g.id) || { guest: g, rows: [] };
      cur.rows.push(s);
      m.set(g.id, cur);
    }
    return [...m.values()]
      .map((x) => ({ guest: x.guest, ...sum(x.rows) }))
      .sort((a, b) => b.rolling - a.rolling)
      .slice(0, 5);
  }, [inPeriod, guestByAccount]);

  const today = todayStr();
  const tripsNow = useMemo(() => {
    const staying = trips.filter((t) => tripStatus(t, today) === 'staying');
    const soon = trips
      .filter((t) => tripStatus(t, today) === 'coming' && daysBetween(today, t.arrival_date) <= 7)
      .sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
    return [...staying, ...soon];
  }, [trips, today]);

  function addGuest(a) {
    const qs = new URLSearchParams({ add: '1', junket: a.junket, account: a.account_no, name: a.player_name || '' });
    navigate(`/guests?${qs}`);
  }

  const truncated = settlements.length >= SETTLEMENT_LIMIT;
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const periodLabel = PERIODS.find((p) => p.value === period)?.label;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-white">
          <LayoutDashboard className="w-5 h-5 text-blue-400" /> Dashboard
        </h1>
        <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[12px] sm:text-[13px] font-semibold">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => choosePeriod(p.value)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                period === p.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {truncated ? (
            <p className="text-[11px] text-slate-500 -mt-1">
              Based on the latest {SETTLEMENT_LIMIT} settlements.
            </p>
          ) : null}

          <TotalsRow
            total={guestCommission}
            share={totals.commission}
            expense={expense}
            expenseError={expenseError}
            onSaveExpense={saveExpense}
            periodLabel={periodLabel}
          />

          {/* Desktop: Guest board on the left, side panels on the right. */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] gap-3 sm:gap-4 items-start">
            <GuestBoard
              guests={guests}
              settled={settled}
              inPeriod={inPeriod}
              trips={trips}
              periodLabel={periodLabel}
              onShowAllTime={period !== 'all' && inPeriod.length === 0 && settled.length > 0 ? () => choosePeriod('all') : null}
            />

            <div className="space-y-3 sm:space-y-4">
              {/* Unlinked accounts */}
              <Card
                icon={Link2Off}
                iconClass="text-amber-400"
                title="Unlinked accounts"
                count={unlinked.length}
                collapsed={!unlinkedOpen}
                onToggle={() => setUnlinkedOpen((v) => !v)}
                action={<span className="text-[11px] text-slate-500 hidden sm:inline">Not assigned to any guest</span>}
              >
                {unlinked.length === 0 ? (
                  <Empty>Every account in the reports belongs to a guest.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-800/80 max-h-[26rem] overflow-y-auto">
                    {unlinked.map((a) => (
                      <li key={a.key} className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <JunketBadge junket={a.junket} />
                            <span className="min-w-0 truncate text-sm">
                              <span className="font-bold font-mono-num text-white">{a.account_no}</span>
                              {a.player_name ? <span className="text-slate-300"> ({a.player_name})</span> : null}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {a.games} game{a.games === 1 ? '' : 's'} · Rolling{' '}
                            <span className="font-mono-num text-slate-300">{formatCompact(a.rolling)}</span>
                            {a.guest ? (
                              <>
                                {' '}· Guest: <span className="text-sky-300/80">{a.guest}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addGuest(a)}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-600 border border-blue-500/25 transition cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add guest
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Top guests */}
              <Card icon={Trophy} iconClass="text-amber-300" title="Top guests" action={<span className="text-[11px] text-slate-500">by rolling</span>}>
                {topGuests.length === 0 ? (
                  <Empty>No guest games in this period.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-800/80">
                    {topGuests.map((t, i) => (
                      <li key={t.guest.id}>
                        <Link
                          to={`/guests?view=${t.guest.id}`}
                          className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-slate-800/40 transition"
                        >
                          <span className="w-5 text-center font-mono-num text-[12px] font-bold text-slate-500">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-100 truncate">{t.guest.guest_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {t.games} game{t.games === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="text-right font-mono-num leading-tight shrink-0">
                            <div className="text-[13px] font-bold text-slate-100">{formatCompact(t.rolling)}</div>
                            <div className={`text-[11px] ${wlTone(t.win_loss)}`}>{formatSigned(Math.round(t.win_loss))}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Trips */}
              <Card
                icon={Plane}
                iconClass="text-sky-400"
                title="Staying & arriving"
                count={tripsNow.length || null}
                action={
                  <Link to="/trips" className="text-[12px] font-semibold text-sky-400 hover:text-sky-300">
                    All trips
                  </Link>
                }
              >
                {tripsNow.length === 0 ? (
                  <Empty>No guests staying or arriving in the next 7 days.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-800/80">
                    {tripsNow.map((t) => {
                      const st = TRIP_STATUSES.find((x) => x.value === tripStatus(t, today));
                      return (
                        <li key={t.id}>
                          <Link
                            to={`/trips/${t.id}`}
                            className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-slate-800/40 transition"
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-100 truncate">{t.guest_name}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {formatRange(t)} · <span className="text-slate-300">{tripProgress(t, today)}</span>
                                {t.hotel ? ` · ${t.hotel}` : ''}
                              </div>
                            </div>
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-px rounded border ${st.badge}`}>
                              {st.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
