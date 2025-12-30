import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DeploymentModeService } from './deployment-mode.service';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * 任务日志清理服务
 * 基于数据库任务状态智能清理日志目录
 *
 * 清理策略：
 * - 正常完成任务：2分钟下载期结束后由CleanupService精确清理，不在此处理
 * - 失败/出错任务：保留24小时用于问题分析
 * - 僵尸任务：PENDING超过48小时或RUNNING超过6小时
 */
export class TaskLogCleanupService {
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static readonly CLEANUP_INTERVAL_HOURS = 2; // 每2小时执行一次
  private static readonly LOGS_BASE_DIR = process.env.TASK_LOGS_DIR || path.join(process.cwd(), '../../logs');

  /**
   * 启动日志清理服务
   */
  static startLogCleanupService(): void {
    if (this.cleanupInterval) {
      logger.warn('Task log cleanup service already running');
      return;
    }

    const intervalMs = this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000; // 转换为毫秒

    this.cleanupInterval = setInterval(() => {
      this.performLogCleanup();
    }, intervalMs);

    logger.info({
      intervalHours: this.CLEANUP_INTERVAL_HOURS,
      intervalMs,
      logsBaseDir: this.LOGS_BASE_DIR
    }, 'Task log cleanup service started');

    // 启动时立即执行一次清理
    setTimeout(() => {
      this.performLogCleanup();
    }, 5000); // 5秒后执行，避免启动时的资源竞争
  }

  /**
   * 停止日志清理服务
   */
  static stopLogCleanupService(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Task log cleanup service stopped');
    }
  }

  /**
   * 执行日志清理操作
   */
  private static async performLogCleanup(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Log cleanup already running, skipping this cycle');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('Starting task log cleanup process');

      const result = await this.cleanupTaskLogs();

      logger.info({
        cleanedLogs: result.cleanedCount,
        preservedLogs: result.preservedCount,
        totalProcessed: result.totalProcessed,
        freedSpaceBytes: result.freedSpaceBytes
      }, 'Task log cleanup completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to perform log cleanup');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 清理任务日志
   */
  private static async cleanupTaskLogs(): Promise<{
    cleanedCount: number;
    preservedCount: number;
    totalProcessed: number;
    freedSpaceBytes: number;
  }> {
    const result = {
      cleanedCount: 0,
      preservedCount: 0,
      totalProcessed: 0,
      freedSpaceBytes: 0
    };

    try {
      // 检查logs目录是否存在
      if (!await this.directoryExists(this.LOGS_BASE_DIR)) {
        logger.debug('Logs directory does not exist, skipping cleanup');
        return result;
      }

      // 获取所有日志目录（按任务ID命名）
      const logDirs = await fs.readdir(this.LOGS_BASE_DIR, { withFileTypes: true });
      const taskLogDirs = logDirs.filter(dir => dir.isDirectory());

      for (const dir of taskLogDirs) {
        const taskId = dir.name;
        const logDirPath = path.join(this.LOGS_BASE_DIR, taskId);

        try {
          result.totalProcessed++;

          // 检查任务状态决定是否清理
          const shouldCleanup = await this.shouldCleanupTaskLog(taskId);

          if (shouldCleanup.cleanup) {
            // 计算目录大小
            const dirSize = await this.getDirectorySize(logDirPath);
            
            // 删除日志目录
            await fs.rm(logDirPath, { recursive: true, force: true });
            
            result.cleanedCount++;
            result.freedSpaceBytes += dirSize;

            logger.info({
              taskId,
              reason: shouldCleanup.reason,
              sizeBytes: dirSize,
              logDirPath
            }, 'Cleaned up task log directory');

          } else {
            result.preservedCount++;
            
            logger.debug({
              taskId,
              reason: shouldCleanup.reason
            }, 'Preserved task log directory');
          }

        } catch (error) {
          logger.error({
            taskId,
            logDirPath,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to process task log directory');
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to read logs directory');
    }

    return result;
  }

  /**
   * 判断是否应该清理任务日志
   * 注意：已完成且已清理的任务（cleanedAt不为空）不重复清理
   */
  private static async shouldCleanupTaskLog(taskId: string): Promise<{
    cleanup: boolean;
    reason: string;
  }> {
    try {
      // 查询任务状态
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          finishedAt: true,
          cleanedAt: true, // 检查是否已清理
          retryCount: true,
          maxRetries: true
        }
      });

      if (!task) {
        // 任务不存在，可能已被删除，清理日志
        return {
          cleanup: true,
          reason: 'TASK_NOT_FOUND'
        };
      }

      // 如果已经清理过，不再清理（由CleanupService的精确清理处理）
      if (task.cleanedAt) {
        return {
          cleanup: false,
          reason: 'ALREADY_CLEANED_BY_PRECISE_CLEANUP'
        };
      }

      const now = new Date();
      const logRetentionHours = DeploymentModeService.getLogRetentionHours(); // 使用配置服务

      // 情况1：任务已完成且已过24小时日志保留期
      if (task.status === 'COMPLETED') {
        if (task.finishedAt) {
          const hoursSinceFinished = (now.getTime() - task.finishedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFinished > logRetentionHours) {
            return {
              cleanup: true,
              reason: `TASK_COMPLETED_${logRetentionHours}H_EXPIRED`
            };
          }
        } else {
          // 没有完成时间但状态是完成，检查创建时间
          const hoursSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceCreated > logRetentionHours) {
            return {
              cleanup: true,
              reason: `TASK_COMPLETED_${logRetentionHours}H_NO_FINISH_TIME`
            };
          }
        }
      }

      // 情况2：任务失败，且超过24小时（用于问题分析）
      if (task.status === 'FAILED') {
        if (task.finishedAt) {
          const hoursSinceFinished = (now.getTime() - task.finishedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFinished > logRetentionHours) {
            return {
              cleanup: true,
              reason: `TASK_FAILED_${logRetentionHours}H_EXPIRED`
            };
          }
        } else {
          // 没有完成时间，检查创建时间
          const hoursSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceCreated > logRetentionHours) {
            return {
              cleanup: true,
              reason: `TASK_FAILED_${logRetentionHours}H_NO_FINISH_TIME`
            };
          }
        }
      }

      // 情况3：任务已取消，且超过24小时
      if (task.status === 'CANCELLED') {
        if (task.finishedAt) {
          const hoursSinceFinished = (now.getTime() - task.finishedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFinished > logRetentionHours) {
            return {
              cleanup: true,
              reason: `TASK_CANCELLED_${logRetentionHours}H_EXPIRED`
            };
          }
        }
      }

      // 情况4：任务重试次数已达上限且超过12小时
      if (task.retryCount >= task.maxRetries) {
        const hoursSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreated > 12) {
          return {
            cleanup: true,
            reason: 'MAX_RETRIES_EXCEEDED_12H'
          };
        }
      }

      // 情况5：任务创建超过7天（无论状态）
      const daysSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated > 7) {
        return {
          cleanup: true,
          reason: 'TASK_OLDER_THAN_7_DAYS'
        };
      }

      // 情况6：PENDING状态超过48小时（可能是僵尸任务）
      if (task.status === 'PENDING') {
        const hoursSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreated > 48) {
          return {
            cleanup: true,
            reason: 'PENDING_TASK_48H_TIMEOUT'
          };
        }
      }

      // 情况7：RUNNING状态超过6小时（可能是卡住的任务）
      if (task.status === 'RUNNING') {
        const hoursSinceCreated = (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreated > 6) {
          return {
            cleanup: true,
            reason: 'RUNNING_TASK_6H_TIMEOUT'
          };
        }
      }

      // 默认保留日志
      return {
        cleanup: false,
        reason: `TASK_${task.status}_ACTIVE`
      };

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check task status for log cleanup');

      // 出错时保守处理，不清理
      return {
        cleanup: false,
        reason: 'ERROR_CHECKING_TASK_STATUS'
      };
    }
  }

  /**
   * 检查目录是否存在
   */
  private static async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 计算目录大小
   */
  private static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else if (item.isFile()) {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      logger.debug({
        dirPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to calculate directory size');
    }

    return totalSize;
  }

  /**
   * 手动触发日志清理（用于测试或管理）
   */
  static async manualCleanup(): Promise<void> {
    logger.info('Manual task log cleanup triggered');
    await this.performLogCleanup();
  }

  /**
   * 获取日志清理统计信息
   */
  static async getCleanupStats(): Promise<{
    totalLogDirs: number;
    totalLogSize: number;
    oldestLogDate: Date | null;
    newestLogDate: Date | null;
  }> {
    const stats = {
      totalLogDirs: 0,
      totalLogSize: 0,
      oldestLogDate: null as Date | null,
      newestLogDate: null as Date | null
    };

    try {
      if (!await this.directoryExists(this.LOGS_BASE_DIR)) {
        return stats;
      }

      const logDirs = await fs.readdir(this.LOGS_BASE_DIR, { withFileTypes: true });
      const taskLogDirs = logDirs.filter(dir => dir.isDirectory());

      stats.totalLogDirs = taskLogDirs.length;

      for (const dir of taskLogDirs) {
        const logDirPath = path.join(this.LOGS_BASE_DIR, dir.name);
        
        // 计算大小
        stats.totalLogSize += await this.getDirectorySize(logDirPath);

        // 获取创建时间
        const dirStats = await fs.stat(logDirPath);
        const createTime = dirStats.birthtime;

        if (!stats.oldestLogDate || createTime < stats.oldestLogDate) {
          stats.oldestLogDate = createTime;
        }

        if (!stats.newestLogDate || createTime > stats.newestLogDate) {
          stats.newestLogDate = createTime;
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get cleanup stats');
    }

    return stats;
  }
}
