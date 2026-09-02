import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);

export default router;
