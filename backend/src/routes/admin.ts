import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  listPendingUsers,
  approveUser,
  rejectUser,
  listAllUsers,
  updateUser,
  getSiteStats,
  getAuditLog,
} from '../controllers/adminController';
import { createInvite, listInvites, revokeInvite } from '../controllers/inviteController';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/users/pending', listPendingUsers);
adminRouter.post('/users/:id/approve', approveUser);
adminRouter.post('/users/:id/reject', rejectUser);
adminRouter.get('/users', listAllUsers);
adminRouter.patch('/users/:id', updateUser);
adminRouter.get('/stats', getSiteStats);
adminRouter.get('/audit', getAuditLog);

adminRouter.get('/invites', listInvites);
adminRouter.post('/invites', createInvite);
adminRouter.delete('/invites/:id', revokeInvite);
