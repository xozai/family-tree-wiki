import { describe, expect, it } from 'vitest';
import {
  canEditMember,
  canManageMedia,
  canViewMember,
  canViewField,
  visiblePersonIdsForViewer,
  type AccessRelationship,
  type AccessMember,
  type AccessUser,
} from '../lib/accessPolicy';

const user = (
  role: AccessUser['role'],
  linkedMemberIds: string[] = [],
  editGrantMemberIds: string[] = [],
  mediaGrantMemberIds: string[] = [],
): AccessUser => ({
  id: 'user-1',
  role,
  linkedMemberIds,
  editGrantMemberIds,
  mediaGrantMemberIds,
});

const member = (id: string, overrides: Partial<AccessMember> = {}): AccessMember => ({
  id,
  privacyLevel: 'PRIVATE',
  isLiving: false,
  isMinor: false,
  ...overrides,
});

const rel = (personAId: string, personBId: string, relationshipType: AccessRelationship['relationshipType']): AccessRelationship => ({
  personAId,
  personBId,
  relationshipType,
});

describe('relationship access policy', () => {
  it('allows a viewer to see self, ancestors, descendants, siblings, aunts/uncles, nieces/nephews, and first cousins', () => {
    const relationships: AccessRelationship[] = [
      rel('grandparent', 'parent', 'PARENT'),
      rel('parent', 'self', 'PARENT'),
      rel('parent', 'sibling', 'PARENT'),
      rel('sibling', 'niece', 'PARENT'),
      rel('grandparent', 'aunt', 'PARENT'),
      rel('aunt', 'cousin', 'PARENT'),
      rel('self', 'child', 'PARENT'),
      rel('child', 'grandchild', 'PARENT'),
      rel('spouse', 'self', 'SPOUSE'),
    ];

    const visible = visiblePersonIdsForViewer(user('VIEWER', ['self']), relationships);

    expect([...visible].sort()).toEqual([
      'aunt',
      'child',
      'cousin',
      'grandchild',
      'grandparent',
      'niece',
      'parent',
      'self',
      'sibling',
      'spouse',
    ].sort());
  });

  it('does not let a spouse relationship bridge into unrelated in-law branches by default', () => {
    const relationships: AccessRelationship[] = [
      rel('self', 'spouse', 'SPOUSE'),
      rel('spouseParent', 'spouse', 'PARENT'),
      rel('spouseParent', 'spouseSibling', 'PARENT'),
    ];

    const visible = visiblePersonIdsForViewer(user('VIEWER', ['self']), relationships);

    expect(visible.has('spouse')).toBe(true);
    expect(visible.has('spouseParent')).toBe(false);
    expect(visible.has('spouseSibling')).toBe(false);
  });

  it('lets admins view private profiles but limits viewers and editors to relationship-visible or public profiles', () => {
    const relationships: AccessRelationship[] = [rel('parent', 'self', 'PARENT')];
    const privateParent = member('parent');
    const privateUnrelated = member('unrelated');
    const publicUnrelated = member('public-unrelated', { privacyLevel: 'PUBLIC' });

    expect(canViewMember(user('ADMIN'), privateUnrelated, relationships)).toBe(true);
    expect(canViewMember(user('VIEWER', ['self']), privateParent, relationships)).toBe(true);
    expect(canViewMember(user('VIEWER', ['self']), privateUnrelated, relationships)).toBe(false);
    expect(canViewMember(user('VIEWER', ['self']), publicUnrelated, relationships)).toBe(true);
    expect(canViewMember(user('EDITOR', ['self']), privateUnrelated, relationships)).toBe(false);
    expect(canViewMember(user('EDITOR', ['self']), publicUnrelated, relationships)).toBe(true);
  });

  it('redacts sensitive fields for living people and minors unless the viewer is self, admin, or explicitly related', () => {
    const relationships: AccessRelationship[] = [];
    const livingUnrelated = member('living', { privacyLevel: 'PUBLIC', isLiving: true });
    const minorUnrelated = member('minor', { privacyLevel: 'PUBLIC', isMinor: true });

    expect(canViewField(user('VIEWER', ['self']), livingUnrelated, 'birthDate', relationships)).toBe(false);
    expect(canViewField(user('VIEWER', ['self']), minorUnrelated, 'media', relationships)).toBe(false);
    expect(canViewField(user('ADMIN'), minorUnrelated, 'media', relationships)).toBe(true);
    expect(canViewField(user('VIEWER', ['living']), livingUnrelated, 'birthDate', relationships)).toBe(true);
  });

  it('allows editors to edit only profiles with explicit edit grants', () => {
    const relationships: AccessRelationship[] = [];
    const granted = member('granted');
    const ungranted = member('ungranted');

    expect(canEditMember(user('ADMIN'), ungranted, relationships)).toBe(true);
    expect(canEditMember(user('EDITOR', [], ['granted']), granted, relationships)).toBe(true);
    expect(canEditMember(user('EDITOR', [], ['granted']), ungranted, relationships)).toBe(false);
    expect(canEditMember(user('VIEWER', [], ['granted']), granted, relationships)).toBe(false);
  });

  it('allows media-only editor grants to manage media without granting profile edits', () => {
    const relationships: AccessRelationship[] = [];
    const mediaGranted = member('media-granted', { privacyLevel: 'PRIVATE', isLiving: true });

    expect(canEditMember(user('EDITOR', [], [], ['media-granted']), mediaGranted, relationships)).toBe(false);
    expect(canManageMedia(user('EDITOR', [], [], ['media-granted']), mediaGranted, relationships)).toBe(true);
    expect(canViewField(user('EDITOR', [], [], ['media-granted']), mediaGranted, 'media', relationships)).toBe(true);
    expect(canViewField(user('EDITOR', [], [], ['media-granted']), mediaGranted, 'birthDate', relationships)).toBe(false);
  });
});
