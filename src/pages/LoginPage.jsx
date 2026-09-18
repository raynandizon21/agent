import { Bot } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function doLogin(user, pass) {
    setError('');
    setBusy(true);
    try {
      await login(user.trim(), pass);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    doLogin(username, password);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[420px] bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <p className="text-[14px] font-bold uppercase tracking-widest text-blue-400">Agent Inbox</p>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign in</h1>
          <p className="text-sm text-slate-400 mt-1">Staff access to Telegram message logs</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="bg-slate-950 border border-slate-800 rounded-lg text-slate-100 px-3 py-2.5 focus:outline-hidden focus:border-blue-500 transition"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="bg-slate-950 border border-slate-800 rounded-lg text-slate-100 px-3 py-2.5 focus:outline-hidden focus:border-blue-500 transition"
          />
        </label>

        {error ? <p className="text-rose-400 text-sm">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => doLogin('agent', '123')}
          className="w-full py-2.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
        >
          Quick log in (agent)
        </button>
      </form>
    </div>
  );
}
