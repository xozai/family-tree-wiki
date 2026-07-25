import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import { authRouter } from './routes/auth';
import { authenticate } from './middleware/authenticate';
import { membersRouter } from './routes/members';
import { mediaRouter } from './routes/media';
import { serveUpload } from './controllers/mediaController';
import { tagsRouter } from './routes/tags';
import { importRouter } from './routes/import';
import { adminRouter } from './routes/admin';
import { exportRouter } from './routes/export';
import { errorHandler } from './middleware/errorHandler';
import { healthCheck } from './controllers/healthController';
import { prisma } from './lib/prisma';

// ── Env validation ─────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
if ((process.env.JWT_ACCESS_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
}
if ((process.env.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');
}

// ── App setup ──────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;
const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploads through auth and relationship-aware media authorization.
app.get('/uploads/:filename', authenticate, serveUpload);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/api/health', healthCheck);
app.use('/api/auth', authRouter);
app.use('/api/members', membersRouter);
app.use('/api/media', mediaRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/import', importRouter);
app.use('/api/admin', adminRouter);
app.use('/api/export', exportRouter);

app.use(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    await prisma.$disconnect();
    console.log('Database connection closed. Exiting.');
    process.exit(0);
  });
  // Force exit after 5 seconds if shutdown hangs
  setTimeout(() => {
    console.error('Forced exit after 5s timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
