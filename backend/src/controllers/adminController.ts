import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'REJECTED']).optional(),
});

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

// GET /api/admin/users/pending
export async function listPendingUsers(_req: AuthRequest, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      relationshipToFamily: true,
      createdAt: true,
      status: true,
    },
  });
  res.json(users);
}

// POST /api/admin/users/:id/approve
export async function approveUser(req: AuthRequest, res: Response): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      status: 'ACTIVE',
      approvedById: req.user!.userId,
      rejectionReason: null,
    },
    select: { id: true, username: true, email: true, fullName: true, status: true, role: true },
  });

  res.json(user);
}

// POST /api/admin/users/:id/reject
export async function rejectUser(req: AuthRequest, res: Response): Promise<void> {
  const result = rejectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      status: 'REJECTED',
      rejectionReason: result.data.reason ?? null,
    },
    select: { id: true, username: true, email: true, fullName: true, status: true },
  });

  res.json(user);
}

// GET /api/admin/users
export async function listAllUsers(_req: AuthRequest, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      relationshipToFamily: true,
      rejectionReason: true,
      createdAt: true,
      approvedBy: { select: { fullName: true, username: true } },
    },
  });
  res.json(users);
}

// PATCH /api/admin/users/:id
export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  if (req.params.id === req.user!.userId) {
    res.status(400).json({ error: 'You cannot modify your own account via this endpoint' });
    return;
  }

  const result = updateUserSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: result.data,
    select: { id: true, username: true, email: true, fullName: true, role: true, status: true },
  });

  res.json(user);
}

// GET /api/admin/stats
export async function getSiteStats(_req: AuthRequest, res: Response): Promise<void> {
  const [
    totalMembers,
    privateMembers,
    totalUsers,
    activeUsers,
    pendingUsers,
    totalRelationships,
    totalMedia,
    recentActivity,
  ] = await Promise.all([
    prisma.familyMember.count(),
    prisma.familyMember.count({ where: { privacyLevel: 'PRIVATE' } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.relationship.count(),
    prisma.media.count(),
    prisma.profileRevision.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
      include: {
        familyMember: { select: { id: true, firstName: true, lastName: true } },
        editedBy: { select: { fullName: true, username: true } },
      },
    }),
  ]);

  res.json({
    members: { total: totalMembers, private: privateMembers, public: totalMembers - privateMembers },
    users: { total: totalUsers, active: activeUsers, pending: pendingUsers },
    relationships: totalRelationships,
    media: totalMedia,
    recentActivity,
  });
}
