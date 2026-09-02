import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import AgentsPage from './pages/AgentsPage';
import InboxPage from './pages/InboxPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import SettlementsPage from './pages/SettlementsPage';

function Shell() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="boot">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">Agent Inbox</p>
        <nav>
          <NavLink to="/" end>
            Settlements
          </NavLink>
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          {/* <NavLink to="/agents">Agents</NavLink> */}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{user.username}</span>
          <button type="button" className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<SettlementsPage />} />
          <Route path="/messages" element={<InboxPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settlements" element={<Navigate to="/" replace />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
