import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function logAudit(opts: {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: opts.action,
      actorId: opts.actorId ?? null,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      targetName: opts.targetName ?? null,
      meta: opts.meta !== undefined ? (opts.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
    };
    await prisma.auditLog.create({ data });
  } catch (e) {
    // Audit failures must never break the primary operation
    console.warn('Failed to write audit log', opts.action, e);
  }
}
