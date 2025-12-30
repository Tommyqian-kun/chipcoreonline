/**
 * 后台管理系统任务路由
 * 支持双部署模式的任务管理和下载功能
 */

import { Router } from 'express';
import { 
    downloadEcsLocalFile, 
    getOssDownloadUrl, 
    getTaskDownloadInfo 
} from '../controllers/admin-task.controller';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

const router = Router();

/**
 * 管理员下载ECS本地文件
 * GET /api/v1/admin/tasks/:taskId/download-ecs/:filename
 */
router.get('/tasks/:taskId/download-ecs/:filename', 
    authenticateToken, 
    requireAdmin,
    downloadEcsLocalFile
);

/**
 * 管理员获取OSS下载链接
 * GET /api/v1/admin/tasks/:taskId/download-oss
 */
router.get('/tasks/:taskId/download-oss', 
    authenticateToken, 
    requireAdmin,
    getOssDownloadUrl
);

/**
 * 获取任务下载信息（管理员版本）
 * GET /api/v1/admin/tasks/:taskId/download-info
 */
router.get('/tasks/:taskId/download-info', 
    authenticateToken, 
    requireAdmin,
    getTaskDownloadInfo
);

export default router;
