import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as expenseController from '../controllers/expenseController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', expenseController.get);
router.put('/', expenseController.set);

export default router;
