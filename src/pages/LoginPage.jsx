import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const REMEMBER_KEY = 'login.rememberedUsername';

function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const remembered = readRemembered();
  const [username, setUsername] = useState(remembered ?? 'admin');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(remembered !== null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function doLogin(user, pass) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await login(user.trim(), pass);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, user.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // storage unavailable — ignore
      }
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

  const inputClass =
    'w-full bg-[#e8f0fe] border border-slate-600/60 rounded-xl text-slate-900 text-[15px] px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition';
  const labelClass = 'block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2';

  return (
    <div className="min-h-screen grid place-items-center bg-[#0f172a] p-6">
      <form onSubmit={onSubmit} className="w-full max-w-[400px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-400">Agent Inbox</p>
        <h1 className="text-[32px] font-extrabold text-white tracking-tight leading-tight mt-2">Welcome Back</h1>
        <p className="text-[15px] text-slate-400 mt-1">Please enter your details to sign in</p>

        <div className="mt-7 space-y-5">
          <div>
            <label htmlFor="login-username" className={labelClass}>Username</label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="login-password" className={labelClass}>Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-5">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => setNotice('Please contact your administrator to reset your password.')}
            className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        {error ? <p className="text-rose-400 text-sm mt-4">{error}</p> : null}
        {notice ? <p className="text-slate-300 text-sm mt-4">{notice}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full mt-6 py-3.5 bg-[#4f39f6] hover:bg-[#5b47f7] text-white rounded-xl text-[15px] font-bold shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="flex justify-center gap-4 border-t border-slate-800 mt-10 pt-6 text-xs text-slate-500">
          <button
            type="button"
            disabled={busy}
            onClick={() => doLogin('admin', '123')}
            className="hover:text-slate-300 transition cursor-pointer disabled:opacity-55"
          >
            Quick log in (Admin)
          </button>
          <span>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => doLogin('raynan', '12348765')}
            className="hover:text-slate-300 transition cursor-pointer disabled:opacity-55"
          >
            Quick log in (Agent)
          </button>
        </div>
      </form>
    </div>
  );
}
