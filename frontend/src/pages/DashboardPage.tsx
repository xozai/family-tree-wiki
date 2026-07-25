import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import AuthImage from '../components/AuthImage';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  deathDate: string | null;
  updatedAt: string;
  media: Array<{ fileUrl: string }>;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [recent, setRecent] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [firstMemberId, setFirstMemberId] = useState('');

  useEffect(() => {
    api.get('/members?limit=6&sortBy=updatedAt').then(({ data }) => {
      setRecent(data.members);
      setTotal(data.total);
      if (data.members[0]) setFirstMemberId(data.members[0].id);
    });
  }, []);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-warm-700 to-warm-800 text-white rounded-2xl p-8">
        <h1 className="font-serif text-3xl font-bold">Welcome back, {user?.fullName?.split(' ')[0]}</h1>
        <p className="mt-2 text-warm-200">Your family history, preserved for generations.</p>
        <div className="mt-6 flex gap-4 text-sm flex-wrap">
          <div className="bg-white/10 rounded-xl px-5 py-3">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-warm-200">Family Members</div>
          </div>
        </div>
        <div className="mt-6 flex gap-3 flex-wrap">
          <Link to="/members" className="bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Browse Members
          </Link>
          {firstMemberId && (
            <button onClick={() => navigate(`/tree/${firstMemberId}`)}
              className="bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              🌳 View Family Tree
            </button>
          )}
          {canEdit && (
            <Link to="/members/new" className="bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              + Add Member
            </Link>
          )}
          {canEdit && (
            <Link to="/import" className="bg-white/15 hover:bg-white/25 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              📥 Import GEDCOM
            </Link>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-semibold text-stone-800">Recently Updated</h2>
          <Link to="/members" className="text-sm text-warm-700 hover:text-warm-800">View all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {recent.map((m) => (
            <Link key={m.id} to={`/members/${m.id}`}
              className="bg-white rounded-xl shadow-sm border border-stone-100 p-4 hover:shadow-md transition-shadow flex gap-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                {m.media[0] ? (
                  <AuthImage src={m.media[0].fileUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-400 text-lg">👤</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-stone-800 truncate">{m.firstName} {m.lastName}</div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {m.birthDate ? format(new Date(m.birthDate), 'yyyy') : '?'} — {m.deathDate ? format(new Date(m.deathDate), 'yyyy') : 'present'}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">Updated {format(new Date(m.updatedAt), 'MMM d')}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
