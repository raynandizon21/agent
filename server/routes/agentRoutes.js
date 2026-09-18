import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as agentController from '../controllers/agentController.js';

const router = Router();

// Managing the agent directory is account-wide — admin only.
router.use(authMiddleware, requireAdmin);
router.get('/', agentController.list);
router.post('/', agentController.create);
router.put('/:id', agentController.update);
router.delete('/:id', agentController.remove);

export default router;
