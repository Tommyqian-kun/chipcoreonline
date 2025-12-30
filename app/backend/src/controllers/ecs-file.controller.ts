/**
 * ECS本地文件下载控制器
 * 实现ECS Only模式下的文件下载功能
 */

import { Request, Response } from 'express';
import { EcsLocalStorageService } from '../services/ecs-local-storage.service';
import { DeploymentModeService } from '../services/deployment-mode.service';
import { prisma } from '../utils/database';
import logger from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';
import { ECS_LOCAL_PATHS } from '../config/paths';

/**
 * 下载ECS本地文件
 */
export const downloadEcsLocalFile = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }

    const { taskId, filename } = req.params;
    const userId = req.user.id;

    try {
        // 检查部署模式
        if (!DeploymentModeService.isEcsOnlyMode()) {
            return res.status(400).json({ 
                message: 'ECS local file download is only available in ECS Only mode' 
            });
        }

        // 验证任务权限
        const task = await prisma.task.findFirst({
            where: { 
                id: taskId, 
                userId: userId 
            },
            select: {
                id: true,
                status: true,
                deploymentMode: true,
                tool: {
                    select: { name: true }
                }
            }
        });

        if (!task) {
            logger.warn({
                taskId,
                userId,
                filename
            }, 'Task not found or unauthorized access attempt');
            return res.status(404).json({ message: 'Task not found' });
        }

        // 检查任务状态
        if (task.status !== 'COMPLETED') {
            return res.status(400).json({ 
                message: 'File download is only available for completed tasks' 
            });
        }

        // 获取文件路径，如果指定文件不存在，尝试查找实际的结果文件
        let actualFilename = filename;
        let filePath = EcsLocalStorageService.getFilePath(taskId, filename);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            // 尝试查找实际的结果文件（可能有不同的命名格式）
            const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);
            if (fs.existsSync(outputDir)) {
                const files = fs.readdirSync(outputDir);
                // 查找包含taskId和工具名的zip文件
                const resultFile = files.find(file =>
                    file.endsWith('.zip') &&
                    file.includes(taskId) &&
                    (file.includes('sdc') || file.includes('upf') || file.includes('result'))
                );

                if (resultFile) {
                    actualFilename = resultFile;
                    filePath = EcsLocalStorageService.getFilePath(taskId, resultFile);
                    logger.info({
                        taskId,
                        requestedFilename: filename,
                        actualFilename: resultFile
                    }, 'Found actual result file with different naming');
                }
            }
        }

        if (!fs.existsSync(filePath)) {
            logger.warn({
                taskId,
                userId,
                filename,
                actualFilename,
                filePath
            }, 'File not found for download');
            return res.status(404).json({ message: 'File not found' });
        }

        // 获取文件信息
        const stats = await fs.promises.stat(filePath);
        
        // 设置下载响应头，使用实际的文件名
        res.setHeader('Content-Disposition', `attachment; filename="${actualFilename}"`);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', stats.size.toString());
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // 记录下载日志
        logger.info({
            taskId,
            userId,
            filename,
            fileSize: stats.size,
            toolName: task.tool?.name
        }, 'ECS local file download started');

        // 流式传输文件
        const fileStream = fs.createReadStream(filePath);
        
        fileStream.on('error', (error) => {
            logger.error({
                taskId,
                userId,
                filename,
                error: error.message
            }, 'Error streaming file');
            
            if (!res.headersSent) {
                res.status(500).json({ message: 'File streaming error' });
            }
        });

        fileStream.on('end', () => {
            logger.info({
                taskId,
                userId,
                filename
            }, 'ECS local file download completed');
        });

        fileStream.pipe(res);

    } catch (error) {
        logger.error({
            taskId,
            userId,
            filename,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'ECS local file download error');
        
        if (!res.headersSent) {
            res.status(500).json({ message: 'Download failed' });
        }
    }
};

/**
 * 检查ECS本地文件是否存在
 */
export const checkEcsLocalFile = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }

    const { taskId, filename } = req.params;
    const userId = req.user.id;

    try {
        // 检查部署模式
        if (!DeploymentModeService.isEcsOnlyMode()) {
            return res.status(400).json({ 
                message: 'ECS local file check is only available in ECS Only mode' 
            });
        }

        // 验证任务权限
        const task = await prisma.task.findFirst({
            where: { 
                id: taskId, 
                userId: userId 
            },
            select: {
                id: true,
                status: true,
                deploymentMode: true
            }
        });

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // 检查文件是否存在，如果不存在则尝试查找实际的结果文件
        let actualFilename = filename;
        let exists = await EcsLocalStorageService.fileExists(taskId, filename);
        let fileSize = 0;

        if (!exists) {
            // 尝试查找实际的结果文件
            const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);
            if (fs.existsSync(outputDir)) {
                const files = fs.readdirSync(outputDir);
                const resultFile = files.find(file =>
                    file.endsWith('.zip') &&
                    file.includes(taskId) &&
                    (file.includes('sdc') || file.includes('upf') || file.includes('result'))
                );

                if (resultFile) {
                    actualFilename = resultFile;
                    exists = true;
                    fileSize = await EcsLocalStorageService.getFileSize(taskId, resultFile);
                }
            }
        } else {
            fileSize = await EcsLocalStorageService.getFileSize(taskId, filename);
        }

        res.json({
            exists,
            fileSize,
            taskStatus: task.status,
            actualFilename: actualFilename !== filename ? actualFilename : undefined,
            downloadUrl: exists ? EcsLocalStorageService.generateLocalDownloadUrl(taskId, actualFilename) : null
        });

    } catch (error) {
        logger.error({
            taskId,
            userId,
            filename,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'ECS local file check error');
        
        res.status(500).json({ message: 'File check failed' });
    }
};

/**
 * 获取任务的下载信息
 */
export const getTaskDownloadInfo = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated' });
    }

    const { taskId } = req.params;
    const userId = req.user.id;

    try {
        // 验证任务权限
        const task = await prisma.task.findFirst({
            where: { 
                id: taskId, 
                userId: userId 
            },
            select: {
                id: true,
                status: true,
                deploymentMode: true,
                finishedAt: true,
                tool: {
                    select: { name: true }
                }
            }
        });

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        if (DeploymentModeService.isEcsOnlyMode()) {
            // ECS Only模式 - 查找正确格式的结果文件
            const toolType = task.tool?.name || 'result';
            let filename = await EcsLocalStorageService.findResultFile(taskId, toolType);

            // 如果没找到新格式，回退到旧格式
            if (!filename) {
                filename = `${taskId}_${toolType}.zip`;
            }

            const exists = await EcsLocalStorageService.fileExists(taskId, filename);
            const fileSize = exists ? await EcsLocalStorageService.getFileSize(taskId, filename) : 0;
            
            // 计算剩余下载时间
            let downloadTimeRemaining = null;
            if (task.status === 'COMPLETED' && task.finishedAt) {
                const finishedTime = new Date(task.finishedAt).getTime();
                const now = Date.now();
                const timeoutMs = DeploymentModeService.getDownloadTimeout() * 1000;
                const elapsed = now - finishedTime;
                downloadTimeRemaining = Math.max(0, Math.floor((timeoutMs - elapsed) / 1000));
            }

            res.json({
                deploymentMode: 'ecs_only',
                taskStatus: task.status,
                fileExists: exists,
                fileSize,
                filename,
                downloadUrl: exists ? EcsLocalStorageService.generateLocalDownloadUrl(taskId, filename) : null,
                downloadTimeRemaining,
                isDownloadExpired: downloadTimeRemaining === 0
            });
        } else {
            // ECS + OSS + ACR模式
            res.json({
                deploymentMode: 'ecs_oss_acr',
                taskStatus: task.status,
                message: 'Use OSS download for this deployment mode'
            });
        }

    } catch (error) {
        logger.error({
            taskId,
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Get task download info error');
        
        res.status(500).json({ message: 'Failed to get download info' });
    }
};
