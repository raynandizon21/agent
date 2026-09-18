import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, icon: Icon, maxWidth = 'max-w-md', children }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900 border border-slate-800 rounded-2xl ${maxWidth} w-full p-4 sm:p-5 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <h3 className="text-base font-bold text-white flex items-center gap-1.5">
            {Icon ? <Icon className="w-4 h-4 text-blue-400" /> : null}
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
