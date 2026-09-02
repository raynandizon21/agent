import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as forwarderController from '../controllers/forwarderController.js';

const router = Router();

router.use(authMiddleware);
router.get('/config', forwarderController.getConfig);
router.put('/config', forwarderController.updateConfig);

export default router;
