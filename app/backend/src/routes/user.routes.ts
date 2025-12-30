import { Router } from 'express';
import { getMyProfile, updateMyProfile } from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 这个路由受到 auth middleware 的保护
router.get('/me', authenticateToken, getMyProfile);

router.patch('/me', authenticateToken, updateMyProfile);

export default router; 