import { BedDouble, ChevronRight, Loader2, Plane, PlaneLanding, PlaneTakeoff, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import TripFormModal from '../components/trips/TripFormModal';
import { TRIP_STATUSES, formatRange, todayStr, tripProgress, tripStatus } from '../lib/trips';

const TAB_KEY = 'trips.tab';

function readTab() {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function TripCard({ trip, today, onOpen }) {
  const status = TRIP_STATUSES.find((s) => s.value === tripStatus(trip, today));
  return (
    <button
      type="button"
      onClick={() => onOpen(trip)}
      className="w-full text-left bg-slate-900/70 hover:bg-slate-800/70 active:bg-slate-800 border border-slate-800 rounded-xl p-3 transition cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-100 truncate">{trip.guest_name}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {formatRange(trip)} · <span className="text-slate-300">{tripProgress(trip, today)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden="true" />
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        {trip.arrival_flight ? (
          <span className="inline-flex items-center gap-1">
            <PlaneLanding className="w-3.5 h-3.5" /> {trip.arrival_flight}
          </span>
        ) : null}
        {trip.departure_flight ? (
          <span className="inline-flex items-center gap-1">
            <PlaneTakeoff className="w-3.5 h-3.5" /> {trip.departure_flight}
          </span>
        ) : null}
        {trip.hotel ? (
          <span className="inline-flex items-center gap-1 min-w-0">
            <BedDouble className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {trip.hotel}
              {trip.room_no ? ` #${trip.room_no}` : ''}
            </span>
          </span>
        ) : null}
        {trip.agent_name ? <span className="text-slate-500">· {trip.agent_name}</span> : null}
      </div>
    </button>
  );
}

function EmptyColumn({ label }) {
  return <p className="text-sm text-slate-500 text-center py-8">No {label.toLowerCase()} guests</p>;
}

// Trips board — the agent's day-to-day view of their guests' visits,
// grouped Coming / Staying / Finished (derived from the schedule dates).
// Phones get one column at a time behind a segmented control; desktop
// shows all three side by side.
export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(readTab);
  const [formOpen, setFormOpen] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    try {
      const data = await api('/trips');
      setTrips(data.trips || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = { coming: [], staying: [], finished: [] };
    for (const t of trips) {
      if (
        needle &&
        ![t.guest_name, t.guest_code, t.hotel, t.arrival_flight, t.departure_flight]
          .some((v) => v && String(v).toLowerCase().includes(needle))
      ) {
        continue;
      }
      out[tripStatus(t, today)].push(t);
    }
    // Soonest arrival first for coming; soonest departure first while
    // staying; most recent departure first once finished.
    out.coming.sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
    out.staying.sort((a, b) => a.departure_date.localeCompare(b.departure_date));
    out.finished.sort((a, b) => b.departure_date.localeCompare(a.departure_date));
    return out;
  }, [trips, q, today]);

  // Default the phone tab to whoever is in-house right now, else upcoming.
  const activeTab = tab || (grouped.staying.length ? 'staying' : 'coming');

  function selectTab(value) {
    setTab(value);
    try {
      sessionStorage.setItem(TAB_KEY, value);
    } catch {
      /* storage unavailable — tab just won't be remembered */
    }
  }

  function openTrip(trip) {
    navigate(`/trips/${trip.id}`);
  }

  return (
    <div className="space-y-3 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Plane className="w-5 h-5 text-blue-400" /> Trips
          </h2>
          <p className="text-xs text-slate-400">Guest schedule, casino play and exchanges per visit</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Register guest
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guest, hotel, flight…"
          className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500/60 rounded-lg pl-9 pr-3 py-2.5 text-base sm:text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {/* Phone / tablet: segmented control + one list */}
      <div className="lg:hidden space-y-3">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
          {TRIP_STATUSES.map((s) => {
            const active = activeTab === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => selectTab(s.value)}
                className={`py-2 rounded-lg text-sm font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  active ? s.active : 'border-transparent text-slate-400'
                }`}
              >
                {s.label}
                <span className={`text-xs tabular-nums ${active ? '' : 'text-slate-500'}`}>{grouped[s.value].length}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : grouped[activeTab].length === 0 ? (
          <EmptyColumn label={TRIP_STATUSES.find((s) => s.value === activeTab).label} />
        ) : (
          <div className="space-y-2">
            {grouped[activeTab].map((t) => (
              <TripCard key={t.id} trip={t} today={today} onOpen={openTrip} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: the three columns side by side */}
      <div className="hidden lg:grid grid-cols-3 gap-3">
        {TRIP_STATUSES.map((s) => (
          <section key={s.value} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-2.5 min-h-[300px]">
            <header className={`flex items-center justify-between px-2.5 py-1.5 mb-2 rounded-lg border ${s.active}`}>
              <span className="text-sm font-bold">{s.label}</span>
              <span className="text-xs tabular-nums font-semibold">{grouped[s.value].length}</span>
            </header>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              </div>
            ) : grouped[s.value].length === 0 ? (
              <EmptyColumn label={s.label} />
            ) : (
              <div className="space-y-2">
                {grouped[s.value].map((t) => (
                  <TripCard key={t.id} trip={t} today={today} onOpen={openTrip} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Phone: floating register button, clear of the bottom nav */}
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Register guest"
        className="sm:hidden fixed right-4 bottom-20 z-40 w-14 h-14 rounded-full bg-blue-600 active:bg-blue-500 text-white shadow-lg shadow-blue-900/50 flex items-center justify-center cursor-pointer"
      >
        <Plus className="w-6 h-6" />
      </button>

      <TripFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          setFormOpen(false);
          navigate(`/trips/${id}`);
        }}
      />
    </div>
  );
}
