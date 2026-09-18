import { Check, Edit2, Loader2, Plus, Power, Search, Trash2, UserCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';
import Modal from '../components/common/Modal';

const EMPTY_FORM = { name: '', telegram_id: '' };
const PAGE_SIZE = 20;

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);

  const [rowBusy, setRowBusy] = useState(null); // agent id currently saving/deleting
  const [toDelete, setToDelete] = useState(null); // agent pending delete confirmation

  const filteredAgents = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter(
      (a) => a.name.toLowerCase().includes(query) || String(a.telegram_id).includes(query)
    );
  }, [agents, q]);

  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [q]);
  const pagedAgents = filteredAgents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function load() {
    setError('');
    try {
      const data = await api('/agents');
      setAgents(data.agents || []);
    } catch (err) {
      setError(err.message || 'Failed to load agents');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditingAgent(null);
    setForm(EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  }

  function openEdit(a) {
    setEditingAgent(a);
    setForm({ name: a.name, telegram_id: String(a.telegram_id) });
    setError('');
    setIsModalOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      if (editingAgent) {
        await api(`/agents/${editingAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name,
            telegram_id: form.telegram_id,
            is_active: editingAgent.is_active,
          }),
        });
        setOk('Agent updated');
      } else {
        const data = await api('/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            telegram_id: form.telegram_id,
          }),
        });
        if (data.login) {
          setOk(
            `Agent added. Dashboard login — username: ${data.login.username}, password: ${data.login.password} (share this with them, and have them change it).`
          );
        } else {
          setOk('Agent added');
        }
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save agent');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a) {
    setRowBusy(a.id);
    setError('');
    setOk('');
    try {
      await api(`/agents/${a.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: a.name,
          telegram_id: a.telegram_id,
          is_active: !a.is_active,
        }),
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update agent');
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
      await api(`/agents/${toDelete.id}`, { method: 'DELETE' });
      setOk('Agent deleted');
      setToDelete(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete agent');
    } finally {
      setRowBusy(null);
    }
  }

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-hidden focus:border-blue-500 text-sm';

  return (
    <div className="space-y-3 pb-16 sm:pb-6 font-sans">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">Agents</h1>
              <span className="text-[13px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-blue-300 font-mono-num font-bold border border-slate-700">
                {agents.length} Registered
              </span>
            </div>
            <p className="text-[14px] text-slate-400 mt-0.5">
              Chat-id maintenance — register the Telegram ids that send reports so inbound messages are matched.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add agent</span>
        </button>
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-400 text-sm">{ok}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or Telegram ID…"
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
        <span className="text-[13px] font-mono-num text-slate-500 px-1">{filteredAgents.length} rows</span>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 text-[14px] font-bold select-none">
                <th className="py-2.5 px-3.5 whitespace-nowrap">NAME</th>
                <th className="py-2.5 px-3 whitespace-nowrap">TELEGRAM ID</th>
                <th className="py-2.5 px-3 whitespace-nowrap">ACTIVE</th>
                <th className="py-2.5 px-3 whitespace-nowrap">CREATED</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pagedAgents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    {agents.length === 0 ? 'No agents yet.' : 'No agents match your search.'}
                  </td>
                </tr>
              ) : (
                pagedAgents.map((a) => {
                  const busyRow = rowBusy === a.id;
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition group">
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm font-mono-num">
                            {a.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                            {a.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono-num text-sm text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                          {a.telegram_id}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[13px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                            a.is_active
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {a.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-slate-400 text-[14px]">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(a)}
                            disabled={busyRow}
                            title="Edit"
                            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(a)}
                            disabled={busyRow}
                            title={a.is_active ? 'Deactivate' : 'Activate'}
                            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            {busyRow ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className={`w-3.5 h-3.5 ${a.is_active ? 'text-emerald-400' : 'text-slate-500'}`} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(a)}
                            disabled={busyRow}
                            className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/15 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                            title="Delete Agent"
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

      {filteredAgents.length > 0 ? (
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
        title={editingAgent ? 'Edit Agent' : 'Add Agent'}
        icon={UserCheck}
      >
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Telegram ID</label>
            <input
              value={form.telegram_id}
              onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))}
              placeholder="e.g. 123456789"
              required
              className={`${inputClass} font-mono-num`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={busy}
              className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-bold flex items-center gap-1 text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" />
              {busy ? 'Saving…' : 'Save agent'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete agent?"
        message={
          toDelete
            ? `Delete "${toDelete.name}" (${toDelete.telegram_id})? Past messages/settlements stay, just unlinked (shown as Unmatched).`
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
