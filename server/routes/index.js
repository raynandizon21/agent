import { Router } from 'express';
import { telegramWebhookHandler } from '../services/telegram.js';
import authRoutes from './authRoutes.js';
import agentRoutes from './agentRoutes.js';
import messageRoutes from './messageRoutes.js';
import settlementRoutes from './settlementRoutes.js';
import forwarderRoutes from './forwarderRoutes.js';

const router = Router();

// Public: Telegram push endpoint (authenticated via secret_token header).
router.post('/telegram/webhook', telegramWebhookHandler);

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/messages', messageRoutes);
router.use('/settlements', settlementRoutes);
router.use('/forwarder', forwarderRoutes);

export default router;
