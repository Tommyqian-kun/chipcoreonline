import { prisma } from '../utils/database';
import { getOssClient, generatePresignedUrl, validateOssConfig } from '../utils/oss';
import { Task, TaskStatus } from '@prisma/client';
import { getWebSocketService } from './websocket.service';
import { TaskIdGeneratorService } from './task-id-generator.service';
import { DeploymentModeService } from './deployment-mode.service';
import { EcsLocalStorageService } from './ecs-local-storage.service';
import logger from '../config/logger';
import { toolTypeManager } from '../config/tool-types.config';
import { ToolMappingService } from './tool-mapping.service';
import { ToolExecutionService } from './tool-execution.service';
import { createTaskLogger, TaskLogger } from './task-logger.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { redisPool } from './redis-pool.service';
import { sanitizeFileName, generateSafeFilePath } from '../utils/file-security';

export const createTask = async (body: any, userId: string, inputFiles?: Express.Multer.File[]): Promise<Task> => {
    // 标记：订阅中间件已经预留了并发槽位
    // 如果任务创建失败，需要释放槽位
    let slotReserved = true; // 默认为true，因为中间件已经预留

    try {
        const { toolId, parameters } = body;

    // 使用改进的TaskID生成服务确保唯一性
    const taskId = await TaskIdGeneratorService.generateUniqueTaskId();

    // 获取用户信息用于日志记录
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
    });
    const username = user?.email?.split('@')[0] || 'unknown';

    // 初始化任务日志器
    const taskLogger = await createTaskLogger(taskId, userId, username, toolId);

    // 步骤1：提交任务开始
    await taskLogger.logStepStart('TASK_SUBMISSION', 'User submitted task', {
        toolId,
        parameters,
        inputFileCount: inputFiles?.length || 0,
        userAgent: 'web-client',
        submissionTime: new Date().toISOString()
    });

    // 准备工具执行上下文
    const context = await ToolExecutionService.prepareExecutionContext(
        toolId,
        parameters,
        userId,
        inputFiles
    );
    context.taskId = taskId;

    // 验证执行前置条件
    await ToolExecutionService.validateExecutionPreconditions(context);

    // 步骤2：权限验证
    await taskLogger.logStepStart('PERMISSION_VERIFICATION', 'Verifying user permissions');

    // 获取用户订阅状态以确定用户权限类型
    const subscription = await prisma.subscription.findFirst({
        where: {
            userId: userId,
            status: 'ACTIVE',
            endDate: {
                gt: new Date(),
            },
        },
        include: {
            plan: true,
        },
    });

    // 确定用户权限类型：有有效订阅为专业用户，否则为免费用户
    const userPermissionType = subscription ? 'pro' : 'free';

    await taskLogger.logStepSuccess('PERMISSION_VERIFICATION', 'User permissions verified', {
        userPermissionType,
        hasSubscription: !!subscription,
        subscriptionPlan: subscription?.plan?.name || 'free',
        subscriptionStatus: subscription?.status || 'none',
        subscriptionEndDate: subscription?.endDate || null
    });

    logger.info({
        userId,
        taskId,
        userPermissionType,
        hasSubscription: !!subscription,
        subscriptionPlan: subscription?.plan?.name || 'free'
    }, 'User permission type determined for task creation');

    // 步骤3：检查Redis队列上限
    await taskLogger.logStepStart('REDIS_QUEUE_CHECK', 'Checking Redis queue capacity');
    // 使用静态导入的redisPool
    const maxQueueLength = parseInt(process.env.MAX_QUEUE_LENGTH || '48');
    const currentQueueLength = await redisPool.getClient().llen('task_queue');

    if (currentQueueLength >= maxQueueLength) {
        await taskLogger.logStepError('REDIS_QUEUE_CHECK', 'Queue is full', new Error(`Queue is full (${currentQueueLength}/${maxQueueLength})`));
        throw new Error(`队列已满，当前队列长度: ${currentQueueLength}/${maxQueueLength}，请稍后再试`);
    }

    await taskLogger.logStepSuccess('REDIS_QUEUE_CHECK', 'Queue capacity check passed', {
        currentQueueLength,
        maxQueueLength,
        queueUtilization: `${Math.round((currentQueueLength / maxQueueLength) * 100)}%`
    });

    // 构建任务参数（先准备参数，稍后保存文件）
    const taskParameters = {
        ...context.parameters,
        userPermissionType,
        // 记录文件信息但不存储文件内容
        inputFileNames: inputFiles ? inputFiles.map(f => f.originalname) : [],
        // 保留原有的工具配置
        toolType: context.toolType,
        moduleName: context.moduleName
    };

    // 步骤4：建立任务ID数据库数据
    await taskLogger.logStepStart('DATABASE_RECORD_CREATION', 'Creating task record in database');
    const task = await prisma.task.create({
        data: {
            id: taskId,
            userId: userId,
            toolId: context.actualToolId,
            status: 'PENDING',
            deploymentMode: context.deploymentMode,
            queuedAt: new Date(), // 记录入队时间
            // 延迟目录创建：不设置inputFile路径，将在Worker中处理
            inputFile: null,
            localStoragePath: DeploymentModeService.isEcsOnlyMode() ? taskId : null,
            parameters: taskParameters,
            retryCount: 0,
            maxRetries: 3
        },
    });
    await taskLogger.logStepSuccess('DATABASE_RECORD_CREATION', 'Task record created successfully', {
        taskId: task.id,
        status: task.status,
        deploymentMode: task.deploymentMode,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        databaseTable: 'Task'
    });

    // 步骤5：建立temp/{taskId}目录
    await taskLogger.logStepStart('TEMP_DIRECTORY_CREATION', 'Creating temp directory after database record');
    const { FileSystemLockService } = await import('./file-system-lock.service');

    // 确保使用正确的temp目录路径
    let tempUploadDir = process.env.TEMP_UPLOAD_DIR;
    if (!tempUploadDir) {
        // 如果环境变量未设置，使用项目根目录下的temp目录
        const projectRoot = path.resolve(process.cwd(), '..', '..');  // 从backend目录到LogicCore根目录
        tempUploadDir = path.join(projectRoot, 'temp');
        logger.warn({
            fallbackPath: tempUploadDir,
            currentWorkingDir: process.cwd()
        }, 'TEMP_UPLOAD_DIR not set, using fallback path');
    }

    const tempDir = path.join(tempUploadDir, taskId);
    await FileSystemLockService.safeCreateDirectory(tempDir);
    await taskLogger.logStepSuccess('TEMP_DIRECTORY_CREATION', 'Temp directory created successfully', {
        tempDir,
        tempUploadDir,
        directoryStructure: 'temp/{taskId}',
        permissions: 'read-write'
    });

    // 步骤6：保存上传数据到temp/{taskId}目录
    let inputFilePaths: string[] = [];
    if (inputFiles && inputFiles.length > 0) {
        await taskLogger.logStepStart('TEMP_FILE_UPLOAD', 'Saving uploaded files to temp directory');

        for (const file of inputFiles) {
            // 验证并清理文件名，防止路径遍历攻击
            const safeFilePath = generateSafeFilePath(tempDir, file.originalname);
            const { safeName } = sanitizeFileName(file.originalname);

            await fs.writeFile(safeFilePath, file.buffer);
            inputFilePaths.push(safeName);

            logger.debug({
                originalName: file.originalname,
                safeName,
                safeFilePath
            }, 'File sanitized and saved');
        }

        await taskLogger.logStepSuccess('TEMP_FILE_UPLOAD', 'Files saved to temp directory', {
            tempDir,
            fileCount: inputFiles.length,
            files: inputFilePaths,
            totalSize: inputFiles.reduce((sum, file) => sum + file.size, 0),
            fileTypes: inputFiles.map(f => f.mimetype)
        });
    } else {
        await taskLogger.logInfo('TEMP_FILE_UPLOAD', 'No files to upload', {
            tempDir,
            fileCount: 0
        });
    }

    // 步骤7：任务入队
    await taskLogger.logStepStart('TASK_ENQUEUE', 'Adding task to Redis execution queue');

    // 原子性入队（队列容量已在前面检查过）
    const enqueueSuccess = await redisPool.atomicEnqueueIfNotFull('task_queue', task.id, maxQueueLength);

    if (!enqueueSuccess) {
        // 如果入队失败，清理已创建的资源
        await taskLogger.logStepError('TASK_ENQUEUE', 'Failed to enqueue task', new Error('Atomic enqueue failed'));

        // 【新增】释放已预留的并发槽位
        try {
            const { userConcurrentCheck } = await import('./user-concurrent-check.service');
            await userConcurrentCheck.releaseConcurrentSlot(userId);
            logger.info({ userId, taskId }, 'Released concurrent slot after enqueue failure');
        } catch (releaseError) {
            logger.error({ userId, taskId, error: releaseError }, 'Failed to release concurrent slot after enqueue failure');
        }

        // 清理temp目录
        try {
            await FileSystemLockService.safeRemoveDirectory(tempDir);
        } catch (cleanupError) {
            logger.error({ tempDir, error: cleanupError }, 'Failed to cleanup temp directory after enqueue failure');
        }

        // 删除已创建的任务记录
        await prisma.task.delete({ where: { id: task.id } });

        throw new Error('任务入队失败，请稍后再试');
    }

    await taskLogger.logStepSuccess('TASK_ENQUEUE', 'Task successfully added to execution queue', {
        taskId: task.id,
        queuePosition: currentQueueLength + 1,
        estimatedWaitTime: `${(currentQueueLength + 1) * 2} minutes`,
        queueName: 'task_queue',
        redisOperation: 'lpush'
    });

    // 发送WebSocket通知，告知前端任务已创建并进入队列
    const webSocketService = getWebSocketService();
    if (webSocketService) {
        webSocketService.notifyTaskStatusUpdate(
            userId,
            taskId,
            'PENDING' as TaskStatus,
            {
                progress: 0,
                currentStep: 'QUEUED',
                queuePosition: currentQueueLength + 1,
                estimatedWaitTime: `${(currentQueueLength + 1) * 2} minutes`
            }
        );
        await taskLogger.logInfo('WEBSOCKET_NOTIFICATION', 'Sent PENDING status notification to frontend', {
            taskId,
            status: 'PENDING',
            queuePosition: currentQueueLength + 1
        });
    }

    await taskLogger.logStepSuccess('TASK_CREATION', 'Task creation process completed successfully');

    // 任务创建成功，槽位保持预留状态，直到任务完成/失败
    slotReserved = false; // 标记为不需要在catch中释放

    return task;

    } catch (error) {
        // 如果槽位仍然预留，说明在任务创建过程中失败了，需要释放
        if (slotReserved) {
            try {
                const { userConcurrentCheck } = await import('./user-concurrent-check.service');
                await userConcurrentCheck.releaseConcurrentSlot(userId);
                logger.warn({ userId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Released concurrent slot due to task creation failure');
            } catch (releaseError) {
                logger.error({ userId, error: releaseError }, 'Failed to release concurrent slot during error handling');
            }
        }

        // 重新抛出原始错误
        throw error;
    }
};

export const getTaskStatus = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            status: true,
            progress: true,
            currentStep: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            finishedAt: true,
            outputFile: true,
            logFile: true,
            deploymentMode: true,
            localStoragePath: true,
            errorMessage: true,
            tool: {
                select: { name: true }
            }
        },
    });

    if (!task || task.userId !== userId) {
        throw new Error('Task not found or unauthorized.');
    }

    // 根据部署模式返回不同的状态信息
    let statusResponse: any = {
        id: task.id,
        status: task.status,
        progress: task.progress !== null ? task.progress : (task.status === 'COMPLETED' ? 100 : 0),
        currentStep: task.currentStep,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        finishedAt: task.finishedAt,
        outputFile: task.outputFile,
        logFile: task.logFile,
        deploymentMode: task.deploymentMode || 'ecs_only',
        errorMessage: task.errorMessage
    };

    // ECS Only模式的特殊处理
    if ((task.deploymentMode || 'ecs_only') === 'ecs_only' && task.status === 'COMPLETED' && task.finishedAt) {
        const downloadTimeout = DeploymentModeService.getDownloadTimeout();
        const finishedTime = new Date(task.finishedAt).getTime();
        const now = Date.now();
        const elapsed = now - finishedTime;
        const downloadTimeRemaining = Math.max(0, Math.floor((downloadTimeout * 1000 - elapsed) / 1000));

        statusResponse.downloadTimeRemaining = downloadTimeRemaining;
        statusResponse.isDownloadExpired = downloadTimeRemaining === 0;

        // 查找任务的结果文件（支持模式匹配）
        const actualFileName = await EcsLocalStorageService.findTaskResultFile(taskId);
        if (actualFileName) {
            statusResponse.resultUrl = EcsLocalStorageService.generateLocalDownloadUrl(taskId, actualFileName);
            console.log(`[DEBUG] Found result file: ${actualFileName} for task ${taskId}`);
        } else {
            console.log(`[DEBUG] No result file found for task ${taskId}`);
            console.log(`[DEBUG] Expected output dir: ${EcsLocalStorageService.getFilePath(taskId, 'dummy').replace('/dummy', '')}`);
        }
    }

    return statusResponse;
};

export const getDownloadUrl = async (taskId: string, userId: string, type: 'result' | 'log'): Promise<string> => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            userId: true,
            outputFile: true,
            logFile: true,
            status: true,
            deploymentMode: true,
            tool: {
                select: { name: true }
            }
        },
    });

    if (!task || task.userId !== userId) {
        throw new Error('Task not found or unauthorized.');
    }

    if (task.status !== 'COMPLETED' && task.status !== 'FAILED') {
        throw new Error('Download is not available until the task is completed or has failed.');
    }

    // 根据部署模式处理下载
    const deploymentMode = task.deploymentMode || 'ecs_only';

    if (deploymentMode === 'ecs_only') {
        // ECS Only模式：不应该直接生成URL，应该通过下载API
        // 这个函数在ECS Only模式下不应该被调用
        throw new Error('ECS Only mode should use download API, not direct URLs');
    } else {
        // ECS+OSS+ACR模式：生成OSS预签名URL
        let bucketName: string;
        let objectName: string | null;

        if (type === 'result') {
            bucketName = process.env.OSS_BUCKET_JOB_RESULTS as string;
            objectName = task.outputFile;
        } else { // type === 'log'
            bucketName = process.env.OSS_BUCKET_JOB_LOGS as string;
            objectName = task.logFile;
        }

        if (!objectName) {
            throw new Error(`No ${type} file available for this task.`);
        }

        return generatePresignedUrl(bucketName, objectName);
    }
};

export const getUserTasks = async (userId: string, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [tasks, total] = await prisma.$transaction([
        prisma.task.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                tool: {
                    select: { name: true, description: true },
                },
            },
        }),
        prisma.task.count({ where: { userId } }),
    ]);

    // 获取下载剩余时间的辅助函数
    const getDownloadTimeRemaining = (task: any): number | null => {
        // 只有ECS Only模式且任务完成才有下载时间限制
        if ((task.deploymentMode || 'ecs_only') !== 'ecs_only' || task.status !== 'COMPLETED') {
            return null;
        }

        if (!task.finishedAt) {
            return null;
        }

        // ECS Only模式：使用配置的下载时间限制
        const downloadTimeout = DeploymentModeService.getDownloadTimeout();
        const finishedTime = new Date(task.finishedAt).getTime();
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - finishedTime) / 1000;

        const remainingSeconds = downloadTimeout - elapsedSeconds;

        if (remainingSeconds <= 0) {
            return 0; // 已过期
        }

        // 使用Math.floor()与getTaskStatus保持一致
        const result = Math.floor(remainingSeconds);
        console.log(`[getUserTasks] Task ${task.id} download time remaining: ${result}s (timeout: ${downloadTimeout}s, elapsed: ${Math.round(elapsedSeconds)}s)`);
        return result; // 返回秒数
    };

    // 计算任务持续时间的辅助函数 - 正确区分单页面和多页面
    const calculateTaskDuration = (createdAt: Date, finishedAt: Date | null, queuedAt?: Date | null): number => {
        // 如果任务未完成，返回0
        if (!finishedAt) {
            return 0;
        }

        // 多页面任务：使用queuedAt作为开始时间（用户点击提交按钮的时刻）
        // 单页面任务：使用createdAt作为开始时间（没有queuedAt字段）
        const startTime = queuedAt ? new Date(queuedAt).getTime() : new Date(createdAt).getTime();
        const endTime = new Date(finishedAt).getTime();
        const durationMs = endTime - startTime;

        // 确保持续时间不为负数
        return Math.max(0, Math.round(durationMs / 1000));
    };

    // 应用与getTaskStatus相同的进度计算逻辑，并添加downloadTimeRemaining和duration
    const enhancedTasks = tasks.map(task => ({
        ...task,
        // 统一的进度计算逻辑：与getTaskStatus保持一致
        progress: task.progress !== null ? task.progress : (task.status === 'COMPLETED' ? 100 : 0),
        // 添加下载剩余时间计算
        downloadTimeRemaining: getDownloadTimeRemaining(task),
        // 只有任务完成时才计算持续时间，避免超时等情况下的错误计算
        duration: task.status === 'COMPLETED' ? calculateTaskDuration(task.createdAt, task.finishedAt, task.queuedAt) : undefined,
    }));

    return {
        data: enhancedTasks,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

export const getTaskById = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({
        where: {
            id: taskId,
            userId: userId,
        },
        include: {
            tool: true,
        },
    });

    if (!task) {
        throw new Error('Task not found or you do not have permission to view it.');
    }

    return task;
};

/**
 * 删除任务记录（用于队列添加失败时的清理）
 */
export const deleteTask = async (taskId: string): Promise<void> => {
    try {
        await prisma.task.delete({
            where: { id: taskId }
        });
        logger.info({ taskId }, 'Task deleted successfully');
    } catch (error) {
        logger.error({ error, taskId }, 'Failed to delete task');
        throw new Error(`Failed to delete task ${taskId}`);
    }
};



/**
 * 更新任务状态并发送WebSocket通知
 */
export const updateTaskStatus = async (
    taskId: string,
    status: TaskStatus,
    additionalData?: any
): Promise<void> => {
    try {
        // 获取任务信息用于日志记录
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
                userId: true,
                toolId: true,
                user: { select: { email: true } }
            }
        });

        if (existingTask) {
            const username = existingTask.user.email?.split('@')[0] || 'unknown';
            const taskLogger = new TaskLogger(taskId, existingTask.userId, username, existingTask.toolId);

            await taskLogger.logInfo('STATUS_UPDATE', `Updating task status to ${status}`, {
                previousStatus: 'unknown',
                newStatus: status,
                additionalData
            });
        }

        // 更新数据库中的任务状态
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                status,
                updatedAt: new Date(),
                ...additionalData
            },
            select: {
                id: true,
                userId: true,
                status: true,
                updatedAt: true,
                outputFile: true,
                logFile: true
            }
        });

        // 发送WebSocket通知
        const webSocketService = getWebSocketService();
        if (webSocketService) {
            webSocketService.notifyTaskStatusUpdate(
                updatedTask.userId,
                taskId,
                status,
                {
                    updatedAt: updatedTask.updatedAt.toISOString(),
                    hasOutput: !!updatedTask.outputFile,
                    hasLog: !!updatedTask.logFile,
                    ...additionalData
                }
            );
        }

        // 【新增】任务完成/失败/取消时释放并发槽位
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
            try {
                const { userConcurrentCheck } = await import('./user-concurrent-check.service');
                await userConcurrentCheck.releaseConcurrentSlot(updatedTask.userId);
                logger.info({
                    taskId,
                    userId: updatedTask.userId,
                    status
                }, 'Released concurrent slot for completed/failed/cancelled task');
            } catch (releaseError) {
                logger.error({
                    taskId,
                    userId: updatedTask.userId,
                    error: releaseError instanceof Error ? releaseError.message : 'Unknown error'
                }, 'Failed to release concurrent slot for completed task');
            }

            // 清理TaskID（从Redis活跃集合中移除）
            await TaskIdGeneratorService.cleanupTaskId(taskId);
        }

        logger.info({
            taskId,
            userId: updatedTask.userId,
            status,
            additionalData
        }, 'Task status updated with notification');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            taskId,
            status,
            additionalData
        }, 'Failed to update task status');
        throw error;
    }
};

/**
 * 内部API：更新任务状态（供Worker使用）
 */
export const updateTaskStatusInternal = async (taskId: string, updateData: {
  status?: string;
  errorMessage?: string;
  finishedAt?: Date;
  outputFile?: string;
  logFile?: string;
  currentStep?: string;
  progress?: number;
  downloadStatus?: string;
  downloadTimeRemaining?: number;
}) => {
  // 类型转换：确保Date字段转为ISO字符串，status转为TaskStatus
  const updatePayload: any = {
    ...updateData,
    updatedAt: new Date().toISOString() // Prisma需要ISO字符串格式
  };

  // 如果有status，确保它是正确的枚举类型
  if (updateData.status) {
    updatePayload.status = updateData.status as any; // 类型断言以绕过TypeScript检查
  }

  // 如果有finishedAt，转换为ISO字符串
  if (updateData.finishedAt) {
    updatePayload.finishedAt = updateData.finishedAt.toISOString();
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updatePayload
  });

  // 发送WebSocket通知给前端
  const webSocketService = getWebSocketService();
  if (webSocketService) {
    // 根据部署模式构建下载URL（如果有输出文件）
    let resultUrl = null;
    let logUrl = null;

    const deploymentMode = task.deploymentMode || 'ecs_only';

    if (task.outputFile) {
      if (deploymentMode === 'ecs_only') {
        // ECS Only模式：使用API路径，让前端调用下载API
        resultUrl = `/api/v1/tasks/${taskId}/download?type=result`;
      } else {
        // ECS+OSS+ACR模式：使用相对路径，前端会调用API获取预签名URL
        resultUrl = `/api/v1/tasks/${taskId}/download?type=result`;
      }
    }

    if (task.logFile) {
      if (deploymentMode === 'ecs_only') {
        // ECS Only模式：生成本地下载URL
        const fileName = `${taskId}_logs.zip`;
        logUrl = EcsLocalStorageService.generateLocalDownloadUrl(taskId, fileName);
      } else {
        // ECS+OSS+ACR模式：使用相对路径
        logUrl = `/api/v1/tasks/${taskId}/download?type=log`;
      }
    }

    // 处理downloadTimeRemaining：始终基于finishedAt时间准确计算，确保同步
    let calculatedDownloadTimeRemaining = updateData.downloadTimeRemaining;
    if (task.status === 'COMPLETED' && task.finishedAt && deploymentMode === 'ecs_only') {
      // 始终基于finishedAt时间计算，确保工具页面和任务历史页面同步
      const downloadTimeout = DeploymentModeService.getDownloadTimeout();
      const finishedTime = new Date(task.finishedAt).getTime();
      const now = Date.now();
      const elapsed = now - finishedTime;
      calculatedDownloadTimeRemaining = Math.max(0, Math.floor((downloadTimeout * 1000 - elapsed) / 1000));
      console.log(`[WebSocket] Calculated downloadTimeRemaining for task ${taskId}: ${calculatedDownloadTimeRemaining}s (finishedAt: ${task.finishedAt}, elapsed: ${Math.round(elapsed/1000)}s)`);
    }

    // 计算任务持续时间（秒）
    const calculateDuration = (createdAt: Date, finishedAt: Date | null): number => {
      if (!finishedAt) return 0;
      const startTime = new Date(createdAt).getTime();
      const endTime = new Date(finishedAt).getTime();
      const durationMs = endTime - startTime;
      return Math.max(0, Math.round(durationMs / 1000));
    };

    webSocketService.notifyTaskStatusUpdate(
      task.userId,
      taskId,
      task.status as TaskStatus,
      {
        updatedAt: task.updatedAt.toISOString(),
        errorMessage: task.errorMessage,
        finishedAt: task.finishedAt?.toISOString(),
        hasOutput: !!task.outputFile,
        hasLog: !!task.logFile,
        // 添加下载URL到WebSocket消息
        resultUrl: resultUrl,
        logUrl: logUrl,
        outputFile: task.outputFile, // 兼容性字段
        logFile: task.logFile, // 兼容性字段
        progress: updateData.progress,
        currentStep: updateData.currentStep,
        downloadStatus: updateData.downloadStatus,
        downloadTimeRemaining: calculatedDownloadTimeRemaining,
        // 只有任务完成时才发送持续时间
        ...(task.status === 'COMPLETED' && task.finishedAt ? { duration: calculateDuration(task.createdAt, task.finishedAt) } : {})
      }
    );
  }

  return task;
};