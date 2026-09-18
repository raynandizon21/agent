import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import * as userController from '../controllers/userController.js';

const router = Router();

// Managing dashboard logins is account-wide — admin only.
router.use(authMiddleware, requireAdmin);
router.get('/', userController.list);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.delete('/:id', userController.remove);

export default router;
