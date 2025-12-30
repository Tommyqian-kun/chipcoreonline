/**
 * 后台管理系统任务控制器
 * 支持双部署模式的任务下载功能
 */

import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { DeploymentModeService } from '../services/deployment-mode.service';
import { EcsLocalStorageService } from '../services/ecs-local-storage.service';
import { generatePresignedUrl } from '../utils/oss';
import logger from '../config/logger';
import * as fs from 'fs';

/**
 * 管理员下载ECS本地文件
 */
export const downloadEcsLocalFile = async (req: Request, res: Response) => {
    const { taskId, filename } = req.params;

    try {
        // 验证管理员权限（假设已通过中间件验证）
        
        // 验证任务存在
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                user: { select: { email: true } },
                tool: { select: { name: true } }
            }
        });

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // 检查部署模式
        if (task.deploymentMode !== 'ecs_only') {
            return res.status(400).json({ 
                message: 'This task is not in ECS Only mode' 
            });
        }

        // 获取文件路径
        const filePath = EcsLocalStorageService.getFilePath(taskId, filename);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found' });
        }

        // 获取文件信息
        const stats = await fs.promises.stat(filePath);
        
        // 设置下载响应头
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stats.size.toString());

        // 记录管理员下载日志
        logger.info({
            taskId,
            filename,
            fileSize: stats.size,
            userEmail: task.user?.email,
            toolName: task.tool?.name,
            adminAction: 'download_ecs_file'
        }, 'Admin downloaded ECS local file');

        // 流式传输文件
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        logger.error({
            taskId,
            filename,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Admin ECS file download error');
        
        res.status(500).json({ message: 'Download failed' });
    }
};

/**
 * 管理员获取OSS下载链接
 */
export const getOssDownloadUrl = async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
        // 验证任务存在
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                user: { select: { id: true, email: true } },
                tool: { select: { name: true } }
            }
        });

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // 检查部署模式
        if (task.deploymentMode === 'ecs_only') {
            return res.status(400).json({ 
                message: 'This task is in ECS Only mode, use ECS download endpoint' 
            });
        }

        // 检查任务状态
        if (task.status !== 'COMPLETED') {
            return res.status(400).json({ 
                message: 'Task is not completed' 
            });
        }

        // 构建OSS文件路径
        const fileName = `${task.tool?.name || 'result'}_result.zip`;
        const ossFilePath = `${task.user?.id}/${taskId}/outputs/${fileName}`;
        
        // 生成预签名URL（24小时有效期）
        const expirationTime = new Date();
        expirationTime.setHours(expirationTime.getHours() + 24);
        
        const downloadUrl = await generatePresignedUrl(
            process.env.OSS_BUCKET_JOB_RESULTS as string,
            ossFilePath,
            Math.floor(expirationTime.getTime() / 1000)
        );

        // 记录管理员下载日志
        logger.info({
            taskId,
            ossFilePath,
            userEmail: task.user?.email,
            toolName: task.tool?.name,
            adminAction: 'get_oss_download_url'
        }, 'Admin requested OSS download URL');

        res.json({
            downloadUrl,
            fileName,
            expiresAt: expirationTime.toISOString()
        });

    } catch (error) {
        logger.error({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Admin OSS download URL generation error');
        
        res.status(500).json({ message: 'Failed to generate download URL' });
    }
};

/**
 * 获取任务下载信息（管理员版本）
 */
export const getTaskDownloadInfo = async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
        // 验证任务存在
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                user: { select: { id: true, email: true } },
                tool: { select: { name: true } }
            }
        });

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        const deploymentMode = task.deploymentMode || 'ecs_only';

        if (deploymentMode === 'ecs_only') {
            // ECS Only模式
            const fileName = `${taskId}_${task.tool?.name || 'result'}.zip`;
            const fileExists = await EcsLocalStorageService.fileExists(taskId, fileName);
            const fileSize = fileExists ? await EcsLocalStorageService.getFileSize(taskId, fileName) : 0;

            res.json({
                deploymentMode,
                taskStatus: task.status,
                fileExists,
                fileSize,
                fileName,
                downloadEndpoint: `/api/v1/admin/tasks/${taskId}/download-ecs/${fileName}`
            });
        } else {
            // ECS + OSS + ACR模式
            const fileName = `${task.tool?.name || 'result'}_result.zip`;
            
            res.json({
                deploymentMode,
                taskStatus: task.status,
                fileName,
                downloadEndpoint: `/api/v1/admin/tasks/${taskId}/download-oss`
            });
        }

    } catch (error) {
        logger.error({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Get admin task download info error');
        
        res.status(500).json({ message: 'Failed to get download info' });
    }
};
