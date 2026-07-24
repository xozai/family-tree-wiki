export type AccessRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type AccessPrivacyLevel = 'PUBLIC' | 'PRIVATE';
export type AccessRelationshipType = 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
export type SensitiveField =
  | 'birthDate'
  | 'birthPlace'
  | 'deathDate'
  | 'deathPlace'
  | 'biography'
  | 'occupation'
  | 'education'
  | 'achievements'
  | 'media'
  | 'relationships';

export interface AccessUser {
  id: string;
  role: AccessRole;
  linkedMemberIds?: string[];
}

export interface AccessMember {
  id: string;
  privacyLevel: AccessPrivacyLevel;
  isLiving?: boolean;
  isMinor?: boolean;
}

export interface AccessRelationship {
  personAId: string;
  personBId: string;
  relationshipType: AccessRelationshipType;
}

interface GraphIndexes {
  parentsOf: Map<string, Set<string>>;
  childrenOf: Map<string, Set<string>>;
  spousesOf: Map<string, Set<string>>;
  siblingsOf: Map<string, Set<string>>;
}

function addEdge(map: Map<string, Set<string>>, from: string, to: string): void {
  const existing = map.get(from) ?? new Set<string>();
  existing.add(to);
  map.set(from, existing);
}

function buildIndexes(relationships: AccessRelationship[]): GraphIndexes {
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  const spousesOf = new Map<string, Set<string>>();
  const siblingsOf = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (relationship.relationshipType === 'PARENT') {
      addEdge(parentsOf, relationship.personBId, relationship.personAId);
      addEdge(childrenOf, relationship.personAId, relationship.personBId);
    } else if (relationship.relationshipType === 'CHILD') {
      addEdge(parentsOf, relationship.personAId, relationship.personBId);
      addEdge(childrenOf, relationship.personBId, relationship.personAId);
    } else if (relationship.relationshipType === 'SPOUSE') {
      addEdge(spousesOf, relationship.personAId, relationship.personBId);
      addEdge(spousesOf, relationship.personBId, relationship.personAId);
    } else if (relationship.relationshipType === 'SIBLING') {
      addEdge(siblingsOf, relationship.personAId, relationship.personBId);
      addEdge(siblingsOf, relationship.personBId, relationship.personAId);
    }
  }

  // Derive siblings from shared parents. Explicit SIBLING edges are still honored above.
  for (const children of childrenOf.values()) {
    const ids = [...children];
    for (const id of ids) {
      for (const siblingId of ids) {
        if (siblingId !== id) addEdge(siblingsOf, id, siblingId);
      }
    }
  }

  return { parentsOf, childrenOf, spousesOf, siblingsOf };
}

function addRecursive(
  visible: Set<string>,
  map: Map<string, Set<string>>,
  roots: Iterable<string>,
  maxDepth = Number.POSITIVE_INFINITY,
): Set<string> {
  const queue = [...roots].map((id) => ({ id, depth: 0 }));
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    visible.add(current.id);
    if (current.depth >= maxDepth) continue;
    for (const next of map.get(current.id) ?? []) {
      queue.push({ id: next, depth: current.depth + 1 });
    }
  }

  return visible;
}

export function visiblePersonIdsForViewer(
  user: AccessUser,
  relationships: AccessRelationship[],
): Set<string> {
  const linkedMemberIds = user.linkedMemberIds ?? [];
  const visible = new Set<string>(linkedMemberIds);
  const indexes = buildIndexes(relationships);

  addRecursive(visible, indexes.parentsOf, linkedMemberIds);
  addRecursive(visible, indexes.childrenOf, linkedMemberIds);

  const siblings = new Set<string>();
  const parents = new Set<string>();
  for (const id of linkedMemberIds) {
    for (const spouse of indexes.spousesOf.get(id) ?? []) visible.add(spouse);
    for (const sibling of indexes.siblingsOf.get(id) ?? []) siblings.add(sibling);
    for (const parent of indexes.parentsOf.get(id) ?? []) parents.add(parent);
  }
  for (const sibling of siblings) visible.add(sibling);

  // Nieces/nephews: children of siblings.
  for (const sibling of siblings) {
    for (const child of indexes.childrenOf.get(sibling) ?? []) visible.add(child);
  }

  // Aunts/uncles: siblings of parents.
  const auntsAndUncles = new Set<string>();
  for (const parent of parents) {
    for (const siblingOfParent of indexes.siblingsOf.get(parent) ?? []) {
      auntsAndUncles.add(siblingOfParent);
      visible.add(siblingOfParent);
    }
  }

  // First cousins: children of aunts/uncles.
  for (const auntOrUncle of auntsAndUncles) {
    for (const cousin of indexes.childrenOf.get(auntOrUncle) ?? []) visible.add(cousin);
  }

  return visible;
}

export function canViewMember(
  user: AccessUser,
  member: AccessMember,
  relationships: AccessRelationship[],
): boolean {
  if (user.role === 'ADMIN' || user.role === 'EDITOR') return true;
  if (member.privacyLevel === 'PUBLIC') return true;
  return visiblePersonIdsForViewer(user, relationships).has(member.id);
}

export function canViewField(
  user: AccessUser,
  member: AccessMember,
  field: SensitiveField,
  relationships: AccessRelationship[],
): boolean {
  if (user.role === 'ADMIN' || user.role === 'EDITOR') return true;
  const isSelf = (user.linkedMemberIds ?? []).includes(member.id);
  if (isSelf) return true;

  const relationshipVisible = visiblePersonIdsForViewer(user, relationships).has(member.id);
  if (!relationshipVisible) {
    if (field === 'deathDate' || field === 'deathPlace' || field === 'relationships') return member.privacyLevel === 'PUBLIC';
    return !(member.isLiving || member.isMinor) && member.privacyLevel === 'PUBLIC';
  }

  if (member.isMinor && ['birthDate', 'birthPlace', 'biography', 'media'].includes(field)) {
    return false;
  }

  return true;
}
