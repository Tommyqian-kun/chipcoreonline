import { prisma } from '../utils/database';
import { TaskStatus } from '@prisma/client';
import logger from '../config/logger';
import { updateTaskStatus } from './task.service';
import { getWebSocketService } from './websocket.service';

/**
 * 任务状态管理器
 * 负责任务状态一致性检查和孤儿任务清理
 */
export class TaskStateManager {
  private reconciliationInterval: NodeJS.Timeout;
  private isReconciling = false;

  constructor() {
    // 每5分钟执行一次状态协调
    this.reconciliationInterval = setInterval(() => {
      this.reconcileTaskStates();
    }, 5 * 60 * 1000);

    logger.info('Task state manager initialized');
  }

  /**
   * 协调任务状态
   * 检查长时间运行的任务和孤儿任务
   */
  async reconcileTaskStates(): Promise<void> {
    if (this.isReconciling) {
      logger.debug('Task state reconciliation already in progress, skipping');
      return;
    }

    this.isReconciling = true;
    const startTime = Date.now();

    try {
      logger.info('Starting task state reconciliation');

      // 1. 检查长时间运行的任务
      await this.checkStuckTasks();

      // 2. 检查孤儿任务（在队列中但数据库状态不匹配）
      await this.checkOrphanTasks();

      // 3. 检查状态不一致的任务
      await this.checkInconsistentTasks();

      const duration = Date.now() - startTime;
      logger.info({ duration }, 'Task state reconciliation completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during task state reconciliation');
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * 检查卡住的任务
   */
  private async checkStuckTasks(): Promise<void> {
    try {
      // 查找超过30分钟仍在运行的任务
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);
      
      const stuckTasks = await prisma.task.findMany({
        where: {
          status: 'RUNNING',
          updatedAt: { lt: stuckThreshold }
        },
        select: {
          id: true,
          userId: true,
          status: true,
          updatedAt: true,
          createdAt: true
        }
      });

      if (stuckTasks.length === 0) {
        logger.debug('No stuck tasks found');
        return;
      }

      logger.warn({ count: stuckTasks.length }, 'Found stuck tasks');

      for (const task of stuckTasks) {
        try {
          // 检查Docker容器状态
          const containerStatus = await this.checkContainerStatus(task.id);
          
          if (!containerStatus.isRunning) {
            // 容器不存在或已停止，更新任务状态为失败
            await updateTaskStatus(task.id, 'FAILED', {
              errorMessage: 'Container not found or stopped unexpectedly',
              failureReason: 'CONTAINER_LOST',
              finishedAt: new Date()
            });

            logger.warn({
              taskId: task.id,
              userId: task.userId,
              stuckDuration: Date.now() - task.updatedAt.getTime()
            }, 'Marked stuck task as failed - container not running');

          } else if (containerStatus.isHealthy === false) {
            // 容器存在但不健康
            await this.handleUnhealthyContainer(task.id, containerStatus);
            
          } else {
            // 容器正常运行，可能是状态更新延迟，延长检查时间
            logger.info({
              taskId: task.id,
              containerStatus
            }, 'Task appears stuck but container is running normally');
          }

        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            taskId: task.id
          }, 'Error checking stuck task');
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error in checkStuckTasks');
    }
  }

  /**
   * 检查孤儿任务
   */
  private async checkOrphanTasks(): Promise<void> {
    try {
      // 查找状态为PENDING但创建时间超过10分钟的任务
      const orphanThreshold = new Date(Date.now() - 10 * 60 * 1000);
      
      const orphanTasks = await prisma.task.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: orphanThreshold }
        },
        select: {
          id: true,
          userId: true,
          createdAt: true
        }
      });

      if (orphanTasks.length === 0) {
        logger.debug('No orphan tasks found');
        return;
      }

      logger.warn({ count: orphanTasks.length }, 'Found potential orphan tasks');

      for (const task of orphanTasks) {
        try {
          // 检查任务是否在Redis队列中
          const isInQueue = await this.checkTaskInQueue(task.id);
          
          if (!isInQueue) {
            // 任务不在队列中，标记为失败
            await updateTaskStatus(task.id, 'FAILED', {
              errorMessage: 'Task was not found in execution queue',
              failureReason: 'QUEUE_LOST',
              finishedAt: new Date()
            });

            logger.warn({
              taskId: task.id,
              userId: task.userId,
              age: Date.now() - task.createdAt.getTime()
            }, 'Marked orphan task as failed - not in queue');
          }

        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            taskId: task.id
          }, 'Error checking orphan task');
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error in checkOrphanTasks');
    }
  }

  /**
   * 检查状态不一致的任务
   */
  private async checkInconsistentTasks(): Promise<void> {
    try {
      // 查找状态为COMPLETED但没有输出文件的任务
      const inconsistentTasks = await prisma.task.findMany({
        where: {
          status: 'COMPLETED',
          outputFile: null,
          updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } // 5分钟前完成的
        },
        select: {
          id: true,
          userId: true,
          status: true,
          outputFile: true,
          updatedAt: true
        }
      });

      if (inconsistentTasks.length === 0) {
        logger.debug('No inconsistent tasks found');
        return;
      }

      logger.warn({ count: inconsistentTasks.length }, 'Found inconsistent tasks');

      for (const task of inconsistentTasks) {
        try {
          // 检查OSS中是否有输出文件
          const hasOutputFiles = await this.checkTaskOutputFiles(task.id);
          
          if (hasOutputFiles) {
            // 有输出文件，更新数据库记录
            await this.updateTaskOutputPath(task.id);
            logger.info({ taskId: task.id }, 'Updated task output path from OSS');
          } else {
            // 没有输出文件，可能任务实际失败了
            await updateTaskStatus(task.id, 'FAILED', {
              errorMessage: 'Task marked as completed but no output files found',
              failureReason: 'MISSING_OUTPUT',
              finishedAt: new Date()
            });
            logger.warn({ taskId: task.id }, 'Marked inconsistent task as failed - no output files');
          }

        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            taskId: task.id
          }, 'Error checking inconsistent task');
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error in checkInconsistentTasks');
    }
  }

  /**
   * 检查Docker容器状态
   */
  private async checkContainerStatus(taskId: string): Promise<{
    isRunning: boolean;
    isHealthy?: boolean;
    containerId?: string;
  }> {
    try {
      // 这里应该调用Docker API检查容器状态
      // 由于当前系统可能没有直接的Docker集成，我们模拟检查
      
      // 在实际实现中，这里应该：
      // 1. 根据taskId查找对应的容器ID
      // 2. 调用Docker API检查容器状态
      // 3. 返回容器的运行状态和健康状态
      
      // 临时实现：假设容器不存在（需要根据实际Docker集成情况调整）
      return {
        isRunning: false,
        isHealthy: false
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId
      }, 'Error checking container status');
      
      return {
        isRunning: false,
        isHealthy: false
      };
    }
  }

  /**
   * 处理不健康的容器
   */
  private async handleUnhealthyContainer(taskId: string, containerStatus: any): Promise<void> {
    logger.warn({
      taskId,
      containerStatus
    }, 'Handling unhealthy container');

    // 可以选择重启容器或标记任务失败
    // 这里选择标记为失败，避免无限重试
    await updateTaskStatus(taskId, 'FAILED', {
      errorMessage: 'Container became unhealthy during execution',
      failureReason: 'CONTAINER_UNHEALTHY',
      finishedAt: new Date()
    });
  }

  /**
   * 检查任务是否在Redis队列中
   */
  private async checkTaskInQueue(taskId: string): Promise<boolean> {
    try {
      // 这里需要访问Redis检查任务是否在队列中
      // 由于Redis连接在其他服务中，这里返回false作为保守处理
      return false;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId
      }, 'Error checking task in queue');
      return false;
    }
  }

  /**
   * 检查任务输出文件
   */
  private async checkTaskOutputFiles(taskId: string): Promise<boolean> {
    try {
      // 这里应该检查OSS中是否有对应的输出文件
      // 临时返回false，需要根据实际OSS集成情况调整
      return false;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId
      }, 'Error checking task output files');
      return false;
    }
  }

  /**
   * 更新任务输出路径
   */
  private async updateTaskOutputPath(taskId: string): Promise<void> {
    try {
      // 注意：不要覆盖Worker已经正确设置的outputFile
      // 这个方法主要用于OSS模式，ECS Only模式下Worker已经正确设置了文件名
      logger.info({
        taskId
      }, 'Skipping outputFile update for ECS Only mode - Worker has already set correct filename');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId
      }, 'Error updating task output path');
    }
  }

  /**
   * 获取状态管理统计信息
   */
  getStats(): {
    isReconciling: boolean;
    lastReconciliation: Date | null;
  } {
    return {
      isReconciling: this.isReconciling,
      lastReconciliation: new Date() // 简化实现
    };
  }

  /**
   * 停止状态管理器
   */
  stop(): void {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
    }
    logger.info('Task state manager stopped');
  }
}

// 单例实例
let taskStateManager: TaskStateManager | null = null;

export const initializeTaskStateManager = (): TaskStateManager => {
  if (!taskStateManager) {
    taskStateManager = new TaskStateManager();
    logger.info('Task state manager initialized');
  }
  return taskStateManager;
};

export const getTaskStateManager = (): TaskStateManager | null => {
  return taskStateManager;
};
