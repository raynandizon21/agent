import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import ConfirmDialog from '../ConfirmDialog';

const EMPTY_FORM = { username: '', password: '', agent_id: '' };

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ agent_id: '', password: '' });
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

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          agent_id: form.agent_id || null,
        }),
      });
      setForm(EMPTY_FORM);
      setOk('User added');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add user');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditForm({ agent_id: u.agent_id ? String(u.agent_id) : '', password: '' });
    setError('');
    setOk('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ agent_id: '', password: '' });
  }

  async function saveEdit(id) {
    setRowBusy(id);
    setError('');
    setOk('');
    try {
      const body = { agent_id: editForm.agent_id || null };
      if (editForm.password) body.password = editForm.password;
      await api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setOk('User updated');
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update user');
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

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">
            Dashboard logins. Link a login to an agent to scope it to that
            agent's own messages/settlements only — leave unlinked for an
            admin login that sees everything.
          </p>
        </div>
      </header>

      <form className="agent-form" onSubmit={onSubmit}>
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="min 8 characters"
            required
          />
        </label>
        <label>
          Scope to agent
          <select
            value={form.agent_id}
            onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
          >
            <option value="">— Admin (sees everything) —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add user'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Scope</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const editing = editingId === u.id;
                const busyRow = rowBusy === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.username}
                      {u.id === me?.id ? <span className="muted"> (you)</span> : null}
                    </td>
                    {editing ? (
                      <>
                        <td>
                          <select
                            value={editForm.agent_id}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, agent_id: e.target.value }))
                            }
                          >
                            <option value="">— Admin (sees everything) —</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, password: e.target.value }))
                            }
                            placeholder="new password (optional)"
                            style={{ marginTop: 6 }}
                          />
                        </td>
                        <td className="mono">{new Date(u.created_at).toLocaleString()}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() => saveEdit(u.id)}
                              disabled={busyRow}
                            >
                              {busyRow ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={cancelEdit}
                              disabled={busyRow}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          {u.agent_id ? (
                            <span className="badge role-receiver">{u.agent_name}</span>
                          ) : (
                            <span className="badge">admin — sees everything</span>
                          )}
                        </td>
                        <td className="mono">{new Date(u.created_at).toLocaleString()}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => startEdit(u)}
                              disabled={busyRow}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setToDelete(u)}
                              disabled={busyRow || u.id === me?.id}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete user?"
        message={toDelete ? `Delete login "${toDelete.username}"? This can't be undone.` : ''}
        confirmLabel="Delete"
        busy={rowBusy === toDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
