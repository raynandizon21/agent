import { ChevronLeft, ChevronRight, PlaneLanding, PlaneTakeoff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { daysBetween, formatDay, toDateStr, todayStr } from '../../lib/trips';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: toDateStr(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

// Always-open calendar for a stay, in one of three modes picked at the top:
//   Arrival only · Departure only · Both (a range: Arrival first, then
//   Departure; tap a chip to choose which end the next tap sets).
// `from`/`to` are 'YYYY-MM-DD' or '' when not set.
export default function DateRangeCalendar({ from, to, onChange, fromLabel = 'Arrival', toLabel = 'Departure', fromIcon = PlaneLanding, toIcon = PlaneTakeoff }) {
  const today = todayStr();
  const modeOf = (f, t) => (f && t ? 'both' : t ? 'departure' : 'arrival');
  const [mode, setMode] = useState(() => modeOf(from, to));
  const [picking, setPicking] = useState(() => (modeOf(from, to) === 'departure' ? 'departure' : 'arrival'));
  const [cursor, setCursor] = useState(() => {
    const s = from || to || today;
    return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 };
  });
  const [hover, setHover] = useState(null);

  // The form fills its dates after the modal opens (editing an older trip),
  // so jump to the arrival month the first time one arrives.
  const synced = useRef(!!(from || to));
  useEffect(() => {
    const first = from || to;
    if (first && !synced.current) {
      synced.current = true;
      setMode(modeOf(from, to));
      setPicking(modeOf(from, to) === 'departure' ? 'departure' : 'arrival');
      setCursor({ y: Number(first.slice(0, 4)), m: Number(first.slice(5, 7)) - 1 });
    }
  }, [from, to]);

  function chooseMode(m) {
    setMode(m);
    if (m === 'arrival') {
      onChange({ from: from || to, to: '' });
      setPicking('arrival');
    } else if (m === 'departure') {
      onChange({ from: '', to: to || from });
      setPicking('departure');
    } else {
      setPicking(from ? 'departure' : 'arrival');
    }
  }

  function pick(d) {
    if (mode === 'arrival') return onChange({ from: d, to: '' });
    if (mode === 'departure') return onChange({ from: '', to: d });
    if (picking === 'arrival') {
      // A departure before the new arrival no longer makes sense — drop it.
      onChange({ from: d, to: to && to >= d ? to : '' });
      setPicking('departure');
    } else {
      onChange({ from: from && from <= d ? from : '', to: d });
      setPicking('arrival');
    }
  }

  const move = (delta) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // While choosing Departure, preview the range up to the hovered day.
  const end = picking === 'departure' && hover && from && hover >= from ? hover : to || from;
  const start = from || to;
  const nights = from && to ? daysBetween(from, to) : 0;
  const cells = monthCells(cursor.y, cursor.m);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const chip = (key, Icon, label, value, clear) => (
    <div
      className={`relative flex items-center rounded-lg border transition min-w-0 ${
        picking === key ? 'border-blue-500/70 bg-blue-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
      }`}
    >
      <button type="button" onClick={() => setPicking(key)} className="flex flex-1 items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-left cursor-pointer min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${picking === key ? 'text-blue-300' : 'text-slate-500'}`} />
        <span className="min-w-0">
          <span className="block text-[11px] text-slate-500">{label}</span>
          <span className={`block text-sm font-semibold truncate ${value ? 'text-slate-100' : 'text-slate-500'}`}>
            {value ? formatDay(value, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Not set'}
          </span>
        </span>
      </button>
      {value && clear ? (
        <button type="button" onClick={clear} title={`Clear ${label.toLowerCase()}`} className="shrink-0 p-1.5 mr-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[12px] font-semibold">
        {[
          { value: 'arrival', label: `${fromLabel} only` },
          { value: 'departure', label: `${toLabel} only` },
          { value: 'both', label: 'Both' },
        ].map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => chooseMode(m.value)}
            className={`py-1.5 rounded-md truncate transition cursor-pointer ${mode === m.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'both' ? (
        <div className="grid grid-cols-2 gap-2">
          {chip('arrival', fromIcon, fromLabel, from, () => {
            onChange({ from: '', to });
            setPicking('arrival');
          })}
          {chip('departure', toIcon, toLabel, to, () => {
            onChange({ from, to: '' });
            setPicking('departure');
          })}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 sm:p-3" onMouseLeave={() => setHover(null)}>
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-slate-100">{monthLabel}</span>
          <button type="button" onClick={() => move(1)} aria-label="Next month" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase text-slate-500 mb-1">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 sm:gap-y-0.5">
          {cells.map((c) => {
            const isStart = c.date === start;
            const isEnd = c.date === end;
            const inRange = start && end && c.date > start && c.date < end;
            const edge = isStart || isEnd;
            return (
              <div
                key={c.date}
                className={`relative ${inRange ? 'bg-blue-500/15' : ''} ${isStart && end && end > start ? 'bg-gradient-to-r from-transparent from-50% to-blue-500/15 to-50%' : ''} ${
                  isEnd && start && end > start ? 'bg-gradient-to-l from-transparent from-50% to-blue-500/15 to-50%' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => pick(c.date)}
                  onMouseEnter={() => setHover(c.date)}
                  className={`relative mx-auto flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-sm transition cursor-pointer ${
                    edge
                      ? 'bg-blue-600 text-white font-bold'
                      : c.inMonth
                        ? 'text-slate-200 hover:bg-slate-800'
                        : 'text-slate-600 hover:bg-slate-800/60'
                  } ${c.date === today && !edge ? 'ring-1 ring-blue-400/60' : ''}`}
                >
                  {c.day}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-1 sm:mt-2 text-center text-[12px] font-semibold text-slate-300">
          {mode === 'arrival'
            ? from ? `${fromLabel}: ${formatDay(from, { weekday: 'short', month: 'short', day: 'numeric' })}` : `Tap the ${fromLabel.toLowerCase()} day`
            : mode === 'departure'
              ? to ? `${toLabel}: ${formatDay(to, { weekday: 'short', month: 'short', day: 'numeric' })}` : `Tap the ${toLabel.toLowerCase()} day`
              : `Tap to set ${picking === 'departure' ? toLabel.toLowerCase() : fromLabel.toLowerCase()}${
                  from && to ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''
                }`}
        </p>
      </div>
    </div>
  );
}
