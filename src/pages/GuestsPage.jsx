import {
  Calculator,
  Check,
  Edit2,
  Gamepad2,
  Loader2,
  Plus,
  Power,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import ConfirmDialog from '../ConfirmDialog';
import CopyImageButton from '../components/common/CopyImageButton';
import Modal from '../components/common/Modal';
import Select from '../components/common/Select';
import { effectiveCommission, effectiveRate } from '../lib/commission';
import { renderGameRecordsImage } from '../lib/statementImage';

function formatAmount(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString();
}

// Single settings button that opens Edit / Activate-Deactivate / Delete —
// replaces the old row of three icon buttons so the guest modal stays tidy
// on phones.
// The menu is position:fixed (anchored to the button's rect) so it isn't
// clipped by the desktop table's overflow container.
const MENU_HEIGHT = 140;

function GuestActionsMenu({ active, busy, onEdit, onToggle, onDelete }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const open = pos !== null;

  function toggle() {
    if (open) {
      setPos(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const flipUp = r.bottom + MENU_HEIGHT + 8 > window.innerHeight;
    setPos(flipUp ? { right, bottom: window.innerHeight - r.top + 6 } : { right, top: r.bottom + 6 });
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPos(null);
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const item =
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Guest settings"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 rounded-md transition cursor-pointer ${
          open ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
      </button>
      {open ? (
        <div
          role="menu"
          style={pos}
          className="fixed z-[60] w-48 overflow-hidden rounded-lg bg-slate-900 border border-slate-700 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPos(null);
              onEdit();
            }}
            className={`${item} text-slate-200 hover:bg-slate-800`}
          >
            <Edit2 className="w-4 h-4 text-slate-400" />
            Edit guest
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setPos(null);
              onToggle();
            }}
            className={`${item} text-slate-200 hover:bg-slate-800`}
          >
            <Power className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
            {active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPos(null);
              onDelete();
            }}
            className={`${item} text-rose-400 hover:bg-rose-500/10 border-t border-slate-800`}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatRate(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
}

// One-line "Mon DD, HH:mm" (no year, 24h) — the standard date+time format
// across the app's tables (see the same shape in SettlementsPage.jsx and
// InboxPage.jsx).
function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart}, ${timePart}`;
}

// A junket badge's rate/percent suffix — shown on the guest table row and in
// the Game Records header. Rolling % and Com % are independent and can both
// be set (a hybrid — see effectiveRow()/customRate()), so both show up here
// when present, distinguished by label since a 1% rate and a 50% rolling
// discount look wildly different in magnitude otherwise.
function junketBadgeSuffix(j) {
  const parts = [];
  if (j.commission_percent != null) parts.push(`${j.commission_percent}% rolling`);
  if (j.commission_rate != null) parts.push(`${j.commission_rate}% com`);
  return parts.length ? `· ${parts.join(' · ')}` : null;
}

// Compact "1.2M" style for the KPI tiles and guest cards, where the exact
// figure lives in the tooltip / Game Records modal.
function formatCompact(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

function formatSignedCompact(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${formatCompact(n)}`;
}

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const EMPTY_STATS = { games: 0, buy_in: 0, cashout: 0, rolling: 0, commission: 0, win_loss: 0, last_played: null };

// Full "INFINITY · INF555 · 100% rolling · 1.2% com" text — the chip's tooltip.
function junketChipLabel(j) {
  return [j.junket, j.account_no ? `· ${j.account_no}` : null, junketBadgeSuffix(j)].filter(Boolean).join(' ');
}

// Single-line chip: truncates with "…" when space runs out; the tooltip
// carries the full text.
function JunketChip({ j, size = 'sm' }) {
  const meta = JUNKETS.find((jj) => jj.value === j.junket);
  const suffix = junketBadgeSuffix(j);
  return (
    <span
      title={junketChipLabel(j)}
      className={`min-w-0 max-w-full truncate whitespace-nowrap rounded border font-mono-num ${
        size === 'xs' ? 'text-[10px] px-1 py-px' : 'text-[12px] px-1.5 py-0.5'
      } ${meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700'}`}
    >
      <span className="font-bold uppercase tracking-wide">{j.junket}</span>
      {j.account_no ? <span> · {j.account_no}</span> : null}
      {suffix ? <span className="opacity-80"> {suffix}</span> : null}
    </span>
  );
}

const PAGE_SIZE = 20;

const JUNKETS = [
  { value: 'win9', label: 'Win9', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'galaxy', label: 'Galaxy', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { value: 'democage', label: 'Demo Cage', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'infinity', label: 'Infinity', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
];

const EMPTY_FORM = { telegram_id: '', guest_code: '', guest_name: '', junkets: [] };

// Junket checkboxes; checking one reveals a dropdown of that junket's real
// account numbers (pulled from already-parsed Settlements) to link to this
// guest, plus two independent, optional fields — Rolling % and Com % — that
// can both be set at once (a hybrid). Both are Guests-page **display-only**
// — neither ever writes to the real settlements data (Settlements page,
// "Original data", exports all stay exactly what the junket reported): Com %
// alone shows ROLLING × Com% as COMMISSION; Rolling % discounts ROLLING for
// display, with Com % (if also set) or the original game rate as the rate
// against that discounted ROLLING — see effectiveRow()/customRate() and
// CLAUDE.md's "custom commission modes" section. `value`
// is [{ junket, account_no, commission_rate, commission_percent }, ...].
// `usedAccounts` is { [junket]: Set(account_no) } already claimed by OTHER
// guests — a real account belongs to one player, so those are hidden here to
// stop the same account getting linked twice (this guest's own current pick
// stays visible).
function JunketPicker({ value, onChange, accountsByJunket, usedAccounts = {} }) {
  return (
    <div className="space-y-1.5">
      {JUNKETS.map((j) => {
        const entry = value.find((v) => v.junket === j.value);
        const used = usedAccounts[j.value];
        const options = (accountsByJunket[j.value] || []).filter(
          (a) => a.account_no === entry?.account_no || !used?.has(a.account_no)
        );
        return (
          <div key={j.value} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-200 w-24 shrink-0">
              <input
                type="checkbox"
                checked={!!entry}
                onChange={() =>
                  onChange(
                    entry
                      ? value.filter((v) => v.junket !== j.value)
                      : [
                          ...value,
                          { junket: j.value, account_no: null, commission_rate: null, commission_percent: null },
                        ]
                  )
                }
                className="rounded bg-slate-950 border-slate-700 text-blue-600 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-semibold">{j.label}</span>
            </label>
            {entry ? (
              <>
                <Select
                  value={entry.account_no || ''}
                  onChange={(accountNo) =>
                    onChange(
                      value.map((v) =>
                        v.junket === j.value ? { ...v, account_no: accountNo || null } : v
                      )
                    )
                  }
                  options={[
                    { value: '', label: 'Select account…' },
                    ...options.map((a) => ({
                      value: a.account_no,
                      label: `${a.account_no}${a.player_name ? ` — ${a.player_name}` : ''}`,
                    })),
                  ]}
                  className="flex-1 min-w-0 w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 font-mono-num focus:outline-hidden focus:border-blue-500"
                />
                <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto pl-[6.5rem] sm:pl-0">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Rolling</span>
                  <div className="relative w-16">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={entry.commission_percent ?? ''}
                      onChange={(e) =>
                        onChange(
                          value.map((v) =>
                            v.junket === j.value
                              ? { ...v, commission_percent: e.target.value === '' ? null : e.target.value }
                              : v
                          )
                        )
                      }
                      title="Percent of ROLLING this guest is credited for on the Guests page — display-only, never overwrites the stored commission. Leave blank to show real ROLLING unchanged."
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 pr-4 text-sm text-slate-200 font-mono-num focus:outline-hidden"
                    />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 text-[11px] pointer-events-none">
                      %
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Com</span>
                  <div className="relative w-16">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={entry.commission_rate ?? ''}
                      onChange={(e) =>
                        onChange(
                          value.map((v) =>
                            v.junket === j.value
                              ? { ...v, commission_rate: e.target.value === '' ? null : e.target.value }
                              : v
                          )
                        )
                      }
                      title="Commission rate (%) of ROLLING, shown on the Guests page only — never overwrites the real stored commission. If a Rolling % is also set, this rate applies against the discounted ROLLING instead of the original game rate."
                      className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 pr-4 text-sm text-slate-200 font-mono-num focus:outline-hidden"
                    />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 text-[11px] pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Game Records / Original Data table, shared by both modals. The
// rolling/rate/commission accessors carry each modal's own numbers —
// effectiveRow()/customRate() for Game Records, the junket's untouched raw
// values for Original Data — so this stays purely presentational. On phones
// the 10 columns fold into 4 (Account, In/Out, Roll/Com, W/L) so the table
// fits the screen without side-scrolling.
function RecordsTable({ records, rolling, rate, rateLabel, commission, totals }) {
  const wlClass = (v) => (Number(v) >= 0 ? 'text-emerald-400' : 'text-rose-400');
  return (
    <div className="rounded-lg border border-slate-800 overflow-auto max-h-[60dvh] md:max-h-[28rem]">
      <table className="w-full text-left text-[11px] md:text-[13px] border-collapse">
        <thead className="sticky top-0">
          <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[10px] md:text-[11px] font-bold">
            <th className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap">GAME START</th>
            <th className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap">JUNKET</th>
            <th className="py-2 px-2 md:px-2.5 whitespace-nowrap">
              <span className="md:hidden">ACCOUNT</span>
              <span className="hidden md:inline">ACCOUNT / GUEST</span>
            </th>
            <th className="md:hidden py-2 px-1 text-right whitespace-nowrap">IN / OUT</th>
            <th className="md:hidden py-2 px-1 text-right whitespace-nowrap">ROLL / COM</th>
            <th className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap">BUY-IN</th>
            <th className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap">CASHOUT</th>
            <th className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap">ROLLING</th>
            <th className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap">{rateLabel}</th>
            <th className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap">COMMISSION</th>
            <th className="py-2 px-2 md:px-2.5 text-right whitespace-nowrap">WIN/LOSS</th>
            <th className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap">GAME END</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 bg-slate-900">
          {records.map((r) => {
            const meta = JUNKETS.find((jj) => jj.value === r.junket);
            const badge = meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700';
            return (
              <tr key={r.id} className="hover:bg-slate-800/40 transition">
                <td className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-400">
                  {formatWhen(r.game_start || r.settled_at || r.created_at)}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap">
                  <span className={`inline-block uppercase font-bold text-[11px] px-1.5 py-0.5 rounded border ${badge}`}>
                    {r.junket}
                  </span>
                </td>
                <td className="py-2 px-2 md:px-2.5 whitespace-nowrap font-mono-num text-slate-300 max-md:max-w-[140px] md:max-w-[280px]">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className="min-w-0 truncate"
                      title={`${r.account_no || '—'}${r.player_name ? ` (${r.player_name})` : ''}`}
                    >
                      <span className="font-bold text-slate-100">{r.account_no || '—'}</span>
                      {r.player_name ? <span className="font-sans text-slate-300"> ({r.player_name})</span> : null}
                    </span>
                    <span className={`md:hidden uppercase font-bold text-[8px] px-1 rounded-sm border ${badge}`}>
                      {r.junket}
                    </span>
                  </div>
                  {r.guest ? (
                    <div className="text-[10px] md:text-[11px] font-sans text-sky-300/80 truncate" title={`Guest: ${r.guest}`}>
                      <span className="text-slate-500">Guest:</span> {r.guest}
                    </div>
                  ) : null}
                  <div className="md:hidden text-[10px] text-slate-500">
                    {formatWhen(r.game_start || r.settled_at || r.created_at)}
                    {rate(r) != null ? ` · ${formatRate(rate(r))}` : ''}
                  </div>
                </td>
                <td className="md:hidden py-2 px-1 text-right whitespace-nowrap font-mono-num leading-snug">
                  <div className="font-bold text-slate-200">{formatAmount(r.buy_in)}</div>
                  <div className="text-slate-400">{formatAmount(r.cashout)}</div>
                </td>
                <td className="md:hidden py-2 px-1 text-right whitespace-nowrap font-mono-num leading-snug">
                  <div className="font-bold text-slate-100">{formatAmount(rolling(r))}</div>
                  <div className="text-amber-400">{formatAmount(commission(r))}</div>
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                  {formatAmount(r.buy_in)}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                  {formatAmount(r.cashout)}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-100">
                  {formatAmount(rolling(r))}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-100 font-mono-num">
                  {formatRate(rate(r))}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 text-right whitespace-nowrap font-bold text-amber-400">
                  {formatAmount(commission(r))}
                </td>
                <td className={`py-2 px-2 md:px-2.5 text-right whitespace-nowrap font-bold font-mono-num ${wlClass(r.win_loss)}`}>
                  {formatAmount(r.win_loss)}
                </td>
                <td className="hidden md:table-cell py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-400">
                  {formatWhen(r.settled_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0">
          <tr className="md:hidden border-t border-slate-700 bg-slate-950 font-bold font-mono-num">
            <td className="py-2 px-2 whitespace-nowrap text-slate-400 font-sans">TOTAL</td>
            <td className="py-2 px-1 text-right whitespace-nowrap leading-snug">
              <div className="text-slate-100">{formatAmount(totals.buy_in)}</div>
              <div className="text-slate-400">{formatAmount(totals.cashout)}</div>
            </td>
            <td className="py-2 px-1 text-right whitespace-nowrap leading-snug">
              <div className="text-slate-100">{formatAmount(totals.rolling)}</div>
              <div className="text-amber-400">{formatAmount(totals.commission)}</div>
            </td>
            <td className={`py-2 px-2 text-right whitespace-nowrap ${wlClass(totals.win_loss)}`}>
              {formatAmount(totals.win_loss)}
            </td>
          </tr>
          <tr className="hidden md:table-row border-t border-slate-700 bg-slate-950 font-bold">
            <td className="py-2 px-2.5 whitespace-nowrap text-slate-400" colSpan={3}>
              GRAND TOTAL
            </td>
            <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">{formatAmount(totals.buy_in)}</td>
            <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">{formatAmount(totals.cashout)}</td>
            <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">{formatAmount(totals.rolling)}</td>
            <td className="py-2 px-2.5"></td>
            <td className="py-2 px-2.5 text-right whitespace-nowrap text-amber-400">{formatAmount(totals.commission)}</td>
            <td className={`py-2 px-2.5 text-right whitespace-nowrap ${wlClass(totals.win_loss)}`}>
              {formatAmount(totals.win_loss)}
            </td>
            <td className="py-2 px-2.5"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [accountsByJunket, setAccountsByJunket] = useState({});
  const { user } = useAuth();
  const isAdmin = user?.agentId == null;
  const [summary, setSummary] = useState({}); // { [guestId]: EMPTY_STATS shape }
  const [junketFilter, setJunketFilter] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);

  const [rowBusy, setRowBusy] = useState(null); // guest id currently saving/deleting
  const [toDelete, setToDelete] = useState(null); // guest pending delete confirmation

  const [viewingGuest, setViewingGuest] = useState(null); // guest whose records are shown
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [recordsJunketFilter, setRecordsJunketFilter] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);

  // Quick inline rate/percent edit for one linked junket, triggered by
  // clicking its badge in the Game Records modal — a scoped alternative to
  // opening the full Edit Guest form just to change one number.
  const [inlineEditJunket, setInlineEditJunket] = useState(null); // { junket, commission_rate, commission_percent } | null
  const [inlineSaving, setInlineSaving] = useState(false);

  async function saveInlineJunket() {
    if (!inlineEditJunket || !viewingGuest) return;
    setInlineSaving(true);
    setError('');
    try {
      const newJunkets = viewingGuest.junkets.map((j) =>
        j.junket === inlineEditJunket.junket
          ? {
              ...j,
              commission_rate: inlineEditJunket.commission_rate,
              commission_percent: inlineEditJunket.commission_percent,
            }
          : j
      );
      await api(`/guests/${viewingGuest.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          telegram_id: viewingGuest.telegram_id,
          guest_code: viewingGuest.guest_code,
          guest_name: viewingGuest.guest_name,
          active: viewingGuest.active,
          junkets: newJunkets,
        }),
      });
      setInlineEditJunket(null);
      await load();
      await openView({ ...viewingGuest, junkets: newJunkets });
    } catch (err) {
      setError(err.message || 'Failed to update junket');
    } finally {
      setInlineSaving(false);
    }
  }

  async function openView(g) {
    setViewingGuest(g);
    setRecords([]);
    setRecordsError('');
    setRecordsJunketFilter('');
    setShowOriginal(false);
    setRecordsLoading(true);
    try {
      const data = await api(`/guests/${g.id}/settlements`);
      setRecords(data.settlements || []);
    } catch (err) {
      setRecordsError(err.message || 'Failed to load game records');
    } finally {
      setRecordsLoading(false);
    }
  }

  async function load() {
    setError('');
    try {
      const [data, sum] = await Promise.all([api('/guests'), api('/guests/summary').catch(() => ({}))]);
      setGuests(data.guests || []);
      setSummary(sum.summary || {});
    } catch (err) {
      setError(err.message || 'Failed to load guests');
    }
  }

  async function loadAccounts() {
    const entries = await Promise.all(
      JUNKETS.map(async (j) => {
        try {
          const data = await api(`/settlements/accounts?junket=${j.value}`);
          return [j.value, data.accounts || []];
        } catch {
          return [j.value, []];
        }
      })
    );
    setAccountsByJunket(Object.fromEntries(entries));
  }

  useEffect(() => {
    load();
    loadAccounts();
  }, []);

  function openAdd() {
    setEditingGuest(null);
    setForm(EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  }

  function openEdit(g) {
    setEditingGuest(g);
    setForm({
      telegram_id: g.telegram_id == null ? '' : String(g.telegram_id),
      guest_code: g.guest_code,
      guest_name: g.guest_name,
      junkets: g.junkets || [],
    });
    setError('');
    setIsModalOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      if (editingGuest) {
        await api(`/guests/${editingGuest.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            telegram_id: form.telegram_id,
            guest_code: form.guest_code,
            guest_name: form.guest_name,
            active: editingGuest.active,
            junkets: form.junkets,
          }),
        });
        setOk('Guest updated');
      } else {
        await api('/guests', {
          method: 'POST',
          body: JSON.stringify({
            telegram_id: form.telegram_id,
            guest_code: form.guest_code,
            guest_name: form.guest_name,
            junkets: form.junkets,
          }),
        });
        setOk('Guest added');
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save guest');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(g) {
    setRowBusy(g.id);
    setError('');
    setOk('');
    try {
      await api(`/guests/${g.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          telegram_id: g.telegram_id,
          guest_code: g.guest_code,
          guest_name: g.guest_name,
          active: !g.active,
          junkets: g.junkets,
        }),
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update guest');
    } finally {
      setRowBusy(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setRowBusy(toDelete.id);
    setError('');
    setOk('');
    try {
      await api(`/guests/${toDelete.id}`, { method: 'DELETE' });
      setOk('Guest deleted');
      setToDelete(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete guest');
    } finally {
      setRowBusy(null);
    }
  }

  const statsOf = (g) => summary[g.id] || EMPTY_STATS;

  const filteredGuests = useMemo(() => {
    const query = q.trim().toLowerCase();
    return guests.filter((g) => {
      if (junketFilter && !(g.junkets || []).some((j) => j.junket === junketFilter)) return false;
      if (!query) return true;
      return (
        (g.guest_code || '').toLowerCase().includes(query) ||
        g.guest_name.toLowerCase().includes(query) ||
        String(g.telegram_id ?? '').toLowerCase().includes(query) ||
        (g.agent_name || '').toLowerCase().includes(query) ||
        (g.junkets || []).some((j) => (j.account_no || '').toLowerCase().includes(query))
      );
    });
  }, [guests, junketFilter, q]);

  const kpis = useMemo(() => {
    const t = { active: 0, games: 0, rolling: 0, commission: 0, win_loss: 0 };
    for (const g of filteredGuests) {
      const st = summary[g.id] || EMPTY_STATS;
      if (g.active) t.active += 1;
      t.games += st.games;
      t.rolling += st.rolling;
      t.commission += st.commission;
      t.win_loss += st.win_loss;
    }
    return t;
  }, [filteredGuests, summary]);

  const totalPages = Math.max(1, Math.ceil(filteredGuests.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [q, junketFilter]);
  const visibleGuests = filteredGuests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Accounts already linked to OTHER guests, per junket — hidden from the
  // picker so the same real account can't get linked to two guest records.
  const usedAccounts = {};
  for (const g of guests) {
    if (editingGuest && g.id === editingGuest.id) continue;
    for (const j of g.junkets || []) {
      if (!j.account_no) continue;
      if (!usedAccounts[j.junket]) usedAccounts[j.junket] = new Set();
      usedAccounts[j.junket].add(j.account_no);
    }
  }

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-hidden focus:border-blue-500 text-sm';

  const recordJunkets = useMemo(
    () => JUNKETS.filter((j) => records.some((r) => r.junket === j.value)),
    [records]
  );
  const visibleRecords = recordsJunketFilter
    ? records.filter((r) => r.junket === recordsJunketFilter)
    : records;
  // Linked accounts in "Comm %" mode credit this guest a % of ROLLING itself
  // (not a % of COMMISSION) — see the Guests page discussion this codifies.
  // ROLLING mode display, only, is discounted by that %; COMMISSION here
  // stays the junket's real original commission (r.original_commission,
  // already re-derived from RAW_TEXT by guestController.js's settlements()).
  // "Rate" mode accounts (and unlinked ones) are unaffected — r.rolling and
  // r.commission (the real stored COMMISSION) pass through untouched.
  const junketByAccount = useMemo(() => {
    const map = {};
    for (const j of viewingGuest?.junkets || []) {
      if (!j.account_no) continue;
      map[`${j.junket}|${j.account_no}`] = j;
    }
    return map;
  }, [viewingGuest]);
  // Hybrid: Rolling % and Com % can both be set on the same account (see
  // JunketPicker). The formulas live in src/lib/commission.js (shared with
  // the Trips detail screen) — display-only, never written to settlements.
  function effectiveRow(r) {
    return effectiveCommission(r, junketByAccount[`${r.junket}|${r.account_no}`]);
  }
  // The RATE column, kept in sync with effectiveRow() so RATE × ROLLING /
  // 100 = COMMISSION reads correctly left to right in the table.
  function customRate(r) {
    return effectiveRate(r, junketByAccount[`${r.junket}|${r.account_no}`]);
  }
  const recordsTotals = useMemo(
    () =>
      visibleRecords.reduce((acc, r) => {
        const eff = effectiveRow(r);
        return {
          buy_in: acc.buy_in + (Number(r.buy_in) || 0),
          cashout: acc.cashout + (Number(r.cashout) || 0),
          rolling: acc.rolling + (Number(eff.rolling) || 0),
          commission: acc.commission + (Number(eff.commission) || 0),
          win_loss: acc.win_loss + (Number(r.win_loss) || 0),
          balance: acc.balance + (Number(r.balance) || 0),
        };
      }, { buy_in: 0, cashout: 0, rolling: 0, commission: 0, win_loss: 0, balance: 0 }),
    [visibleRecords, junketByAccount]
  );
  // Game Records as a PNG (Copy image) — same numbers the table shows,
  // i.e. effectiveRow()/customRate(), display-only.
  function makeRecordsImage() {
    const junketLabel = recordsJunketFilter
      ? JUNKETS.find((j) => j.value === recordsJunketFilter)?.label || recordsJunketFilter
      : 'All junkets';
    const n = visibleRecords.length;
    return renderGameRecordsImage({
      guest: viewingGuest,
      subtitle: `${junketLabel} · ${n} game${n === 1 ? '' : 's'}`,
      rows: visibleRecords.map((r) => {
        const eff = effectiveRow(r);
        return { ...r, rolling: eff.rolling, commission: eff.commission, rate: customRate(r) };
      }),
      totals: recordsTotals,
    });
  }

  // `hasOriginal` tracks whether ANY row actually had a parseable original
  // commission — some junket messages (e.g. a garbled OCR read) never yield
  // one, and defaulting a missing value to 0 for the sum would otherwise
  // make the grand total misleadingly show "0"/"0.00%" (a real number)
  // instead of "no data available", unlike the per-row "—".
  const originalTotals = useMemo(
    () =>
      visibleRecords.reduce(
        (acc, r) => ({
          rolling: acc.rolling + (Number(r.rolling) || 0),
          commission: acc.commission + (Number(r.original_commission) || 0),
          hasOriginal: acc.hasOriginal || r.original_commission != null,
        }),
        { rolling: 0, commission: 0, hasOriginal: false }
      ),
    [visibleRecords]
  );

  // Plain render helper (not a component) so rows don't remount each render.
  function rowActions(g) {
    return (
      <GuestActionsMenu
        active={g.active}
        busy={rowBusy === g.id}
        onEdit={() => openEdit(g)}
        onToggle={() => toggleActive(g)}
        onDelete={() => setToDelete(g)}
      />
    );
  }

  const wlTone = (v) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            {isAdmin ? 'Guests' : 'My Guests'}
          </h1>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add guest</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Totals — one compact strip, same style as the Settlements page. */}
      <div className="grid grid-cols-4 gap-px rounded-lg bg-slate-800 border border-slate-800 overflow-hidden">
        {[
          { label: 'Guests', value: `${kpis.active}/${filteredGuests.length}`, title: `${kpis.active} active of ${filteredGuests.length}` },
          { label: 'Rolling', value: formatCompact(kpis.rolling), title: formatAmount(kpis.rolling) },
          { label: 'Commission', value: formatCompact(kpis.commission), title: formatAmount(kpis.commission), tone: 'text-amber-400' },
          { label: 'Win/Loss', value: formatSignedCompact(kpis.win_loss), title: formatAmount(kpis.win_loss), tone: wlTone(kpis.win_loss) },
        ].map((k) => (
          <div key={k.label} title={k.title} className="bg-slate-900 px-2 py-1.5 sm:px-3 sm:py-2.5 min-w-0">
            <span className="text-[10px] sm:text-[12px] font-semibold uppercase tracking-wider block truncate text-slate-400">
              {k.label}
            </span>
            <span className={`text-[13px] sm:text-base font-bold font-mono-num tracking-tight block truncate ${k.tone || 'text-slate-100'}`}>
              {k.value}
            </span>
          </div>
        ))}
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-400 text-sm">{ok}</p> : null}

      <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guest…"
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
        <Select
          value={junketFilter}
          onChange={setJunketFilter}
          options={[{ value: '', label: 'All junkets' }, ...JUNKETS]}
          aria-label="Junket filter"
          className="w-[104px] sm:w-auto sm:min-w-[140px] shrink-0 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-[13px] text-slate-300 focus:outline-hidden focus:border-blue-500"
        />
      </div>

      {visibleGuests.length === 0 ? (
        <div className="p-10 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <Users className="w-7 h-7 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">
            {guests.length === 0 ? 'No guests yet — add your first guest to start tracking their games.' : 'No guests match your filters.'}
          </p>
          {guests.length === 0 ? (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add guest
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* Phones: simple list — tap a row for records and actions. */}
          <ul className="md:hidden rounded-lg bg-slate-900 border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
            {visibleGuests.map((g) => {
              const st = statsOf(g);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => openView(g)}
                    className={`w-full px-3 py-2.5 text-left active:bg-slate-800/60 transition cursor-pointer ${
                      g.active ? '' : 'opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-300 grid place-items-center text-[11px] font-bold shrink-0">
                        {initials(g.guest_name)}
                      </div>
                      <span className="font-semibold text-slate-100 truncate">{g.guest_name}</span>
                      {g.guest_code ? (
                        <span className="font-mono-num text-[11px] text-blue-400 font-bold shrink-0">{g.guest_code}</span>
                      ) : null}
                      {!g.active ? (
                        <span className="ml-auto text-[10px] font-semibold uppercase text-rose-400 shrink-0">Inactive</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 pl-[42px] font-mono-num leading-tight">
                      <div className="min-w-0">
                        <div className="text-[9px] font-sans font-semibold uppercase tracking-wide text-slate-500">Buy-in</div>
                        <div className="text-[12px] font-bold text-slate-200 truncate">{formatCompact(st.buy_in)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-sans font-semibold uppercase tracking-wide text-slate-500">Rolling</div>
                        <div className="text-[12px] font-bold text-slate-100 truncate">{formatCompact(st.rolling)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-sans font-semibold uppercase tracking-wide text-slate-500">Comm</div>
                        <div className="text-[12px] font-bold text-amber-400 truncate">{formatCompact(st.commission)}</div>
                      </div>
                      <div className="min-w-0 text-right">
                        <div className="text-[9px] font-sans font-semibold uppercase tracking-wide text-slate-500">Win/Loss</div>
                        <div className={`text-[12px] font-bold truncate ${wlTone(st.win_loss)}`}>
                          {formatSignedCompact(st.win_loss)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop: dense table. */}
          <div className="hidden md:block rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[12px] font-bold uppercase tracking-wide">
                    <th className="py-2.5 px-3 whitespace-nowrap">Guest</th>
                    {isAdmin ? <th className="py-2.5 px-3 whitespace-nowrap">Agent</th> : null}
                    <th className="py-2.5 px-3 whitespace-nowrap">Junkets</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Buy-in</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Rolling</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Commission</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Win/Loss</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visibleGuests.map((g) => {
                    const st = statsOf(g);
                    return (
                      <tr
                        key={g.id}
                        onClick={() => openView(g)}
                        className={`hover:bg-slate-800/40 transition cursor-pointer ${g.active ? '' : 'opacity-60'}`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 grid place-items-center text-[12px] font-bold">
                                {initials(g.guest_name)}
                              </div>
                              <span
                                title={g.active ? 'Active' : 'Deactivated'}
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                                  g.active ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-100 truncate max-w-[220px]">{g.guest_name}</div>
                              <div className="text-[12px] text-slate-500 font-mono-num whitespace-nowrap">
                                {g.guest_code ? <span className="text-blue-400 font-bold">{g.guest_code}</span> : null}
                                {g.guest_code && g.telegram_id != null ? ' · ' : ''}
                                {g.telegram_id != null ? `TG ${g.telegram_id}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        {isAdmin ? (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {g.agent_name ? (
                              <span className="font-medium text-slate-200">{g.agent_name}</span>
                            ) : (
                              <span className="text-slate-500 italic">Unassigned</span>
                            )}
                          </td>
                        ) : null}
                        <td className="py-2.5 px-3">
                          {(g.junkets || []).length === 0 ? (
                            <span className="text-slate-500 italic">—</span>
                          ) : (
                            <div
                              className="flex flex-nowrap gap-1 w-[340px] max-w-[340px] overflow-hidden"
                              title={g.junkets.map(junketChipLabel).join('\n')}
                            >
                              {g.junkets.map((j) => (
                                <JunketChip key={j.junket} j={j} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono-num font-bold text-slate-200">
                          {formatAmount(st.buy_in)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono-num font-bold text-slate-100">
                          {formatAmount(st.rolling)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono-num font-bold text-amber-400">
                          {formatAmount(st.commission)}
                        </td>
                        <td className={`py-2.5 px-3 text-right whitespace-nowrap font-mono-num font-bold ${wlTone(st.win_loss)}`}>
                          {formatAmount(st.win_loss)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {rowActions(g)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {filteredGuests.length > PAGE_SIZE ? (
        <div className="flex items-center justify-center sm:justify-end gap-3">
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

      <Modal
        open={isModalOpen}
        onClose={() => !busy && setIsModalOpen(false)}
        title={editingGuest ? 'Edit Guest' : 'Add Guest'}
        icon={Users}
        maxWidth="max-w-lg"
      >
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Guest code</label>
              <input
                value={form.guest_code}
                onChange={(e) => setForm((f) => ({ ...f, guest_code: e.target.value }))}
                placeholder="optional"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Guest name</label>
              <input
                value={form.guest_name}
                onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Telegram ID</label>
            <input
              value={form.telegram_id}
              onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))}
              placeholder="optional"
              className={`${inputClass} font-mono-num`}
            />
          </div>

          <div>
            <span className="text-slate-400 font-semibold block mb-1.5 text-[13px] uppercase">Junkets</span>
            <JunketPicker
              value={form.junkets}
              onChange={(junkets) => setForm((f) => ({ ...f, junkets }))}
              accountsByJunket={accountsByJunket}
              usedAccounts={usedAccounts}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={busy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm font-medium cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-bold flex items-center gap-1 text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" />
              {busy ? 'Saving…' : editingGuest ? 'Update guest' : 'Add guest'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewingGuest}
        onClose={() => setViewingGuest(null)}
        title={viewingGuest ? viewingGuest.guest_name : ''}
        icon={Gamepad2}
        maxWidth="max-w-7xl"
        headerActions={
          viewingGuest ? (
            <GuestActionsMenu
              active={viewingGuest.active}
              busy={rowBusy === viewingGuest.id}
              onEdit={() => {
                const g = viewingGuest;
                setViewingGuest(null);
                openEdit(g);
              }}
              onToggle={async () => {
                await toggleActive(viewingGuest);
                setViewingGuest((v) => (v ? { ...v, active: !v.active } : v));
              }}
              onDelete={() => {
                const g = viewingGuest;
                setViewingGuest(null);
                setToDelete(g);
              }}
            />
          ) : null
        }
      >
        {viewingGuest ? (
          <div className="space-y-3 text-sm">
            {/* One compact info line instead of a 4-box grid. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-400">
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  viewingGuest.active ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${viewingGuest.active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {viewingGuest.active ? 'Active' : 'Inactive'}
              </span>
              {viewingGuest.guest_code ? (
                <span className="font-mono-num text-blue-400 font-bold">· {viewingGuest.guest_code}</span>
              ) : null}
              {isAdmin ? <span>· {viewingGuest.agent_name || 'Unassigned'}</span> : null}
              {viewingGuest.telegram_id != null ? (
                <span className="font-mono-num">· TG {viewingGuest.telegram_id}</span>
              ) : null}
            </div>

            <section className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
              <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-500 block mb-2">
                Accounts
              </span>
              {(viewingGuest.junkets || []).length === 0 ? (
                <span className="text-slate-500 text-sm italic">No junket accounts linked.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {viewingGuest.junkets.map((j) => {
                    const meta = JUNKETS.find((jj) => jj.value === j.junket);
                    const badgeClass = meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700';

                    if (inlineEditJunket?.junket === j.junket) {
                      const onKeyDown = (e) => {
                        if (e.key === 'Enter') saveInlineJunket();
                        if (e.key === 'Escape') setInlineEditJunket(null);
                      };
                      return (
                        <div
                          key={j.junket}
                          className={`inline-flex flex-wrap items-center gap-1 text-[12px] px-1.5 py-0.5 rounded border font-mono-num ${badgeClass}`}
                        >
                          <span className="font-bold uppercase tracking-wider">{j.junket}</span>
                          <span className="text-[10px] opacity-70">Rolling</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            autoFocus
                            disabled={inlineSaving}
                            value={inlineEditJunket.commission_percent ?? ''}
                            onChange={(e) =>
                              setInlineEditJunket((v) => ({
                                ...v,
                                commission_percent: e.target.value === '' ? null : e.target.value,
                              }))
                            }
                            onKeyDown={onKeyDown}
                            className="w-12 bg-black/20 border border-white/20 rounded px-1 py-0.5 text-[13px] font-mono-num focus:outline-hidden"
                          />
                          <span className="text-[11px] opacity-70">%</span>
                          <span className="text-[10px] opacity-70">Com</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            disabled={inlineSaving}
                            value={inlineEditJunket.commission_rate ?? ''}
                            onChange={(e) =>
                              setInlineEditJunket((v) => ({
                                ...v,
                                commission_rate: e.target.value === '' ? null : e.target.value,
                              }))
                            }
                            onKeyDown={onKeyDown}
                            className="w-12 bg-black/20 border border-white/20 rounded px-1 py-0.5 text-[13px] font-mono-num focus:outline-hidden"
                          />
                          <span className="text-[11px] opacity-70">%</span>
                          <button
                            type="button"
                            disabled={inlineSaving}
                            onClick={saveInlineJunket}
                            title="Save"
                            className="shrink-0 p-0.5 rounded hover:bg-black/40 transition cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={inlineSaving}
                            onClick={() => setInlineEditJunket(null)}
                            title="Cancel"
                            className="shrink-0 p-0.5 rounded hover:bg-black/40 transition cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={j.junket}
                        type="button"
                        title="Click to edit this account's rate"
                        onClick={() =>
                          setInlineEditJunket({
                            junket: j.junket,
                            commission_rate: j.commission_rate,
                            commission_percent: j.commission_percent,
                          })
                        }
                        className={`inline-flex flex-wrap items-center gap-x-1 text-left text-[12px] px-1.5 py-0.5 rounded border font-mono-num cursor-pointer transition hover:brightness-125 hover:ring-1 hover:ring-white/30 ${badgeClass}`}
                      >
                        <span className="font-bold uppercase tracking-wider">{j.junket}</span>
                        {j.account_no ? <span>· {j.account_no}</span> : null}
                        {junketBadgeSuffix(j) ? <span>{junketBadgeSuffix(j)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-500">
                  Game Records{records.length ? ` · ${visibleRecords.length}` : ''}
                </span>
                {recordJunkets.length > 1 ? (
                  <Select
                    value={recordsJunketFilter}
                    onChange={setRecordsJunketFilter}
                    options={[{ value: '', label: 'All junkets' }, ...recordJunkets]}
                    aria-label="Filter game records by junket"
                    className="min-w-[120px] bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[13px] text-slate-300 focus:outline-hidden focus:border-blue-500"
                  />
                ) : null}
              </div>

              {/* Actions: equal-width row on phones, compact on desktop. */}
              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-1.5 mb-3">
                <CopyImageButton
                  makeImage={makeRecordsImage}
                  disabled={recordsLoading || visibleRecords.length === 0}
                  onError={setRecordsError}
                  className="flex items-center justify-center gap-1.5 min-w-0 px-2 py-1.5 text-[13px] font-semibold rounded-md border transition cursor-pointer text-white bg-blue-600 hover:bg-blue-500 border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowOriginal(true)}
                  disabled={records.length === 0}
                  title="Original commission and game rate, derived from the raw settlement message — ignores any custom rate set on this guest's linked account"
                  className="flex items-center justify-center gap-1.5 min-w-0 px-2 py-1.5 text-[13px] font-semibold rounded-md border transition cursor-pointer text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-600 border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calculator className="w-4 h-4 shrink-0" />
                  <span className="truncate">Original data</span>
                </button>
              </div>

              {recordsError ? <p className="text-rose-400 text-sm">{recordsError}</p> : null}

              {recordsLoading ? (
                <p className="text-slate-400 text-sm">Loading…</p>
              ) : visibleRecords.length === 0 ? (
                <div className="p-6 text-center rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <Gamepad2 className="w-5 h-5 text-slate-600 mx-auto" />
                  <p className="text-slate-500 text-sm">
                    {records.length === 0
                      ? "No game records yet for this guest's linked accounts."
                      : 'No game records for this junket.'}
                  </p>
                </div>
              ) : (
                <RecordsTable
                  records={visibleRecords}
                  rolling={(r) => effectiveRow(r).rolling}
                  rate={customRate}
                  rateLabel="RATE"
                  commission={(r) => effectiveRow(r).commission}
                  totals={recordsTotals}
                />
              )}
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showOriginal}
        onClose={() => setShowOriginal(false)}
        title="Original Data — no custom rate"
        icon={Calculator}
        maxWidth="max-w-7xl"
      >
        <div className="space-y-3 text-sm">
          {visibleRecords.length === 0 ? (
            <div className="p-6 text-center rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <Calculator className="w-5 h-5 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">No game records to compute.</p>
            </div>
          ) : (
            <RecordsTable
              records={visibleRecords}
              rolling={(r) => r.rolling}
              rate={(r) => r.game_rate}
              rateLabel="GAME RATE"
              commission={(r) => r.original_commission}
              totals={{
                ...recordsTotals,
                rolling: originalTotals.rolling,
                commission: originalTotals.hasOriginal ? originalTotals.commission : null,
              }}
            />
          )}

          <div className="flex items-center justify-end pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowOriginal(false)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete guest?"
        message={
          toDelete
            ? `Delete "${toDelete.guest_name}"${toDelete.guest_code ? ` (${toDelete.guest_code})` : ''}?`
            : ''
        }
        confirmLabel="Delete"
        busy={rowBusy === toDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
