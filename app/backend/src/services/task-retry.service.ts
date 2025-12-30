import logger from '../config/logger';
import { prisma } from '../utils/database';
import * as fs from 'fs';
import * as path from 'path';

export class TaskRetryService {
  private static readonly MAX_RETRIES = 3; // 每个任务最多3次机会（包括第一次）
  
  /**
   * 检查并处理未完成的任务，实现重试机制
   */
  static async processIncompleteTasksOnStartup(): Promise<{
    recoveredTasks: number;
    failedTasks: number;
    details: Array<{
      taskId: string;
      action: string;
      reason: string;
    }>;
  }> {
    const result = {
      recoveredTasks: 0,
      failedTasks: 0,
      details: [] as Array<{
        taskId: string;
        action: string;
        reason: string;
      }>
    };

    try {
      logger.info('Starting incomplete tasks recovery process');

      // 1. 查找所有可能需要重试的任务
      const incompleteTasks = await this.findIncompleteTasks();
      
      logger.info({
        incompleteTasksCount: incompleteTasks.length
      }, 'Found incomplete tasks');

      for (const task of incompleteTasks) {
        try {
          const action = await this.processIncompleteTask(task);
          
          if (action.type === 'RETRY') {
            result.recoveredTasks++;
          } else if (action.type === 'FAIL') {
            result.failedTasks++;
          }
          
          result.details.push({
            taskId: task.id,
            action: action.type,
            reason: action.reason
          });

        } catch (error) {
          logger.error({
            taskId: task.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to process incomplete task');
          
          result.failedTasks++;
          result.details.push({
            taskId: task.id,
            action: 'ERROR',
            reason: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      logger.info({
        recoveredTasks: result.recoveredTasks,
        failedTasks: result.failedTasks,
        totalProcessed: incompleteTasks.length
      }, 'Incomplete tasks recovery completed');

      return result;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to process incomplete tasks');
      throw error;
    }
  }

  /**
   * 查找所有未完成的任务
   */
  private static async findIncompleteTasks(): Promise<Array<{
    id: string;
    status: string;
    retryCount: number;
    maxRetries: number;
    originalTaskId: string | null;
    startedAt: Date | null;
    containerStartedAt: Date | null;
    createdAt: Date;
    userId: string;
    toolId: string;
  }>> {
    return await prisma.task.findMany({
      where: {
        status: {
          in: ['RUNNING', 'PENDING'] // 查找可能卡住的任务
        },
        // 查找超过一定时间的任务（避免处理刚提交的任务）
        createdAt: {
          lt: new Date(Date.now() - 5 * 60 * 1000) // 5分钟前创建的任务
        }
      },
      select: {
        id: true,
        status: true,
        retryCount: true,
        maxRetries: true,
        originalTaskId: true,
        startedAt: true,
        containerStartedAt: true,
        createdAt: true,
        userId: true,
        toolId: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * 处理单个未完成任务
   */
  private static async processIncompleteTask(task: {
    id: string;
    status: string;
    retryCount: number;
    maxRetries: number;
    originalTaskId: string | null;
    startedAt: Date | null;
    containerStartedAt: Date | null;
    createdAt: Date;
    userId: string;
    toolId: string;
  }): Promise<{ type: 'RETRY' | 'FAIL' | 'SKIP'; reason: string }> {
    
    // 检查是否还有重试机会
    if (task.retryCount >= task.maxRetries - 1) {
      // 已达到最大重试次数，标记为失败
      await this.markTaskAsFailed(task.id, 'Maximum retry attempts exceeded');
      await this.cleanupTaskResources(task.id);
      
      return {
        type: 'FAIL',
        reason: `Maximum retry attempts exceeded (${task.retryCount}/${task.maxRetries})`
      };
    }

    // 检查temp目录是否存在未完成的任务数据
    const hasIncompleteData = await this.checkIncompleteTaskData(task.id);
    
    if (hasIncompleteData) {
      // 有未完成数据，重新入队
      await this.retryTask(task);
      
      return {
        type: 'RETRY',
        reason: `Found incomplete data, retrying (attempt ${task.retryCount + 1}/${task.maxRetries})`
      };
    } else {
      // 没有未完成数据，可能是僵尸任务，标记为失败
      await this.markTaskAsFailed(task.id, 'No incomplete data found, likely zombie task');
      
      return {
        type: 'FAIL',
        reason: 'No incomplete data found, marked as zombie task'
      };
    }
  }

  /**
   * 检查temp目录是否存在未完成的任务数据
   */
  private static async checkIncompleteTaskData(taskId: string): Promise<boolean> {
    try {
      const tempDir = path.join(process.cwd(), 'temp', taskId);
      
      if (!fs.existsSync(tempDir)) {
        return false;
      }

      // 检查是否有输入文件或其他相关数据
      const files = fs.readdirSync(tempDir);
      return files.length > 0;

    } catch (error) {
      logger.debug({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check incomplete task data');
      return false;
    }
  }

  /**
   * 重试任务
   */
  private static async retryTask(task: {
    id: string;
    retryCount: number;
    userId: string;
    toolId: string;
  }): Promise<void> {
    try {
      // 1. 更新重试计数
      await prisma.task.update({
        where: { id: task.id },
        data: {
          retryCount: task.retryCount + 1,
          status: 'PENDING',
          startedAt: null,
          containerStartedAt: null,
          finishedAt: null,
          errorMessage: null,
          queuedAt: new Date()
        }
      });

      // 2. 重新入队到Redis
      const { redisPool } = await import('./redis-pool.service');
      await redisPool.getClient().lpush('task_queue', task.id);

      logger.info({
        taskId: task.id,
        retryCount: task.retryCount + 1,
        userId: task.userId,
        toolId: task.toolId
      }, 'Task requeued for retry');

    } catch (error) {
      logger.error({
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to retry task');
      throw error;
    }
  }

  /**
   * 标记任务为失败
   */
  private static async markTaskAsFailed(taskId: string, reason: string): Promise<void> {
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: `Task retry failed: ${reason}`
        }
      });

      logger.info({
        taskId,
        reason
      }, 'Task marked as failed after retry attempts');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to mark task as failed');
      throw error;
    }
  }

  /**
   * 清理任务相关资源
   */
  private static async cleanupTaskResources(taskId: string): Promise<void> {
    try {
      // 清理temp目录
      const tempDir = path.join(process.cwd(), 'temp', taskId);
      if (fs.existsSync(tempDir)) {
        await fs.promises.rmdir(tempDir, { recursive: true });
        logger.debug({ taskId }, 'Cleaned up temp directory');
      }

      // 清理jobs目录
      const jobsDir = path.join(process.cwd(), 'jobs', taskId);
      if (fs.existsSync(jobsDir)) {
        await fs.promises.rmdir(jobsDir, { recursive: true });
        logger.debug({ taskId }, 'Cleaned up jobs directory');
      }

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup task resources');
    }
  }

  /**
   * 启动时调用，处理所有未完成任务
   */
  static async initializeRetryService(): Promise<void> {
    try {
      logger.info('Initializing task retry service');
      
      // 等待一段时间确保其他服务已启动
      await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒
      
      const result = await this.processIncompleteTasksOnStartup();
      
      logger.info({
        recoveredTasks: result.recoveredTasks,
        failedTasks: result.failedTasks
      }, 'Task retry service initialized');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to initialize task retry service');
    }
  }
}
