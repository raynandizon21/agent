import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as guestController from '../controllers/guestController.js';

const router = Router();

// Managing the guest directory is account-wide — admin only.
router.use(authMiddleware, requireAdmin);
router.get('/', guestController.list);
router.post('/', guestController.create);
router.put('/:id', guestController.update);
router.delete('/:id', guestController.remove);

export default router;
