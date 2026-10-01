import { Bot, Check, KeyRound, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/common/Modal';

// Every value lives in the singleton bot_config row (the Telegram module's
// table), so this is a one-row table with Edit — no "create", nothing to add.
const FIELDS = [
  {
    key: 'token',
    label: 'Telegram Bot Token (@BotFather)',
    placeholder: 'from @BotFather',
    hint: 'Required. Receives the agents’ messages and photos.',
    icon: Bot,
  },
  {
    key: 'googleVisionKey',
    label: 'Google Cloud Vision API Key',
    placeholder: 'AIza…',
    hint: 'OCR for every photo. Blank = falls back to tesseract (poor on bulk reports).',
    icon: KeyRound,
  },
  {
    key: 'anthropicKey',
    label: 'Anthropic API Key (Claude vision)',
    placeholder: 'sk-ant-…',
    hint: 'Optional. Re-reads bulk report tables when Google Vision is not set.',
    icon: KeyRound,
  },
];

const EMPTY = { token: '', googleVisionKey: '', anthropicKey: '' };

// Show only the ends of a secret on the read-only view.
function mask(value) {
  if (!value) return null;
  if (value.length <= 10) return '•'.repeat(value.length);
  return `${value.slice(0, 6)}${'•'.repeat(8)}${value.slice(-4)}`;
}

export default function SettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/telegram-config');
      setForm({
        token: data.token || '',
        googleVisionKey: data.googleVisionKey || '',
        anthropicKey: data.anthropicKey || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit() {
    setDraft(form);
    setIsModalOpen(true);
    setError('');
    setOk('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk('');
    try {
      const data = await api('/telegram-config', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setIsModalOpen(false);
      setOk(data.applied ? 'Saved and applied — live, no restart needed.' : 'Saved.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900 border border-slate-800">
        <Settings className="w-4 h-4 text-blue-400" />
        <div>
          <h1 className="text-base font-bold text-white">Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Stored in the database. Saving applies it immediately — no server restart needed.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-3.5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-200 text-sm font-bold uppercase tracking-wider">
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            <span>Telegram &amp; API Keys</span>
          </div>
          <button
            type="button"
            onClick={openEdit}
            className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md text-sm font-medium transition cursor-pointer"
          >
            Edit
          </button>
        </div>

        {FIELDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="text-sm">
            <span className="text-[14px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-slate-500" />
              {label}
            </span>
            <div className="font-mono-num text-slate-200 bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 break-all">
              {mask(form[key]) || <span className="text-slate-500">not set</span>}
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-400 text-sm">{ok}</p> : null}

      <Modal
        open={isModalOpen}
        onClose={() => !busy && setIsModalOpen(false)}
        title="Edit Settings"
        icon={Settings}
      >
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          {FIELDS.map(({ key, label, placeholder, hint }) => (
            <div key={key}>
              <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">{label}</label>
              <input
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono-num text-sm focus:outline-hidden focus:border-blue-500"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                placeholder={placeholder}
                autoComplete="off"
              />
              <p className="text-slate-500 text-xs mt-1">{hint}</p>
            </div>
          ))}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={busy}
              className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-bold flex items-center gap-1.5 text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
