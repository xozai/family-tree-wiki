import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import MemberDetailPage from './pages/MemberDetailPage';
import MemberFormPage from './pages/MemberFormPage';
import MemberRevisionsPage from './pages/MemberRevisionsPage';
import ImportPage from './pages/ImportPage';
import AdminPage from './pages/AdminPage';
import FamilyTreePage from './pages/FamilyTreePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireEditorOrAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN' && user.role !== 'EDITOR') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="members/new" element={<MemberFormPage />} />
        <Route path="members/:id" element={<MemberDetailPage />} />
        <Route path="members/:id/edit" element={<MemberFormPage />} />
        <Route path="members/:id/revisions" element={<MemberRevisionsPage />} />
        <Route
          path="import"
          element={
            <RequireEditorOrAdmin>
              <ImportPage />
            </RequireEditorOrAdmin>
          }
        />
        <Route path="tree" element={<FamilyTreePage />} />
        <Route path="tree/:id" element={<FamilyTreePage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
