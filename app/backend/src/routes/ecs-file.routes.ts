/**
 * ECS本地文件路由
 * 定义ECS Only模式下的文件下载和管理路由
 */

import { Router } from 'express';
import { 
    downloadEcsLocalFile, 
    checkEcsLocalFile, 
    getTaskDownloadInfo 
} from '../controllers/ecs-file.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * ECS本地文件下载路由
 * GET /api/v1/ecs-files/download/:taskId/:filename
 */
router.get('/download/:taskId/:filename', 
    authenticateToken, 
    downloadEcsLocalFile
);

/**
 * 检查ECS本地文件是否存在
 * GET /api/v1/ecs-files/check/:taskId/:filename
 */
router.get('/check/:taskId/:filename', 
    authenticateToken, 
    checkEcsLocalFile
);

/**
 * 获取任务下载信息
 * GET /api/v1/ecs-files/info/:taskId
 */
router.get('/info/:taskId', 
    authenticateToken, 
    getTaskDownloadInfo
);

export default router;
