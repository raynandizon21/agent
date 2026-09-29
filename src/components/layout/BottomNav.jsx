import { Bot, Gamepad2, MoreHorizontal, Plane, Radio, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Settlements', icon: Gamepad2, adminOnly: false },
  { to: '/trips', end: false, label: 'Trips', icon: Plane, adminOnly: false },
  { to: '/guests', end: false, label: 'Guests', icon: Users, adminOnly: false },
  { to: '/messages', end: false, label: 'Messages', icon: Radio, adminOnly: true },
  { to: '/agents', end: false, label: 'Agents', icon: UserCheck, adminOnly: true },
  { to: '/users', end: false, label: 'Users', icon: ShieldCheck, adminOnly: true },
  { to: '/telegram', end: false, label: 'Telegram', icon: Bot, adminOnly: true },
];

// Tabs that fit the bar before the rest collapse into a "More" sheet.
const MAX_TABS = 5;

function isRouteActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function TabContent({ icon: Icon, label, active }) {
  return (
    <>
      <span
        className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full transition ${
          active ? 'bg-blue-400' : 'bg-transparent'
        }`}
      />
      <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
      <span className={`text-[11px] mt-1 leading-none truncate max-w-full ${active ? 'text-white font-semibold' : 'text-slate-400'}`}>
        {label}
      </span>
    </>
  );
}

const TAB_CLASS = 'relative flex flex-col items-center justify-center h-14 px-1 min-w-0 transition active:bg-slate-900';

export default function BottomNav({ isAdmin }) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const overflow = items.length > MAX_TABS;
  const primary = overflow ? items.slice(0, MAX_TABS - 1) : items;
  const extra = overflow ? items.slice(MAX_TABS - 1) : [];
  const extraActive = extra.some((item) => isRouteActive(item, pathname));
  const cols = primary.length + (overflow ? 1 : 0);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute left-2 right-2 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] rounded-2xl bg-slate-900 border border-slate-800 p-2 shadow-2xl grid grid-cols-3 gap-1"
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
                    `flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition ${
                      isActive ? 'bg-blue-500/15 text-blue-300' : 'text-slate-300 active:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 safe-bottom lg:hidden">
        <div className="grid max-w-lg mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {primary.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={TAB_CLASS}>
              {({ isActive }) => (
                <TabContent icon={item.icon} label={item.label} active={isActive} />
              )}
            </NavLink>
          ))}
          {overflow ? (
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className={`${TAB_CLASS} cursor-pointer`}
            >
              <TabContent icon={MoreHorizontal} label="More" active={moreOpen || extraActive} />
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
