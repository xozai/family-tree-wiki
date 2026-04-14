import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { sendEmail, APP_URL } from '../lib/email';
import { logAudit } from '../lib/audit';

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

  await logAudit({
    actorId: req.user!.userId,
    action: 'user.approve',
    targetType: 'user',
    targetId: user.id,
    targetName: user.fullName,
  });

  res.json(user);

  try {
    await sendEmail(
      user.email,
      'Your Family Tree Wiki account has been approved',
      `<p>Hello ${user.fullName},</p>
       <p>Your registration has been approved. You can now sign in.</p>
       <p><a href="${APP_URL}/login">Sign in →</a></p>`,
    );
  } catch (e) {
    console.error('Approval email error:', e);
  }
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

  await logAudit({
    actorId: req.user!.userId,
    action: 'user.reject',
    targetType: 'user',
    targetId: user.id,
    targetName: user.fullName,
    meta: result.data.reason ? { reason: result.data.reason } : undefined,
  });

  res.json(user);

  try {
    await sendEmail(
      user.email,
      'Your Family Tree Wiki registration was not approved',
      `<p>Hello ${user.fullName},</p>
       <p>Unfortunately your registration was not approved at this time.</p>
       ${result.data.reason ? `<p><strong>Reason:</strong> ${result.data.reason}</p>` : ''}
       <p>If you believe this is an error, please contact the family administrator.</p>`,
    );
  } catch (e) {
    console.error('Rejection email error:', e);
  }
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

  await logAudit({
    actorId: req.user!.userId,
    action: 'user.update',
    targetType: 'user',
    targetId: user.id,
    targetName: user.fullName,
    meta: result.data as Record<string, unknown>,
  });

  res.json(user);
}

// GET /api/admin/audit
export async function getAuditLog(req: AuthRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (req.query.action) {
    where.action = { startsWith: String(req.query.action) };
  }
  if (req.query.targetType) {
    where.targetType = String(req.query.targetType);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        actor: { select: { username: true, fullName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page, limit });
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
