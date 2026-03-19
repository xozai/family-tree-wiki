import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/authenticate';

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

  const media = await prisma.media.create({
    data: {
      familyMemberId: req.params.memberId,
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      caption: req.body.caption || null,
      isPrimary: req.body.isPrimary === 'true',
      uploadedById: req.user!.userId,
    },
  });

  res.status(201).json(media);
}

export async function deleteMedia(req: AuthRequest, res: Response): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: req.params.mediaId } });
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const filePath = path.resolve(process.env.UPLOADS_DIR || './uploads', path.basename(media.fileUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
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
