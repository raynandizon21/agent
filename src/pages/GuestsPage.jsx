import { Calculator, Check, Edit2, Gamepad2, Loader2, Plus, Power, Search, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';
import Modal from '../components/common/Modal';

function formatAmount(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString();
}

function formatRate(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
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
// guest. `value` is [{ junket, account_no }, ...]. `usedAccounts` is
// { [junket]: Set(account_no) } already claimed by OTHER guests — a real
// account belongs to one player, so those are hidden here to stop the same
// account getting linked twice (this guest's own current pick stays visible).
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
          <div key={j.value} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-200 w-24 shrink-0">
              <input
                type="checkbox"
                checked={!!entry}
                onChange={() =>
                  onChange(
                    entry
                      ? value.filter((v) => v.junket !== j.value)
                      : [...value, { junket: j.value, account_no: null, commission_rate: null }]
                  )
                }
                className="rounded bg-slate-950 border-slate-700 text-blue-600 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-semibold">{j.label}</span>
            </label>
            {entry ? (
              <>
                <select
                  value={entry.account_no || ''}
                  onChange={(e) =>
                    onChange(
                      value.map((v) =>
                        v.junket === j.value ? { ...v, account_no: e.target.value || null } : v
                      )
                    )
                  }
                  className="flex-1 min-w-0 w-0 truncate bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 font-mono-num focus:outline-hidden"
                >
                  <option value="">Select account…</option>
                  {options.map((a) => (
                    <option key={a.account_no} value={a.account_no}>
                      {a.account_no}
                      {a.player_name ? ` — ${a.player_name}` : ''}
                    </option>
                  ))}
                </select>
                <div className="relative w-24 shrink-0">
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
                    placeholder="Rate"
                    title="Commission rate (%) — saving recomputes this account's commission on every game"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 pr-5 text-sm text-slate-200 font-mono-num focus:outline-hidden"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[13px] pointer-events-none">
                    %
                  </span>
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [accountsByJunket, setAccountsByJunket] = useState({});
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
      const data = await api('/guests');
      setGuests(data.guests || []);
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
    const recomputed = form.junkets.some((j) => j.account_no && j.commission_rate != null);
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
        setOk(recomputed ? 'Guest updated — commission recomputed for that account.' : 'Guest updated');
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
        setOk(recomputed ? 'Guest added — commission recomputed for that account.' : 'Guest added');
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

  const filteredGuests = useMemo(() => {
    const query = q.trim().toLowerCase();
    return guests.filter((g) => {
      if (junketFilter && !(g.junkets || []).some((j) => j.junket === junketFilter)) return false;
      if (!query) return true;
      return (
        (g.guest_code || '').toLowerCase().includes(query) ||
        g.guest_name.toLowerCase().includes(query) ||
        String(g.telegram_id ?? '').toLowerCase().includes(query) ||
        (g.agent_name || '').toLowerCase().includes(query)
      );
    });
  }, [guests, junketFilter, q]);

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
  const recordsTotals = useMemo(
    () =>
      visibleRecords.reduce(
        (acc, r) => ({
          buy_in: acc.buy_in + (Number(r.buy_in) || 0),
          cashout: acc.cashout + (Number(r.cashout) || 0),
          rolling: acc.rolling + (Number(r.rolling) || 0),
          commission: acc.commission + (Number(r.commission) || 0),
          win_loss: acc.win_loss + (Number(r.win_loss) || 0),
          balance: acc.balance + (Number(r.balance) || 0),
        }),
        { buy_in: 0, cashout: 0, rolling: 0, commission: 0, win_loss: 0, balance: 0 }
      ),
    [visibleRecords]
  );
  const originalTotals = useMemo(
    () =>
      visibleRecords.reduce(
        (acc, r) => ({
          rolling: acc.rolling + (Number(r.rolling) || 0),
          commission: acc.commission + (Number(r.original_commission) || 0),
        }),
        { rolling: 0, commission: 0 }
      ),
    [visibleRecords]
  );
  // Junket commission is rolling-based (a % of turnover), not buy-in-based.
  const overallGameRate = originalTotals.rolling ? (originalTotals.commission / originalTotals.rolling) * 100 : null;
  // The Game Records table shows each linked account's own custom commission
  // rate (the same rate shown in its badge above), not the rolling-derived
  // original rate — that one only shows in the Original Data popup.
  const customRateByAccount = useMemo(() => {
    const map = new Map();
    for (const j of viewingGuest?.junkets || []) {
      if (j.account_no) map.set(`${j.junket}:${j.account_no}`, j.commission_rate);
    }
    return map;
  }, [viewingGuest]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            Guests
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Guest/player directory — code, name, and Telegram id.</p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add guest
        </button>
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-400 text-sm">{ok}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, name, telegram ID, or agent…"
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

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <select
            value={junketFilter}
            onChange={(e) => setJunketFilter(e.target.value)}
            aria-label="Junket filter"
            className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="">All junkets</option>
            {JUNKETS.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
          <span className="text-[13px] font-mono-num text-slate-500 px-1">{filteredGuests.length} rows</span>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[14px] font-bold">
                <th className="py-2.5 px-3 whitespace-nowrap">GUEST CODE</th>
                <th className="py-2.5 px-3 whitespace-nowrap">PLAYER NAME</th>
                <th className="py-2.5 px-3 whitespace-nowrap">AGENT</th>
                <th className="py-2.5 px-3 whitespace-nowrap">TELEGRAM ID</th>
                <th className="py-2.5 px-3 whitespace-nowrap">JUNKETS</th>
                <th className="py-2.5 px-3 whitespace-nowrap">STATUS</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {visibleGuests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {guests.length === 0 ? 'No guests yet.' : 'No guests match your search.'}
                  </td>
                </tr>
              ) : (
                visibleGuests.map((g) => {
                  const busyRow = rowBusy === g.id;
                  return (
                    <tr
                      key={g.id}
                      onClick={() => openView(g)}
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-sm font-bold text-blue-400">
                        {g.guest_code || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-100 font-semibold">
                        {g.guest_name}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {g.agent_name ? (
                          <span className="font-medium text-slate-200">{g.agent_name}</span>
                        ) : (
                          <span className="text-slate-500 text-[14px] italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-slate-400">
                        {g.telegram_id ?? '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {(g.junkets || []).length === 0 ? (
                          <span className="text-slate-500 text-[14px] italic">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 items-center max-w-md">
                            {g.junkets.map((j) => {
                              const meta = JUNKETS.find((jj) => jj.value === j.junket);
                              return (
                                <span
                                  key={j.junket}
                                  className={`inline-flex items-center gap-1 text-[13px] px-1.5 py-0.5 rounded border font-mono-num ${
                                    meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  <span className="font-bold uppercase tracking-wider">{j.junket}</span>
                                  {j.account_no ? <span>· {j.account_no}</span> : null}
                                  {j.commission_rate != null ? <span>· {j.commission_rate}%</span> : null}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[13px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                            g.active
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          }`}
                        >
                          {g.active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(g)}
                            disabled={busyRow}
                            title="Edit"
                            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(g)}
                            disabled={busyRow}
                            title={g.active ? 'Deactivate' : 'Activate'}
                            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            {busyRow ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className={`w-3.5 h-3.5 ${g.active ? 'text-emerald-400' : 'text-slate-500'}`} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(g)}
                            disabled={busyRow}
                            title="Delete"
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredGuests.length > 0 ? (
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
        title={viewingGuest ? `${viewingGuest.guest_name} — Game Records` : ''}
        icon={Gamepad2}
        maxWidth="max-w-7xl"
      >
        {viewingGuest ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <span className="text-[11px] uppercase font-semibold text-slate-500 block">Guest Code</span>
                <span className="font-mono-num text-blue-400 font-bold">{viewingGuest.guest_code || '—'}</span>
              </div>
              <div>
                <span className="text-[11px] uppercase font-semibold text-slate-500 block">Telegram ID</span>
                <span className="font-mono-num text-slate-200">{viewingGuest.telegram_id ?? '—'}</span>
              </div>
              <div>
                <span className="text-[11px] uppercase font-semibold text-slate-500 block">Agent</span>
                <span className="text-slate-200">{viewingGuest.agent_name || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-[11px] uppercase font-semibold text-slate-500 block">Status</span>
                <span className={viewingGuest.active ? 'text-emerald-400' : 'text-rose-400'}>
                  {viewingGuest.active ? 'Active' : 'Deactivated'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[11px] uppercase font-semibold text-slate-500 block mb-1.5">
                Linked Junket Accounts
              </span>
              {(viewingGuest.junkets || []).length === 0 ? (
                <span className="text-slate-500 text-sm italic">No junket accounts linked.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {viewingGuest.junkets.map((j) => {
                    const meta = JUNKETS.find((jj) => jj.value === j.junket);
                    return (
                      <span
                        key={j.junket}
                        className={`inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded border font-mono-num ${
                          meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        <span className="font-bold uppercase tracking-wider">{j.junket}</span>
                        {j.account_no ? <span>· {j.account_no}</span> : null}
                        {j.commission_rate != null ? <span>· {j.commission_rate}%</span> : null}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <span className="text-[11px] uppercase font-semibold text-slate-500">Game Records</span>
                <div className="flex items-center gap-1.5">
                  {records.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowOriginal(true)}
                      title="Original commission and game rate, derived from the raw settlement message — ignores any custom rate set on this guest's linked account"
                      className="flex items-center gap-1 px-2 py-1 text-[13px] font-semibold text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-600 rounded-md border border-blue-500/20 transition cursor-pointer"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      Original data
                    </button>
                  ) : null}
                  {recordJunkets.length > 1 ? (
                    <select
                      value={recordsJunketFilter}
                      onChange={(e) => setRecordsJunketFilter(e.target.value)}
                      aria-label="Filter game records by junket"
                      className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[13px] text-slate-300 focus:outline-hidden cursor-pointer"
                    >
                      <option value="">All junkets</option>
                      {recordJunkets.map((j) => (
                        <option key={j.value} value={j.value}>
                          {j.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
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
                <div className="rounded-lg border border-slate-800 overflow-auto max-h-80">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead className="sticky top-0">
                      <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px] font-bold">
                        <th className="py-2 px-2.5 whitespace-nowrap">DATE</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">STATUS</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">JUNKET</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">GAME NO.</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">ACCOUNT NO.</th>
                        <th className="py-2 px-2.5">PLAYER NAME</th>
                        <th className="py-2 px-2.5 whitespace-nowrap">AGENT</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">BUY-IN</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">CASHOUT</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">ROLLING</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">GAME RATE</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">COMMISSION</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">WIN/LOSS</th>
                        <th className="py-2 px-2.5 text-right whitespace-nowrap">BALANCE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900">
                      {visibleRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-400">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <span
                              className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                                r.status === 'open'
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              }`}
                            >
                              {r.status === 'open' ? r.step || 'open' : 'settled'}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            {(() => {
                              const meta = JUNKETS.find((jj) => jj.value === r.junket);
                              return (
                                <span
                                  className={`inline-block uppercase font-bold text-[11px] px-1.5 py-0.5 rounded border ${
                                    meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {r.junket}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-300">
                            {r.game_no || '—'}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-300">
                            {r.account_no || '—'}
                          </td>
                          <td
                            className="py-2 px-2.5 text-slate-200 truncate max-w-[180px]"
                            title={r.player_name || ''}
                          >
                            {r.player_name || '—'}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap text-slate-200">
                            {r.agent_name || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                            {formatAmount(r.buy_in)}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                            {formatAmount(r.cashout)}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-100">
                            {formatAmount(r.rolling)}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-300 font-mono-num">
                            {formatRate(customRateByAccount.get(`${r.junket}:${r.account_no}`))}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-amber-400">
                            {formatAmount(r.commission)}
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap font-bold ${
                              Number(r.win_loss) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatAmount(r.win_loss)}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200 font-mono-num">
                            {formatAmount(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="border-t border-slate-700 bg-slate-950 font-bold">
                        <td className="py-2 px-2.5 whitespace-nowrap text-slate-400" colSpan={7}>
                          GRAND TOTAL
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                          {formatAmount(recordsTotals.buy_in)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                          {formatAmount(recordsTotals.cashout)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                          {formatAmount(recordsTotals.rolling)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap"></td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-amber-400">
                          {formatAmount(recordsTotals.commission)}
                        </td>
                        <td
                          className={`py-2 px-2.5 text-right whitespace-nowrap ${
                            recordsTotals.win_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatAmount(recordsTotals.win_loss)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100 font-mono-num">
                          {formatAmount(recordsTotals.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewingGuest(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
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
          <p className="text-[13px] text-slate-400">
            Commission below is re-derived from each settlement's raw message, ignoring any custom commission
            rate saved on this guest's linked account. Game rate = original commission ÷ rolling.
          </p>

          {visibleRecords.length === 0 ? (
            <div className="p-6 text-center rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <Calculator className="w-5 h-5 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">No game records to compute.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 overflow-auto max-h-96">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead className="sticky top-0">
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px] font-bold">
                    <th className="py-2 px-2.5 whitespace-nowrap">DATE</th>
                    <th className="py-2 px-2.5 whitespace-nowrap">STATUS</th>
                    <th className="py-2 px-2.5 whitespace-nowrap">JUNKET</th>
                    <th className="py-2 px-2.5 whitespace-nowrap">GAME NO.</th>
                    <th className="py-2 px-2.5 whitespace-nowrap">ACCOUNT NO.</th>
                    <th className="py-2 px-2.5">PLAYER NAME</th>
                    <th className="py-2 px-2.5 whitespace-nowrap">AGENT</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">BUY-IN</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">CASHOUT</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">ROLLING</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">GAME RATE</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">ORIGINAL COMMISSION</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">WIN/LOSS</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap">BALANCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900">
                  {visibleRecords.map((r) => {
                    const meta = JUNKETS.find((jj) => jj.value === r.junket);
                    return (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-400">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                              r.status === 'open'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            }`}
                          >
                            {r.status === 'open' ? r.step || 'open' : 'settled'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block uppercase font-bold text-[11px] px-1.5 py-0.5 rounded border ${
                              meta ? meta.color : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {r.junket}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-300">
                          {r.game_no || '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap font-mono-num text-slate-300">
                          {r.account_no || '—'}
                        </td>
                        <td className="py-2 px-2.5 text-slate-200 truncate max-w-[180px]" title={r.player_name || ''}>
                          {r.player_name || '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-slate-200">
                          {r.agent_name || '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                          {formatAmount(r.buy_in)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200">
                          {formatAmount(r.cashout)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-100">
                          {formatAmount(r.rolling)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-100 font-mono-num">
                          {formatRate(r.game_rate)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-amber-400">
                          {formatAmount(r.original_commission)}
                        </td>
                        <td
                          className={`py-2 px-2.5 text-right whitespace-nowrap font-bold ${
                            Number(r.win_loss) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatAmount(r.win_loss)}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap font-bold text-slate-200 font-mono-num">
                          {formatAmount(r.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr className="border-t border-slate-700 bg-slate-950 font-bold">
                    <td className="py-2 px-2.5 whitespace-nowrap text-slate-400" colSpan={7}>
                      GRAND TOTAL
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                      {formatAmount(recordsTotals.buy_in)}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                      {formatAmount(recordsTotals.cashout)}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100">
                      {formatAmount(recordsTotals.rolling)}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100 font-mono-num">
                      {formatRate(overallGameRate)}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-amber-400">
                      {formatAmount(originalTotals.commission)}
                    </td>
                    <td
                      className={`py-2 px-2.5 text-right whitespace-nowrap ${
                        recordsTotals.win_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatAmount(recordsTotals.win_loss)}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-100 font-mono-num">
                      {formatAmount(recordsTotals.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
