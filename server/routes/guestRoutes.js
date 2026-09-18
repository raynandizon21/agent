import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as guestController from '../controllers/guestController.js';

const router = Router();

// Agents create/manage their own guests; a scoped login only ever sees and
// touches guests it owns (enforced in the controller via AGENT_ID). An admin
// login sees and can manage every guest — same pattern as settlements.
router.use(authMiddleware);
router.get('/', guestController.list);
router.get('/:id/settlements', guestController.settlements);
router.post('/', guestController.create);
router.put('/:id', guestController.update);
router.delete('/:id', guestController.remove);

export default router;
