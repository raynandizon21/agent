import { Bot, LogOut } from 'lucide-react';

export default function Navbar({ username, agentName, isAdmin, onLogout }) {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-2.5">
      <div className="w-full flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-bold text-slate-100 tracking-tight truncate">
              Agent Inbox
            </h1>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="hidden sm:inline text-sm font-medium text-slate-300">
            {username}
            {!isAdmin ? (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[13px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                {agentName || 'agent'}
              </span>
            ) : null}
          </span>

          <button
            onClick={onLogout}
            className="px-2.5 sm:px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
