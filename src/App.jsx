import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import BottomNav from './components/layout/BottomNav';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
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
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A login linked to an agent only ever sees that agent's own data — the
  // agent directory and login management are account-wide, admin only.
  const isAdmin = user.agentId == null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      <Navbar
        username={user.username}
        agentName={user.agentName}
        isAdmin={isAdmin}
        onLogout={logout}
      />

      <div className="flex-1 flex w-full">
        <Sidebar isAdmin={isAdmin} />

        <main className="flex-1 p-2.5 sm:p-5 overflow-y-auto min-w-0 pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      <div className="block lg:hidden">
        <BottomNav isAdmin={isAdmin} />
      </div>
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
          <Route path="/guests" element={<GuestsPage />} />
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
