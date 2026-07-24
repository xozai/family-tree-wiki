import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import RichTextEditor from '../components/RichTextEditor';

interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface RelationshipInput {
  personBId: string;
  relationshipType: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
}

interface FormData {
  firstName: string;
  lastName: string;
  maidenName: string;
  alternateNames: string;
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  biography: string;
  occupation: string;
  education: string;
  achievements: string;
  privacyLevel: 'PUBLIC' | 'PRIVATE';
  isLiving: boolean;
  isMinor: boolean;
  tags: string;
  editSummary: string;
}

export default function MemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormData>({
    firstName: '', lastName: '', maidenName: '', alternateNames: '', birthDate: '', birthPlace: '',
    deathDate: '', deathPlace: '', biography: '', occupation: '', education: '',
    achievements: '', privacyLevel: 'PUBLIC', isLiving: false, isMinor: false, tags: '', editSummary: '',
  });
  const [relationships, setRelationships] = useState<RelationshipInput[]>([]);
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/members?limit=200').then(({ data }) => setAllMembers(data.members));
    if (isEdit && id) {
      api.get(`/members/${id}`).then(({ data }) => {
        setForm({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          maidenName: data.maidenName || '',
          alternateNames: data.alternateNames?.join(', ') || '',
          birthDate: data.birthDate ? data.birthDate.slice(0, 10) : '',
          birthPlace: data.birthPlace || '',
          deathDate: data.deathDate ? data.deathDate.slice(0, 10) : '',
          deathPlace: data.deathPlace || '',
          biography: data.biography || '',
          occupation: data.occupation || '',
          education: data.education || '',
          achievements: data.achievements || '',
          privacyLevel: data.privacyLevel || 'PUBLIC',
          isLiving: Boolean(data.isLiving),
          isMinor: Boolean(data.isMinor),
          tags: data.tags?.map((t: { tag: { name: string } }) => t.tag.name).join(', ') || '',
          editSummary: '',
        });
        setRelationships([
          ...data.relationshipsAsA.map((r: { personBId: string; relationshipType: RelationshipInput['relationshipType'] }) => ({
            personBId: r.personBId,
            relationshipType: r.relationshipType,
          })),
        ]);
      });
    }
  }, [id, isEdit]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, type, value } = e.target;
    const nextValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setForm((f) => ({ ...f, [name]: nextValue }));
  }

  function addRelationship() {
    setRelationships((r) => [...r, { personBId: '', relationshipType: 'PARENT' }]);
  }

  function updateRelationship(i: number, field: keyof RelationshipInput, value: string) {
    setRelationships((r) => r.map((rel, idx) => idx === i ? { ...rel, [field]: value } : rel));
  }

  function removeRelationship(i: number) {
    setRelationships((r) => r.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        alternateNames: form.alternateNames.split(',').map((n) => n.trim()).filter(Boolean),
        birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
        deathDate: form.deathDate ? new Date(form.deathDate).toISOString() : null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        relationships: relationships.filter((r) => r.personBId),
      };

      if (isEdit) {
        await api.put(`/members/${id}`, payload);
        navigate(`/members/${id}`);
      } else {
        const { data } = await api.post('/members', payload);
        navigate(`/members/${data.id}`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-warm-400 focus:border-warm-400 outline-none";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-stone-500 hover:text-stone-700">← Back</button>
        <h1 className="font-serif text-2xl font-bold text-stone-800">{isEdit ? 'Edit Profile' : 'Add Family Member'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Basic Info */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">First Name *</label>
              <input name="firstName" value={form.firstName} onChange={handleChange} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Last Name *</label>
              <input name="lastName" value={form.lastName} onChange={handleChange} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Maiden Name</label>
              <input name="maidenName" value={form.maidenName} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Alternate Names <span className="text-stone-400">(comma separated)</span></label>
              <input name="alternateNames" value={form.alternateNames} onChange={handleChange} placeholder="e.g. Maggie, Meg" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Occupation</label>
              <input name="occupation" value={form.occupation} onChange={handleChange} className={inputClass} />
            </div>
          </div>
        </section>

        {/* Dates & Places */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Dates &amp; Places</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Birth Date</label>
              <input type="date" name="birthDate" value={form.birthDate} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Birth Place</label>
              <input name="birthPlace" value={form.birthPlace} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Death Date</label>
              <input type="date" name="deathDate" value={form.deathDate} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Death Place</label>
              <input name="deathPlace" value={form.deathPlace} onChange={handleChange} className={inputClass} />
            </div>
          </div>
        </section>

        {/* Biography */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Biography</h2>
          <RichTextEditor value={form.biography} onChange={(html) => setForm((f) => ({ ...f, biography: html }))} />
        </section>

        {/* Education & Achievements */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Education &amp; Achievements</h2>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Education</label>
            <textarea name="education" value={form.education} onChange={handleChange} rows={2} className={inputClass + ' resize-none'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Achievements</label>
            <textarea name="achievements" value={form.achievements} onChange={handleChange} rows={2} className={inputClass + ' resize-none'} />
          </div>
        </section>

        {/* Relationships */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Relationships</h2>
            <button type="button" onClick={addRelationship} className="text-sm text-warm-700 hover:text-warm-800 font-medium">+ Add</button>
          </div>
          {relationships.map((rel, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select value={rel.relationshipType} onChange={(e) => updateRelationship(i, 'relationshipType', e.target.value)}
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-warm-400 outline-none sm:w-36">
                <option value="PARENT">Parent of</option>
                <option value="CHILD">Child of</option>
                <option value="SPOUSE">Spouse of</option>
                <option value="SIBLING">Sibling of</option>
              </select>
              <select value={rel.personBId} onChange={(e) => updateRelationship(i, 'personBId', e.target.value)}
                className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-warm-400 outline-none">
                <option value="">— Select person —</option>
                {allMembers.filter((m) => m.id !== id).map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeRelationship(i)} className="text-red-400 hover:text-red-600 text-lg leading-none self-end sm:self-auto">× Remove</button>
            </div>
          ))}
        </section>

        {/* Meta */}
        <section className="bg-white rounded-xl border border-stone-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-stone-700 text-sm uppercase tracking-wide">Tags &amp; Privacy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Tags <span className="text-stone-400">(comma separated)</span></label>
              <input name="tags" value={form.tags} onChange={handleChange} placeholder="Military, Pioneer, Immigrant…" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Privacy Level</label>
              <select name="privacyLevel" value={form.privacyLevel} onChange={handleChange} className={inputClass}>
                <option value="PUBLIC">Public (all approved family users)</option>
                <option value="PRIVATE">Private (relationship-visible users and admins)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" name="isLiving" checked={form.isLiving} onChange={handleChange} className="rounded border-stone-300" />
              Living person — redact sensitive fields for unrelated viewers
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" name="isMinor" checked={form.isMinor} onChange={handleChange} className="rounded border-stone-300" />
              Minor — hide photos, biography, and birth details by default
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Edit Summary</label>
            <input name="editSummary" value={form.editSummary} onChange={handleChange}
              placeholder="Brief description of changes…" className={inputClass} />
          </div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button type="button" onClick={() => navigate(-1)} className="w-full sm:w-auto px-5 py-2.5 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="w-full sm:w-auto px-5 py-2.5 bg-warm-700 hover:bg-warm-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Profile')}
          </button>
        </div>
      </form>
    </div>
  );
}
