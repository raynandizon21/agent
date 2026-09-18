import { useEffect, useState } from 'react';
import { api } from '../api';
import ConfirmDialog from '../ConfirmDialog';

const EMPTY_FORM = { telegram_id: '', guest_code: '', guest_name: '' };

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // Inline edit state: which row is being edited, and its draft values.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [rowBusy, setRowBusy] = useState(null); // guest id currently saving/deleting
  const [toDelete, setToDelete] = useState(null); // guest pending delete confirmation

  async function load() {
    setError('');
    try {
      const data = await api('/guests');
      setGuests(data.guests || []);
    } catch (err) {
      setError(err.message || 'Failed to load guests');
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
      await api('/guests', {
        method: 'POST',
        body: JSON.stringify({
          telegram_id: form.telegram_id,
          guest_code: form.guest_code,
          guest_name: form.guest_name,
        }),
      });
      setForm(EMPTY_FORM);
      setOk('Guest added');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add guest');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(g) {
    setEditingId(g.id);
    setEditForm({
      telegram_id: g.telegram_id == null ? '' : String(g.telegram_id),
      guest_code: g.guest_code,
      guest_name: g.guest_name,
      active: !!g.active,
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
      await api(`/guests/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          telegram_id: editForm.telegram_id,
          guest_code: editForm.guest_code,
          guest_name: editForm.guest_name,
          active: editForm.active,
        }),
      });
      setOk('Guest updated');
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update guest');
    } finally {
      setRowBusy(null);
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

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Guests</h1>
          <p className="muted">Guest/player directory — code, name, and Telegram id.</p>
        </div>
      </header>

      <form className="agent-form" onSubmit={onSubmit}>
        <label>
          Guest code
          <input
            value={form.guest_code}
            onChange={(e) => setForm((f) => ({ ...f, guest_code: e.target.value }))}
            placeholder="optional"
          />
        </label>
        <label>
          Guest name
          <input
            value={form.guest_name}
            onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
            required
          />
        </label>
        <label>
          Telegram ID
          <input
            value={form.telegram_id}
            onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value }))}
            placeholder="optional"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add guest'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Guest code</th>
              <th>Guest name</th>
              <th>Telegram ID</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No guests yet.
                </td>
              </tr>
            ) : (
              guests.map((g) => {
                const editing = editingId === g.id;
                const busyRow = rowBusy === g.id;
                return (
                  <tr key={g.id}>
                    {editing ? (
                      <>
                        <td>
                          <input
                            value={editForm.guest_code}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, guest_code: e.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={editForm.guest_name}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, guest_name: e.target.value }))
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
                        <td>{editForm.active ? 'Yes' : 'No'}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() => saveEdit(g.id)}
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
                        <td>{g.guest_code || '—'}</td>
                        <td>{g.guest_name}</td>
                        <td className="mono">{g.telegram_id ?? '—'}</td>
                        <td>{g.active ? 'Yes' : 'No'}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => startEdit(g)}
                              disabled={busyRow}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => toggleActive(g)}
                              disabled={busyRow}
                            >
                              {busyRow ? 'Working…' : g.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => setToDelete(g)}
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
    </section>
  );
}
