import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadMedia, deleteMedia, setPrimaryMedia } from '../controllers/mediaController';
import { authenticate, requireRole } from '../middleware/authenticate';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export const mediaRouter = Router();
mediaRouter.use(authenticate);

// Wrap multer so fileFilter and size errors become 400 instead of 500
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

mediaRouter.post('/:memberId', requireRole('ADMIN', 'EDITOR'), uploadSingle, uploadMedia);
mediaRouter.delete('/:mediaId', requireRole('ADMIN', 'EDITOR'), deleteMedia);
mediaRouter.patch('/:mediaId/primary', requireRole('ADMIN', 'EDITOR'), setPrimaryMedia);
