import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') ?? '';

  const [form, setForm] = useState({
    username: '', email: '', password: '', fullName: '', relationshipToFamily: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // No token in URL — show a clear error rather than a form they can't submit
  if (!inviteToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-stone-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <span className="text-5xl">🔒</span>
          <h2 className="font-serif text-2xl font-bold text-stone-800 mt-4">Invite Required</h2>
          <p className="text-stone-500 mt-2">
            This is a private family site. Registration requires an invite link from the administrator.
          </p>
          <button onClick={() => navigate('/login')} className="mt-6 text-amber-700 hover:text-amber-800 font-medium text-sm">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', { ...form, inviteToken });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-stone-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <span className="text-5xl">✅</span>
          <h2 className="font-serif text-2xl font-bold text-stone-800 mt-4">Request Submitted</h2>
          <p className="text-stone-500 mt-2">Your registration is pending admin approval. You'll be notified once reviewed.</p>
          <button onClick={() => navigate('/login')} className="mt-6 text-amber-700 hover:text-amber-800 font-medium text-sm">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 to-stone-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-4xl">🌳</span>
          <h1 className="font-serif text-2xl font-bold text-stone-800 mt-2">Request Access</h1>
          <p className="text-stone-500 text-sm mt-1">Family member registration requires admin approval</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                <input name="fullName" value={form.fullName} onChange={handleChange} required
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Username</label>
                <input name="username" value={form.username} onChange={handleChange} required
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Password <span className="text-stone-400">(min 12 chars)</span></label>
              <input type="password" name="password" value={form.password} onChange={handleChange} required minLength={12}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Relationship to Family</label>
              <input name="relationshipToFamily" value={form.relationshipToFamily} onChange={handleChange} required
                placeholder="e.g., Grandson of John Smith"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-amber-700 hover:bg-amber-800 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
          <p className="text-center text-sm text-stone-500 mt-5">
            Already have access? <Link to="/login" className="text-amber-700 hover:text-amber-800 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
