import { Router } from 'express';
import { createFeedback } from '../controllers/feedback.controller';

const router = Router();

/**
 * @route   POST /api/v1/feedback
 * @desc    Create a new feedback
 * @access  Public
 */
router.post('/', createFeedback);

export default router;
