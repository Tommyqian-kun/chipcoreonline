import { Router } from 'express';
import { getMySubscription, cancelMySubscription } from '../controllers/subscription.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get current user's subscription
router.get('/me', authenticateToken, getMySubscription);

// Cancel subscription (disable auto-renew)
router.delete('/me', authenticateToken, cancelMySubscription);

export default router; 