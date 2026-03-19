import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { format } from 'date-fns';
import { useAuthStore } from '../stores/authStore';

interface Revision {
  id: string;
  editSummary: string | null;
  createdAt: string;
  editedBy: { username: string; fullName: string } | null;
}

export default function MemberRevisionsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [reverting, setReverting] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/members/${id}/revisions`).then(({ data }) => setRevisions(data));
  }, [id]);

  async function handleRevert(revisionId: string) {
    if (!window.confirm('Revert to this version? A new revision will be created.')) return;
    setReverting(revisionId);
    try {
      await api.post(`/members/${id}/revisions/${revisionId}/revert`);
      navigate(`/members/${id}`);
    } finally {
      setReverting(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/members/${id}`} className="text-stone-500 hover:text-stone-700 text-sm">← Back to Profile</Link>
        <h1 className="font-serif text-2xl font-bold text-stone-800">Revision History</h1>
      </div>

      <div className="space-y-3">
        {revisions.map((rev, i) => (
          <div key={rev.id} className="bg-white rounded-xl border border-stone-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-stone-800">{rev.editSummary || 'No summary'}</span>
                {i === 0 && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Current</span>}
              </div>
              <div className="text-xs text-stone-400 mt-0.5">
                {format(new Date(rev.createdAt), 'MMMM d, yyyy · h:mm a')}
                {rev.editedBy && ` · by ${rev.editedBy.fullName}`}
              </div>
            </div>
            {i > 0 && (user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
              <button
                onClick={() => handleRevert(rev.id)}
                disabled={reverting === rev.id}
                className="text-sm text-warm-700 hover:text-warm-800 font-medium disabled:opacity-40"
              >
                {reverting === rev.id ? 'Reverting…' : 'Revert'}
              </button>
            )}
          </div>
        ))}
        {revisions.length === 0 && <div className="text-center text-stone-400 py-8">No revisions yet</div>}
      </div>
    </div>
  );
}
