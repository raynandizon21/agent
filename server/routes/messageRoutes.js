import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as messageController from '../controllers/messageController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', messageController.list);
router.delete('/', messageController.clear);

export default router;
