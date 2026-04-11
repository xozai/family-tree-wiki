import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

async function generateThumbnail(filePath: string, filename: string): Promise<string | null> {
  const thumbFilename = `thumb_${filename}`;
  const thumbPath = path.join(UPLOADS_DIR, thumbFilename);
  try {
    await sharp(filePath)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .toFile(thumbPath);
    return `/uploads/${thumbFilename}`;
  } catch (e) {
    console.warn('Failed to generate thumbnail for', filename, e);
    return null;
  }
}

export async function uploadMedia(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const member = await prisma.familyMember.findUnique({ where: { id: req.params.memberId } });
  if (!member) {
    fs.unlinkSync(req.file.path);
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const thumbUrl = await generateThumbnail(req.file.path, req.file.filename);

  let media;
  try {
    media = await prisma.media.create({
      data: {
        familyMemberId: req.params.memberId,
        fileUrl: `/uploads/${req.file.filename}`,
        thumbUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        caption: req.body.caption || null,
        isPrimary: req.body.isPrimary === 'true',
        uploadedById: req.user!.userId,
      },
    });
  } catch (e) {
    // Clean up uploaded files if DB write fails
    try { fs.unlinkSync(req.file.path); } catch {}
    if (thumbUrl) {
      const thumbPath = path.resolve(UPLOADS_DIR, path.basename(thumbUrl));
      try { fs.unlinkSync(thumbPath); } catch {}
    }
    throw e;
  }

  res.status(201).json(media);
}

export async function deleteMedia(req: AuthRequest, res: Response): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: req.params.mediaId } });
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  try {
    const filePath = path.resolve(UPLOADS_DIR, path.basename(media.fileUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('Could not delete media file:', e);
  }

  if (media.thumbUrl) {
    try {
      const thumbPath = path.resolve(UPLOADS_DIR, path.basename(media.thumbUrl));
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    } catch (e) {
      console.warn('Could not delete thumbnail file:', e);
    }
  }

  await prisma.media.delete({ where: { id: req.params.mediaId } });
  res.json({ message: 'Media deleted' });
}

export async function setPrimaryMedia(req: AuthRequest, res: Response): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: req.params.mediaId } });
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  await prisma.$transaction([
    prisma.media.updateMany({
      where: { familyMemberId: media.familyMemberId },
      data: { isPrimary: false },
    }),
    prisma.media.update({
      where: { id: req.params.mediaId },
      data: { isPrimary: true },
    }),
  ]);

  res.json({ message: 'Primary photo updated' });
}
