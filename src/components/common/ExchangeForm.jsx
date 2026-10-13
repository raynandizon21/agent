import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import Select from './Select';

// The one money-exchange form, shared by the dashboard's guest popup
// (GuestBoard.jsx) and a trip's Exchange tab (TripDetailPage.jsx) so the two
// can't drift apart. The parent owns the form state and the save call.

const CURRENCY_OPTIONS = ['PHP', 'KRW', 'USD', 'JPY', 'CNY'].map((c) => ({ value: c, label: c }));
export const fieldCls =
  'w-full bg-slate-950 border border-slate-800 focus:border-blue-500/60 rounded-lg px-2.5 py-2 text-base sm:text-sm text-slate-100 outline-none placeholder:text-slate-500';

// Number field that shows thousands separators (10,000.50) while the value
// kept in state stays a plain number string ("10000.50"). `decimals` caps
// the digits after the point. The caret stays put as commas come and go.
function withCommas(raw) {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === undefined ? grouped : `${grouped}.${dec}`;
}

export function AmountInput({ value, onChange, decimals = 2, className, ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null); // digits/dots left of the caret after an edit

  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current == null || !el || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < el.value.length && seen < caret.current) {
      if (el.value[pos] !== ',') seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  });

  function handle(e) {
    const typed = e.target.value;
    const left = typed.slice(0, e.target.selectionStart ?? typed.length).replace(/[^\d.]/g, '').length;
    let raw = typed.replace(/[^\d.]/g, '');
    const dot = raw.indexOf('.');
    if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
    if (decimals === 0) raw = raw.replace('.', '');
    raw = raw.replace(/^0+(?=\d)/, '');
    caret.current = Math.min(left, raw.length);
    onChange(raw);
  }

  return <input ref={ref} inputMode="decimal" className={className} value={withCommas(value)} onChange={handle} {...rest} />;
}

export const blankExchange = () => ({ from_currency: 'KRW', from_amount: '', to_currency: 'PHP', to_amount: '', notes: '' });

// Both amounts are typed by hand; the rate is derived from them.
export function exchangeRate(form) {
  return Number(form.from_amount) > 0 && Number(form.to_amount) > 0
    ? Math.round((Number(form.to_amount) / Number(form.from_amount)) * 1e6) / 1e6
    : null;
}

// Pick each currency, type both amounts (as on the counter's receipt); the
// rate is worked out from them. `children` renders above the fields (e.g. an
// "editing" banner or a date field).
export default function ExchangeForm({ form, setForm, busy, error, submitLabel = 'Save exchange', onSubmit, autoFocus = false, children }) {
  const rate = exchangeRate(form);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function swap() {
    setForm((f) => ({
      ...f,
      from_currency: f.to_currency,
      to_currency: f.from_currency,
      from_amount: f.to_amount,
      to_amount: f.from_amount,
    }));
  }

  // Any pair is allowed; picking the same currency on both sides swaps them.
  function pickCurrency(key, c) {
    const other = key === 'from_currency' ? 'to_currency' : 'from_currency';
    setForm((f) => ({ ...f, [key]: c, ...(f[other] === c ? { [other]: f[key] } : {}) }));
  }

  function submit(e) {
    e.preventDefault();
    onSubmit(rate);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {children}
      <div>
        <span className="block text-xs font-semibold text-slate-400 mb-1">Guest gives</span>
        <div className="grid grid-cols-[5.5rem_1fr] gap-1.5">
          <Select className={fieldCls} value={form.from_currency} onChange={(c) => pickCurrency('from_currency', c)} options={CURRENCY_OPTIONS} />
          <AmountInput autoFocus={autoFocus} className={`${fieldCls} font-mono-num text-lg`} placeholder="0" value={form.from_amount} onChange={(v) => set('from_amount', v)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-amber-300">Guest receives</span>
          <button
            type="button"
            onClick={swap}
            title="Swap gives / receives"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <ArrowRightLeft className="w-3 h-3 rotate-90" /> Swap
          </button>
        </div>
        <div className="grid grid-cols-[5.5rem_1fr] gap-1.5">
          <Select className={fieldCls} value={form.to_currency} onChange={(c) => pickCurrency('to_currency', c)} options={CURRENCY_OPTIONS} />
          <AmountInput className={`${fieldCls} font-mono-num text-lg text-amber-300`} placeholder="0" value={form.to_amount} onChange={(v) => set('to_amount', v)} />
        </div>
      </div>

      {/* Rate is read-only: worked out from the two amounts. */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
        <span className="text-slate-400">Rate</span>
        <span className="font-mono-num font-semibold text-slate-100 truncate">
          {rate ? `1 ${form.from_currency} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${form.to_currency}` : '—'}
        </span>
      </div>

      <input className={fieldCls} placeholder="Notes (optional)" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !rate}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {submitLabel}
      </button>
    </form>
  );
}
