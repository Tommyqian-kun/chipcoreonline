import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';
import { ECS_LOCAL_PATHS } from '../config/paths';

const prisma = new PrismaClient();

export class TaskConsistencyService {
  /**
   * 检查并修复任务状态不一致问题
   */
  static async checkAndFixInconsistentTasks(): Promise<{
    checkedTasks: number;
    fixedTasks: number;
    issues: Array<{
      taskId: string;
      issue: string;
      action: string;
    }>;
  }> {
    const result = {
      checkedTasks: 0,
      fixedTasks: 0,
      issues: [] as Array<{
        taskId: string;
        issue: string;
        action: string;
      }>
    };

    try {
      // 查找所有RUNNING状态的任务
      const runningTasks = await prisma.task.findMany({
        where: {
          status: 'RUNNING'
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          createdAt: true,
          deploymentMode: true
        }
      });

      result.checkedTasks = runningTasks.length;

      for (const task of runningTasks) {
        const issues = await this.checkTaskConsistency(task.id);
        
        if (issues.length > 0) {
          // 发现不一致问题，尝试修复
          const fixed = await this.fixTaskInconsistency(task.id, issues);
          if (fixed) {
            result.fixedTasks++;
          }
          
          result.issues.push(...issues.map(issue => ({
            taskId: task.id,
            issue: issue.description,
            action: issue.action
          })));
        }
      }

      logger.info({
        checkedTasks: result.checkedTasks,
        fixedTasks: result.fixedTasks,
        issuesFound: result.issues.length
      }, 'Task consistency check completed');

      return result;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check task consistency');
      throw error;
    }
  }

  /**
   * 检查单个任务的一致性
   */
  private static async checkTaskConsistency(taskId: string): Promise<Array<{
    type: string;
    description: string;
    action: string;
  }>> {
    const issues = [];

    try {
      // 1. 检查jobs目录是否存在
      const jobsDir = path.join(process.cwd(), 'jobs', taskId);
      const jobsDirExists = fs.existsSync(jobsDir);

      // 2. 检查Docker容器是否存在
      const containerExists = await this.checkContainerExists(taskId);

      // 3. 检查任务执行时间
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          startedAt: true,
          status: true
        }
      });

      if (!task) {
        issues.push({
          type: 'TASK_NOT_FOUND',
          description: 'Task not found in database',
          action: 'SKIP'
        });
        return issues;
      }

      // 检查执行时间是否超时（3分钟）
      if (task.startedAt) {
        const executionTime = Date.now() - task.startedAt.getTime();
        const timeoutMs = 3 * 60 * 1000; // 3分钟

        if (executionTime > timeoutMs) {
          issues.push({
            type: 'EXECUTION_TIMEOUT',
            description: `Task execution timeout (${Math.round(executionTime / 1000)}s > 180s)`,
            action: 'MARK_FAILED'
          });
        }
      }

      // 检查目录和容器状态不一致
      if (!jobsDirExists && !containerExists) {
        issues.push({
          type: 'ZOMBIE_TASK',
          description: 'Task marked as RUNNING but no jobs directory or container exists',
          action: 'MARK_FAILED'
        });
      }

      return issues;

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check task consistency');
      return [];
    }
  }

  /**
   * 检查Docker容器是否存在
   */
  private static async checkContainerExists(taskId: string): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(`docker ps -q --filter "name=tool-${taskId}"`);
      return stdout.trim().length > 0;

    } catch (error) {
      logger.debug({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check container existence');
      return false;
    }
  }

  /**
   * 修复任务不一致问题
   */
  private static async fixTaskInconsistency(taskId: string, issues: Array<{
    type: string;
    description: string;
    action: string;
  }>): Promise<boolean> {
    try {
      let shouldMarkFailed = false;
      let errorMessage = '';

      for (const issue of issues) {
        if (issue.action === 'MARK_FAILED') {
          shouldMarkFailed = true;
          errorMessage = issue.description;
          break;
        }
      }

      if (shouldMarkFailed) {
        // 更新任务状态为FAILED
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: `Task consistency check: ${errorMessage}`
          }
        });

        // 清理相关资源
        await this.cleanupTaskResources(taskId);

        logger.info({
          taskId,
          errorMessage
        }, 'Fixed inconsistent task by marking as FAILED');

        return true;
      }

      return false;

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to fix task inconsistency');
      return false;
    }
  }

  /**
   * 清理任务相关资源
   */
  private static async cleanupTaskResources(taskId: string): Promise<void> {
    try {
      // 清理jobs目录
      const jobsDir = path.join(process.cwd(), 'jobs', taskId);
      if (fs.existsSync(jobsDir)) {
        await fs.promises.rmdir(jobsDir, { recursive: true });
        logger.debug({ taskId }, 'Cleaned up jobs directory');
      }

      // 清理temp目录
      const tempDir = path.join(process.cwd(), 'temp', taskId);
      if (fs.existsSync(tempDir)) {
        await fs.promises.rmdir(tempDir, { recursive: true });
        logger.debug({ taskId }, 'Cleaned up temp directory');
      }

      // 尝试停止相关容器
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        await execAsync(`docker stop $(docker ps -q --filter "name=tool-${taskId}") 2>/dev/null || true`);
        logger.debug({ taskId }, 'Attempted to stop related containers');
      } catch (error) {
        // 忽略容器停止错误
      }

    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup task resources');
    }
  }

  /**
   * 启动定期一致性检查
   */
  static startPeriodicConsistencyCheck(intervalMinutes: number = 5): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    logger.info({
      intervalMinutes
    }, 'Starting periodic task consistency check');

    return setInterval(async () => {
      try {
        await this.checkAndFixInconsistentTasks();
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Periodic consistency check failed');
      }
    }, intervalMs);
  }
}
