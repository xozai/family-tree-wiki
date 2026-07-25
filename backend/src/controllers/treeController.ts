import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { loadAccessContext, memberAccessWhere, type AccessContext } from '../lib/accessControl';
import { canViewField } from '../lib/accessPolicy';

export interface TreeNode {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  deathYear: number | null;
  photo: string | null;
  children: TreeNode[];
}

// Build the visible member + relationship map in one DB round-trip.
async function loadAll(where: Awaited<ReturnType<typeof memberAccessWhere>>) {
  const [members, relationships] = await Promise.all([
    prisma.familyMember.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        deathDate: true,
        privacyLevel: true,
        media: { where: { isPrimary: true }, take: 1, select: { fileUrl: true } },
      },
    }),
    prisma.relationship.findMany({
      select: { personAId: true, personBId: true, relationshipType: true },
    }),
  ]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  return { memberMap, relationships };
}

function toNode(
  m: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    deathDate: Date | null;
    privacyLevel: 'PUBLIC' | 'PRIVATE';
    isLiving: boolean;
    isMinor: boolean;
    media: { fileUrl: string }[];
  },
  children: TreeNode[] = [],
  context?: AccessContext,
): TreeNode {
  const canSeeBirth = !context || canViewField(context.user, m, 'birthDate', context.relationships);
  const canSeeDeath = !context || canViewField(context.user, m, 'deathDate', context.relationships);
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    birthYear: canSeeBirth && m.birthDate ? m.birthDate.getFullYear() : null,
    deathYear: canSeeDeath && m.deathDate ? m.deathDate.getFullYear() : null,
    // Tree SVG images cannot attach Authorization headers; omit photos instead of leaking upload URLs.
    photo: null,
    children,
  };
}

function buildDescendants(
  rootId: string,
  depth: number,
  memberMap: Map<string, ReturnType<typeof toNode> extends TreeNode ? never : Parameters<typeof toNode>[0]>,
  childrenOf: Map<string, string[]>,
  visited: Set<string>,
  context: AccessContext,
): TreeNode | null {
  const m = memberMap.get(rootId);
  if (!m) return null;
  if (visited.has(rootId)) return toNode(m, [], context); // circular — leaf
  visited.add(rootId);

  const children: TreeNode[] = [];
  if (depth > 0) {
    for (const childId of childrenOf.get(rootId) ?? []) {
      const child = buildDescendants(childId, depth - 1, memberMap, childrenOf, new Set(visited), context);
      if (child) children.push(child);
    }
  }

  return toNode(m, children, context);
}

function buildAncestors(
  rootId: string,
  depth: number,
  memberMap: Parameters<typeof buildDescendants>[2],
  parentsOf: Map<string, string[]>,
  visited: Set<string>,
  context: AccessContext,
): TreeNode | null {
  const m = memberMap.get(rootId);
  if (!m) return null;
  if (visited.has(rootId)) return toNode(m, [], context);
  visited.add(rootId);

  // In D3 we abuse "children" to mean "ancestors" so the tree layout works
  const parents: TreeNode[] = [];
  if (depth > 0) {
    for (const parentId of parentsOf.get(rootId) ?? []) {
      const parent = buildAncestors(parentId, depth - 1, memberMap, parentsOf, new Set(visited), context);
      if (parent) parents.push(parent);
    }
  }

  return toNode(m, parents, context);
}

// GET /api/members/:id/tree?mode=descendants|ancestors&depth=1-5
export async function getMemberTree(req: AuthRequest, res: Response): Promise<void> {
  const mode = req.query.mode === 'ancestors' ? 'ancestors' : 'descendants';
  const depth = Math.min(5, Math.max(1, parseInt(String(req.query.depth ?? '3'), 10)));

  const [accessWhere, context] = await Promise.all([
    memberAccessWhere(req.user!),
    loadAccessContext(req.user!),
  ]);
  const { memberMap, relationships } = await loadAll(accessWhere);

  const root = memberMap.get(req.params.id);
  if (!root) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  // Build adjacency maps
  // childrenOf[X] = IDs of X's children
  // parentsOf[X]  = IDs of X's parents
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  for (const rel of relationships) {
    if (rel.relationshipType === 'PARENT') {
      // personA is parent of personB
      const list = childrenOf.get(rel.personAId) ?? [];
      list.push(rel.personBId);
      childrenOf.set(rel.personAId, list);
    } else if (rel.relationshipType === 'CHILD') {
      // personA is child of personB
      const list = parentsOf.get(rel.personAId) ?? [];
      list.push(rel.personBId);
      parentsOf.set(rel.personAId, list);
    }
  }

  const tree =
    mode === 'ancestors'
      ? buildAncestors(req.params.id, depth, memberMap as Parameters<typeof buildDescendants>[2], parentsOf, new Set(), context)
      : buildDescendants(req.params.id, depth, memberMap as Parameters<typeof buildDescendants>[2], childrenOf, new Set(), context);

  res.json({ mode, depth, root: tree });
}
