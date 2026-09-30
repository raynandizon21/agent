import { X } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  maxWidth = 'max-w-md',
  headerActions = null,
  children,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center pt-[max(0.5rem,env(safe-area-inset-top))] px-2 sm:p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900 border border-slate-800 rounded-2xl ${maxWidth} w-full p-3 sm:p-5 shadow-2xl space-y-3 max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] overflow-y-auto`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <h3 className="text-base font-bold text-white flex items-center gap-1.5 min-w-0 truncate">
            {Icon ? <Icon className="w-4 h-4 text-blue-400 shrink-0" /> : null}
            {title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
