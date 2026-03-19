import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');

  // Check DB with a 2-second timeout
  let dbOk = false;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('db timeout')), 2000),
      ),
    ]);
    dbOk = true;
  } catch {
    // db not reachable
  }

  // Check uploads directory is writable
  let uploadsOk = false;
  try {
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    uploadsOk = true;
  } catch {
    // not writable
  }

  const ok = dbOk && uploadsOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    uploads: uploadsOk ? 'ok' : 'error',
  });
}
