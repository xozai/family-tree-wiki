import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';

interface Media {
  id: string;
  fileUrl: string;
  caption: string | null;
  isPrimary: boolean;
}

interface RelatedMember {
  id: string;
  firstName: string;
  lastName: string;
  media: Array<{ fileUrl: string }>;
}

interface Relationship {
  id: string;
  personBId: string;
  relationshipType: string;
  personB: RelatedMember;
}

interface RelationshipAsB {
  id: string;
  personAId: string;
  relationshipType: string;
  personA: RelatedMember;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  maidenName: string | null;
  alternateNames: string[];
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  biography: string | null;
  occupation: string | null;
  education: string | null;
  achievements: string | null;
  privacyLevel: string;
  updatedAt: string;
  media: Media[];
  tags: Array<{ tag: { name: string } }>;
  relationshipsAsA: Relationship[];
  relationshipsAsB: RelationshipAsB[];
  createdBy: { username: string; fullName: string } | null;
  lastEditedBy: { username: string; fullName: string } | null;
}

// Labels when current member IS personA
const REL_LABELS_A: Record<string, string> = {
  PARENT: 'Parent of',
  CHILD: 'Child of',
  SPOUSE: 'Spouse of',
  SIBLING: 'Sibling of',
};

// Labels when current member IS personB (inverse perspective)
const REL_LABELS_B: Record<string, string> = {
  PARENT: 'Child of',   // personA is parent of me → I am child of personA
  CHILD: 'Parent of',   // personA is child of me → I am parent of personA
  SPOUSE: 'Spouse of',
  SIBLING: 'Sibling of',
};

// Canonical dedup key — normalises inverse pairs (PARENT↔CHILD) and symmetric types (SPOUSE, SIBLING)
function canonicalKey(aId: string, bId: string, type: string): string {
  // CHILD(A→B) is the inverse of PARENT(B→A) — normalise both to PARENT(parent→child)
  if (type === 'CHILD') { [aId, bId] = [bId, aId]; type = 'PARENT'; }
  // Symmetric types: sort IDs so order doesn't matter
  if (type === 'SPOUSE' || type === 'SIBLING') [aId, bId] = [aId, bId].sort() as [string, string];
  return `${aId}:${bId}:${type}`;
}

export default function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState('');
  const [activePhoto, setActivePhoto] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get(`/members/${id}`)
      .then(({ data }) => setMember(data))
      .catch(() => setError('Member not found'));
  }, [id]);

  async function handleDelete() {
    if (!window.confirm('Delete this profile permanently?')) return;
    await api.delete(`/members/${id}`);
    navigate('/members');
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post(`/media/${id}`, fd);
      setMember((m) => m ? { ...m, media: [...m.media, data] } : m);
    } finally {
      setUploading(false);
    }
  }

  if (error) return <div className="text-center text-red-600 py-12">{error}</div>;
  if (!member) return <div className="text-center text-stone-400 py-12">Loading…</div>;

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const primaryPhoto = member.media.find((m) => m.isPrimary) || member.media[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-stone-500 mb-2">
            <Link to="/members" className="hover:text-stone-700">Members</Link> /
            <span>{member.firstName} {member.lastName}</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-stone-900">
            {member.firstName} {member.lastName}
            {member.maidenName && <span className="text-stone-500 text-xl ml-2 font-normal">née {member.maidenName}</span>}
          </h1>
          {member.alternateNames.length > 0 && (
            <p className="text-sm text-stone-500 mt-1">Also known as: {member.alternateNames.join(', ')}</p>
          )}
          {member.privacyLevel === 'PRIVATE' && (
            <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Private Profile</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/tree/${id}`}
            className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors">
            🌳 View Tree
          </Link>
          {canEdit && (
            <>
              <Link to={`/members/${id}/edit`}
                className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors text-stone-700">
                Edit
              </Link>
              <Link to={`/members/${id}/revisions`}
                className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors text-stone-700">
                History
              </Link>
              {user?.role === 'ADMIN' && (
                <button onClick={handleDelete}
                  className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-1 space-y-4">
          {/* Photo */}
          <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="aspect-square bg-stone-100">
              {primaryPhoto ? (
                <img src={member.media[activePhoto]?.fileUrl || primaryPhoto.fileUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-stone-300">👤</div>
              )}
            </div>
            {member.media.length > 1 && (
              <div className="flex gap-1 p-2 overflow-x-auto">
                {member.media.map((m, i) => (
                  <button key={m.id} onClick={() => setActivePhoto(i)}
                    className={`w-10 h-10 rounded overflow-hidden flex-shrink-0 ring-2 ${i === activePhoto ? 'ring-warm-500' : 'ring-transparent'}`}>
                    <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="p-3 border-t border-stone-100">
                <label className="cursor-pointer text-sm text-warm-700 hover:text-warm-800 font-medium">
                  {uploading ? 'Uploading…' : '+ Add Photo'}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            )}
          </div>

          {/* Vitals */}
          <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-4 space-y-3">
            <h3 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Vitals</h3>
            {member.birthDate && (
              <div>
                <div className="text-xs text-stone-400">Born</div>
                <div className="text-sm text-stone-700">{format(new Date(member.birthDate), 'MMMM d, yyyy')}</div>
                {member.birthPlace && <div className="text-xs text-stone-500">{member.birthPlace}</div>}
              </div>
            )}
            {member.deathDate && (
              <div>
                <div className="text-xs text-stone-400">Died</div>
                <div className="text-sm text-stone-700">{format(new Date(member.deathDate), 'MMMM d, yyyy')}</div>
                {member.deathPlace && <div className="text-xs text-stone-500">{member.deathPlace}</div>}
              </div>
            )}
            {member.occupation && (
              <div>
                <div className="text-xs text-stone-400">Occupation</div>
                <div className="text-sm text-stone-700">{member.occupation}</div>
              </div>
            )}
          </div>

          {/* Tags */}
          {member.tags.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-4">
              <h3 className="font-semibold text-stone-700 text-sm uppercase tracking-wide mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {member.tags.map(({ tag }) => (
                  <Link key={tag.name} to={`/members?tags=${encodeURIComponent(tag.name)}`}
                    className="text-xs bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-800 px-2 py-1 rounded-full transition-colors">
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Page info */}
          <div className="text-xs text-stone-400 space-y-1 px-1">
            {member.lastEditedBy && <div>Last edited by {member.lastEditedBy.fullName}</div>}
            <div>Updated {format(new Date(member.updatedAt), 'MMM d, yyyy')}</div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-5">
          {/* Biography */}
          {member.biography && (
            <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6">
              <h2 className="font-serif text-lg font-semibold text-stone-800 mb-3">Biography</h2>
              <div
                className="prose prose-stone max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(member.biography) }}
              />
            </div>
          )}

          {/* Education & Achievements */}
          {(member.education || member.achievements) && (
            <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
              {member.education && (
                <div>
                  <h3 className="font-semibold text-stone-700 mb-1">Education</h3>
                  <p className="text-sm text-stone-600 whitespace-pre-wrap">{member.education}</p>
                </div>
              )}
              {member.achievements && (
                <div>
                  <h3 className="font-semibold text-stone-700 mb-1">Achievements</h3>
                  <p className="text-sm text-stone-600 whitespace-pre-wrap">{member.achievements}</p>
                </div>
              )}
            </div>
          )}

          {/* Relationships */}
          {(() => {
            // Build a deduplicated, correctly-labelled relationship list
            const seen = new Set<string>();
            type RelEntry = { key: string; otherId: string; otherPerson: RelatedMember; label: string };
            const entries: RelEntry[] = [];

            for (const rel of member.relationshipsAsA) {
              const k = canonicalKey(member.id, rel.personBId, rel.relationshipType);
              if (!seen.has(k)) {
                seen.add(k);
                entries.push({ key: rel.id, otherId: rel.personBId, otherPerson: rel.personB, label: REL_LABELS_A[rel.relationshipType] });
              }
            }
            for (const rel of member.relationshipsAsB) {
              const k = canonicalKey(rel.personAId, member.id, rel.relationshipType);
              if (!seen.has(k)) {
                seen.add(k);
                entries.push({ key: rel.id, otherId: rel.personAId, otherPerson: rel.personA, label: REL_LABELS_B[rel.relationshipType] });
              }
            }

            if (entries.length === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6">
                <h2 className="font-serif text-lg font-semibold text-stone-800 mb-4">Family Relationships</h2>
                <div className="grid grid-cols-2 gap-3">
                  {entries.map((entry) => (
                    <Link key={entry.key} to={`/members/${entry.otherId}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 hover:bg-stone-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                        {entry.otherPerson.media[0] ? (
                          <img src={entry.otherPerson.media[0].fileUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300">👤</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-stone-400">{entry.label}</div>
                        <div className="text-sm font-medium text-stone-700">{entry.otherPerson.firstName} {entry.otherPerson.lastName}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Photos gallery */}
          {member.media.length > 1 && (
            <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-6">
              <h2 className="font-serif text-lg font-semibold text-stone-800 mb-3">Photos ({member.media.length})</h2>
              <div className="grid grid-cols-3 gap-2">
                {member.media.map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-stone-100">
                    <img src={m.fileUrl} alt={m.caption || ''} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
