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

export default function BottomNav({ isAdmin }) {
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 px-1 py-1 safe-bottom lg:hidden">
      <div className="flex items-center justify-between overflow-x-auto no-scrollbar gap-1 max-w-lg mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-all relative min-w-[50px] shrink-0 ${
                  isActive
                    ? 'text-blue-400 bg-blue-500/10 font-bold'
                    : 'text-slate-400 hover:text-slate-200 active:bg-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span className={`text-[12px] mt-1 tracking-tight leading-none ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
