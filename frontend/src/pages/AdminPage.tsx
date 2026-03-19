import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';

type Tab = 'pending' | 'users' | 'stats';

interface PendingUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  relationshipToFamily: string;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';
  relationshipToFamily: string;
  rejectionReason: string | null;
  createdAt: string;
  approvedBy: { fullName: string; username: string } | null;
}

interface Stats {
  members: { total: number; private: number; public: number };
  users: { total: number; active: number; pending: number };
  relationships: number;
  media: number;
  recentActivity: Array<{
    id: string;
    createdAt: string;
    editSummary: string | null;
    familyMember: { id: string; firstName: string; lastName: string };
    editedBy: { fullName: string; username: string } | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  EDITOR: 'bg-blue-100 text-blue-700',
  VIEWER: 'bg-stone-100 text-stone-600',
};

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    setActionMsg('');
    try {
      if (t === 'pending') {
        const { data } = await api.get('/admin/users/pending');
        setPending(data);
      } else if (t === 'users') {
        const { data } = await api.get('/admin/users');
        setUsers(data);
      } else {
        const { data } = await api.get('/admin/stats');
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  async function approve(id: string) {
    await api.post(`/admin/users/${id}/approve`);
    setActionMsg('User approved.');
    setPending((p) => p.filter((u) => u.id !== id));
  }

  async function reject(id: string) {
    await api.post(`/admin/users/${id}/reject`, { reason: rejectReason });
    setActionMsg('User rejected.');
    setPending((p) => p.filter((u) => u.id !== id));
    setRejectId(null);
    setRejectReason('');
  }

  async function changeRole(id: string, role: string) {
    await api.patch(`/admin/users/${id}`, { role });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: role as User['role'] } : u)));
  }

  async function changeStatus(id: string, status: string) {
    await api.patch(`/admin/users/${id}`, { status });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status: status as User['status'] } : u)));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-stone-800">Admin Dashboard</h1>
        {stats && (
          <div className="flex gap-4 text-sm text-stone-500">
            <span><strong className="text-stone-800">{stats.members.total}</strong> members</span>
            <span><strong className="text-stone-800">{stats.users.active}</strong> active users</span>
            {stats.users.pending > 0 && (
              <span className="text-amber-700 font-medium">
                <strong>{stats.users.pending}</strong> pending approval
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-200 flex gap-6">
        {([
          { id: 'pending', label: `Pending${pending.length > 0 && tab !== 'pending' ? ` (${pending.length})` : ''}` },
          { id: 'users', label: 'All Users' },
          { id: 'stats', label: 'Site Statistics' },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-amber-700 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {label}
            {id === 'pending' && pending.length > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {actionMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <div className="text-center text-stone-400 py-12">Loading…</div>
      ) : (
        <>
          {/* ── PENDING TAB ── */}
          {tab === 'pending' && (
            <div>
              {pending.length === 0 ? (
                <div className="text-center text-stone-400 py-16">
                  <div className="text-4xl mb-3">✅</div>
                  <p>No pending registrations.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pending.map((u) => (
                    <div key={u.id} className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-800">{u.fullName}</span>
                            <span className="text-stone-400 text-sm">@{u.username}</span>
                          </div>
                          <div className="text-sm text-stone-500 mt-0.5">{u.email}</div>
                          <div className="text-sm text-stone-600 mt-2">
                            <span className="text-stone-400">Relationship to family:</span>{' '}
                            {u.relationshipToFamily}
                          </div>
                          <div className="text-xs text-stone-400 mt-1.5">
                            Registered {format(new Date(u.createdAt), 'MMM d, yyyy')}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(u.id)}
                            className="bg-green-600 hover:bg-green-500 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectId(u.id)}
                            className="border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-1.5 rounded-lg transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      {/* Reject inline form */}
                      {rejectId === u.id && (
                        <div className="mt-4 pt-4 border-t border-stone-100 flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="text-xs text-stone-500 block mb-1">
                              Rejection reason (optional)
                            </label>
                            <input
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="e.g. Unable to verify connection to family"
                              className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-red-300 outline-none"
                            />
                          </div>
                          <button
                            onClick={() => reject(u.id)}
                            className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-1.5 rounded-lg"
                          >
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => setRejectId(null)}
                            className="text-stone-400 text-sm px-2"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ALL USERS TAB ── */}
          {tab === 'users' && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-left">
                    <th className="px-4 py-3 font-medium text-stone-600">User</th>
                    <th className="px-4 py-3 font-medium text-stone-600">Role</th>
                    <th className="px-4 py-3 font-medium text-stone-600">Status</th>
                    <th className="px-4 py-3 font-medium text-stone-600">Joined</th>
                    <th className="px-4 py-3 font-medium text-stone-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-800">{u.fullName}</div>
                        <div className="text-xs text-stone-400">
                          @{u.username} · {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.id === user?.id ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLORS[u.role]}`}>
                            {u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="text-xs border border-stone-200 rounded px-2 py-1 bg-white"
                          >
                            <option value="VIEWER">VIEWER</option>
                            <option value="EDITOR">EDITOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.id === user?.id ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[u.status]}`}>
                            {u.status}
                          </span>
                        ) : (
                          <select
                            value={u.status}
                            onChange={(e) => changeStatus(u.id, e.target.value)}
                            className="text-xs border border-stone-200 rounded px-2 py-1 bg-white"
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PENDING">PENDING</option>
                            <option value="REJECTED">REJECTED</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-500 text-xs">
                        {format(new Date(u.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-400">
                        {u.approvedBy && `Approved by ${u.approvedBy.fullName}`}
                        {u.rejectionReason && (
                          <span title={u.rejectionReason} className="text-red-400 cursor-help">
                            Rejected ⓘ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── STATS TAB ── */}
          {tab === 'stats' && stats && (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Members', value: stats.members.total, color: 'blue' },
                  { label: 'Public Profiles', value: stats.members.public, color: 'green' },
                  { label: 'Private Profiles', value: stats.members.private, color: 'amber' },
                  { label: 'Relationships', value: stats.relationships, color: 'purple' },
                  { label: 'Active Users', value: stats.users.active, color: 'green' },
                  { label: 'Pending Approval', value: stats.users.pending, color: 'yellow' },
                  { label: 'Total Users', value: stats.users.total, color: 'blue' },
                  { label: 'Photos Uploaded', value: stats.media, color: 'stone' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4 text-center`}>
                    <div className={`text-3xl font-bold text-${color}-700`}>{value}</div>
                    <div className={`text-xs text-${color}-600 mt-1`}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Export + Actions */}
              <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-stone-700 mb-3">Data Management</h3>
                <div className="flex gap-3 flex-wrap">
                  <a
                    href={`${import.meta.env.VITE_API_URL || '/api'}/export/gedcom`}
                    className="bg-amber-700 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                    onClick={(e) => {
                      // Inject auth token into the request via a fetch download
                      e.preventDefault();
                      import('../lib/api').then(({ default: a }) => {
                        a.get('/export/gedcom', { responseType: 'blob' }).then(({ data }) => {
                          const url = URL.createObjectURL(data);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `family-tree-${Date.now()}.ged`;
                          link.click();
                          URL.revokeObjectURL(url);
                        });
                      });
                    }}
                  >
                    📥 Export GEDCOM
                  </a>
                  <Link
                    to="/import"
                    className="border border-stone-300 text-stone-700 hover:bg-stone-50 text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    📤 Import GEDCOM
                  </Link>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <h3 className="font-semibold text-stone-700">Recent Activity</h3>
                </div>
                <div className="divide-y divide-stone-100">
                  {stats.recentActivity.map((rev) => (
                    <div key={rev.id} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div>
                        <Link
                          to={`/members/${rev.familyMember.id}`}
                          className="font-medium text-stone-800 hover:text-amber-700"
                        >
                          {rev.familyMember.firstName} {rev.familyMember.lastName}
                        </Link>
                        <span className="text-stone-400 ml-2">
                          {rev.editSummary || 'Updated'}
                          {rev.editedBy && ` · by ${rev.editedBy.fullName}`}
                        </span>
                      </div>
                      <span className="text-xs text-stone-400 flex-shrink-0 ml-4">
                        {format(new Date(rev.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
