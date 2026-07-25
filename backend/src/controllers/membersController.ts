import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { logAudit } from '../lib/audit';
import { loadAccessContext, memberAccessWhere, redactMemberFields } from '../lib/accessControl';

const CONTRADICTING_TYPES: Partial<Record<string, string[]>> = {
  PARENT: ['CHILD'],
  CHILD: ['PARENT'],
};

async function validateRelationships(
  memberId: string,
  relationships: Array<{ personBId: string; relationshipType: string }>,
): Promise<string | null> {
  for (const r of relationships) {
    if (r.personBId === memberId) {
      return 'A member cannot have a relationship with themselves';
    }
    const contradictTypes = CONTRADICTING_TYPES[r.relationshipType];
    if (contradictTypes) {
      const conflict = await prisma.relationship.findFirst({
        where: {
          personAId: r.personBId,
          personBId: memberId,
          relationshipType: { in: contradictTypes as ('PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING')[] },
        },
      });
      if (conflict) {
        return `Relationship contradiction: cannot set ${r.relationshipType} when the inverse ${conflict.relationshipType} already exists`;
      }
    }
  }
  return null;
}

const memberSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  maidenName: z.string().max(100).optional(),
  alternateNames: z.array(z.string()).optional(),
  birthDate: z.string().datetime().optional().nullable(),
  birthPlace: z.string().max(200).optional(),
  deathDate: z.string().datetime().optional().nullable(),
  deathPlace: z.string().max(200).optional(),
  biography: z.string().optional(),
  occupation: z.string().max(200).optional(),
  education: z.string().max(500).optional(),
  achievements: z.string().optional(),
  privacyLevel: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  isLiving: z.boolean().optional(),
  isMinor: z.boolean().optional(),
  relationships: z.array(z.object({
    personBId: z.string().uuid(),
    relationshipType: z.enum(['PARENT', 'CHILD', 'SPOUSE', 'SIBLING']),
    confidence: z.number().min(0).max(100).optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  editSummary: z.string().max(500).optional(),
});

export async function listMembers(req: AuthRequest, res: Response): Promise<void> {
  const { search, page = '1', limit = '20', tags, birthYearMin, birthYearMax, sortBy = 'lastName' } = req.query;

  const AND: Record<string, unknown>[] = [await memberAccessWhere(req.user!)];

  if (search) {
    AND.push({
      OR: [
        { firstName: { contains: String(search), mode: 'insensitive' } },
        { lastName: { contains: String(search), mode: 'insensitive' } },
        { maidenName: { contains: String(search), mode: 'insensitive' } },
        { birthPlace: { contains: String(search), mode: 'insensitive' } },
        { deathPlace: { contains: String(search), mode: 'insensitive' } },
        { occupation: { contains: String(search), mode: 'insensitive' } },
        { education: { contains: String(search), mode: 'insensitive' } },
        { achievements: { contains: String(search), mode: 'insensitive' } },
        { biography: { contains: String(search), mode: 'insensitive' } },
      ],
    });
  }

  if (tags) {
    const tagList = String(tags).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tagList.length) {
      AND.push({ tags: { some: { tag: { name: { in: tagList } } } } });
    }
  }

  if (birthYearMin || birthYearMax) {
    const birthDateFilter: Record<string, Date> = {};
    if (birthYearMin) birthDateFilter.gte = new Date(parseInt(String(birthYearMin), 10), 0, 1);
    if (birthYearMax) birthDateFilter.lte = new Date(parseInt(String(birthYearMax), 10), 11, 31);
    AND.push({ birthDate: birthDateFilter });
  }

  const where = AND.length > 0 ? { AND } : {};

  const validSortFields: Record<string, object> = {
    lastName: { lastName: 'asc' },
    firstName: { firstName: 'asc' },
    birthDate: { birthDate: { nulls: 'last', sort: 'asc' } },
    updatedAt: { updatedAt: 'desc' },
  };
  const orderBy = validSortFields[String(sortBy)] ?? validSortFields.lastName;

  const pageNum = Math.max(1, parseInt(String(page)));
  const limitNum = Math.min(100, parseInt(String(limit)));
  const skip = (pageNum - 1) * limitNum;

  const [members, total, context] = await Promise.all([
    prisma.familyMember.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        media: { where: { isPrimary: true }, take: 1 },
        tags: { include: { tag: true } },
      },
    }),
    prisma.familyMember.count({ where }),
    loadAccessContext(req.user!),
  ]);

  res.json({ members: members.map((member) => redactMemberFields(member, context)), total, page: pageNum, limit: limitNum });
}

export async function getMember(req: AuthRequest, res: Response): Promise<void> {
  const accessWhere = await memberAccessWhere(req.user!);
  const member = await prisma.familyMember.findFirst({
    where: { AND: [{ id: req.params.id }, accessWhere] },
    include: {
      media: true,
      tags: { include: { tag: true } },
      relationshipsAsA: { include: { personB: { include: { media: { where: { isPrimary: true }, take: 1 } } } } },
      relationshipsAsB: { include: { personA: { include: { media: { where: { isPrimary: true }, take: 1 } } } } },
      createdBy: { select: { username: true, fullName: true } },
      lastEditedBy: { select: { username: true, fullName: true } },
    },
  });

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  const context = await loadAccessContext(req.user!);
  const canSeeAll = req.user?.role === 'ADMIN' || req.user?.role === 'EDITOR';
  const canSeeRelated = (related: { id: string; privacyLevel: 'PUBLIC' | 'PRIVATE' }): boolean =>
    canSeeAll || related.privacyLevel === 'PUBLIC' || context.visibleMemberIds.has(related.id);

  const result = redactMemberFields({
    ...member,
    relationshipsAsA: member.relationshipsAsA.filter((r) => canSeeRelated(r.personB)),
    relationshipsAsB: member.relationshipsAsB.filter((r) => canSeeRelated(r.personA)),
  }, context);

  res.json(result);
}

export async function createMember(req: AuthRequest, res: Response): Promise<void> {
  const result = memberSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const { relationships, tags, editSummary, ...data } = result.data;

  if (relationships?.length) {
    const validationError = await validateRelationships('new', relationships);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
  }

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.familyMember.create({
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        deathDate: data.deathDate ? new Date(data.deathDate) : null,
        createdById: req.user!.userId,
        lastEditedById: req.user!.userId,
      },
    });

    // Create snapshot
    await tx.profileRevision.create({
      data: {
        familyMemberId: m.id,
        contentSnapshot: { ...data },
        editSummary: editSummary || 'Initial creation',
        editedById: req.user!.userId,
      },
    });

    // Create relationships
    if (relationships?.length) {
      await tx.relationship.createMany({
        data: relationships.map((r) => ({
          personAId: m.id,
          personBId: r.personBId,
          relationshipType: r.relationshipType,
          confidence: r.confidence ?? 100,
        })),
        skipDuplicates: true,
      });
    }

    // Handle tags
    if (tags?.length) {
      for (const tagName of tags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName.toLowerCase() },
          update: {},
          create: { name: tagName.toLowerCase() },
        });
        await tx.tagsOnMembers.create({
          data: { memberId: m.id, tagId: tag.id },
        });
      }
    }

    return m;
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'member.create',
    targetType: 'member',
    targetId: member.id,
    targetName: `${member.firstName} ${member.lastName}`,
  });

  res.status(201).json(member);
}

export async function updateMember(req: AuthRequest, res: Response): Promise<void> {
  const result = memberSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const existing = await prisma.familyMember.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const { relationships, tags, editSummary, ...data } = result.data;

  if (relationships?.length) {
    const validationError = await validateRelationships(req.params.id, relationships);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
  }

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.familyMember.update({
      where: { id: req.params.id },
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        deathDate: data.deathDate ? new Date(data.deathDate) : null,
        lastEditedById: req.user!.userId,
      },
    });

    // Save revision snapshot
    await tx.profileRevision.create({
      data: {
        familyMemberId: m.id,
        contentSnapshot: { ...data },
        editSummary: editSummary || 'Updated profile',
        editedById: req.user!.userId,
      },
    });

    // Update relationships: delete existing, recreate
    if (relationships !== undefined) {
      await tx.relationship.deleteMany({ where: { personAId: m.id } });
      if (relationships.length) {
        await tx.relationship.createMany({
          data: relationships.map((r) => ({
            personAId: m.id,
            personBId: r.personBId,
            relationshipType: r.relationshipType,
            confidence: r.confidence ?? 100,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Update tags
    if (tags !== undefined) {
      await tx.tagsOnMembers.deleteMany({ where: { memberId: m.id } });
      for (const tagName of tags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName.toLowerCase() },
          update: {},
          create: { name: tagName.toLowerCase() },
        });
        await tx.tagsOnMembers.create({
          data: { memberId: m.id, tagId: tag.id },
        });
      }
    }

    return m;
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'member.update',
    targetType: 'member',
    targetId: member.id,
    targetName: `${member.firstName} ${member.lastName}`,
    meta: { editSummary: result.data.editSummary },
  });

  res.json(member);
}

export async function deleteMember(req: AuthRequest, res: Response): Promise<void> {
  const existing = await prisma.familyMember.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  await prisma.familyMember.delete({ where: { id: req.params.id } });

  await logAudit({
    actorId: req.user!.userId,
    action: 'member.delete',
    targetType: 'member',
    targetId: existing.id,
    targetName: `${existing.firstName} ${existing.lastName}`,
  });

  res.json({ message: 'Member deleted' });
}

export async function getMemberRevisions(req: AuthRequest, res: Response): Promise<void> {
  const revisions = await prisma.profileRevision.findMany({
    where: { familyMemberId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { editedBy: { select: { username: true, fullName: true } } },
  });
  res.json(revisions);
}

export async function revertMemberRevision(req: AuthRequest, res: Response): Promise<void> {
  const revision = await prisma.profileRevision.findUnique({
    where: { id: req.params.revisionId },
  });
  if (!revision || revision.familyMemberId !== req.params.id) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  const snapshot = revision.contentSnapshot as Record<string, unknown>;
  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.familyMember.update({
      where: { id: req.params.id },
      data: {
        firstName: snapshot.firstName as string,
        lastName: snapshot.lastName as string,
        maidenName: snapshot.maidenName as string | undefined,
        biography: snapshot.biography as string | undefined,
        occupation: snapshot.occupation as string | undefined,
        lastEditedById: req.user!.userId,
      },
    });

    await tx.profileRevision.create({
      data: {
        familyMemberId: m.id,
        contentSnapshot: snapshot as unknown as import('@prisma/client').Prisma.InputJsonValue,
        editSummary: `Reverted to revision from ${revision.createdAt.toISOString()}`,
        editedById: req.user!.userId,
      },
    });

    return m;
  });

  await logAudit({
    actorId: req.user!.userId,
    action: 'member.revert',
    targetType: 'member',
    targetId: member.id,
    targetName: `${member.firstName} ${member.lastName}`,
    meta: { revisionId: req.params.revisionId },
  });

  res.json(member);
}
