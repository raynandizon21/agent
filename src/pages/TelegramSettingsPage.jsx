import { Bot, Check, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/common/Modal';

// There's only ever one bot (a singleton row in the bot_config table, not
// a list), so this is a one-row table with Edit — no "create", nothing to add.
export default function TelegramSettingsPage() {
  const [form, setForm] = useState({ token: '' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftToken, setDraftToken] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const data = await api('/telegram-config');
      setForm({ token: data.token || '' });
    } catch (err) {
      setError(err.message || 'Failed to load Telegram config');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit() {
    setDraftToken(form.token);
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
        body: JSON.stringify({ ...form, token: draftToken }),
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
        <Bot className="w-4 h-4 text-blue-400" />
        <div>
          <h1 className="text-base font-bold text-white">Telegram API</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Stored in the database. Saving applies it immediately — no server restart needed.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-3.5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-200 text-sm font-bold uppercase tracking-wider">
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            <span>Bot Configuration</span>
          </div>
          <button
            type="button"
            onClick={openEdit}
            className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md text-sm font-medium transition cursor-pointer"
          >
            Edit
          </button>
        </div>

        <div className="text-sm">
          <span className="text-[14px] font-semibold text-slate-400 block mb-1">Bot Token (@BotFather)</span>
          <div className="font-mono-num text-slate-200 bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5">
            {form.token || <span className="text-slate-500">not set</span>}
          </div>
        </div>
      </div>

      {error ? <p className="text-rose-400 text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-400 text-sm">{ok}</p> : null}

      <Modal
        open={isModalOpen}
        onClose={() => !busy && setIsModalOpen(false)}
        title="Edit Telegram Bot Token"
        icon={Bot}
      >
        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <div>
            <label className="text-slate-400 font-semibold block mb-1 text-[13px] uppercase">
              Bot Token (@BotFather)
            </label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono-num text-sm focus:outline-hidden focus:border-blue-500"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="from @BotFather"
              autoComplete="off"
            />
          </div>

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
