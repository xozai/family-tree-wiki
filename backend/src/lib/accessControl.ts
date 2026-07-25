import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  canViewField,
  canViewMember,
  visiblePersonIdsForViewer,
  type AccessMember,
  type AccessRelationship,
  type AccessRole,
  type AccessUser,
  type SensitiveField,
} from './accessPolicy';
import { JwtPayload } from './jwt';

const MEMBER_SELECT = {
  id: true,
  privacyLevel: true,
  isLiving: true,
  isMinor: true,
} satisfies Prisma.FamilyMemberSelect;

const RELATIONSHIP_SELECT = {
  personAId: true,
  personBId: true,
  relationshipType: true,
} satisfies Prisma.RelationshipSelect;

type RawMember = Prisma.FamilyMemberGetPayload<{ select: typeof MEMBER_SELECT }>;
type RawRelationship = Prisma.RelationshipGetPayload<{ select: typeof RELATIONSHIP_SELECT }>;

export interface AccessContext {
  user: AccessUser;
  relationships: AccessRelationship[];
  visibleMemberIds: Set<string>;
}

function toAccessRelationship(relationship: RawRelationship): AccessRelationship {
  return {
    personAId: relationship.personAId,
    personBId: relationship.personBId,
    relationshipType: relationship.relationshipType,
  };
}

function toAccessMember(member: RawMember): AccessMember {
  return {
    id: member.id,
    privacyLevel: member.privacyLevel,
    isLiving: member.isLiving,
    isMinor: member.isMinor,
  };
}

export async function loadAccessContext(jwtUser: JwtPayload): Promise<AccessContext> {
  const [links, relationships] = await Promise.all([
    prisma.userProfileLink.findMany({
      where: { userId: jwtUser.userId, status: 'VERIFIED' },
      select: { familyMemberId: true },
    }),
    prisma.relationship.findMany({ select: RELATIONSHIP_SELECT }),
  ]);

  const accessUser: AccessUser = {
    id: jwtUser.userId,
    role: jwtUser.role as AccessRole,
    linkedMemberIds: links.map((link) => link.familyMemberId),
  };
  const accessRelationships = relationships.map(toAccessRelationship);

  return {
    user: accessUser,
    relationships: accessRelationships,
    visibleMemberIds: visiblePersonIdsForViewer(accessUser, accessRelationships),
  };
}

export async function memberAccessWhere(jwtUser: JwtPayload): Promise<Prisma.FamilyMemberWhereInput> {
  if (jwtUser.role === 'ADMIN' || jwtUser.role === 'EDITOR') return {};
  const context = await loadAccessContext(jwtUser);
  return {
    OR: [
      { privacyLevel: 'PUBLIC' },
      { id: { in: [...context.visibleMemberIds] } },
    ],
  };
}

export async function assertCanViewMember(jwtUser: JwtPayload, memberId: string): Promise<RawMember | null> {
  const member = await prisma.familyMember.findUnique({ where: { id: memberId }, select: MEMBER_SELECT });
  if (!member) return null;
  const context = await loadAccessContext(jwtUser);
  return canViewMember(context.user, toAccessMember(member), context.relationships) ? member : null;
}

export function redactMemberFields<T extends RawMember>(
  member: T,
  context: AccessContext,
): T {
  const accessMember = toAccessMember(member);
  const redacted: Record<string, unknown> = { ...member };
  const fields: SensitiveField[] = [
    'birthDate',
    'birthPlace',
    'deathDate',
    'deathPlace',
    'biography',
    'occupation',
    'education',
    'achievements',
  ];

  for (const field of fields) {
    if (field in redacted && !canViewField(context.user, accessMember, field, context.relationships)) {
      redacted[field] = null;
    }
  }

  if ('media' in redacted && !canViewField(context.user, accessMember, 'media', context.relationships)) {
    redacted.media = [];
  }

  return redacted as T;
}
