import { prisma } from '../utils/database';

export class DataIntegrityService {
  /**
   * 检查任务数据完整性
   */
  static async checkTaskDataIntegrity(taskId: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // 1. 检查表结构是否存在
      const tables = await prisma.table.findMany({
        where: {
          OR: [
            { taskId } as any,
            { taskId: null, isTemplate: true } as any // 基础模板表结构
          ]
        } as any
      });

      if (tables.length === 0) {
        issues.push(`任务 ${taskId} 缺少表结构定义`);
      }

      // 2. 检查数据是否与表结构匹配
      for (const table of tables) {
        const dataCount = await prisma.tableData.count({
          where: {
            taskId,
            tableId: table.id
          }
        });

        const columnsSchema = table.columnsSchema as any;
        if (columnsSchema?.columns) {
          // 检查数据字段是否与表结构匹配
          const sampleData = await prisma.tableData.findFirst({
            where: {
              taskId,
              tableId: table.id
            }
          });

          if (sampleData) {
            const dataFields = Object.keys(sampleData.rowData as any);
            const schemaFields = columnsSchema.columns.map((c: any) => c.name);

            const missingFields = schemaFields.filter((f: string) => !dataFields.includes(f));
            if (missingFields.length > 0) {
              issues.push(`表格 ${table.tableName} 缺少字段: ${missingFields.join(', ')}`);
            }
          }
        }
      }

      // 3. 检查孤立数据
      const orphanedData = await prisma.tableData.findMany({
        where: {
          taskId,
          table: null as any
        }
      });

      if (orphanedData.length > 0) {
        issues.push(`发现 ${orphanedData.length} 条孤立数据记录`);
      }

      // 4. 检查任务状态一致性
      const task = await prisma.task.findUnique({
        where: { id: taskId }
      });

      if (!task) {
        issues.push(`任务 ${taskId} 不存在`);
      } else {
        const dataCount = await prisma.tableData.count({
          where: { taskId }
        });

        if (task.status === 'DRAFT' && dataCount === 0) {
          issues.push(`任务 ${taskId} 状态为DRAFT但没有数据`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      issues.push(`数据完整性检查失败: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isValid: false,
        issues
      };
    }
  }

  /**
   * 修复数据完整性问题
   */
  static async repairDataIntegrity(taskId: string): Promise<{
    success: boolean;
    repairedIssues: string[];
    remainingIssues: string[];
  }> {
    const repairedIssues: string[] = [];
    const remainingIssues: string[] = [];

    try {
      console.log(`🔧 开始修复任务 ${taskId} 的数据完整性问题...`);

      // 1. 清理孤立数据
      const orphanedData = await prisma.tableData.deleteMany({
        where: {
          taskId,
          table: null as any
        }
      });

      if (orphanedData.count > 0) {
        repairedIssues.push(`清理了 ${orphanedData.count} 条孤立数据`);
      }

      // 2. 重新检查完整性
      const finalCheck = await this.checkTaskDataIntegrity(taskId);
      remainingIssues.push(...finalCheck.issues);

      console.log(`✅ 数据完整性修复完成`);

      return {
        success: remainingIssues.length === 0,
        repairedIssues,
        remainingIssues
      };
    } catch (error) {
      console.error(`数据完整性修复失败:`, error);
      return {
        success: false,
        repairedIssues,
        remainingIssues: [`修复失败: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 生成数据完整性报告
   */
  static async generateIntegrityReport(toolType: 'sdc' | 'upf'): Promise<{
    totalTasks: number;
    validTasks: number;
    invalidTasks: number;
    issues: Array<{
      taskId: string;
      issues: string[];
    }>;
  }> {
    try {
      console.log(`📊 生成 ${toolType} 工具的数据完整性报告...`);

      const tasks = await prisma.task.findMany({
        where: {
          toolId: toolType === 'sdc' ? 'sdc-generator' : 'upf-generator'
        },
        select: {
          id: true
        }
      });

      const report = {
        totalTasks: tasks.length,
        validTasks: 0,
        invalidTasks: 0,
        issues: [] as Array<{ taskId: string; issues: string[] }>
      };

      for (const task of tasks) {
        const integrity = await this.checkTaskDataIntegrity(task.id);
        
        if (integrity.isValid) {
          report.validTasks++;
        } else {
          report.invalidTasks++;
          report.issues.push({
            taskId: task.id,
            issues: integrity.issues
          });
        }
      }

      console.log(`✅ 数据完整性报告生成完成`);
      return report;
    } catch (error) {
      console.error(`生成数据完整性报告失败:`, error);
      throw error;
    }
  }
}
