/**
 * 下载服务
 * 生成任务结果文件的预签名下载URL和下载凭证
 */

import { generatePresignedUrl } from '../utils/oss';
import { prisma } from '../utils/database';
import { DeploymentModeService } from './deployment-mode.service';
import { EcsLocalStorageService } from './ecs-local-storage.service';
import logger from '../config/logger';

export interface DownloadCredential {
    taskId: string;
    userId: string;
    fileName: string;
    downloadUrl: string;
    expiresAt: string;
    fileSize?: number;
    contentType?: string;
}

export class DownloadService {
    /**
     * 生成任务结果文件的下载凭证
     */
    static async generateDownloadCredential(
        taskId: string,
        userId: string,
        fileName: string = 'result.zip',
        expirationHours: number = 24
    ): Promise<DownloadCredential> {
        // 根据部署模式选择不同的下载逻辑
        if (DeploymentModeService.isEcsOnlyMode()) {
            return await this.generateEcsLocalDownloadCredential(taskId, userId, fileName);
        } else {
            return await this.generateOssDownloadCredential(taskId, userId, fileName, expirationHours);
        }
    }

    /**
     * 生成ECS本地下载凭证
     */
    private static async generateEcsLocalDownloadCredential(
        taskId: string,
        userId: string,
        fileName: string
    ): Promise<DownloadCredential> {
        // 验证任务权限
        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                userId: userId,
                status: 'COMPLETED'
            },
            include: {
                tool: { select: { name: true } }
            }
        });

        if (!task) {
            throw new Error('Task not found or not completed');
        }

        // 如果没有指定文件名，查找正确格式的结果文件
        if (fileName === 'result.zip') {
            // 新格式：result_{taskid}_{tool_type}_{timestamp}.zip
            const toolType = task.tool?.name || 'result';
            const resultFileName = await EcsLocalStorageService.findResultFile(taskId, toolType);
            if (resultFileName) {
                fileName = resultFileName;
            } else {
                // 回退到旧格式
                fileName = `${taskId}_${toolType}.zip`;
            }
        }

        // 检查文件是否存在
        const fileExists = await EcsLocalStorageService.fileExists(taskId, fileName);
        if (!fileExists) {
            throw new Error('Result file not found');
        }

        // 计算剩余下载时间
        const downloadTimeout = DeploymentModeService.getDownloadTimeout();
        const expiresAt = new Date(Date.now() + downloadTimeout * 1000);

        // 生成本地下载URL
        const downloadUrl = EcsLocalStorageService.generateLocalDownloadUrl(taskId, fileName);

        const credential: DownloadCredential = {
            taskId,
            userId,
            fileName,
            downloadUrl,
            expiresAt: expiresAt.toISOString(),
            contentType: 'application/zip'
        };

        logger.info({
            taskId,
            userId,
            fileName,
            deploymentMode: 'ecs_only'
        }, 'Generated ECS local download credential');

        return credential;
    }

    /**
     * 生成OSS下载凭证（原有逻辑保持不变）
     */
    private static async generateOssDownloadCredential(
        taskId: string,
        userId: string,
        fileName: string,
        expirationHours: number
    ): Promise<DownloadCredential> {
        // 验证任务是否存在且属于该用户
        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                userId: userId,
                status: 'COMPLETED'
            }
        });

        if (!task) {
            throw new Error('Task not found or not completed');
        }

        // 构建OSS文件路径
        const ossFilePath = `${userId}/${taskId}/outputs/${fileName}`;

        // 生成预签名URL
        const expirationTime = new Date();
        expirationTime.setHours(expirationTime.getHours() + expirationHours);

        const downloadUrl = await generatePresignedUrl(
            process.env.OSS_BUCKET_JOB_RESULTS as string,
            ossFilePath,
            Math.floor(expirationTime.getTime() / 1000) // 转换为Unix时间戳
        );

        // 创建下载凭证
        const credential: DownloadCredential = {
            taskId,
            userId,
            fileName,
            downloadUrl,
            expiresAt: expirationTime.toISOString(),
            contentType: 'application/zip'
        };

        logger.info({
            taskId,
            userId,
            fileName,
            deploymentMode: 'ecs_oss_acr'
        }, 'Generated OSS download credential');

        return credential;
    }

    /**
     * 生成多个文件的下载凭证
     */
    static async generateMultipleDownloadCredentials(
        taskId: string,
        userId: string,
        fileNames: string[],
        expirationHours: number = 24
    ): Promise<DownloadCredential[]> {
        const credentials: DownloadCredential[] = [];

        for (const fileName of fileNames) {
            try {
                const credential = await this.generateDownloadCredential(
                    taskId, 
                    userId, 
                    fileName, 
                    expirationHours
                );
                credentials.push(credential);
            } catch (error) {
                console.error(`Failed to generate credential for ${fileName}:`, error);
                // 继续处理其他文件，不因单个文件失败而中断
            }
        }

        return credentials;
    }

    /**
     * 验证下载凭证是否有效
     */
    static validateDownloadCredential(credential: DownloadCredential): boolean {
        const now = new Date();
        const expiresAt = new Date(credential.expiresAt);
        
        return now < expiresAt;
    }

    /**
     * 获取任务的所有可下载文件
     */
    static async getTaskDownloadableFiles(taskId: string, userId: string): Promise<string[]> {
        // 验证任务
        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                userId: userId,
                status: 'COMPLETED'
            }
        });

        if (!task) {
            throw new Error('Task not found or not completed');
        }

        // 返回标准的下载文件列表
        return [
            'sdc_result.zip',        // 主要结果文件
            'result_summary.txt',    // 结果摘要
            'task_execution.log'     // 执行日志
        ];
    }

    /**
     * 生成任务完整下载包
     */
    static async generateTaskDownloadPackage(
        taskId: string, 
        userId: string
    ): Promise<{
        mainResult: DownloadCredential;
        additionalFiles: DownloadCredential[];
        summary: {
            taskId: string;
            userId: string;
            totalFiles: number;
            packageGeneratedAt: string;
            expiresAt: string;
        };
    }> {
        // 获取可下载文件列表
        const downloadableFiles = await this.getTaskDownloadableFiles(taskId, userId);
        
        // 生成主结果文件凭证
        const mainResult = await this.generateDownloadCredential(taskId, userId, 'sdc_result.zip');
        
        // 生成其他文件凭证
        const additionalFiles = await this.generateMultipleDownloadCredentials(
            taskId, 
            userId, 
            downloadableFiles.filter(f => f !== 'sdc_result.zip')
        );

        return {
            mainResult,
            additionalFiles,
            summary: {
                taskId,
                userId,
                totalFiles: downloadableFiles.length,
                packageGeneratedAt: new Date().toISOString(),
                expiresAt: mainResult.expiresAt
            }
        };
    }

    /**
     * 记录下载事件（用于统计和监控）
     */
    static async recordDownloadEvent(
        taskId: string,
        userId: string,
        fileName: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<void> {
        try {
            // 这里可以记录到数据库或日志系统
            console.log(`Download event: Task ${taskId}, User ${userId}, File ${fileName}`, {
                timestamp: new Date().toISOString(),
                userAgent,
                ipAddress
            });
            
            // 可以扩展为记录到专门的下载日志表
            // await prisma.downloadLog.create({ ... });
            
        } catch (error) {
            console.error('Failed to record download event:', error);
            // 不抛出错误，避免影响下载功能
        }
    }
}

export default DownloadService;
