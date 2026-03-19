import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  listPendingUsers,
  approveUser,
  rejectUser,
  listAllUsers,
  updateUser,
  getSiteStats,
} from '../controllers/adminController';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/users/pending', listPendingUsers);
adminRouter.post('/users/:id/approve', approveUser);
adminRouter.post('/users/:id/reject', rejectUser);
adminRouter.get('/users', listAllUsers);
adminRouter.patch('/users/:id', updateUser);
adminRouter.get('/stats', getSiteStats);
