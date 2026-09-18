import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as settlementController from '../controllers/settlementController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', settlementController.list);
router.get('/accounts', settlementController.accounts);
router.delete('/', requireAdmin, settlementController.clear);

export default router;
