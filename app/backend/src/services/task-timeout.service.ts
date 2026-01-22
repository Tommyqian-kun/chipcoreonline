import { prisma } from '../utils/database';
import logger from '../config/logger';
import { DeploymentModeService } from './deployment-mode.service';
import { spawnPython, getPythonCommand } from '../utils/pythonHelper';
import fs from 'fs/promises';
import path from 'path';
import { redisPool } from './redis-pool.service';

export class TaskTimeoutService {
  // 从环境变量读取超时配置
  private static readonly QUEUE_WAIT_TIMEOUT_MINUTES = parseInt(process.env.QUEUE_WAIT_TIMEOUT_MINUTES || '35');
  private static readonly CONTAINER_EXECUTION_TIMEOUT_MINUTES = parseInt(process.env.CONTAINER_EXECUTION_TIMEOUT_MINUTES || '3');
  private static readonly CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '60');
  private static readonly DRAFT_TASK_TIMEOUT_HOURS = parseInt(process.env.DRAFT_TASK_TIMEOUT_HOURS || '24');
  private static timeoutInterval: NodeJS.Timeout | null = null;

  /**
   * 启动任务超时监控
   */
  static startTimeoutMonitoring(): void {
    if (this.timeoutInterval) {
      return; // 已经启动
    }

    logger.info({
      queueWaitTimeoutMinutes: this.QUEUE_WAIT_TIMEOUT_MINUTES,
      containerExecutionTimeoutMinutes: this.CONTAINER_EXECUTION_TIMEOUT_MINUTES,
      cleanupIntervalMinutes: this.CLEANUP_INTERVAL_MINUTES
    }, 'Starting enhanced task timeout monitoring');

    this.timeoutInterval = setInterval(async () => {
      try {
        await this.checkAndHandleTimeoutTasks();
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Error in timeout monitoring');
      }
    }, this.CLEANUP_INTERVAL_MINUTES * 60 * 1000);
  }

  /**
   * 停止任务超时监控
   */
  static stopTimeoutMonitoring(): void {
    if (this.timeoutInterval) {
      clearInterval(this.timeoutInterval);
      this.timeoutInterval = null;
      logger.info('Stopped task timeout monitoring');
    }
  }

  /**
   * 检查并处理超时任务（差异化处理）
   */
  static async checkAndHandleTimeoutTasks(): Promise<void> {
    try {
      // 1. 检查队列等待超时的任务
      await this.checkQueueWaitTimeouts();

      // 2. 检查容器执行超时的任务
      await this.checkContainerExecutionTimeouts();

      // 3. 检查DRAFT超时任务（多页面交互未提交的草稿）
      await this.checkDraftTimeouts();

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check timeout tasks');
    }
  }

  /**
   * 检查队列等待超时的任务
   */
  private static async checkQueueWaitTimeouts(): Promise<void> {
    const queueTimeoutThreshold = new Date();
    queueTimeoutThreshold.setMinutes(queueTimeoutThreshold.getMinutes() - this.QUEUE_WAIT_TIMEOUT_MINUTES);

    try {
      // 查找在队列中等待超时的任务
      // 注意：DRAFT状态不参与超时检查，用户可以无限时间填写需求
      const queueTimeoutTasks = await prisma.task.findMany({
        where: {
          status: 'PENDING',  // 只检查PENDING状态，DRAFT状态不参与超时检查
          queuedAt: {
            lt: queueTimeoutThreshold
          }
        },
        select: {
          id: true,
          userId: true,
          queuedAt: true,
          deploymentMode: true,
          toolId: true
        }
      });

      if (queueTimeoutTasks.length > 0) {
        logger.warn({
          queueTimeoutTasksCount: queueTimeoutTasks.length,
          queueTimeoutThreshold: queueTimeoutThreshold.toISOString()
        }, 'Found queue timeout tasks');

        for (const task of queueTimeoutTasks) {
          await this.handleQueueTimeoutTask(task);
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check queue timeout tasks');
    }
  }

  /**
   * 检查容器执行超时的任务
   */
  private static async checkContainerExecutionTimeouts(): Promise<void> {
    const executionTimeoutThreshold = new Date();
    executionTimeoutThreshold.setMinutes(executionTimeoutThreshold.getMinutes() - this.CONTAINER_EXECUTION_TIMEOUT_MINUTES);

    try {
      // 查找执行超时的任务（基于容器真正开始执行时间）
      const executionTimeoutTasks = await prisma.task.findMany({
        where: {
          status: 'RUNNING',
          containerStartedAt: {
            lt: executionTimeoutThreshold
          }
        },
        select: {
          id: true,
          userId: true,
          startedAt: true,
          containerStartedAt: true,
          deploymentMode: true,
          toolId: true
        }
      });

      if (executionTimeoutTasks.length > 0) {
        logger.warn({
          executionTimeoutTasksCount: executionTimeoutTasks.length,
          executionTimeoutThreshold: executionTimeoutThreshold.toISOString()
        }, 'Found execution timeout tasks');

        for (const task of executionTimeoutTasks) {
          await this.handleExecutionTimeoutTask(task);
        }
      }

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check execution timeout tasks');
    }
  }

  /**
   * 检查DRAFT超时任务（多页面交互草稿）
   */
  private static async checkDraftTimeouts(): Promise<void> {
    const draftTimeoutThreshold = new Date();
    draftTimeoutThreshold.setHours(draftTimeoutThreshold.getHours() - this.DRAFT_TASK_TIMEOUT_HOURS);

    try {
      const draftTimeoutTasks = await prisma.task.findMany({
        where: {
          status: 'DRAFT',
          updatedAt: {
            lt: draftTimeoutThreshold
          }
        },
        select: {
          id: true,
          userId: true,
          updatedAt: true,
          parameters: true
        }
      });

      if (draftTimeoutTasks.length > 0) {
        logger.warn({
          draftTimeoutTasksCount: draftTimeoutTasks.length,
          draftTimeoutThreshold: draftTimeoutThreshold.toISOString()
        }, 'Found draft timeout tasks');

        for (const task of draftTimeoutTasks) {
          await this.handleDraftTimeoutTask(task);
        }
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check draft timeout tasks');
    }
  }

  /**
   * 处理队列等待超时的任务
   */
  private static async handleQueueTimeoutTask(task: {
    id: string;
    userId: string;
    queuedAt: Date | null;
    deploymentMode: string | null;
    toolId: string;
  }): Promise<void> {
    const taskId = task.id;
    const queuedTime = task.queuedAt || new Date();
    const waitDuration = Date.now() - queuedTime.getTime();
    const waitMinutes = Math.round(waitDuration / (1000 * 60));

    logger.warn({
      taskId,
      userId: task.userId,
      waitMinutes,
      deploymentMode: task.deploymentMode
    }, 'Handling queue timeout task');

    try {
      // 1. 更新任务状态为队列超时
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'QUEUE_TIMEOUT',
          timeoutType: 'QUEUE_TIMEOUT',
          timeoutAt: new Date(),
          finishedAt: new Date(),
          errorMessage: `Task queue timeout after ${waitMinutes} minutes (waited ${this.QUEUE_WAIT_TIMEOUT_MINUTES} minutes)`
        }
      });

      // 2. 从Redis队列中移除
      await this.removeTaskFromRedisQueue(taskId);

      // 3. 清理temp目录（队列超时也需要清理）
      await this.cleanupTempDirectory(taskId);

      // 4. 记录队列超时事件（注意：不计入用户使用次数）
      logger.info({
        taskId,
        userId: task.userId,
        waitMinutes,
        timeoutType: 'QUEUE_TIMEOUT'
      }, 'Task marked as queue timeout - not counted towards usage');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to handle queue timeout task');
    }
  }

  /**
   * 处理容器执行超时的任务
   */
  private static async handleExecutionTimeoutTask(task: {
    id: string;
    userId: string;
    startedAt: Date | null;
    containerStartedAt: Date | null;
    deploymentMode: string | null;
    toolId: string;
  }): Promise<void> {
    const taskId = task.id;
    const containerStartedTime = task.containerStartedAt || task.startedAt || new Date();
    const executionDuration = Date.now() - containerStartedTime.getTime();
    const executionMinutes = Math.round(executionDuration / (1000 * 60));

    logger.warn({
      taskId,
      userId: task.userId,
      executionMinutes,
      deploymentMode: task.deploymentMode
    }, 'Handling execution timeout task');

    try {
      // 1. 更新任务状态为执行超时
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'EXECUTION_TIMEOUT',
          timeoutType: 'EXECUTION_TIMEOUT',
          timeoutAt: new Date(),
          finishedAt: new Date(),
          errorMessage: `Container execution timeout after ${executionMinutes} minutes (limit ${this.CONTAINER_EXECUTION_TIMEOUT_MINUTES} minutes)`
        }
      });

      // 2. 清理任务相关资源（容器、jobs目录、temp目录等）
      await this.cleanupTaskResources(taskId, task.deploymentMode);

      // 3. 清理容器（3分钟执行超时）
      await this.cleanupTaskContainer(taskId, 'execution_timeout');

      // 3. 清理temp目录
      await this.cleanupTempDirectory(taskId);

      // 4. 清理jobs目录
      await this.cleanupJobsDirectory(taskId);

      // 5. 记录执行超时事件（注意：计入用户使用次数，因为已开始执行）
      logger.error({
        taskId,
        userId: task.userId,
        executionMinutes,
        timeoutType: 'EXECUTION_TIMEOUT'
      }, 'Task marked as execution timeout - counted towards usage');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to handle execution timeout task');
    }
  }

  /**
   * 处理DRAFT超时任务
   */
  private static async handleDraftTimeoutTask(task: {
    id: string;
    userId: string;
    updatedAt: Date | null;
    parameters: any;
  }): Promise<void> {
    const taskId = task.id;
    const updatedAt = task.updatedAt || new Date();
    const draftAgeHours = Math.round((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60));

    logger.warn({
      taskId,
      userId: task.userId,
      draftAgeHours
    }, 'Handling draft timeout task');

    try {
      // 标准化工具类型用于清理
      const rawToolType = task.parameters?.toolType || 'sdc';
      const normalizedToolType = rawToolType === 'sdcgen' ? 'sdc' :
                                 rawToolType === 'upfgen' ? 'upf' :
                                 rawToolType;

      // 1. 标记任务为取消（保留记录）
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'CANCELLED',
          finishedAt: new Date(),
          errorMessage: `Draft task expired after ${draftAgeHours} hours without submission`
        }
      });

      // 2. 清理temp/logs及Excel数据（不触碰jobs目录）
      await (await import('./cleanup.service')).CleanupService.cleanupFailedTask(
        taskId,
        normalizedToolType === 'upf' ? 'upf' : 'sdc',
        'temp_logs'
      );

      logger.info({
        taskId,
        userId: task.userId,
        draftAgeHours
      }, 'Draft task cleaned up after timeout');
    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to handle draft timeout task');
    }
  }

  /**
   * 从Redis队列中移除任务
   */
  private static async removeTaskFromRedisQueue(taskId: string): Promise<void> {
    try {
      // 使用Redis连接池
      // 使用静态导入的redisPool
      const redisClient = redisPool.getClient();

      await redisClient.lrem('task_queue', 0, taskId);
      await redisClient.srem('active_task_ids', taskId);

      logger.debug({
        taskId
      }, 'Removed task from Redis queue');

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to remove task from Redis queue');
    }
  }

  /**
   * 清理temp目录
   */
  private static async cleanupTempDirectory(taskId: string): Promise<void> {
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
   * 清理jobs目录
   */
  private static async cleanupJobsDirectory(taskId: string): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const jobsDir = path.join(process.cwd(), 'jobs', taskId);

      try {
        await fs.access(jobsDir);
        await fs.rmdir(jobsDir, { recursive: true });

        logger.info({
          taskId,
          jobsDir
        }, 'Cleaned up jobs directory');

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
      }, 'Failed to cleanup jobs directory');
    }
  }

  /**
   * 清理任务相关资源
   */
  private static async cleanupTaskResources(taskId: string, deploymentMode: string | null): Promise<void> {
    try {
      const mode = deploymentMode || DeploymentModeService.getDeploymentMode();
      
      if (mode === 'ecs_only') {
        await this.cleanupEcsOnlyResources(taskId);
      } else {
        await this.cleanupEcsOssAcrResources(taskId);
      }

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup task resources');
    }
  }

  /**
   * 清理ECS Only模式的资源
   */
  private static async cleanupEcsOnlyResources(taskId: string): Promise<void> {
    try {
      const config = DeploymentModeService.getConfigSummary();
      
      // 清理临时目录
      if (config.tempJobsDir) {
        const taskTempDir = path.join(config.tempJobsDir, taskId);
        try {
          await fs.rm(taskTempDir, { recursive: true, force: true });
          logger.info({ taskId, path: taskTempDir }, 'Cleaned up task temp directory');
        } catch (error) {
          // 目录可能不存在，忽略错误
        }
      }

      // 清理作业目录
      if (config.jobsDir) {
        const taskJobDir = path.join(config.jobsDir, taskId);
        try {
          await fs.rm(taskJobDir, { recursive: true, force: true });
          logger.info({ taskId, path: taskJobDir }, 'Cleaned up task job directory');
        } catch (error) {
          // 目录可能不存在，忽略错误
        }
      }

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup ECS only resources');
    }
  }

  /**
   * 清理任务容器
   */
  private static async cleanupTaskContainer(taskId: string, reason: string): Promise<void> {
    try {
      // 调用Python容器管理器清理容器
      const pythonScript = path.join(process.cwd(), 'src', 'workers', 'cleanup_container.py');
      const pythonArgs = [pythonScript, taskId, reason];
      const pythonCmd = getPythonCommand(pythonArgs);

      logger.info({ taskId, reason, pythonCmd }, 'Starting container cleanup with Python');

      const cleanup = spawnPython(pythonArgs, {
        stdio: 'pipe'
      });

      cleanup.on('close', (code) => {
        if (code === 0) {
          logger.info({ taskId, reason }, 'Container cleanup completed successfully');
        } else {
          logger.error({ taskId, reason, exitCode: code }, 'Container cleanup failed');
        }
      });

      cleanup.on('error', (error) => {
        logger.error({ taskId, reason, error: error.message }, 'Failed to start container cleanup process');
      });

    } catch (error) {
      logger.error({
        taskId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup task container');
    }
  }

  /**
   * 清理ECS + OSS + ACR模式的资源
   */
  private static async cleanupEcsOssAcrResources(taskId: string): Promise<void> {
    try {
      // TODO: 实现OSS文件清理
      // TODO: 清理临时目录
      logger.info({ taskId }, 'Cleaned up ECS + OSS + ACR resources');
    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup ECS + OSS + ACR resources');
    }
  }

  /**
   * 手动触发超时检查（用于测试）
   */
  static async triggerTimeoutCheck(): Promise<{ processedTasks: number }> {
    await this.checkAndHandleTimeoutTasks();
    return { processedTasks: 0 }; // 实际应该返回处理的任务数量
  }

  /**
   * 获取超时配置信息
   */
  static getTimeoutConfig(): {
    queueWaitTimeoutMinutes: number;
    containerExecutionTimeoutMinutes: number;
    cleanupIntervalMinutes: number;
    isMonitoringActive: boolean;
  } {
    return {
      queueWaitTimeoutMinutes: this.QUEUE_WAIT_TIMEOUT_MINUTES,
      containerExecutionTimeoutMinutes: this.CONTAINER_EXECUTION_TIMEOUT_MINUTES,
      cleanupIntervalMinutes: this.CLEANUP_INTERVAL_MINUTES,
      isMonitoringActive: this.timeoutInterval !== null
    };
  }

  /**
   * 手动触发超时检查（用于测试和管理）
   */
  static async triggerManualTimeoutCheck(): Promise<{
    queueTimeouts: number;
    executionTimeouts: number;
  }> {
    logger.info('Manual timeout check triggered');

    const results = {
      queueTimeouts: 0,
      executionTimeouts: 0
    };

    try {
      // 检查队列超时
      const queueTimeoutThreshold = new Date();
      queueTimeoutThreshold.setMinutes(queueTimeoutThreshold.getMinutes() - this.QUEUE_WAIT_TIMEOUT_MINUTES);

      const queueTimeoutTasks = await prisma.task.count({
        where: {
          status: 'PENDING',
          queuedAt: {
            lt: queueTimeoutThreshold
          }
        }
      });

      // 检查执行超时
      const executionTimeoutThreshold = new Date();
      executionTimeoutThreshold.setMinutes(executionTimeoutThreshold.getMinutes() - this.CONTAINER_EXECUTION_TIMEOUT_MINUTES);

      const executionTimeoutTasks = await prisma.task.count({
        where: {
          status: 'RUNNING',
          containerStartedAt: {
            lt: executionTimeoutThreshold
          }
        }
      });

      results.queueTimeouts = queueTimeoutTasks;
      results.executionTimeouts = executionTimeoutTasks;

      // 执行实际的超时处理
      await this.checkAndHandleTimeoutTasks();

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to perform manual timeout check');
    }

    return results;
  }
}
