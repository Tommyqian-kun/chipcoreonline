import { prisma } from '../utils/database';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TaskCleanupService {
  /**
   * 安全清理任务数据
   */
  static async safeCleanupTask(taskId: string, toolType: 'sdc' | 'upf'): Promise<void> {
    try {
      console.log(`🧹 开始清理任务 ${taskId} (${toolType})...`);

      // 1. 清理任务数据（所有工具通用）
      const deletedDataCount = await prisma.tableData.deleteMany({
        where: { taskId }
      });
      console.log(`🗑️ 删除了 ${deletedDataCount.count} 条任务数据`);

      // 2. 清理任务特定的表结构（仅UPF需要）
      if (toolType === 'upf') {
        const deletedTableCount = await prisma.table.deleteMany({
          where: {
            taskId,
            isTemplate: false
          } as any
        });
        console.log(`🗑️ 删除了 ${deletedTableCount.count} 个任务表结构`);
      }

      // 3. 清理文件系统中的任务文件
      await this.cleanupTaskFiles(taskId);

      console.log(`✅ 任务 ${taskId} 清理完成`);
    } catch (error) {
      console.error(`❌ 清理任务 ${taskId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 清理任务文件
   */
  private static async cleanupTaskFiles(taskId: string): Promise<void> {
    try {
      const taskDir = path.join(process.cwd(), '../../temp', taskId);
      
      // 检查目录是否存在
      try {
        await fs.access(taskDir);
        await fs.rm(taskDir, { recursive: true, force: true });
        console.log(`🗑️ 删除任务目录: ${taskDir}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`清理任务目录失败: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`清理任务文件失败:`, error);
      // 文件清理失败不应阻止数据库清理
    }
  }

  /**
   * 批量清理过期任务
   */
  static async cleanupExpiredTasks(toolType: 'sdc' | 'upf', daysOld: number = 7): Promise<void> {
    try {
      console.log(`🧹 开始清理 ${daysOld} 天前的 ${toolType} 任务...`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // 查找过期任务
      const expiredTasks = await prisma.task.findMany({
        where: {
          toolId: toolType === 'sdc' ? 'sdc-generator' : 'upf-generator',
          createdAt: {
            lt: cutoffDate
          },
          status: {
            in: ['COMPLETED', 'FAILED', 'CANCELLED']
          }
        },
        select: {
          id: true
        }
      });

      console.log(`发现 ${expiredTasks.length} 个过期任务`);

      // 批量清理
      for (const task of expiredTasks) {
        await this.safeCleanupTask(task.id, toolType);
      }

      console.log(`✅ 过期任务清理完成`);
    } catch (error) {
      console.error(`批量清理过期任务失败:`, error);
      throw error;
    }
  }
}
