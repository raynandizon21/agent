import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as telegramConfigController from '../controllers/telegramConfigController.js';

const router = Router();

// The bot token/webhook are account-wide — admin only.
router.use(authMiddleware, requireAdmin);
router.get('/', telegramConfigController.getConfig);
router.put('/', telegramConfigController.updateConfig);

export default router;
