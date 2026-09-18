import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import AgentsPage from './pages/AgentsPage';
import GuestsPage from './pages/GuestsPage';
import InboxPage from './pages/InboxPage';
import LoginPage from './pages/LoginPage';
import SettlementsPage from './pages/SettlementsPage';
import TelegramSettingsPage from './pages/TelegramSettingsPage';
import UsersPage from './pages/UsersPage';

function Shell() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="boot">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A login linked to an agent only ever sees that agent's own data — the
  // agent directory and login management are account-wide, admin only.
  const isAdmin = user.agentId == null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">Agent Inbox</p>
        <nav>
          <NavLink to="/" end>
            Settlements
          </NavLink>
          <NavLink to="/messages">Messages</NavLink>
          {isAdmin ? <NavLink to="/agents">Agents</NavLink> : null}
          {isAdmin ? <NavLink to="/guests">Guests</NavLink> : null}
          {isAdmin ? <NavLink to="/users">Users</NavLink> : null}
          {isAdmin ? <NavLink to="/telegram">Telegram</NavLink> : null}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">
            {user.username}
            {!isAdmin ? (
              <>
                {' '}
                <span className="badge">{user.agentName || 'agent'}</span>
              </>
            ) : null}
          </span>
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

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user && user.agentId != null) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<SettlementsPage />} />
          <Route path="/messages" element={<InboxPage />} />
          <Route path="/settlements" element={<Navigate to="/" replace />} />
          <Route
            path="/agents"
            element={
              <AdminOnly>
                <AgentsPage />
              </AdminOnly>
            }
          />
          <Route
            path="/guests"
            element={
              <AdminOnly>
                <GuestsPage />
              </AdminOnly>
            }
          />
          <Route
            path="/users"
            element={
              <AdminOnly>
                <UsersPage />
              </AdminOnly>
            }
          />
          <Route
            path="/telegram"
            element={
              <AdminOnly>
                <TelegramSettingsPage />
              </AdminOnly>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
