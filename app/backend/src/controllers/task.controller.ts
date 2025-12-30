import { Request, Response } from 'express';
import * as taskService from '../services/task.service';
import { prisma } from '../utils/database';
import { TaskQueueService } from '../services/task-queue.service';
import { workerService } from '../services/workerService';
import { DeploymentModeService } from '../services/deployment-mode.service';
import logger from '../config/logger';
import { ECS_LOCAL_PATHS } from '../config/paths';
import * as fs from 'fs';
import * as path from 'path';

// 初始化队列服务
const taskQueueService = new TaskQueueService();

/**
 * Submits a new task for execution.
 * Handles file upload, creates a task record in the DB, and queues the task in Redis.
 */
export const submitTask = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const files = req.files as Express.Multer.File[];
  const userId = req.user.id;

  try {
    // 1. 检查并确保Worker运行（自动启动机制）
    logger.info({ userId }, 'Checking Worker status before task submission');
    const workerStarted = await workerService.ensureWorkerRunning();

    if (!workerStarted) {
      logger.error({ userId }, 'Failed to start Worker process');
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Worker process could not be started.',
        code: 'WORKER_UNAVAILABLE'
      });
    }

    const workerStatus = workerService.getStatus();
    logger.info({
      userId,
      workerStatus: {
        isRunning: workerStatus.isRunning,
        processId: workerStatus.processId,
        errorCount: workerStatus.errorCount
      }
    }, 'Worker status verified');

    // 2. 检查队列状态（非侵入式增强）
    const queueStatus = await taskQueueService.checkQueueStatus(userId);

    if (!queueStatus.canSubmit) {
      logger.warn({
        userId,
        queueStatus
      }, 'Task submission rejected due to queue limits');

      return res.status(429).json({
        success: false,
        message: queueStatus.message,
        code: queueStatus.code,
        data: {
          queuePosition: queueStatus.queuePosition,
          estimatedWait: queueStatus.estimatedWait
        }
      });
    }

    // 3. 使用原有的任务创建逻辑（保持业务逻辑不变）
    const task = await taskService.createTask(req.body, userId, files);

    // 4. 获取队列位置信息（增强用户体验）
    const queueStats = await taskQueueService.getQueueStats();

    logger.info({
      taskId: task.id,
      userId,
      toolId: req.body.toolId,
      queueLength: queueStats.queueLength
    }, 'Task submitted successfully');

    res.status(202).json({
      success: true,
      data: {
        ...task,
        queuePosition: queueStats.queueLength,
        estimatedWait: queueStats.estimatedWait
      },
      message: '任务提交成功'
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Task submission error');

    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: (error as Error).message,
        code: 'NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit task.',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Retrieves the status of a specific task.
 */
export const getTaskStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const { taskId } = req.params;

  try {
    const status = await taskService.getTaskStatus(taskId, req.user.id);
    res.json(status);
  } catch (error) {
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ message: 'Failed to get task status.', error: (error as Error).message });
  }
};

/**
 * 直接下载任务结果文件（ECS Only模式）或重定向到预签名URL（生产模式）
 */
export const downloadTaskResult = async (req: Request, res: Response) => {
  // 强制调试日志
  console.log('🔍 [DOWNLOAD DEBUG] downloadTaskResult 函数被调用');
  console.log('🔍 [DOWNLOAD DEBUG] taskId:', req.params.taskId);
  console.log('🔍 [DOWNLOAD DEBUG] userId:', req.user?.id);
  console.log('🔍 [DOWNLOAD DEBUG] type:', req.query.type);

  if (!req.user) {
    console.log('❌ [DOWNLOAD DEBUG] 用户未认证，返回401');
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const { taskId } = req.params;
  const { type } = req.query;

  if (type !== 'result' && type !== 'log') {
    console.log('❌ [DOWNLOAD DEBUG] 无效的下载类型，返回400');
    return res.status(400).json({ message: 'Invalid download type specified. Use "result" or "log".' });
  }

  console.log('✅ [DOWNLOAD DEBUG] 基础验证通过，开始查询任务');

  try {
    // 获取任务信息
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: req.user.id
      },
      include: {
        tool: { select: { name: true, toolType: true } }
      }
    });

    console.log('🔍 [DOWNLOAD DEBUG] 任务查询结果:', {
      found: !!task,
      taskId: task?.id,
      status: task?.status,
      toolName: task?.tool?.name,
      toolType: task?.tool?.toolType,
      outputFile: task?.outputFile,
      logFile: task?.logFile
    });

    if (!task) {
      console.log('❌ [DOWNLOAD DEBUG] 任务未找到，返回404');
      return res.status(404).json({ message: 'Task not found' });
    }

    if (task.status !== 'COMPLETED') {
      console.log('❌ [DOWNLOAD DEBUG] 任务未完成，状态:', task.status);
      return res.status(400).json({ message: 'Task not completed yet' });
    }

    console.log('✅ [DOWNLOAD DEBUG] 任务验证通过，开始文件查找');

    const deploymentMode = task.deploymentMode || 'ecs_only';

    if (deploymentMode === 'ecs_only') {
      // ECS Only模式：直接使用数据库中保存的文件名
      console.log('🔍 [DOWNLOAD DEBUG] ECS Only模式，检查数据库中的outputFile');
      console.log('🔍 [DOWNLOAD DEBUG] task.outputFile:', task.outputFile);

      if (!task.outputFile) {
        console.log('❌ [DOWNLOAD DEBUG] 数据库中没有outputFile记录');
        return res.status(404).json({ message: 'Output file not found in database' });
      }

      // 直接使用数据库中保存的文件名
      const actualFileName = task.outputFile;
      const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);
      const filePath = path.join(outputDir, actualFileName);

      console.log('🔍 [DOWNLOAD DEBUG] 使用数据库文件名:', {
        actualFileName,
        outputDir,
        filePath,
        fileExists: fs.existsSync(filePath)
      });

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.log('❌ [DOWNLOAD DEBUG] 文件不存在:', filePath);
        return res.status(404).json({ message: 'Output file not found on disk' });
      }

      // 获取文件信息
      const stats = fs.statSync(filePath);

      // 设置下载响应头 - 使用实际文件名
      res.setHeader('Content-Disposition', `attachment; filename="${actualFileName}"`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', stats.size.toString());

      console.log('✅ [DOWNLOAD DEBUG] 开始文件下载:', {
        actualFileName,
        filePath,
        fileSize: stats.size
      });

      // 更新下载状态 - 与多页面保持一致
      await prisma.task.update({
        where: { id: taskId },
        data: {
          downloadStatus: 'DOWNLOADED'
        }
      });

      // 直接流式传输文件
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } else {
      // 生产模式：重定向到OSS预签名URL
      const downloadUrl = await taskService.getDownloadUrl(taskId, req.user.id, type as 'result' | 'log');
      res.redirect(downloadUrl);
    }

  } catch (error) {
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ message: 'Failed to download file.', error: (error as Error).message });
  }
};

/**
 * Retrieves a paginated history of tasks for the current user.
 */
export const getTaskHistory = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const userId = req.user.id;

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  try {
    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          finishedAt: true,
          deploymentMode: true,
          outputFile: true,
          localStoragePath: true,
          downloadStatus: true,
          timeoutType: true,
          errorMessage: true,
          queuedAt: true,
          startedAt: true,
          progress: true,
          currentStep: true,
          stepStartedAt: true,
          parameters: true, // 添加parameters字段以支持多页面任务识别
          tool: {
            select: {
              name: true,
              description: true
            }
          }
        },
      }),
      prisma.task.count({ where: { userId } }),
    ]);

    // 增强任务数据，添加计算字段
    const enhancedTasks = tasks.map(task => {
      const hasResult = !!(task.outputFile || task.localStoragePath);
      const downloadStatus = getDownloadStatus(task);
      const duration = calculateTaskDuration(task.createdAt, task.finishedAt);

      // 调试信息：检查任务数据
      console.log(`[DEBUG] Task ${task.id}:`, {
        status: task.status,
        hasResult: hasResult,
        outputFile: task.outputFile,
        localStoragePath: task.localStoragePath,
        finishedAt: task.finishedAt,
        downloadStatus: downloadStatus,
        duration: duration
      });

      return {
        ...task,
        // 执行状态（基于status和timeoutType）
        executionStatus: getExecutionStatus(task.status, task.timeoutType),
        // 下载状态（基于outputFile和downloadStatus）
        downloadStatus: downloadStatus,
        // 是否有结果文件
        hasResult: hasResult,
        // 下载剩余时间（ECS Only模式）
        downloadTimeRemaining: getDownloadTimeRemaining(task),
        // 任务持续时间（简单计算：finishedAt - createdAt）
        duration: calculateTaskDuration(task.createdAt, task.finishedAt)
      };
    });

    res.status(200).json({
      data: enhancedTasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error getting task history:', error);
    res.status(500).json({ message: 'Failed to get task history.', error: error.message });
  }
};

/**
 * 获取执行状态（基于status和timeoutType）
 */
function getExecutionStatus(status: string, timeoutType: string | null): string {
  if (timeoutType === 'QUEUE_TIMEOUT') {
    return 'QUEUE_TIMEOUT';
  }
  if (timeoutType === 'EXECUTION_TIMEOUT') {
    return 'EXECUTION_TIMEOUT';
  }
  return status;
}

/**
 * 获取下载状态
 */
function getDownloadStatus(task: any): string {
  // 如果任务未完成，返回NO_RESULT
  if (!['COMPLETED'].includes(task.status)) {
    return 'NO_RESULT';
  }

  // 如果没有输出文件，返回NO_RESULT
  if (!task.outputFile && !task.localStoragePath) {
    return 'NO_RESULT';
  }

  // 如果任务已完成但没有finishedAt时间，说明数据不一致，返回NO_RESULT
  if (!task.finishedAt) {
    console.log(`[DEBUG] Task ${task.id}: COMPLETED but no finishedAt, returning NO_RESULT`);
    return 'NO_RESULT';
  }

  // ECS Only模式下的特殊处理
  if ((task.deploymentMode || 'ecs_only') === 'ecs_only') {
    // 检查下载时间是否过期
    const downloadTimeRemaining = getDownloadTimeRemaining(task);
    console.log(`[DEBUG] Task ${task.id}: downloadTimeRemaining=${downloadTimeRemaining}, dbDownloadStatus=${task.downloadStatus}`);

    if (downloadTimeRemaining === 0) {
      console.log(`[DEBUG] Task ${task.id}: Setting status to EXPIRED`);
      return 'EXPIRED';
    }

    // 如果数据库中的downloadStatus是NOT_DOWNLOADED，但任务已完成且有输出文件，则应该是AVAILABLE
    if (task.downloadStatus === 'NOT_DOWNLOADED') {
      console.log(`[DEBUG] Task ${task.id}: Setting status to AVAILABLE (was NOT_DOWNLOADED)`);
      return 'AVAILABLE';
    }

    // 其他情况使用数据库中的downloadStatus
    const finalStatus = task.downloadStatus || 'AVAILABLE';
    console.log(`[DEBUG] Task ${task.id}: Using db status: ${finalStatus}`);
    return finalStatus;
  }

  // 非ECS Only模式，使用数据库中的downloadStatus字段
  if (task.downloadStatus && task.downloadStatus !== 'NOT_DOWNLOADED') {
    return task.downloadStatus;
  }

  // 默认为AVAILABLE（向后兼容）
  return 'AVAILABLE';
}

/**
 * 获取下载剩余时间（秒）
 */
function getDownloadTimeRemaining(task: any): number | null {
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

  // 调试日志
  console.log(`[DEBUG] Task ${task.id}: finishedAt=${task.finishedAt}, elapsed=${elapsedSeconds.toFixed(2)}s, remaining=${remainingSeconds.toFixed(2)}s`);

  if (remainingSeconds <= 0) {
    console.log(`[DEBUG] Task ${task.id}: EXPIRED (remaining=${remainingSeconds.toFixed(2)}s)`);
    return 0; // 已过期
  }

  // 统一使用Math.floor，与其他地方保持一致
  const finalRemainingSeconds = Math.floor(remainingSeconds);
  console.log(`[DEBUG] Task ${task.id}: AVAILABLE (remaining=${finalRemainingSeconds}s)`);
  return finalRemainingSeconds; // 返回秒数
}

/**
 * 计算任务持续时间（秒）
 * 持续时间 = 任务完成时间 - 任务创建时间
 */
function calculateTaskDuration(createdAt: Date, finishedAt: Date | null): number {
  // 如果任务未完成，返回0
  if (!finishedAt) {
    return 0;
  }

  const startTime = new Date(createdAt).getTime();
  const endTime = new Date(finishedAt).getTime();
  const durationMs = endTime - startTime;

  // 确保持续时间不为负数
  return Math.max(0, Math.round(durationMs / 1000));
}

/**
 * Retrieves the full details of a specific task.
 */
export const getTaskDetails = async (req: Request, res: Response) => {
  const { taskId } = req.params;
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const userId = req.user.id;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    // Ensure the user can only access their own tasks
    if (!task || task.userId !== userId) {
      return res.status(404).json({ message: 'Task not found or unauthorized.' });
    }

    res.status(200).json(task);
  } catch (error: any) {
    console.error('Error getting task details:', error);
    res.status(500).json({ message: 'Failed to get task details.', error: error.message });
  }
};

export const getTasks = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const tasks = await taskService.getUserTasks(req.user.id, page, limit);
    res.json(tasks);
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ message: 'Failed to get tasks.', error: (error as Error).message });
  }
};

export const getTaskById = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const { taskId } = req.params;

  try {
    const task = await taskService.getTaskById(taskId, req.user.id);
    res.json(task);
  } catch (error) {
     if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ message: 'Error retrieving task', error: (error as Error).message });
  }
};

/**
 * 内部API：更新任务状态（供Worker使用）
 */
export const updateTaskStatusInternal = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { status, errorMessage, finishedAt, outputFile, logFile, currentStep, progress, downloadStatus, downloadTimeRemaining } = req.body;

    // 验证内部API密钥
    const internalApiKey = req.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY || 'worker-internal-key';

    if (internalApiKey !== expectedKey) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid internal API key'
      });
    }

    // 更新任务状态，包括进度信息
    await taskService.updateTaskStatusInternal(taskId, {
      status,
      errorMessage,
      finishedAt: finishedAt ? new Date(finishedAt) : undefined,
      outputFile,
      logFile,
      currentStep,
      progress,
      downloadStatus,
      downloadTimeRemaining
    });

    res.json({
      success: true,
      message: 'Task status updated successfully'
    });
  } catch (error) {
    console.error('Update task status internal error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update task status'
    });
  }
};

/**
 * 更新任务下载状态
 * @route PATCH /api/v1/tasks/:taskId/download-status
 * @desc 更新任务的下载状态（用户下载后调用）
 * @access Private
 */
export const updateDownloadStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const { taskId } = req.params;
  const { status } = req.body;

  // 验证状态值
  const validStatuses = ['DOWNLOADED', 'EXPIRED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid download status' });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    // 确保用户只能更新自己的任务
    if (!task || task.userId !== req.user.id) {
      return res.status(404).json({ message: 'Task not found or unauthorized' });
    }

    // 只有已完成的任务才能更新下载状态
    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only completed tasks can update download status' });
    }

    // 更新下载状态
    await prisma.task.update({
      where: { id: taskId },
      data: {
        downloadStatus: status
      }
    });

    console.log(`[DOWNLOAD] Task ${taskId} download status updated to ${status}`);

    res.json({
      success: true,
      message: 'Download status updated successfully'
    });
  } catch (error) {
    console.error('Update download status error:', error);
    res.status(500).json({
      message: 'Failed to update download status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};