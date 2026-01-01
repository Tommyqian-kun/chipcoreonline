import { prisma } from '../utils/database';
import { userConcurrentCheck } from './user-concurrent-check.service';
import logger from '../config/logger';
import { TaskStatus } from '@prisma/client';

/**
 * 用户并发槽位TTL自动刷新服务
 *
 * 功能：
 * - 定期检查正在运行的任务
 * - 自动刷新这些任务所属用户的并发槽位TTL
 * - 防止长时间运行的任务导致槽位过期
 */
export class UserConcurrentRefreshService {
  private static refreshInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * 启动自动刷新服务
   *
   * @param intervalMinutes 刷新间隔（分钟），默认15分钟
   */
  static startRefreshService(intervalMinutes: number = 15): void {
    if (this.refreshInterval) {
      logger.warn('User concurrent refresh service already running');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.refreshInterval = setInterval(async () => {
      await this.performRefresh();
    }, intervalMs);

    logger.info({
      intervalMinutes,
      intervalMs
    }, 'User concurrent TTL refresh service started');

    // 启动时立即执行一次刷新
    setTimeout(() => this.performRefresh(), 5000); // 5秒后执行第一次
  }

  /**
   * 停止刷新服务
   */
  static stopRefreshService(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('User concurrent TTL refresh service stopped');
    }
  }

  /**
   * 执行刷新操作
   */
  private static async performRefresh(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Refresh operation already running, skipping this cycle');
      return;
    }

    this.isRunning = true;

    try {
      // 查找所有正在运行或等待中的任务
      const activeTasks = await prisma.task.findMany({
        where: {
          status: { in: [TaskStatus.DRAFT, TaskStatus.PENDING, TaskStatus.RUNNING] }
        },
        select: {
          id: true,
          userId: true,
          status: true,
          createdAt: true,
          startedAt: true
        },
        distinct: ['userId'] // 按用户去重
      });

      if (activeTasks.length === 0) {
        logger.debug('No active tasks found, skipping TTL refresh');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // 为每个有活跃任务的用户刷新槽位TTL
      for (const task of activeTasks) {
        try {
          await userConcurrentCheck.refreshSlotTTL(task.userId);
          successCount++;

          logger.debug({
            userId: task.userId,
            taskId: task.id,
            taskStatus: task.status
          }, 'Refreshed user concurrent slot TTL');
        } catch (error) {
          errorCount++;
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: task.userId,
            taskId: task.id
          }, 'Failed to refresh user concurrent slot TTL');
        }
      }

      logger.info({
        totalUsers: activeTasks.length,
        successCount,
        errorCount
      }, 'User concurrent TTL refresh cycle completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during user concurrent TTL refresh');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 手动触发刷新操作（用于测试或紧急情况）
   */
  static async triggerManualRefresh(): Promise<{
    totalUsers: number;
    successCount: number;
    errorCount: number;
  }> {
    logger.info('Manual user concurrent TTL refresh triggered');

    try {
      const activeTasks = await prisma.task.findMany({
        where: {
          status: { in: [TaskStatus.DRAFT, TaskStatus.PENDING, TaskStatus.RUNNING] }
        },
        select: {
          id: true,
          userId: true,
          status: true
        },
        distinct: ['userId']
      });

      let successCount = 0;
      let errorCount = 0;

      for (const task of activeTasks) {
        try {
          await userConcurrentCheck.refreshSlotTTL(task.userId);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: task.userId
          }, 'Failed to refresh slot TTL in manual refresh');
        }
      }

      const result = {
        totalUsers: activeTasks.length,
        successCount,
        errorCount
      };

      logger.info(result, 'Manual user concurrent TTL refresh completed');

      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during manual user concurrent TTL refresh');

      return {
        totalUsers: 0,
        successCount: 0,
        errorCount: 1
      };
    }
  }

  /**
   * 获取刷新服务状态
   */
  static getServiceStatus(): {
    isRunning: boolean;
    isOperationInProgress: boolean;
    intervalActive: boolean;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      isOperationInProgress: this.isRunning,
      intervalActive: this.refreshInterval !== null
    };
  }
}
