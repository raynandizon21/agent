import { Bot, FileText, Gamepad2, MoreHorizontal, Plane, Radio, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

// `color` tints each icon so tabs are recognisable at a glance — kept in sync
// with Sidebar.jsx. `pill` is the matching tint for the selected-tab shape.
const NAV_ITEMS = [
  { to: '/', end: true, label: 'Settlements', icon: Gamepad2, color: 'text-amber-400', pill: 'bg-amber-500/15 border-amber-500/40', adminOnly: false },
  { to: '/trips', end: false, label: 'Trips', icon: Plane, color: 'text-sky-400', pill: 'bg-sky-500/15 border-sky-500/40', adminOnly: false },
  { to: '/guests', end: false, label: 'Guests', icon: Users, color: 'text-violet-400', pill: 'bg-violet-500/15 border-violet-500/40', adminOnly: false },
  { to: '/statements', end: false, label: 'Statements', icon: FileText, color: 'text-emerald-400', pill: 'bg-emerald-500/15 border-emerald-500/40', adminOnly: false },
  { to: '/messages', end: false, label: 'Messages', icon: Radio, color: 'text-rose-400', pill: 'bg-rose-500/15 border-rose-500/40', adminOnly: true },
  { to: '/agents', end: false, label: 'Agents', icon: UserCheck, color: 'text-teal-400', pill: 'bg-teal-500/15 border-teal-500/40', adminOnly: true },
  { to: '/users', end: false, label: 'Users', icon: ShieldCheck, color: 'text-indigo-400', pill: 'bg-indigo-500/15 border-indigo-500/40', adminOnly: true },
  { to: '/telegram', end: false, label: 'Telegram', icon: Bot, color: 'text-cyan-400', pill: 'bg-cyan-500/15 border-cyan-500/40', adminOnly: true },
];

// Tabs that fit the bar before the rest collapse into a "More" sheet.
const MAX_TABS = 5;

function isRouteActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function TabContent({ icon: Icon, label, color, active }) {
  return (
    <>
      <Icon className={`w-[18px] h-[18px] ${color} ${active ? '' : 'opacity-85'}`} strokeWidth={active ? 2.3 : 1.9} />
      <span
        className={`text-[10px] mt-0.5 leading-none truncate max-w-full transition-colors ${
          active ? 'text-white font-semibold' : 'text-slate-300/80'
        }`}
      >
        {label}
      </span>
    </>
  );
}

const TAB_CLASS =
  'relative flex flex-col items-center justify-center h-12 px-0.5 min-w-0 cursor-pointer select-none active:scale-95 transition';

// Floating iOS-style glass pill tab bar: translucent and heavily blurred so
// the page shows through; the active tab sits under a glass pill that slides
// between tabs.
export default function BottomNav({ isAdmin }) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const overflow = items.length > MAX_TABS;
  const primary = overflow ? items.slice(0, MAX_TABS - 1) : items;
  const extra = overflow ? items.slice(MAX_TABS - 1) : [];
  const extraActive = extra.some((item) => isRouteActive(item, pathname));
  const cols = primary.length + (overflow ? 1 : 0);

  // Index of the tab under the sliding highlight pill (the "More" tab when
  // its sheet is open or one of its pages is showing).
  const activeIndex =
    moreOpen || extraActive ? cols - 1 : primary.findIndex((item) => isRouteActive(item, pathname));

  const activePill =
    moreOpen || extraActive
      ? 'bg-slate-400/15 border-slate-400/40'
      : primary[activeIndex]?.pill || 'bg-slate-400/15 border-slate-400/40';

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute left-10 right-10 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-w-[350px] mx-auto rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-white/10 p-2 shadow-2xl grid grid-cols-3 gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {extra.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-semibold transition ${
                      isActive ? 'bg-white/10 text-white' : 'text-slate-300 active:bg-white/5'
                    }`
                  }
                >
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 px-10 pb-[max(0.625rem,env(safe-area-inset-bottom))] pointer-events-none lg:hidden">
        <div className="relative max-w-[350px] mx-auto pointer-events-auto rounded-full overflow-hidden border border-slate-700/80 bg-slate-800/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.06),0_10px_30px_-8px_rgba(0,0,0,0.7)]">
          {/* Inset from the rounded ends so the end tabs aren't squeezed by the curve. */}
          <div className="relative mx-3">
          {activeIndex >= 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 transition-[left] duration-300 ease-out"
              style={{ left: `calc(${activeIndex} * 100% / ${cols})`, width: `calc(100% / ${cols})` }}
            >
              <span className={`block h-full rounded-full -mx-1.5 border transition-colors duration-300 ${activePill} shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_14px_-4px_rgba(0,0,0,0.6)] backdrop-blur-md`} />
            </span>
          ) : null}

          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {primary.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={TAB_CLASS}>
                {({ isActive }) => (
                  <TabContent icon={item.icon} label={item.label} color={item.color} active={isActive && !moreOpen} />
                )}
              </NavLink>
            ))}
            {overflow ? (
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className={TAB_CLASS}
              >
                <TabContent icon={MoreHorizontal} label="More" color="text-slate-300" active={moreOpen || extraActive} />
              </button>
            ) : null}
          </div>
          </div>
        </div>
      </nav>
    </>
  );
}
