import { Check, Edit2, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import ConfirmDialog from '../ConfirmDialog';
import Modal from '../components/common/Modal';

const EMPTY_FORM = { username: '', password: '', agent_id: '' };
const PAGE_SIZE = 20;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);

  const [rowBusy, setRowBusy] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    setError('');
    try {
      const [usersData, agentsData] = await Promise.all([
        api('/users'),
        api('/agents'),
      ]);
      setUsers(usersData.users || []);
      setAgents(agentsData.agents || []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  }

  function openEdit(u) {
    setEditingUser(u);
    setForm({ username: u.username, password: '', agent_id: u.agent_id ? String(u.agent_id) : '' });
    setError('');
    setIsModalOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      if (editingUser) {
        const body = { agent_id: form.agent_id || null };
        if (form.password) body.password = form.password;
        await api(`/users/${editingUser.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setOk('User updated');
      } else {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            agent_id: form.agent_id || null,
          }),
        });
        setOk('User added');
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save user');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setRowBusy(toDelete.id);
    setError('');
    setOk('');
    try {
      await api(`/users/${toDelete.id}`, { method: 'DELETE' });
      setOk('User deleted');
      setToDelete(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setRowBusy(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(query) || (u.agent_name || '').toLowerCase().includes(query)
    );
  }, [users, q]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [q]);
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-hidden focus:border-blue-500 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            Users
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Dashboard logins. Link a login to an agent to scope it to that agent's own messages/settlements only —
            leave unlinked for an admin login that sees everything.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add user
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
            placeholder="Search username or agent…"
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
        <span className="text-[13px] font-mono-num text-slate-500 px-1">{filteredUsers.length} rows</span>
      </div>

      <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[14px] font-bold">
                <th className="py-2.5 px-3 whitespace-nowrap">USERNAME</th>
                <th className="py-2.5 px-3 whitespace-nowrap">SCOPE</th>
                <th className="py-2.5 px-3 whitespace-nowrap">CREATED</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pagedUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    {users.length === 0 ? 'No users yet.' : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                pagedUsers.map((u) => {
                  const busyRow = rowBusy === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition group">
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-sm font-semibold text-slate-100">
                        {u.username}
                        {u.id === me?.id ? <span className="text-slate-500"> (you)</span> : null}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {u.agent_id ? (
                          <span className="inline-flex items-center gap-1 text-[13px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-blue-500/15 text-blue-300 border-blue-500/30">
                            {u.agent_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[13px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-purple-500/15 text-purple-300 border-purple-500/30">
                            Admin — sees everything
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono-num text-slate-400 text-[14px]">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            disabled={busyRow}
                            title="Edit"
                            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(u)}
                            disabled={busyRow || u.id === me?.id}
                            title={u.id === me?.id ? 'Cannot delete your active login' : 'Delete'}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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

      {filteredUsers.length > 0 ? (
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
        title={editingUser ? 'Edit User' : 'Add User'}
        icon={ShieldCheck}
      >
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          {editingUser ? (
            <div>
              <span className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Username</span>
              <div className="font-mono-num text-slate-200 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                {editingUser.username}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
                className={`${inputClass} font-mono-num`}
              />
            </div>
          )}

          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">
              Password{editingUser ? ' (leave blank to keep current)' : ''}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editingUser ? 'new password (optional)' : 'min 8 characters'}
              required={!editingUser}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">Scope to agent</label>
            <select
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">— Admin (sees everything) —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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
              {busy ? 'Saving…' : editingUser ? 'Save changes' : 'Add user'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete user?"
        message={toDelete ? `Delete login "${toDelete.username}"? This can't be undone.` : ''}
        confirmLabel="Delete"
        busy={rowBusy === toDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
