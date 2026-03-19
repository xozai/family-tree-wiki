import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { exportGedcom } from '../controllers/exportController';

export const exportRouter = Router();

exportRouter.use(authenticate);

exportRouter.get('/gedcom', exportGedcom);
