import { BedDouble, DoorClosed, DoorOpen, Loader2, Plane, PlaneTakeoff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import DateRangeCalendar from '../common/DateRangeCalendar';
import Modal from '../common/Modal';
import Select from '../common/Select';
import { BOOKING_TYPES, JUNKET_LABELS, todayStr } from '../../lib/trips';

const EMPTY = {
  guest_id: '',
  booking_type: 'hybrid',
  arrival_date: '',
  departure_date: '',
  arrival_flight: '',
  departure_flight: '',
  hotel: '',
  room_no: '',
  notes: '',
};

const JUNKET_OPTIONS = [
  { value: '', label: 'No account yet' },
  ...Object.entries(JUNKET_LABELS).map(([value, label]) => ({ value, label })),
];
const NEW_GUEST = { name: '', junket: '', account_no: '' };
const NEW_OPTION = '__new__'; // the "+ New guest" entry in the guest dropdown
const TYPE_ICONS = { trip: PlaneTakeoff, hotel: BedDouble, hybrid: Plane };

const inputCls =
  'w-full bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg px-3 py-2 sm:py-2.5 text-base sm:text-sm text-slate-100 outline-none placeholder:text-slate-500';

// Registration (and edit) form for a guest trip: guest + account, schedule,
// flight numbers, hotel. Inputs use text-base on phones so iOS Safari doesn't
// zoom the page on focus.
// `defaultGuestId` preselects the guest when registering from somewhere
// that already knows who it's for (the Dashboard's guest board).
// `defaultDate` starts the range on that day (e.g. the day tapped in a calendar);
// `defaultType` presets Trip / Hotel / Trip + Hotel and hides the type picker.
export default function TripFormModal({ open, trip, defaultGuestId, defaultDate, defaultType, onClose, onSaved }) {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'existing' = pick from the dropdown; 'new' = create the guest right here
  // (name + optional junket account), then register the trip.
  const [mode, setMode] = useState('existing');
  const [newGuest, setNewGuest] = useState(NEW_GUEST);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMode('existing');
    setNewGuest(NEW_GUEST);
    setForm(
      trip
        ? {
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, trip[k] ?? ''])),
            guest_id: String(trip.guest_id),
            // Reads fill a missing end from the other; keep it blank here.
            arrival_date: Number(trip.has_arrival) === 0 ? '' : trip.arrival_date,
            departure_date: Number(trip.has_departure) === 0 ? '' : trip.departure_date,
          }
        : {
            ...EMPTY,
            guest_id: defaultGuestId ? String(defaultGuestId) : '',
            booking_type: defaultType || EMPTY.booking_type,
            arrival_date: defaultDate || todayStr(),
            departure_date: '',
          }
    );
    api('/guests')
      .then((data) => setGuests((data.guests || []).filter((g) => g.active || g.id === trip?.guest_id)))
      .catch((err) => setError(err.message));
  }, [open, trip, defaultGuestId, defaultDate, defaultType]);

  const selectedGuest = guests.find((g) => String(g.id) === String(form.guest_id));
  // Opened from a guest's own button: the guest is already known, so the
  // guest/account pickers are hidden and the name goes in the title.
  const lockGuest = !trip && defaultGuestId != null;

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
    const creating = !trip && mode === 'new';
    if (creating && !newGuest.name.trim()) return setError('Enter the guest name');
    if (creating && newGuest.junket && !newGuest.account_no.trim()) return setError('Enter the account no.');
    if (!creating && !form.guest_id) return setError('Pick a guest');
    if (!form.arrival_date && !form.departure_date) return setError('Pick at least one date');
    if (form.arrival_date && form.departure_date && form.departure_date < form.arrival_date) {
      return setError('Departure is before arrival');
    }
    if (form.booking_type === 'hotel' && !form.hotel.trim()) return setError('Enter the hotel name');

    setBusy(true);
    try {
      let guestId = form.guest_id;
      if (creating) {
        const g = await api('/guests', {
          method: 'POST',
          body: JSON.stringify({
            guest_name: newGuest.name.trim(),
            junkets: newGuest.junket ? [{ junket: newGuest.junket, account_no: newGuest.account_no.trim() }] : [],
          }),
        });
        guestId = String(g.id);
        // The guest exists now — if the trip save below fails, a retry
        // must not create them twice, so switch to "existing" with them picked.
        const fresh = await api('/guests').catch(() => null);
        if (fresh) setGuests((fresh.guests || []).filter((x) => x.active || String(x.id) === guestId));
        setForm((f) => ({ ...f, guest_id: guestId }));
        setMode('existing');
      }
      const body = JSON.stringify({
        ...form,
        guest_id: guestId,
        // A flight for a date that isn't set would be orphaned — drop it.
        arrival_flight: form.arrival_date ? form.arrival_flight : '',
        departure_flight: form.departure_date ? form.departure_flight : '',
      });
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
    <Modal open={open} onClose={busy ? () => {} : onClose} title={trip ? 'Edit schedule' : lockGuest ? `${defaultType ? BOOKING_TYPES.find((t) => t.value === defaultType)?.long : 'Book'} · ${selectedGuest?.guest_name || '…'}` : 'Register schedule'} icon={Plane} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-2.5 sm:space-y-3">
        {/* Guest: pick from the list, or "+ New guest" to type a name. */}
        {!lockGuest ? (
          mode === 'new' && !trip ? (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  className={inputCls}
                  placeholder="New guest name"
                  value={newGuest.name}
                  onChange={(e) => setNewGuest((g) => ({ ...g, name: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  title="Pick an existing guest instead"
                  className="shrink-0 px-3 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-2">
                <Select className={inputCls} value={newGuest.junket} onChange={(junket) => setNewGuest((g) => ({ ...g, junket }))} options={JUNKET_OPTIONS} />
                <input
                  className={`${inputCls} uppercase disabled:opacity-50`}
                  placeholder={newGuest.junket ? 'Account no.' : 'Account (optional)'}
                  disabled={!newGuest.junket}
                  value={newGuest.account_no}
                  onChange={(e) => setNewGuest((g) => ({ ...g, account_no: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <Select
              className={inputCls}
              value={form.guest_id}
              onChange={(v) => (v === NEW_OPTION ? setMode('new') : set('guest_id', v))}
              options={[
                { value: '', label: 'Select a guest…' },
                ...(trip ? [] : [{ value: NEW_OPTION, label: '+ New guest' }]),
                ...guests.map((g) => ({ value: String(g.id), label: `${g.guest_name}${g.guest_code ? ` (${g.guest_code})` : ''}` })),
              ]}
            />
          )
        ) : null}

        {!trip && defaultType ? null : (
          <div className="grid grid-cols-3 gap-1.5">
            {BOOKING_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t.value];
              const active = form.booking_type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('booking_type', t.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] sm:text-sm font-semibold transition cursor-pointer ${
                    active ? 'border-blue-500/70 bg-blue-500/15 text-blue-200' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <DateRangeCalendar
          from={form.arrival_date}
          to={form.departure_date}
          onChange={({ from, to }) => setForm((f) => ({ ...f, arrival_date: from, departure_date: to }))}
          {...(form.booking_type === 'hotel' ? { fromLabel: 'Check-in', toLabel: 'Check-out', fromIcon: DoorOpen, toIcon: DoorClosed } : {})}
        />

        {/* One flight field per date that's set. */}
        {form.booking_type !== 'hotel' && (form.arrival_date || form.departure_date) ? (
          <div className={`grid gap-2 ${form.arrival_date && form.departure_date ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {form.arrival_date ? (
              <input className={`${inputCls} uppercase`} placeholder="Arrival flight no." value={form.arrival_flight} onChange={(e) => set('arrival_flight', e.target.value)} />
            ) : null}
            {form.departure_date ? (
              <input className={`${inputCls} uppercase`} placeholder="Departure flight no." value={form.departure_flight} onChange={(e) => set('departure_flight', e.target.value)} />
            ) : null}
          </div>
        ) : null}

        {form.booking_type !== 'trip' ? (
          <div className="grid grid-cols-3 gap-2">
            <input className={`${inputCls} col-span-2`} placeholder={form.booking_type === 'hotel' ? 'Hotel name (required)' : 'Hotel name'} value={form.hotel} onChange={(e) => set('hotel', e.target.value)} />
            <input className={inputCls} placeholder="Room" value={form.room_no} onChange={(e) => set('room_no', e.target.value)} />
          </div>
        ) : null}

        <input className={inputCls} placeholder="Notes (optional)" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <div className="flex gap-2 pt-0.5 sm:pt-1">
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
