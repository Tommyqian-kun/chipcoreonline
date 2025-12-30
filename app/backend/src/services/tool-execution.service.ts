/**
 * 工具执行服务
 * 统一管理工具执行流程，支持多种部署模式和工具类型
 */

import { prisma } from '../utils/database';
import { toolTypeManager } from '../config/tool-types.config';
import { ToolMappingService } from './tool-mapping.service';
import { DeploymentModeService } from './deployment-mode.service';
import { EcsLocalStorageService } from './ecs-local-storage.service';
import { CrossPlatformPaths } from '../utils/cross-platform-paths';
import { getOssClient, validateOssConfig } from '../utils/oss';
import logger from '../config/logger';

export interface ToolExecutionContext {
  taskId: string;
  userId: string;
  toolId: string;
  actualToolId: string;
  tool: any;
  toolType: string;
  moduleName: string;
  parameters: any;
  inputFiles?: Express.Multer.File[];
  deploymentMode: 'ecs_only' | 'ecs_oss_acr';
}

export interface ToolExecutionResult {
  success: boolean;
  taskId: string;
  inputFilePaths: string[];
  error?: string;
}

export class ToolExecutionService {
  /**
   * 准备工具执行上下文
   */
  static async prepareExecutionContext(
    toolId: string,
    parameters: string,
    userId: string,
    inputFiles?: Express.Multer.File[]
  ): Promise<ToolExecutionContext> {
    // 解析参数
    const parsedParams = JSON.parse(parameters || '{}');
    const moduleName = parsedParams.modName || 'default_module';

    // 处理工具ID映射
    let actualToolId = toolId;
    if (!toolId.startsWith('c')) { // CUID通常以c开头
      const mappedId = await ToolMappingService.getToolIdByFrontendName(toolId);
      if (mappedId) {
        actualToolId = mappedId;
      }
    }

    // 获取工具信息
    const tool = await prisma.tool.findUnique({ where: { id: actualToolId } });
    if (!tool) {
      throw new Error('Tool not found.');
    }

    // 确定工具类型
    let toolType = (tool as any).toolType || parsedParams.toolType;
    if (!toolType) {
      toolType = toolTypeManager.inferToolTypeFromToolId(toolId);
      if (!toolType) {
        toolType = 'sdcgen'; // 默认值
      }
    }

    // 验证工具类型
    if (!toolTypeManager.isToolTypeSupported(toolType)) {
      throw new Error(`Tool type '${toolType}' is not supported`);
    }

    // 获取部署模式
    const deploymentMode = DeploymentModeService.getDeploymentMode();

    return {
      taskId: '', // 将在调用方设置
      userId,
      toolId,
      actualToolId,
      tool,
      toolType,
      moduleName,
      parameters: parsedParams,
      inputFiles,
      deploymentMode
    };
  }

  /**
   * 验证工具执行前置条件
   */
  static async validateExecutionPreconditions(context: ToolExecutionContext): Promise<void> {
    // 验证工具类型配置
    const toolConfig = toolTypeManager.getToolTypeConfig(context.toolType);
    if (!toolConfig) {
      throw new Error(`Tool type configuration not found: ${context.toolType}`);
    }

    // 验证输入文件
    if (context.inputFiles && context.inputFiles.length > 0) {
      const fileNames = context.inputFiles.map(f => f.originalname);
      const validation = toolTypeManager.validateFilesForToolType(context.toolType, fileNames);
      
      if (!validation.valid) {
        const errors = [
          ...validation.missingFiles.map(f => `Missing required file: ${f}`),
          ...validation.invalidFiles.map(f => `Invalid file: ${f}`)
        ];
        throw new Error(`File validation failed: ${errors.join(', ')}`);
      }
    }

    // 验证工具参数
    await this.validateToolParameters(context);
  }

  /**
   * 验证工具参数
   */
  private static async validateToolParameters(context: ToolExecutionContext): Promise<void> {
    const { tool, parameters, toolType } = context;
    
    // 基本参数验证
    if (!parameters.modName) {
      throw new Error('Module name (modName) is required');
    }

    // 工具特定参数验证
    const toolConfig = toolTypeManager.getToolTypeConfig(toolType);
    if (toolConfig && toolConfig.requiredFiles) {
      // 可以在这里添加更多工具特定的参数验证逻辑
    }

    logger.info({
      taskId: context.taskId,
      toolType,
      parametersCount: Object.keys(parameters).length
    }, 'Tool parameters validated');
  }

  /**
   * 处理文件上传（根据部署模式）
   */
  static async handleFileUpload(
    context: ToolExecutionContext,
    taskId: string
  ): Promise<string[]> {
    const { deploymentMode, inputFiles, moduleName, toolType } = context;
    let inputFilePaths: string[] = [];

    if (deploymentMode === 'ecs_only') {
      // ECS Only模式：确保目录结构完整性
      logger.info({
        taskId,
        moduleName,
        toolType,
        filesCount: inputFiles?.length || 0
      }, 'Starting ECS Only file upload process');

      // 1. 首先创建完整的任务目录结构（确保目录存在）
      await EcsLocalStorageService.createTaskDirectories(taskId, moduleName, toolType);

      // 2. 保存文件到本地input目录
      if (inputFiles && inputFiles.length > 0) {
        inputFilePaths = await EcsLocalStorageService.saveUploadedFiles(taskId, inputFiles);

        // 3. 复制文件到工具特定目录
        await EcsLocalStorageService.copyInputFilesToToolDir(taskId, moduleName, toolType);

        // 4. 创建任务元数据
        await EcsLocalStorageService.createTaskMetadata(taskId, {
          taskId,
          userId: context.userId,
          toolId: context.actualToolId,
          moduleName,
          toolType,
          createdAt: new Date().toISOString(),
          deploymentMode: 'ecs_only',
          inputFilesCount: inputFiles.length,
          inputFileNames: inputFiles.map(f => f.originalname)
        });

        logger.info({
          taskId,
          inputFilePaths,
          moduleName,
          toolType
        }, 'ECS Only file upload completed successfully');
      } else {
        logger.warn({
          taskId,
          moduleName,
          toolType
        }, 'No input files provided for ECS Only task');
      }
    } else {
      // ECS+OSS+ACR模式：上传到OSS
      if (inputFiles && inputFiles.length > 0) {
        // 验证OSS配置
        if (!validateOssConfig()) {
          console.warn('⚠️ OSS configuration invalid, using local storage for development');
          // 在开发环境中，可以选择跳过OSS上传或使用本地存储
          if (process.env.NODE_ENV === 'development') {
            // 开发环境：记录文件信息但不实际上传
            for (const file of inputFiles) {
              const objectName = `dev-local/${context.userId}/${taskId}/inputs/${file.originalname}`;
              inputFilePaths.push(objectName);
              console.log(`📁 [DEV] Would upload file: ${objectName} (${file.size} bytes)`);
            }
          } else {
            throw new Error('OSS configuration is required in production environment');
          }
        } else {
          // 生产环境：实际上传到OSS
          const bucketName = process.env.OSS_BUCKET_USER_INPUT as string;
          const ossClient = getOssClient(bucketName);

          for (const file of inputFiles) {
            try {
              const objectName = `${context.userId}/${taskId}/inputs/${file.originalname}`;
              await ossClient.put(objectName, file.buffer);
              inputFilePaths.push(objectName);
              console.log(`✅ File uploaded to OSS: ${objectName}`);
            } catch (error) {
              console.error(`❌ Failed to upload file ${file.originalname}:`, error);
              throw new Error(`Failed to upload file ${file.originalname} to OSS`);
            }
          }
        }
      }
    }

    logger.info({
      taskId,
      deploymentMode,
      filesCount: inputFilePaths.length,
      toolType
    }, 'File upload completed');

    return inputFilePaths;
  }

  /**
   * 构建任务参数
   */
  static buildTaskParameters(
    context: ToolExecutionContext,
    inputFilePaths: string[],
    userPermissionType: string
  ): any {
    const { parameters, moduleName, toolType, userId, taskId } = context;

    return {
      ...parameters,
      // 配置文件相关信息
      moduleName,
      toolType,
      inputFilesDirectory: `${userId}/${taskId}/inputs`,
      outputDirectory: `${userId}/${taskId}/outputs`,
      logDirectory: `${userId}/${taskId}/logs`,
      inputFilesList: inputFilePaths,
      // 用户权限信息
      userPermissionType,
      // 工具特定环境变量
      toolEnvironmentVariables: toolTypeManager.getToolTypeConfig(toolType)?.environmentVariables || {}
    };
  }

  /**
   * 验证路径安全性
   */
  static validatePathSecurity(basePath: string, targetPath: string): boolean {
    return CrossPlatformPaths.isSafePath(targetPath, basePath);
  }

  /**
   * 获取工具执行统计信息
   */
  static async getExecutionStats(): Promise<{
    totalTasks: number;
    tasksByType: Record<string, number>;
    tasksByDeploymentMode: Record<string, number>;
  }> {
    const tasks = await prisma.task.findMany({
      select: {
        parameters: true,
        deploymentMode: true
      }
    });

    const stats = {
      totalTasks: tasks.length,
      tasksByType: {} as Record<string, number>,
      tasksByDeploymentMode: {} as Record<string, number>
    };

    tasks.forEach(task => {
      const params = task.parameters as any;
      const toolType = params?.toolType || 'unknown';
      const deploymentMode = task.deploymentMode || 'ecs_only';

      stats.tasksByType[toolType] = (stats.tasksByType[toolType] || 0) + 1;
      stats.tasksByDeploymentMode[deploymentMode] = (stats.tasksByDeploymentMode[deploymentMode] || 0) + 1;
    });

    return stats;
  }

  /**
   * 清理过期的任务数据
   */
  static async cleanupExpiredTasks(retentionDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredTasks = await prisma.task.findMany({
      where: {
        createdAt: {
          lt: cutoffDate
        },
        status: {
          in: ['COMPLETED', 'FAILED', 'CANCELLED']
        }
      },
      select: { id: true, deploymentMode: true }
    });

    let cleanedCount = 0;

    for (const task of expiredTasks) {
      try {
        if (task.deploymentMode === 'ecs_only') {
          // 清理ECS本地文件
          await this.cleanupEcsLocalFiles(task.id);
        } else {
          // 清理OSS文件
          await this.cleanupOssFiles(task.id);
        }
        cleanedCount++;
      } catch (error) {
        logger.error({
          taskId: task.id,
          error: (error as Error).message
        }, 'Failed to cleanup task data');
      }
    }

    logger.info({
      retentionDays,
      expiredTasksCount: expiredTasks.length,
      cleanedCount
    }, 'Task cleanup completed');

    return cleanedCount;
  }

  /**
   * 清理ECS本地文件
   */
  private static async cleanupEcsLocalFiles(taskId: string): Promise<void> {
    try {
      const { ECS_LOCAL_PATHS } = await import('../config/paths');
      const taskDir = ECS_LOCAL_PATHS.getTaskDir(taskId);
      if (CrossPlatformPaths.exists(taskDir)) {
        const fs = await import('fs');
        await fs.promises.rmdir(taskDir, { recursive: true });
        logger.info({ taskId }, 'ECS local files cleaned up');
      }
    } catch (error) {
      logger.error({ taskId, error: (error as Error).message }, 'Failed to cleanup ECS local files');
      throw error;
    }
  }

  /**
   * 清理OSS文件
   */
  private static async cleanupOssFiles(taskId: string): Promise<void> {
    try {
      // 获取任务信息以确定文件路径
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          userId: true,
          outputFile: true,
          logFile: true,
          parameters: true
        }
      });

      if (!task) {
        logger.warn({ taskId }, 'Task not found for OSS cleanup');
        return;
      }

      const { getOssClient } = await import('../utils/oss');

      // 清理输出文件
      if (task.outputFile) {
        try {
          const outputBucket = process.env.OSS_BUCKET_JOB_RESULTS as string;
          const ossClient = getOssClient(outputBucket);
          await ossClient.delete(task.outputFile);
          logger.info({ taskId, file: task.outputFile }, 'OSS output file deleted');
        } catch (error) {
          logger.warn({ taskId, file: task.outputFile, error }, 'Failed to delete OSS output file');
        }
      }

      // 清理日志文件
      if (task.logFile) {
        try {
          const logBucket = process.env.OSS_BUCKET_JOB_LOGS as string;
          const ossClient = getOssClient(logBucket);
          await ossClient.delete(task.logFile);
          logger.info({ taskId, file: task.logFile }, 'OSS log file deleted');
        } catch (error) {
          logger.warn({ taskId, file: task.logFile, error }, 'Failed to delete OSS log file');
        }
      }

      // 清理输入文件
      const params = task.parameters as any;
      if (params?.inputFilesList && Array.isArray(params.inputFilesList)) {
        try {
          const inputBucket = process.env.OSS_BUCKET_USER_INPUT as string;
          const ossClient = getOssClient(inputBucket);

          for (const inputFile of params.inputFilesList) {
            try {
              await ossClient.delete(inputFile);
              logger.info({ taskId, file: inputFile }, 'OSS input file deleted');
            } catch (error) {
              logger.warn({ taskId, file: inputFile, error }, 'Failed to delete OSS input file');
            }
          }
        } catch (error) {
          logger.warn({ taskId, error }, 'Failed to cleanup OSS input files');
        }
      }

      logger.info({ taskId }, 'OSS files cleanup completed');
    } catch (error) {
      logger.error({ taskId, error: (error as Error).message }, 'Failed to cleanup OSS files');
      throw error;
    }
  }
}
