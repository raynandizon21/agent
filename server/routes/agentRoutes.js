import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as agentController from '../controllers/agentController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', agentController.list);
router.post('/', agentController.create);

export default router;
