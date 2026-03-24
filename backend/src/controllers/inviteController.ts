import { Response } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';

const createInviteSchema = z.object({
  note: z.string().max(200).optional(),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export async function createInvite(req: AuthRequest, res: Response): Promise<void> {
  const result = createInviteSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const { note, expiresInDays } = result.data;
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invite = await prisma.inviteToken.create({
    data: { token, note, expiresAt, createdById: req.user!.userId },
    include: { createdBy: { select: { fullName: true, username: true } } },
  });

  res.status(201).json(invite);
}

export async function listInvites(req: AuthRequest, res: Response): Promise<void> {
  const invites = await prisma.inviteToken.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { fullName: true, username: true } },
      usedBy: { select: { fullName: true, username: true } },
    },
  });
  res.json(invites);
}

export async function revokeInvite(req: AuthRequest, res: Response): Promise<void> {
  const invite = await prisma.inviteToken.findUnique({ where: { id: req.params.id } });
  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  if (invite.usedAt) {
    res.status(400).json({ error: 'Cannot revoke an already-used invite' });
    return;
  }
  // Set expiresAt to now to effectively revoke it
  await prisma.inviteToken.update({
    where: { id: req.params.id },
    data: { expiresAt: new Date() },
  });
  res.json({ message: 'Invite revoked' });
}
