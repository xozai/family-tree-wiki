import { describe, expect, it } from 'vitest';
import { canViewField, type AccessRelationship } from '../lib/accessPolicy';

const relationships: AccessRelationship[] = [
  { personAId: 'parent', personBId: 'self', relationshipType: 'PARENT' },
];

describe('media field access', () => {
  it('allows authenticated related viewers to see non-minor media', () => {
    expect(canViewField(
      { id: 'user-1', role: 'VIEWER', linkedMemberIds: ['self'] },
      { id: 'parent', privacyLevel: 'PRIVATE', isLiving: true, isMinor: false },
      'media',
      relationships,
    )).toBe(true);
  });

  it('denies unrelated viewers access to living person media even when the profile is public', () => {
    expect(canViewField(
      { id: 'user-1', role: 'VIEWER', linkedMemberIds: ['self'] },
      { id: 'unrelated', privacyLevel: 'PUBLIC', isLiving: true, isMinor: false },
      'media',
      relationships,
    )).toBe(false);
  });
});
