import { Router } from 'express';
import { telegramWebhookHandler } from '../services/telegram.js';
import authRoutes from './authRoutes.js';
import agentRoutes from './agentRoutes.js';
import messageRoutes from './messageRoutes.js';
import settlementRoutes from './settlementRoutes.js';
import userRoutes from './userRoutes.js';
import telegramConfigRoutes from './telegramConfigRoutes.js';

const router = Router();

// Public: Telegram push endpoint (authenticated via secret_token header).
router.post('/telegram/webhook', telegramWebhookHandler);

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/messages', messageRoutes);
router.use('/settlements', settlementRoutes);
router.use('/users', userRoutes);
router.use('/telegram-config', telegramConfigRoutes);

export default router;
