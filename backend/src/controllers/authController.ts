import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { AuthRequest } from '../middleware/authenticate';

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(2).max(100),
  relationshipToFamily: z.string().min(2).max(200),
  inviteToken: z.string().min(1, 'An invite token is required to register'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

export async function register(req: Request, res: Response): Promise<void> {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const { username, email, password, fullName, relationshipToFamily, inviteToken } = result.data;

  // Validate invite token
  const invite = await prisma.inviteToken.findUnique({ where: { token: inviteToken } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired invite link. Please contact the family administrator.' });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    res.status(409).json({ error: 'Email or username already in use' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { username, email, passwordHash, fullName, relationshipToFamily },
      select: { id: true, email: true, username: true, fullName: true, status: true },
    });
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { usedById: u.id, usedAt: new Date() },
    });
    return u;
  });

  res.status(201).json({ message: 'Registration submitted. Awaiting admin approval.', user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    const messages: Record<string, string> = {
      PENDING: 'Your account is awaiting admin approval.',
      REJECTED: 'Your registration was not approved.',
    };
    res.status(403).json({ error: messages[user.status] || 'Account not active' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const payload = { userId: user.id, role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      id: uuidv4(),
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Rotation: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({ error: 'User not active' });
      return;
    }

    const newPayload = { userId: user.id, role: user.role, email: user.email };
    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: {
        id: uuidv4(),
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ message: 'Logged out' });
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  const { currentPassword, newPassword } = result.data;
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Revoke all existing refresh tokens so other sessions are invalidated
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  res.json({ message: 'Password changed successfully. Please log in again.' });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, username: true, fullName: true, role: true, status: true },
  });
  res.json(user);
}
