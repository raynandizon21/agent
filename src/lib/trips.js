// Shared helpers for the Trips board and trip detail screen.

export const TRIP_STATUSES = [
  { value: 'coming', label: 'Coming', dot: 'bg-sky-400', active: 'bg-sky-500/15 text-sky-300 border-sky-500/40', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { value: 'staying', label: 'Staying', dot: 'bg-emerald-400', active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'finished', label: 'Finished', dot: 'bg-orange-400', active: 'bg-orange-500/15 text-orange-300 border-orange-500/40', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
];

export const JUNKET_LABELS = {
  win9: 'Win9',
  galaxy: 'Galaxy',
  democage: 'Demo Cage',
  infinity: 'Infinity',
};

export const JUNKET_BADGE = {
  win9: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  galaxy: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  democage: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  infinity: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

// Today as 'YYYY-MM-DD' in the browser's local time — trip dates are plain
// calendar dates, so compare as strings rather than Date objects.
export function todayStr() {
  return toDateStr(new Date());
}

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Status is derived from the dates, never stored, so it can't go stale:
// before arrival = coming, arrival..departure (inclusive) = staying.
export function tripStatus(trip, today = todayStr()) {
  if (today < trip.arrival_date) return 'coming';
  if (today > trip.departure_date) return 'finished';
  return 'staying';
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// Every calendar date from arrival to departure, inclusive.
export function tripDays(trip) {
  const out = [];
  const d = parseDate(trip.arrival_date);
  const end = parseDate(trip.departure_date);
  while (d <= end) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function formatDay(s, opts = { month: 'short', day: 'numeric' }) {
  if (!s) return '—';
  return parseDate(s).toLocaleDateString(undefined, opts);
}

export function formatRange(trip) {
  return `${formatDay(trip.arrival_date)} – ${formatDay(trip.departure_date)}`;
}

// One short line describing where the trip is relative to today.
export function tripProgress(trip, today = todayStr()) {
  const status = tripStatus(trip, today);
  const nights = daysBetween(trip.arrival_date, trip.departure_date);
  if (status === 'coming') {
    const n = daysBetween(today, trip.arrival_date);
    return n === 1 ? 'Arrives tomorrow' : `Arrives in ${n} days`;
  }
  if (status === 'staying') {
    const day = daysBetween(trip.arrival_date, today) + 1;
    if (today === trip.departure_date) return 'Departs today';
    return `Day ${day} of ${nights + 1}`;
  }
  const n = daysBetween(trip.departure_date, today);
  return n === 1 ? 'Left yesterday' : `Left ${n} days ago`;
}

export function formatAmount(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString();
}

export function formatSigned(value) {
  if (value == null) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
}

export function formatRate(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
}

export function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
