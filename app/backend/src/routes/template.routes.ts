import { Router } from 'express';
import { downloadTemplate } from '../controllers/template.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/templates/:toolId/:filename
 * @desc    Download template file for a specific tool
 * @access  Private (requires user authentication)
 */
router.get('/:toolId/:filename', authenticateToken, downloadTemplate);

export default router;
