import { FileText, Gamepad2, Plane, Radio, Settings, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Settlements', icon: Gamepad2, color: 'text-amber-400', adminOnly: false },
  { to: '/trips', end: false, label: 'Trips', icon: Plane, color: 'text-sky-400', adminOnly: false },
  { to: '/guests', end: false, label: 'Guests', icon: Users, color: 'text-violet-400', adminOnly: false },
  { to: '/statements', end: false, label: 'Statements', icon: FileText, color: 'text-emerald-400', adminOnly: false },
  { to: '/messages', end: false, label: 'Messages', icon: Radio, color: 'text-rose-400', adminOnly: true },
  { to: '/agents', end: false, label: 'Agents', icon: UserCheck, color: 'text-teal-400', adminOnly: true },
  { to: '/users', end: false, label: 'Users', icon: ShieldCheck, color: 'text-indigo-400', adminOnly: true },
  { to: '/settings', end: false, label: 'Settings', icon: Settings, color: 'text-cyan-400', adminOnly: true },
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
                  <Icon className={`w-4 h-4 ${item.color}`} />
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
