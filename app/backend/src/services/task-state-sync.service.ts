import { prisma } from '../utils/database';
import { redisPool } from './redis-pool.service';
import logger from '../config/logger';

/**
 * 任务状态同步服务
 * 确保数据库和Redis状态的一致性
 */
export class TaskStateSyncService {
  private static instance: TaskStateSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 30000; // 30秒同步一次

  private constructor() {}

  public static getInstance(): TaskStateSyncService {
    if (!TaskStateSyncService.instance) {
      TaskStateSyncService.instance = new TaskStateSyncService();
    }
    return TaskStateSyncService.instance;
  }

  /**
   * 启动状态同步服务
   */
  public startSyncService(): void {
    if (this.syncInterval) {
      logger.warn('Task state sync service is already running');
      return;
    }

    logger.info('Starting task state sync service');
    
    this.syncInterval = setInterval(async () => {
      try {
        await this.performStateSync();
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Error during task state sync');
      }
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * 停止状态同步服务
   */
  public stopSyncService(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Stopped task state sync service');
    }
  }

  /**
   * 执行状态同步
   */
  private async performStateSync(): Promise<void> {
    try {
      // 1. 同步Redis和数据库的任务状态
      await this.syncTaskStates();
      
      // 2. 清理孤立的Redis记录
      await this.cleanupOrphanedRedisRecords();
      
      // 3. 修复不一致的状态
      await this.fixInconsistentStates();
      
      logger.debug('Task state sync completed successfully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to perform task state sync');
    }
  }

  /**
   * 同步任务状态
   */
  private async syncTaskStates(): Promise<void> {
    try {
      // 获取Redis中的活跃任务
      const redisClient = redisPool.getClient();
      const activeTaskIds = await redisClient.smembers('active_task_ids');
      const queueTaskIds = await redisClient.lrange('task_queue', 0, -1);
      
      // 获取数据库中的运行中任务
      const runningTasks = await prisma.task.findMany({
        where: {
          status: {
            in: ['PENDING', 'RUNNING']
          }
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          queuedAt: true
        }
      });

      const dbTaskIds = new Set(runningTasks.map(task => task.id));
      const redisTaskIds = new Set([...activeTaskIds, ...queueTaskIds]);

      // 检查不一致的任务
      const inconsistencies = {
        inRedisNotInDb: Array.from(redisTaskIds).filter(id => !dbTaskIds.has(id)),
        inDbNotInRedis: Array.from(dbTaskIds).filter(id => !redisTaskIds.has(id))
      };

      if (inconsistencies.inRedisNotInDb.length > 0) {
        logger.warn({
          taskIds: inconsistencies.inRedisNotInDb
        }, 'Found tasks in Redis but not in database');
        
        // 从Redis中移除这些任务
        for (const taskId of inconsistencies.inRedisNotInDb) {
          await redisClient.srem('active_task_ids', taskId);
          await redisClient.lrem('task_queue', 0, taskId);
        }
      }

      if (inconsistencies.inDbNotInRedis.length > 0) {
        logger.warn({
          taskIds: inconsistencies.inDbNotInRedis
        }, 'Found tasks in database but not in Redis');
        
        // 根据任务状态决定处理方式
        for (const task of runningTasks) {
          if (inconsistencies.inDbNotInRedis.includes(task.id)) {
            if (task.status === 'PENDING') {
              // 重新加入队列
              await redisClient.rpush('task_queue', task.id);
              await redisClient.sadd('active_task_ids', task.id);
              logger.info({ taskId: task.id }, 'Re-queued pending task');
            } else if (task.status === 'RUNNING') {
              // 检查是否超时
              const now = new Date();
              const startTime = task.startedAt || task.queuedAt || new Date();
              const executionMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
              
              if (executionMinutes > 5) { // 超过5分钟认为异常
                await prisma.task.update({
                  where: { id: task.id },
                  data: {
                    status: 'FAILED',
                    finishedAt: now,
                    errorMessage: 'Task lost from Redis queue during execution'
                  }
                });
                logger.warn({ taskId: task.id, executionMinutes }, 'Marked lost running task as failed');
              }
            }
          }
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to sync task states');
    }
  }

  /**
   * 清理孤立的Redis记录
   */
  private async cleanupOrphanedRedisRecords(): Promise<void> {
    try {
      const redisClient = redisPool.getClient();
      
      // 获取所有Redis中的任务ID
      const activeTaskIds = await redisClient.smembers('active_task_ids');
      
      if (activeTaskIds.length === 0) return;

      // 批量查询数据库中的任务
      const existingTasks = await prisma.task.findMany({
        where: {
          id: {
            in: activeTaskIds
          }
        },
        select: {
          id: true,
          status: true
        }
      });

      const existingTaskIds = new Set(existingTasks.map(task => task.id));
      const completedTaskIds = new Set(
        existingTasks
          .filter(task => ['COMPLETED', 'FAILED', 'CANCELLED', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT'].includes(task.status))
          .map(task => task.id)
      );

      // 清理不存在的任务
      const orphanedTaskIds = activeTaskIds.filter(id => !existingTaskIds.has(id));
      for (const taskId of orphanedTaskIds) {
        await redisClient.srem('active_task_ids', taskId);
        await redisClient.lrem('task_queue', 0, taskId);
        logger.info({ taskId }, 'Cleaned up orphaned Redis record');
      }

      // 清理已完成的任务
      for (const taskId of completedTaskIds) {
        await redisClient.srem('active_task_ids', taskId);
        await redisClient.lrem('task_queue', 0, taskId);
        logger.info({ taskId }, 'Cleaned up completed task from Redis');
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup orphaned Redis records');
    }
  }

  /**
   * 修复不一致的状态
   */
  private async fixInconsistentStates(): Promise<void> {
    try {
      // 查找长时间处于PENDING状态的任务
      const stuckPendingTasks = await prisma.task.findMany({
        where: {
          status: 'PENDING',
          queuedAt: {
            lt: new Date(Date.now() - 10 * 60 * 1000) // 10分钟前
          }
        },
        select: {
          id: true,
          queuedAt: true
        }
      });

      for (const task of stuckPendingTasks) {
        const redisClient = redisPool.getClient();
        const isInQueue = await redisClient.lpos('task_queue', task.id);
        const isInActiveSet = await redisClient.sismember('active_task_ids', task.id);

        if (isInQueue === null && !isInActiveSet) {
          // 任务不在Redis中，重新加入队列
          await redisClient.rpush('task_queue', task.id);
          await redisClient.sadd('active_task_ids', task.id);
          logger.info({ taskId: task.id }, 'Re-queued stuck pending task');
        }
      }

      // 查找长时间处于RUNNING状态的任务
      const stuckRunningTasks = await prisma.task.findMany({
        where: {
          status: 'RUNNING',
          startedAt: {
            lt: new Date(Date.now() - 10 * 60 * 1000) // 10分钟前
          }
        },
        select: {
          id: true,
          startedAt: true
        }
      });

      for (const task of stuckRunningTasks) {
        // 标记为失败
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: 'Task stuck in RUNNING state for too long'
          }
        });

        // 从Redis中清理
        const redisClient = redisPool.getClient();
        await redisClient.srem('active_task_ids', task.id);
        await redisClient.lrem('task_queue', 0, task.id);
        
        logger.warn({ taskId: task.id }, 'Marked stuck running task as failed');
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to fix inconsistent states');
    }
  }

  /**
   * 手动触发状态同步
   */
  public async triggerManualSync(): Promise<{
    syncedTasks: number;
    cleanedOrphans: number;
    fixedInconsistencies: number;
  }> {
    logger.info('Manual task state sync triggered');
    
    try {
      await this.performStateSync();
      
      // 获取同步结果统计
      const redisClient = redisPool.getClient();
      const queueLength = await redisClient.llen('task_queue');
      const activeTasksCount = await redisClient.scard('active_task_ids');
      
      const runningTasksCount = await prisma.task.count({
        where: {
          status: {
            in: ['PENDING', 'RUNNING']
          }
        }
      });

      return {
        syncedTasks: runningTasksCount,
        cleanedOrphans: 0, // 这里可以添加具体的统计
        fixedInconsistencies: 0 // 这里可以添加具体的统计
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to perform manual sync');
      throw error;
    }
  }

  /**
   * 获取同步服务状态
   */
  public getServiceStatus(): {
    isRunning: boolean;
    syncIntervalMs: number;
    lastSyncTime?: Date;
  } {
    return {
      isRunning: this.syncInterval !== null,
      syncIntervalMs: this.SYNC_INTERVAL_MS,
      lastSyncTime: new Date() // 这里可以记录实际的最后同步时间
    };
  }
}

// 导出单例实例
export const taskStateSync = TaskStateSyncService.getInstance();
