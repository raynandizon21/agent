import { useEffect, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';

const EMPTY_FORM = { name: '', telegram_id: '' };

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // Inline edit state: which row is being edited, and its draft values.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [rowBusy, setRowBusy] = useState(null); // agent id currently saving/deleting
  const [toDelete, setToDelete] = useState(null); // agent pending delete confirmation

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

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      const data = await api('/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          telegram_id: form.telegram_id,
        }),
      });
      setForm(EMPTY_FORM);
      if (data.login) {
        setOk(
          `Agent added. Dashboard login — username: ${data.login.username}, password: ${data.login.password} (share this with them, and have them change it).`
        );
        await load();
        return;
      }
      setOk('Agent added');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add agent');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a) {
    setEditingId(a.id);
    setEditForm({
      name: a.name,
      telegram_id: String(a.telegram_id),
      is_active: !!a.is_active,
    });
    setError('');
    setOk('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function saveEdit(id) {
    setRowBusy(id);
    setError('');
    setOk('');
    try {
      await api(`/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          telegram_id: editForm.telegram_id,
          is_active: editForm.is_active,
        }),
      });
      setOk('Agent updated');
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update agent');
    } finally {
      setRowBusy(null);
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

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Agents</h1>
          <p className="muted">
            Chat-id maintenance — register the Telegram ids that send reports
            so inbound messages are matched.
          </p>
        </div>
      </header>

      <form className="agent-form" onSubmit={onSubmit}>
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label>
          Telegram ID
          <input
            value={form.telegram_id}
            onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))}
            placeholder="e.g. 123456789"
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add agent'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Telegram ID</th>
              <th>Active</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No agents yet.
                </td>
              </tr>
            ) : (
              agents.map((a) => {
                const editing = editingId === a.id;
                const busyRow = rowBusy === a.id;
                return (
                  <tr key={a.id}>
                    {editing ? (
                      <>
                        <td>
                          <input
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, name: e.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="mono"
                            value={editForm.telegram_id}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, telegram_id: e.target.value }))
                            }
                          />
                        </td>
                        <td>{editForm.is_active ? 'Yes' : 'No'}</td>
                        <td className="mono">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() => saveEdit(a.id)}
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
                        <td>{a.name}</td>
                        <td className="mono">{a.telegram_id}</td>
                        <td>{a.is_active ? 'Yes' : 'No'}</td>
                        <td className="mono">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => startEdit(a)}
                              disabled={busyRow}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => toggleActive(a)}
                              disabled={busyRow}
                            >
                              {busyRow ? 'Working…' : a.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setToDelete(a)}
                              disabled={busyRow}
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
    </section>
  );
}
