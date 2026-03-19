import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    const refreshToken = useAuthStore.getState().refreshToken;
    await api.post('/auth/logout', { refreshToken }).catch(() => {});
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-warm-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🌳</span>
            <span className="font-serif text-xl font-semibold tracking-tight">Family Tree Wiki</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/members" className="hover:text-warm-200 transition-colors">Members</Link>
            <Link to="/tree" className="hover:text-warm-200 transition-colors">Family Tree</Link>
            {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
              <Link to="/members/new" className="bg-warm-600 hover:bg-warm-500 px-3 py-1 rounded-full transition-colors">
                + Add Member
              </Link>
            )}
            {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
              <Link to="/import" className="hover:text-warm-200 transition-colors flex items-center gap-1">
                <span className="text-xs">📥</span> Import GEDCOM
              </Link>
            )}
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="hover:text-warm-200 transition-colors flex items-center gap-1">
                <span className="text-xs">⚙️</span> Admin
              </Link>
            )}
            <div className="flex items-center gap-2 text-warm-200">
              <span>{user?.fullName}</span>
              <span className="text-xs bg-warm-700 px-2 py-0.5 rounded">{user?.role}</span>
              <button onClick={handleLogout} className="hover:text-white ml-2 text-warm-300">
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <Outlet />
      </main>
      <footer className="bg-stone-100 border-t border-stone-200 text-stone-500 text-xs text-center py-4">
        Family Tree Wiki — Private &amp; Secure
      </footer>
    </div>
  );
}
