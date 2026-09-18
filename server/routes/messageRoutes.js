import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as messageController from '../controllers/messageController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', requireAdmin, messageController.list);
router.delete('/', requireAdmin, messageController.clear);

export default router;
