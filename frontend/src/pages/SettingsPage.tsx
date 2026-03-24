import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (form.newPassword.length < 12) {
      setError('New password must be at least 12 characters');
      return;
    }

    setLoading(true);
    try {
      await api.patch('/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess('Password changed. You will be signed out now.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <h1 className="font-serif text-2xl font-bold text-stone-800">Account Settings</h1>

      {/* Profile info (read-only) */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm space-y-3">
        <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-stone-400 block text-xs mb-0.5">Full Name</span>
            <span className="text-stone-800 font-medium">{user?.fullName}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-xs mb-0.5">Username</span>
            <span className="text-stone-800 font-medium">@{user?.username}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-xs mb-0.5">Email</span>
            <span className="text-stone-800 font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-xs mb-0.5">Role</span>
            <span className="text-stone-800 font-medium">{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide mb-4">Change Password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{success}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Current Password</label>
            <input
              type="password"
              name="currentPassword"
              value={form.currentPassword}
              onChange={handleChange}
              required
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              New Password <span className="text-stone-400 font-normal">(min 12 characters)</span>
            </label>
            <input
              type="password"
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              required
              minLength={12}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-700 hover:bg-amber-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
