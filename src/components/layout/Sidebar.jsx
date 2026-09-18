import { Bot, Gamepad2, Radio, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Settlements', icon: Gamepad2, adminOnly: false },
  { to: '/messages', end: false, label: 'Messages', icon: Radio, adminOnly: false },
  { to: '/agents', end: false, label: 'Agents', icon: UserCheck, adminOnly: true },
  { to: '/guests', end: false, label: 'Guests', icon: Users, adminOnly: false },
  { to: '/users', end: false, label: 'Users', icon: ShieldCheck, adminOnly: true },
  { to: '/telegram', end: false, label: 'Telegram', icon: Bot, adminOnly: true },
];

export default function Sidebar({ isAdmin }) {
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="w-52 shrink-0 hidden lg:flex flex-col p-3 bg-slate-900/60 border-r border-slate-800/80 min-h-[calc(100vh-56px)]">
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
