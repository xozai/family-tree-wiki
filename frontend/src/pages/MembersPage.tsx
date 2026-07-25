import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import AuthImage from '../components/AuthImage';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  maidenName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  occupation: string | null;
  privacyLevel: string;
  media: Array<{ fileUrl: string; thumbUrl: string | null }>;
  tags: Array<{ tag: { name: string } }>;
}

export default function MembersPage() {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(() => searchParams.get('tags') || '');
  const [birthYearMin, setBirthYearMin] = useState('');
  const [birthYearMax, setBirthYearMax] = useState('');
  const [sortBy, setSortBy] = useState('lastName');
  const [showFilters, setShowFilters] = useState(() => !!searchParams.get('tags'));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const limit = 20;

  const hasActiveFilters = birthYearMin || birthYearMax || sortBy !== 'lastName' || tagFilter;

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/members', {
        params: {
          search: search || undefined,
          tags: tagFilter || undefined,
          birthYearMin: birthYearMin || undefined,
          birthYearMax: birthYearMax || undefined,
          sortBy,
          page,
          limit,
        },
      });
      setMembers(data.members);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search, tagFilter, birthYearMin, birthYearMax, sortBy, page]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  function clearFilters() {
    setBirthYearMin('');
    setBirthYearMax('');
    setSortBy('lastName');
    setTagFilter('');
    setSearchParams({});
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-stone-800">Family Members <span className="text-stone-400 text-lg font-normal">({total})</span></h1>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <Link to="/members/new" className="bg-warm-700 hover:bg-warm-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + Add Member
          </Link>
        )}
      </div>

      {/* Search + Filter bar */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, location, occupation…"
              className="w-full border border-stone-300 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none"
            />
            <span className="absolute left-3 top-3 text-stone-400">🔍</span>
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border rounded-xl transition-colors ${
              hasActiveFilters
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-stone-300 text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span>⚙</span> Filters{hasActiveFilters && ' •'}
          </button>
        </div>

        {showFilters && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Tag</label>
              <input
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
                placeholder="e.g. military"
                className="w-28 border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-warm-400"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Birth year from</label>
              <input
                type="number"
                value={birthYearMin}
                onChange={(e) => { setBirthYearMin(e.target.value); setPage(1); }}
                placeholder="e.g. 1850"
                className="w-28 border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-warm-400"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Birth year to</label>
              <input
                type="number"
                value={birthYearMax}
                onChange={(e) => { setBirthYearMax(e.target.value); setPage(1); }}
                placeholder="e.g. 1950"
                className="w-28 border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-warm-400"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-warm-400 bg-white"
              >
                <option value="lastName">Last name (A–Z)</option>
                <option value="firstName">First name (A–Z)</option>
                <option value="birthDate">Birth date (oldest first)</option>
                <option value="updatedAt">Recently updated</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-stone-500 hover:text-stone-700 underline">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-stone-400 py-12">Loading…</div>
      ) : members.length === 0 ? (
        <div className="text-center text-stone-400 py-12">
          {search || tagFilter || birthYearMin || birthYearMax
            ? 'No members match your filters.'
            : 'No members yet. Add the first one!'}
        </div>
      ) : (
        <div className="grid gap-3">
          {members.map((m) => (
            <Link key={m.id} to={`/members/${m.id}`}
              className="bg-white rounded-xl border border-stone-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                {m.media[0] ? (
                  <AuthImage src={m.media[0].thumbUrl ?? m.media[0].fileUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-800">{m.firstName} {m.lastName}</span>
                  {m.maidenName && <span className="text-stone-500 text-sm">née {m.maidenName}</span>}
                  {m.privacyLevel === 'PRIVATE' && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Private</span>}
                </div>
                <div className="text-sm text-stone-500 mt-0.5">
                  {m.birthDate ? format(new Date(m.birthDate), 'MMMM d, yyyy') : 'Unknown'} — {m.deathDate ? format(new Date(m.deathDate), 'yyyy') : 'present'}
                  {m.birthPlace && ` · ${m.birthPlace}`}
                </div>
                {m.occupation && <div className="text-sm text-stone-400 mt-0.5">{m.occupation}</div>}
                {m.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {m.tags.map(({ tag }) => (
                      <button key={tag.name} onClick={(e) => { e.preventDefault(); setTagFilter(tag.name); setShowFilters(true); setPage(1); }}
                        className="text-xs bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-800 px-2 py-0.5 rounded-full transition-colors">
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40">
            ← Previous
          </button>
          <span className="px-4 py-2 text-sm text-stone-500">Page {page} of {Math.ceil(total / limit)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / limit)}
            className="px-4 py-2 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
