import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/authenticate';
import { previewGedcomImport, confirmGedcomImport } from '../controllers/importController';

// Use memory storage — we parse the buffer directly, no disk write needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const originalName = file.originalname.toLowerCase();
    if (originalName.endsWith('.ged') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .ged GEDCOM files are allowed'));
    }
  },
});

function handleMulterError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}

export const importRouter = Router();

importRouter.use(authenticate);
importRouter.use(requireRole('ADMIN', 'EDITOR'));

// POST /api/import/gedcom/preview — parse only, returns summary without saving
importRouter.post(
  '/gedcom/preview',
  upload.single('file'),
  handleMulterError,
  previewGedcomImport,
);

// POST /api/import/gedcom — parse and persist to DB
importRouter.post(
  '/gedcom',
  upload.single('file'),
  handleMulterError,
  confirmGedcomImport,
);
