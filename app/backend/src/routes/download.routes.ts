/**
 * 下载路由
 * 处理任务结果文件的下载相关请求
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    generateDownloadCredential,
    getTaskDownloadPackage,
    getDownloadableFiles,
    downloadFile
} from '../controllers/download.controller';

const router = Router();

/**
 * 生成下载凭证
 * GET /api/v1/download/:taskId/credential?fileName=sdc_result.zip
 */
router.get('/:taskId/credential', authenticateToken, generateDownloadCredential);

/**
 * 获取任务完整下载包
 * GET /api/v1/download/:taskId/package
 */
router.get('/:taskId/package', authenticateToken, getTaskDownloadPackage);

/**
 * 获取可下载文件列表
 * GET /api/v1/download/:taskId/files
 */
router.get('/:taskId/files', authenticateToken, getDownloadableFiles);

/**
 * 直接下载文件
 * GET /api/v1/download/:taskId/file/:fileName
 */
router.get('/:taskId/file/:fileName', authenticateToken, downloadFile);

/**
 * 下载主结果文件（默认sdc_result.zip）
 * GET /api/v1/download/:taskId
 */
router.get('/:taskId', authenticateToken, (req, res, next) => {
    req.params.fileName = 'sdc_result.zip';
    downloadFile(req, res);
});

export default router;
