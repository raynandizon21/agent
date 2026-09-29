import { Loader2, Plane } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { JUNKET_BADGE, JUNKET_LABELS, todayStr } from '../../lib/trips';

const EMPTY = {
  guest_id: '',
  arrival_date: '',
  departure_date: '',
  arrival_flight: '',
  departure_flight: '',
  hotel: '',
  room_no: '',
  notes: '',
};

const inputCls =
  'w-full bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg px-3 py-2.5 text-base sm:text-sm text-slate-100 outline-none placeholder:text-slate-500';
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1';

// Registration (and edit) form for a guest trip: guest + account, schedule,
// flight numbers, hotel. Inputs use text-base on phones so iOS Safari doesn't
// zoom the page on focus.
export default function TripFormModal({ open, trip, onClose, onSaved }) {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      trip
        ? {
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, trip[k] ?? ''])),
            guest_id: String(trip.guest_id),
          }
        : { ...EMPTY, arrival_date: todayStr(), departure_date: todayStr() }
    );
    api('/guests')
      .then((data) => setGuests((data.guests || []).filter((g) => g.active || g.id === trip?.guest_id)))
      .catch((err) => setError(err.message));
  }, [open, trip]);

  const selectedGuest = guests.find((g) => String(g.id) === String(form.guest_id));
  const linkedAccounts = (selectedGuest?.junkets || []).filter((j) => j.account_no);

  function set(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Keep the range valid while picking: moving arrival past departure
      // drags departure along instead of leaving an invalid range.
      if (key === 'arrival_date' && next.departure_date && value > next.departure_date) {
        next.departure_date = value;
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.guest_id) return setError('Pick a guest');
    if (!form.arrival_date || !form.departure_date) return setError('Schedule dates are required');
    if (form.departure_date < form.arrival_date) return setError('Departure is before arrival');

    setBusy(true);
    try {
      const body = JSON.stringify(form);
      if (trip) {
        await api(`/trips/${trip.id}`, { method: 'PUT', body });
        onSaved(trip.id);
      } else {
        const data = await api('/trips', { method: 'POST', body });
        onSaved(data.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={trip ? 'Edit trip' : 'Register guest'} icon={Plane} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <section className="space-y-3">
          <div>
            <label className={labelCls}>1. Guest name</label>
            <Select
              className={inputCls}
              value={form.guest_id}
              onChange={(guestId) => set('guest_id', guestId)}
              options={[
                { value: '', label: 'Select a guest…' },
                ...guests.map((g) => ({
                  value: String(g.id),
                  label: `${g.guest_name}${g.guest_code ? ` (${g.guest_code})` : ''}`,
                })),
              ]}
            />
            <p className="text-xs text-slate-500 mt-1">New guest? Add them on the Guests page first.</p>
          </div>

          <div>
            <label className={labelCls}>2. Account</label>
            {!selectedGuest ? (
              <p className="text-sm text-slate-500">Pick a guest to see their accounts.</p>
            ) : linkedAccounts.length === 0 ? (
              <p className="text-sm text-amber-400/90">
                No junket account linked yet — link one on the Guests page so casino records show up.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {linkedAccounts.map((j) => (
                  <span key={j.junket} className={`px-2 py-1 rounded-md border text-xs font-semibold ${JUNKET_BADGE[j.junket] || ''}`}>
                    {JUNKET_LABELS[j.junket] || j.junket} · {j.account_no}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <label className={labelCls}>3. Schedule</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">Arrival</span>
              <input type="date" className={inputCls} value={form.arrival_date} onChange={(e) => set('arrival_date', e.target.value)} />
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">Departure</span>
              <input
                type="date"
                className={inputCls}
                value={form.departure_date}
                min={form.arrival_date || undefined}
                onChange={(e) => set('departure_date', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section>
          <label className={labelCls}>4. Flight no.</label>
          <div className="grid grid-cols-2 gap-2">
            <input className={`${inputCls} uppercase`} placeholder="Arrival e.g. 5J 187" value={form.arrival_flight} onChange={(e) => set('arrival_flight', e.target.value)} />
            <input className={`${inputCls} uppercase`} placeholder="Departure" value={form.departure_flight} onChange={(e) => set('departure_flight', e.target.value)} />
          </div>
        </section>

        <section>
          <label className={labelCls}>5. Hotel</label>
          <div className="grid grid-cols-3 gap-2">
            <input className={`${inputCls} col-span-2`} placeholder="Hotel name" value={form.hotel} onChange={(e) => set('hotel', e.target.value)} />
            <input className={inputCls} placeholder="Room" value={form.room_no} onChange={(e) => set('room_no', e.target.value)} />
          </div>
        </section>

        <section>
          <label className={labelCls}>Notes</label>
          <textarea rows={2} className={inputCls} placeholder="Optional" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </section>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {trip ? 'Save' : 'Register'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
