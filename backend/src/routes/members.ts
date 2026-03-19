import { Router } from 'express';
import {
  listMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberRevisions,
  revertMemberRevision,
} from '../controllers/membersController';
import { getMemberTree } from '../controllers/treeController';
import { authenticate, requireRole } from '../middleware/authenticate';

export const membersRouter = Router();

membersRouter.use(authenticate);

membersRouter.get('/', listMembers);
membersRouter.get('/:id', getMember);
membersRouter.post('/', requireRole('ADMIN', 'EDITOR'), createMember);
membersRouter.put('/:id', requireRole('ADMIN', 'EDITOR'), updateMember);
membersRouter.delete('/:id', requireRole('ADMIN'), deleteMember);
membersRouter.get('/:id/revisions', getMemberRevisions);
membersRouter.post('/:id/revisions/:revisionId/revert', requireRole('ADMIN', 'EDITOR'), revertMemberRevision);
membersRouter.get('/:id/tree', getMemberTree);
