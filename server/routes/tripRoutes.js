import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as tripController from '../controllers/tripController.js';

const router = Router();

// Same scoping as guests: a scoped agent login only sees/touches trips of
// guests it owns (enforced in the controller); an admin sees all.
router.use(authMiddleware);
router.get('/', tripController.list);
router.get('/:id', tripController.detail);
router.post('/', tripController.create);
router.put('/:id', tripController.update);
router.delete('/:id', tripController.remove);
router.post('/:id/exchanges', tripController.addExchange);
router.delete('/:id/exchanges/:exchangeId', tripController.removeExchange);

export default router;
