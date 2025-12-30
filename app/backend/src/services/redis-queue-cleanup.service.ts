import { prisma } from '../utils/database';
import logger from '../config/logger';

/**
 * Redis队列清理服务
 * 负责清理超时任务，维护Redis队列和active_task_ids的一致性
 */
export class RedisQueueCleanupService {
  private redisPool: any;
  private readonly QUEUE_WAIT_TIMEOUT_MINUTES: number;
  private readonly CONTAINER_EXECUTION_TIMEOUT_MINUTES: number;
  private readonly CLEANUP_INTERVAL_MINUTES: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.QUEUE_WAIT_TIMEOUT_MINUTES = parseInt(process.env.QUEUE_WAIT_TIMEOUT_MINUTES || '35');
    this.CONTAINER_EXECUTION_TIMEOUT_MINUTES = parseInt(process.env.CONTAINER_EXECUTION_TIMEOUT_MINUTES || '3');
    this.CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '60');
    this.initializeRedisPool();
  }

  private async initializeRedisPool() {
    const { redisPool } = await import('./redis-pool.service');
    this.redisPool = redisPool;
  }

  private async getRedisClient() {
    if (!this.redisPool) {
      await this.initializeRedisPool();
    }
    return this.redisPool.getClient();
  }

  /**
   * 启动清理服务
   */
  startCleanupService(): void {
    if (this.cleanupInterval) {
      logger.warn('Redis queue cleanup service is already running');
      return;
    }

    logger.info({
      queueWaitTimeoutMinutes: this.QUEUE_WAIT_TIMEOUT_MINUTES,
      containerExecutionTimeoutMinutes: this.CONTAINER_EXECUTION_TIMEOUT_MINUTES,
      cleanupIntervalMinutes: this.CLEANUP_INTERVAL_MINUTES
    }, 'Starting Redis queue cleanup service');

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Error during Redis queue cleanup');
      }
    }, this.CLEANUP_INTERVAL_MINUTES * 60 * 1000);
  }

  /**
   * 停止清理服务
   */
  stopCleanupService(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Stopped Redis queue cleanup service');
    }
  }

  /**
   * 执行清理操作
   */
  async performCleanup(): Promise<{
    queueTimeoutTasks: number;
    executionTimeoutTasks: number;
    orphanedActiveTaskIds: number;
  }> {
    logger.info('Starting Redis queue cleanup');

    const results = {
      queueTimeoutTasks: 0,
      executionTimeoutTasks: 0,
      orphanedActiveTaskIds: 0
    };

    try {
      // 1. 清理队列等待超时的任务
      results.queueTimeoutTasks = await this.cleanupQueueTimeoutTasks();

      // 2. 清理容器执行超时的任务
      results.executionTimeoutTasks = await this.cleanupExecutionTimeoutTasks();

      // 3. 清理孤立的active_task_ids
      results.orphanedActiveTaskIds = await this.cleanupOrphanedActiveTaskIds();

      logger.info(results, 'Redis queue cleanup completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during cleanup process');
    }

    return results;
  }

  /**
   * 清理队列等待超时的任务
   */
  private async cleanupQueueTimeoutTasks(): Promise<number> {
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - this.QUEUE_WAIT_TIMEOUT_MINUTES);

    try {
      // 查找在队列中等待超时的任务
      const timeoutTasks = await prisma.task.findMany({
        where: {
          status: 'PENDING',
          queuedAt: {
            lt: timeoutThreshold
          }
        },
        select: {
          id: true,
          userId: true,
          queuedAt: true
        }
      });

      if (timeoutTasks.length === 0) {
        return 0;
      }

      logger.warn({
        timeoutTasksCount: timeoutTasks.length,
        timeoutThreshold: timeoutThreshold.toISOString()
      }, 'Found queue timeout tasks');

      let cleanedCount = 0;

      for (const task of timeoutTasks) {
        try {
          await this.handleQueueTimeoutTask(task.id);
          cleanedCount++;
        } catch (error) {
          logger.error({
            taskId: task.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to handle queue timeout task');
        }
      }

      return cleanedCount;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup queue timeout tasks');
      return 0;
    }
  }

  /**
   * 清理容器执行超时的任务
   */
  private async cleanupExecutionTimeoutTasks(): Promise<number> {
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - this.CONTAINER_EXECUTION_TIMEOUT_MINUTES);

    try {
      // 查找执行超时的任务
      const timeoutTasks = await prisma.task.findMany({
        where: {
          status: 'RUNNING',
          startedAt: {
            lt: timeoutThreshold
          }
        },
        select: {
          id: true,
          userId: true,
          startedAt: true
        }
      });

      if (timeoutTasks.length === 0) {
        return 0;
      }

      logger.warn({
        timeoutTasksCount: timeoutTasks.length,
        timeoutThreshold: timeoutThreshold.toISOString()
      }, 'Found execution timeout tasks');

      let cleanedCount = 0;

      for (const task of timeoutTasks) {
        try {
          await this.handleExecutionTimeoutTask(task.id);
          cleanedCount++;
        } catch (error) {
          logger.error({
            taskId: task.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to handle execution timeout task');
        }
      }

      return cleanedCount;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup execution timeout tasks');
      return 0;
    }
  }

  /**
   * 清理孤立的active_task_ids
   */
  private async cleanupOrphanedActiveTaskIds(): Promise<number> {
    try {
      const redis = await this.getRedisClient();

      // 获取Redis中的所有活跃任务ID
      const activeTaskIds = await redis.smembers('active_task_ids');

      if (activeTaskIds.length === 0) {
        return 0;
      }

      let cleanedCount = 0;

      for (const taskId of activeTaskIds) {
        try {
          // 检查任务是否在数据库中存在且状态正确
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { id: true, status: true }
          });

          // 如果任务不存在或已完成/失败，从active_task_ids中移除
          if (!task || ['COMPLETED', 'FAILED', 'CANCELLED', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT'].includes(task.status)) {
            await redis.srem('active_task_ids', taskId);
            cleanedCount++;

            logger.info({
              taskId,
              taskStatus: task?.status || 'NOT_FOUND'
            }, 'Removed orphaned task ID from active_task_ids');
          }

        } catch (error) {
          logger.error({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to check orphaned task ID');
        }
      }

      return cleanedCount;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup orphaned active task IDs');
      return 0;
    }
  }

  /**
   * 处理队列等待超时的任务
   */
  private async handleQueueTimeoutTask(taskId: string): Promise<void> {
    try {
      // 1. 从Redis队列中移除任务
      await this.cleanupTaskFromRedis(taskId);

      // 2. 更新数据库状态为队列超时
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'QUEUE_TIMEOUT',
          timeoutType: 'QUEUE_TIMEOUT',
          timeoutAt: new Date(),
          finishedAt: new Date(),
          errorMessage: `Task queue timeout after ${this.QUEUE_WAIT_TIMEOUT_MINUTES} minutes`
        }
      });

      logger.info({
        taskId,
        timeoutMinutes: this.QUEUE_WAIT_TIMEOUT_MINUTES
      }, 'Handled queue timeout task');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to handle queue timeout task');
      throw error;
    }
  }

  /**
   * 处理容器执行超时的任务
   */
  private async handleExecutionTimeoutTask(taskId: string): Promise<void> {
    try {
      // 1. 从Redis中清理任务记录
      await this.cleanupTaskFromRedis(taskId);

      // 2. 更新数据库状态为执行超时
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'EXECUTION_TIMEOUT',
          timeoutType: 'EXECUTION_TIMEOUT',
          timeoutAt: new Date(),
          finishedAt: new Date(),
          errorMessage: `Container execution timeout after ${this.CONTAINER_EXECUTION_TIMEOUT_MINUTES} minutes`
        }
      });

      // 3. 清理temp目录（如果存在）
      await this.cleanupTempDirectory(taskId);

      // 4. TODO: 停止相关的Docker容器
      // 这需要与Docker API集成或通知Worker进程

      logger.info({
        taskId,
        timeoutMinutes: this.CONTAINER_EXECUTION_TIMEOUT_MINUTES
      }, 'Handled execution timeout task');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to handle execution timeout task');
      throw error;
    }
  }

  /**
   * 清理temp目录
   */
  private async cleanupTempDirectory(taskId: string): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const tempDir = path.join(process.cwd(), 'temp', taskId);

      try {
        await fs.access(tempDir);
        await fs.rmdir(tempDir, { recursive: true });

        logger.info({
          taskId,
          tempDir
        }, 'Cleaned up temp directory');

      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // 目录不存在，无需清理
      }

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup temp directory');
    }
  }

  /**
   * 从Redis清理任务相关记录
   */
  private async cleanupTaskFromRedis(taskId: string): Promise<void> {
    try {
      const redis = await this.getRedisClient();

      // 从active_task_ids移除
      await redis.srem('active_task_ids', taskId);

      // 从task_queue移除（如果存在）
      await redis.lrem('task_queue', 0, taskId);

      logger.debug({
        taskId
      }, 'Cleaned up task from Redis');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup task from Redis');
      throw error;
    }
  }

  /**
   * 手动触发清理（用于测试和管理）
   */
  async triggerManualCleanup(): Promise<{
    queueTimeoutTasks: number;
    executionTimeoutTasks: number;
    orphanedActiveTaskIds: number;
  }> {
    logger.info('Manual cleanup triggered');
    return await this.performCleanup();
  }

  /**
   * 获取清理服务状态
   */
  getServiceStatus(): {
    isRunning: boolean;
    config: {
      queueWaitTimeoutMinutes: number;
      containerExecutionTimeoutMinutes: number;
      cleanupIntervalMinutes: number;
    };
  } {
    return {
      isRunning: this.cleanupInterval !== null,
      config: {
        queueWaitTimeoutMinutes: this.QUEUE_WAIT_TIMEOUT_MINUTES,
        containerExecutionTimeoutMinutes: this.CONTAINER_EXECUTION_TIMEOUT_MINUTES,
        cleanupIntervalMinutes: this.CLEANUP_INTERVAL_MINUTES
      }
    };
  }
}
