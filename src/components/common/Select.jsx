import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_MAX_HEIGHT = 288;
const EDGE = 8; // keep the menu this far from the viewport edges

// Themed replacement for a native <select>. The native popup is drawn by the
// browser and ignores the app's layout — on a narrow screen it can spill past
// the page — so this renders its own menu, portalled to <body> with fixed
// positioning (so a modal's overflow can't clip it), clamped inside the
// viewport and flipped upward when there's no room below.
//
// `options` is [{ value, label }]; `onChange` receives the chosen value.
// `className` styles the trigger, same as it would a native <select>.
export default function Select({ value, onChange, options, className = '', placeholder = 'Select…', ...rest }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value ?? ''));
  const selected = options[selectedIndex];

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 160), vw - EDGE * 2);
    const left = Math.min(Math.max(r.left, EDGE), vw - width - EDGE);
    const below = vh - r.bottom - EDGE;
    const above = r.top - EDGE;
    const up = below < Math.min(MENU_MAX_HEIGHT, 180) && above > below;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, (up ? above : below) - 4);
    setPos(up ? { left, width, maxHeight, bottom: vh - r.top + 4 } : { left, width, maxHeight, top: r.bottom + 4 });
  }

  function openMenu() {
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(opt) {
    setOpen(false);
    triggerRef.current?.focus();
    if (String(opt.value) !== String(value ?? '')) onChange(opt.value);
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    return undefined;
  }, [open, active]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false);
    }
    function onScroll(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className} inline-flex items-center justify-between gap-2 text-left cursor-pointer`}
        {...rest}
      >
        {/* A stored value missing from `options` (e.g. an account no longer
            listed) still shows as-is rather than looking unset. */}
        <span className={`truncate ${selected || value ? '' : 'text-slate-500'}`}>
          {selected ? selected.label : value ? String(value) : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              style={{ position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
              className="z-[60] overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60 py-1 text-sm"
            >
              {options.map((opt, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <li
                    key={String(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                    data-active={i === active}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(opt)}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 sm:py-2 cursor-pointer ${
                      i === active ? 'bg-slate-800' : ''
                    } ${isSelected ? 'text-blue-300 font-semibold' : 'text-slate-200'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected ? <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
