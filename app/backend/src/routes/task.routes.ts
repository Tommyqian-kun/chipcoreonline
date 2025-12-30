import { Router } from 'express';
import { submitTask, getTasks, getTaskById, getTaskStatus, downloadTaskResult, updateTaskStatusInternal, updateDownloadStatus } from '../controllers/task.controller';
import { authenticateToken } from '../middleware/auth';
import { checkTaskExecutionPermission } from '../middleware/subscription';
import multer from 'multer';
import path from 'path';
import { validate } from '../middleware/validate';
import {
  submitTaskSchema,
  getTaskStatusSchema,
  getDownloadUrlSchema
} from '../schemas/task.schema';

// 安全的文件上传配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10, // 最多10个文件
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});
const router = Router();

/**
 * @route   POST /api/v1/tasks
 * @desc    Submit a new task for a tool
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  checkTaskExecutionPermission,
  upload.array('files'),
  validate(submitTaskSchema),
  submitTask
);

/**
 * @route   GET /api/v1/tasks
 * @desc    Get paginated history of tasks for the current user
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  getTasks
);

/**
 * @route   GET /api/v1/tasks/:taskId
 * @desc    Get the full details of a specific task
 * @access  Private
 */
router.get(
  '/:taskId',
  authenticateToken,
  // You might want to add a schema validation for params here later
  getTaskById
);

/**
 * @route   GET /api/v1/tasks/:taskId/status
 * @desc    Get the status of a specific task
 * @access  Private
 */
router.get(
  '/:taskId/status',
  authenticateToken,
  validate(getTaskStatusSchema),
  getTaskStatus
);

/**
 * @route   GET /api/v1/tasks/:taskId/download
 * @desc    Get a pre-signed URL to download task result or log
 * @access  Private
 */
router.get(
  '/:taskId/download',
  authenticateToken,
  validate(getDownloadUrlSchema),
  downloadTaskResult
);

/**
 * @route   PUT /api/internal/tasks/:taskId/status
 * @desc    Update task status (internal API for workers)
 * @access  Internal
 */
router.put(
  '/internal/:taskId/status',
  updateTaskStatusInternal
);

/**
 * @route   PATCH /api/v1/tasks/:taskId/download-status
 * @desc    Update task download status
 * @access  Private
 */
router.patch(
  '/:taskId/download-status',
  authenticateToken,
  updateDownloadStatus
);

export default router;
