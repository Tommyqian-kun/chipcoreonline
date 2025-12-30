/**
 * SDC工具多页面交互控制器
 * 处理初始化、数据保存、数据检查等业务逻辑
 */

import { Request, Response } from 'express';
import { PrismaClient, TaskStatus } from '@prisma/client';
import { ExcelThrpagesService } from '../services/excel_thrpages.service';
import { TaskCleanupService } from '../services/task-cleanup.service';
import { spawn } from 'child_process';
import { spawnPython, getPythonCommand } from '../utils/pythonHelper';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis';
import { DeploymentModeService } from '../services/deployment-mode.service';
import { initializeTaskLogger, logToTaskFile, logErrorToTaskFile, cleanupTaskLogger } from '../utils/task-logger';
import { createOperationLogger } from '../utils/operation-logger';
import { CleanupService } from '../services/cleanup.service';

const prisma = new PrismaClient();

// 不再需要创建uploads目录，因为使用内存存储直接保存到目标目录

/**
 * 初始化多页面交互任务
 */
export const initializeTask = async (req: Request, res: Response) => {
  // TaskLogger变量，需要在整个函数中使用
  let taskLogger: any = null;
  let taskId: string = '';
  let task: any = null; // 存储task对象以便在外部访问

  try {
    const { modName, isFlat } = req.body;
    const userId = req.user?.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // 提前验证用户和文件
    if (!userId) {
      return res.status(401).json({ error: '用户未认证' });
    }

    if (!files?.hierYamlFile?.[0] || !files?.vlogFile?.[0]) {
      return res.status(400).json({ error: '必须上传hier.yaml和vlog.v文件' });
    }

    // 检查Redis队列上限
    const queueLength = await redisClient.llen('task_queue');
    const maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE || '48');

    if (queueLength >= maxQueueSize) {
      return res.status(429).json({
        error: '由于目前任务比较多，请稍后再使用',
        queueLength,
        maxQueueSize
      });
    }

    // 创建任务ID
    taskId = uuidv4();

    // 初始化日志文件
    taskLogger = await initializeTaskLogger(taskId, 'SDC');

    // 使用runWithInterceptedConsole包装整个业务逻辑，捕获所有console输出
    await taskLogger.runWithInterceptedConsole(async () => {
      console.log('🚀 [SDC-THRPAGES] 初始化任务开始');
      console.log('📋 [SDC-THRPAGES] 请求参数:', { userId, modName, isFlat });
      console.log('📁 [SDC-THRPAGES] 上传文件:', files ? Object.keys(files) : 'no files');
      if (files) {
        Object.entries(files).forEach(([key, fileArray]) => {
          fileArray.forEach((file, index) => {
            console.log(`📄 [SDC-THRPAGES] 文件 ${key}[${index}]:`, {
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype
            });
          });
        });
      }

      console.log('✅ [SDC-THRPAGES] 文件上传验证通过');
      console.log('📊 [SDC-THRPAGES] 队列状态:', { queueLength, maxQueueSize });
      console.log('🆔 [SDC-THRPAGES] 生成任务ID:', taskId);

      // 使用环境变量创建正确的目录路径
      const tempUploadDir = process.env.TEMP_UPLOAD_DIR!;
      const taskLogsDir = process.env.TASK_LOGS_DIR!;
      console.log('📂 [SDC-THRPAGES] 环境变量目录:', { tempUploadDir, taskLogsDir });

      const taskDir = path.join(tempUploadDir, taskId);
      const logsDir = path.join(taskLogsDir, taskId);
      console.log('📁 [SDC-THRPAGES] 任务目录:', { taskDir, logsDir });

      // 创建temp和logs目录 - 设置权限为777以确保容器内用户可写入
      await fsPromises.mkdir(taskDir, { recursive: true });
      await fsPromises.mkdir(logsDir, { recursive: true, mode: 0o777 });
      // 如果日志目录已存在，也需要设置权限
      try {
        await fsPromises.chmod(logsDir, 0o777);
      } catch (error) {
        console.error('⚠️ 无法设置日志目录权限:', error);
      }
      console.log('✅ [SDC-THRPAGES] 目录创建成功');

      // 获取或创建SDC工具信息
      console.log('🔍 [SDC-THRPAGES] 查找SDC工具...');

      // 先查看数据库中所有工具
      const allTools = await prisma.tool.findMany({
        select: { id: true, name: true, toolType: true }
      });
      console.log('📋 [SDC-THRPAGES] 数据库中的所有工具:', allTools);

      // 尝试多种可能的SDC工具名称
      let tool = await prisma.tool.findFirst({
        where: {
          OR: [
            { name: 'SDC Generator' },
            { name: 'sdc-generator' },
            { toolType: 'sdc' },
            { toolType: 'sdcgen' }
          ]
        }
      });

      if (!tool) {
        console.log('🔧 [SDC-THRPAGES] SDC工具未找到，正在创建...');
        tool = await prisma.tool.create({
          data: {
            name: 'SDC Generator',
            toolType: 'sdcgen',
            description: 'System Design Constraints Generator Tool',
            version: '1.0.0',
            dockerImage: 'logiccore/sdc-generator:latest',
            inputSchema: {
              type: 'object',
              properties: {
                modName: { type: 'string' },
                isFlat: { type: 'boolean' }
              }
            }
          }
        });
        console.log('✅ [SDC-THRPAGES] SDC工具创建成功:', tool.id);
      } else {
        console.log('✅ [SDC-THRPAGES] SDC工具找到:', { id: tool.id, name: tool.name, toolType: tool.toolType });
      }

      // 创建任务数据库记录
      console.log('💾 [SDC-THRPAGES] 创建任务数据库记录...');
      task = await prisma.task.create({
        data: {
          id: taskId,
          userId,
          toolId: tool.id,
          status: 'DRAFT' as TaskStatus,
          parameters: {
            modName,
            isFlat,
            toolType: 'sdcgen',
            isMultiPage: true,
            pageMethod: 'multi'
          },
          deploymentMode: 'ecs_only',
          localStoragePath: taskDir
        }
      });
      console.log('✅ [SDC-THRPAGES] 任务数据库记录创建成功');

      // 直接保存上传的文件到任务目录
      const hierYamlPath = path.join(taskDir, 'hier.yaml');
      const vlogPath = path.join(taskDir, 'vlog.v');
      console.log('💾 [SDC-THRPAGES] 保存上传文件:', { hierYamlPath, vlogPath });

      await fsPromises.writeFile(hierYamlPath, files.hierYamlFile[0].buffer);
      await fsPromises.writeFile(vlogPath, files.vlogFile[0].buffer);
      console.log('✅ [SDC-THRPAGES] 文件保存成功');

      // 调用sdc_dg_gen.py生成dcont.xlsx
      const dcontPath = path.join(taskDir, 'dcont.xlsx');
      const pythonScript = path.join(process.cwd(), 'src/tools/sdc_dg_gen.py');
      console.log('🐍 [SDC-THRPAGES] 准备执行Python脚本:', {
        pythonScript,
        dcontPath,
        taskId: task.id
      });

      await new Promise<void>((resolve, reject) => {
        const pythonArgs = [
          pythonScript,
          'sdc_dg_gen',
          '-taskid',
          task.id,
          '-dg'
        ];
        const pythonCmd = getPythonCommand(pythonArgs);
        console.log('🐍 [SDC-THRPAGES] Python命令:', pythonCmd);

        const pythonProcess = spawnPython(pythonArgs, {
          env: {
            ...process.env,
            ECS_TEMPLATES_DIR: process.env.ECS_TEMPLATES_DIR,
            TEMP_UPLOAD_DIR: process.env.TEMP_UPLOAD_DIR,
            TASK_LOGS_DIR: process.env.TASK_LOGS_DIR,
            CURRENT_TASK_ID: task.id
          },
          cwd: process.cwd()
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout?.on('data', (data: any) => {
          const output = data.toString();
          stdout += output;
          console.log('🐍 [SDC-THRPAGES] Python stdout:', output.trim());
        });

        pythonProcess.stderr?.on('data', (data: any) => {
          const output = data.toString();
          stderr += output;
          console.log('🐍 [SDC-THRPAGES] Python stderr:', output.trim());
        });

        pythonProcess.on('close', (code: number) => {
          console.log(`🐍 [SDC-THRPAGES] Python脚本执行完成，退出码: ${code}`);
          if (code === 0) {
            console.log('✅ [SDC-THRPAGES] sdc_dg_gen.py执行成功:', stdout);
            resolve();
          } else {
            console.error('❌ [SDC-THRPAGES] sdc_dg_gen.py执行失败:', stderr || stdout);
            reject(new Error(`Python脚本执行失败: ${stderr || stdout}`));
          }
        });
      });

      // 检查dcont.xlsx文件是否生成
      console.log('📄 [SDC-THRPAGES] 检查dcont.xlsx文件是否生成:', dcontPath);
      try {
        await fsPromises.access(dcontPath);
        console.log('✅ [SDC-THRPAGES] dcont.xlsx文件存在');
      } catch (error) {
        console.error('❌ [SDC-THRPAGES] dcont.xlsx文件不存在:', error);
        throw new Error('dcont.xlsx文件生成失败');
      }

      // 确保数据库表结构已初始化
      console.log('🔧 [SDC-THRPAGES] 检查数据库表结构...');
      const existingSheets = await prisma.sheet.findMany({
        where: { toolType: 'sdc' }
      });

      if (existingSheets.length === 0) {
        console.log('🔧 [SDC-THRPAGES] 数据库表结构不存在，正在初始化...');
        await ExcelThrpagesService.initializeSdcDatabaseSchemaHardcoded();
        console.log('✅ [SDC-THRPAGES] 数据库表结构初始化完成');
      } else {
        console.log('✅ [SDC-THRPAGES] 数据库表结构已存在');
      }

      // 解析生成的dcont.xlsx文件并更新数据库
      console.log('📊 [SDC-THRPAGES] 开始解析Excel文件...');
      await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, dcontPath);
      console.log('✅ [SDC-THRPAGES] Excel文件解析完成');

      // 验证Excel ↔ 数据库数据一致性
      console.log('🔍 [SDC-THRPAGES] 开始验证Excel ↔ 数据库数据一致性...');
      const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
        task.id,
        userId,
        dcontPath
      );

      if (!validation.isConsistent) {
        console.error('❌ [SDC-THRPAGES] Excel ↔ 数据库数据不一致:', validation.differences);
        console.log('=== 数据验证失败详情开始 ===');
        validation.differences.forEach((diff, index) => {
          console.log(`[${index + 1}/${validation.differences.length}] ${JSON.stringify(diff, null, 2)}`);
        });
        console.log('=== 数据验证失败详情结束 ===');

        throw new Error(`数据验证失败: 发现 ${validation.differences.length} 处不一致`);
      }
      console.log('✅ [SDC-THRPAGES] Excel ↔ 数据库数据验证通过');
    });

    // 清理task logger
    if (taskLogger) {
      taskLogger.cleanup();
      cleanupTaskLogger(taskId);
    }

    res.json({
      success: true,
      message: '任务初始化成功',
      taskId: taskId,
      data: {
        taskId: taskId,
        modName,
        isFlat,
        status: 'DRAFT' as TaskStatus,
        createdAt: task?.createdAt || new Date()
      }
    });

  } catch (error) {
    if (taskLogger) {
      console.error('初始化任务失败:', error);
      taskLogger.logError('初始化任务失败', error);
      taskLogger.cleanup();
      cleanupTaskLogger(taskId);
    }
    res.status(500).json({
      error: '初始化任务失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 获取任务的所有sheet信息
 */
export const getTaskSheets = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!task) {
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    // 获取所有sheet信息
    const sheets = await prisma.sheet.findMany({
      where: { toolType: 'sdc' },
      include: {
        tables: {
          select: {
            id: true,
            tableName: true,
            displayOrder: true
          },
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { displayOrder: 'asc' }
    });

    res.json({
      success: true,
      data: {
        taskId,
        sheets: sheets.map(sheet => ({
          sheet_id: sheet.id,
          sheet_name: sheet.sheetName,
          display_order: sheet.displayOrder,
          tables: sheet.tables
        }))
      }
    });

  } catch (error) {
    console.error('获取sheet信息失败:', error);
    res.status(500).json({ 
      error: '获取sheet信息失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 获取指定sheet的表格数据
 */
export const getSheetData = async (req: Request, res: Response) => {
  try {
    const { taskId, sheetName } = req.params;
    const userId = req.user?.id;

    console.log(`📋 [GET-SHEET-DATA] 开始获取sheet数据:`, { taskId, sheetName, userId });

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!task) {
      console.error(`❌ [GET-SHEET-DATA] 任务未找到:`, { taskId, userId });
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    console.log(`✅ [GET-SHEET-DATA] 任务验证通过:`, { taskId, toolId: task.toolId });

    // 获取sheet数据
    const sheetData = await ExcelThrpagesService.getTaskDataBySheet(taskId, sheetName);

    console.log(`📊 [GET-SHEET-DATA] 查询结果:`, {
      taskId,
      sheetName,
      resultCount: sheetData.length,
      firstResult: sheetData[0] ? {
        sheet_name: sheetData[0].sheet_name,
        tablesCount: sheetData[0].tables?.length
      } : null
    });

    if (sheetData.length === 0) {
      console.error(`❌ [GET-SHEET-DATA] Sheet数据未找到:`, { taskId, sheetName });
      return res.status(404).json({ error: `Sheet ${sheetName} 未找到` });
    }

    console.log(`✅ [GET-SHEET-DATA] 数据返回成功:`, { taskId, sheetName });



    res.json({
      success: true,
      data: sheetData[0]
    });

  } catch (error) {
    console.error(`❌ [GET-SHEET-DATA] 获取sheet数据失败:`, { taskId: req.params.taskId, sheetName: req.params.sheetName, error });
    res.status(500).json({
      error: '获取sheet数据失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 保存指定sheet的表格数据
 */
export const saveSheetData = async (req: Request, res: Response) => {
  try {
    const { taskId, sheetName } = req.params;
    const { tables } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: '用户未认证' });
    }

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!task) {
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    // 保存数据
    await ExcelThrpagesService.saveTableData(taskId, userId, sheetName, tables);

    res.json({
      success: true,
      message: `${sheetName} sheet数据保存成功`,
      data: {
        taskId,
        sheetName,
        tablesCount: tables.length,
        savedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('保存sheet数据失败:', error);
    res.status(500).json({
      error: '保存sheet数据失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 检查任务数据
 */
export const checkTaskData = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    console.log(`🔍 [CHECK-TASK-DATA] 开始检查任务数据:`, { taskId, userId });

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!task) {
      console.error(`❌ [CHECK-TASK-DATA] 任务未找到:`, { taskId, userId });
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    console.log(`✅ [CHECK-TASK-DATA] 任务验证通过:`, { taskId, toolId: task.toolId });

    const taskDir = path.join(process.cwd(), 'temp', taskId);
    const dcontPath = path.join(taskDir, 'dcont.xlsx');

    // 1. 将数据库数据同步到dcont.xlsx文件
    await ExcelThrpagesService.syncDatabaseToExcel(taskId, dcontPath);

    // 2. 生成JSON格式文件
    await ExcelThrpagesService.generateJsonFiles(taskId, taskDir);

    // 3. 调用sdc_dg_chk.py脚本检查数据
    const pythonScript = path.join(process.cwd(), 'app/backend/src/tools/sdc_dg_chk.py');

    const checkResult = await new Promise<{ success: boolean; message: string; details?: string }>((resolve) => {
      const pythonArgs = [pythonScript];
      const pythonCmd = getPythonCommand(pythonArgs);
      console.log('🐍 [CHECK-TASK-DATA] Python命令:', pythonCmd);

      const pythonProcess = spawnPython(pythonArgs, {
        env: {
          ...process.env,
          TASK_ID: taskId,
          DCONT_FILE: dcontPath,
          CURRENT_TASK_ID: taskId  // 设置当前任务ID环境变量，避免使用default_task
        },
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout?.on('data', (data: any) => {
        stdout += data.toString();
      });

      pythonProcess.stderr?.on('data', (data: any) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          console.log('sdc_dg_chk.py执行成功:', stdout);
          resolve({
            success: true,
            message: '数据检查通过',
            details: stdout
          });
        } else {
          console.error('sdc_dg_chk.py执行失败:', stderr);
          resolve({
            success: false,
            message: '数据检查失败',
            details: stderr
          });
        }
      });
    });

    res.json({
      success: checkResult.success,
      message: checkResult.message,
      data: {
        taskId,
        checkPassed: checkResult.success,
        details: checkResult.details,
        checkedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('检查任务数据失败:', error);
    res.status(500).json({
      error: '检查任务数据失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 提交任务执行
 */
export const submitTask = async (req: Request, res: Response) => {
  let operationLogger: any = null;
  let queueLength: number = 0; // 在外部定义以便在res.json中访问

  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    // 创建操作日志记录器
    operationLogger = createOperationLogger(taskId, 'submission');

    // 使用runWithInterceptedConsole包装业务逻辑，捕获console输出
    await operationLogger.runWithInterceptedConsole(async () => {
      operationLogger.stepStart('INIT', `开始SDC工具任务提交: 任务=${taskId}, 用户=${userId}`);

      // 验证任务权限
      operationLogger.stepStart('AUTH', '验证任务权限');
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId }
      });

      if (!task) {
        operationLogger.stepFailed('AUTH', '任务未找到或无权限访问');
        return res.status(404).json({ error: '任务未找到或无权限访问' });
      }

      operationLogger.stepComplete('AUTH', '任务权限验证通过');

      // 将任务加入Redis队列
      operationLogger.stepStart('QUEUE', '将任务加入Redis队列');
      operationLogger.info(`队列名称: task_queue`);
      console.log(`🔄 [SDC-THRPAGES] 将任务加入Redis队列:`, { taskId, queueName: 'task_queue' });
      await redisClient.rpush('task_queue', taskId);

      // 验证任务是否成功入队
      queueLength = await redisClient.llen('task_queue');
      operationLogger.stepComplete('QUEUE', `任务入队成功，当前队列长度: ${queueLength}`);
      console.log(`✅ [SDC-THRPAGES] 任务入队成功:`, { taskId, currentQueueLength: queueLength });

      // 更新任务状态
      operationLogger.stepStart('STATUS', '更新任务状态为PENDING');
      console.log(`📝 [SDC-THRPAGES] 更新任务状态为PENDING:`, { taskId });
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'PENDING' as TaskStatus,
          queuedAt: new Date()
        }
      });
      operationLogger.stepComplete('STATUS', '任务状态更新完成');
      console.log(`✅ [SDC-THRPAGES] 任务状态更新完成:`, { taskId, status: 'PENDING' });
    });

    // 记录操作完成
    operationLogger.complete(true, '任务提交完成，已加入执行队列');

    res.json({
      success: true,
      message: '任务已提交执行',
      data: {
        taskId,
        status: 'PENDING',
        submittedAt: new Date().toISOString(),
        queueLength,
        logPath: operationLogger?.getLogFilePath()
      }
    });

  } catch (error) {
    // 记录操作失败
    if (operationLogger) {
      operationLogger.complete(false, `任务提交失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }

    console.error('提交任务失败:', error);
    res.status(500).json({
      error: '提交任务失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 获取任务状态
 */
export const getTaskStatus = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        tool: {
          select: {
            name: true,
            description: true
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    // 计算多页面交互模式的持续时间（从queuedAt开始计算，而不是createdAt）
    const calculateDuration = (createdAt: Date, finishedAt: Date | null, queuedAt?: Date | null): number => {
      if (!finishedAt) return 0;
      // 多页面交互模式：如果有queuedAt时间，使用queuedAt作为开始时间
      // 否则使用createdAt作为开始时间（兼容传统模式）
      const startTime = queuedAt ? new Date(queuedAt).getTime() : new Date(createdAt).getTime();
      const endTime = new Date(finishedAt).getTime();
      const durationMs = endTime - startTime;
      return Math.max(0, Math.round(durationMs / 1000));
    };

    // 计算下载URL和相关状态（与单页面工具保持一致）
    let resultUrl = null;
    let logUrl = null;
    let isDownloadExpired = false;
    let calculatedDownloadTimeRemaining = task.downloadTimeRemaining;
    let calculatedDownloadStatus = task.downloadStatus || 'NOT_DOWNLOADED';

    if (task.status === 'COMPLETED') {
      // 动态计算下载剩余时间（与单页面工具保持一致）
      if (task.finishedAt) {
        const downloadTimeout = DeploymentModeService.getDownloadTimeout(); // 使用统一的配置
        const finishedTime = new Date(task.finishedAt).getTime();
        const now = Date.now();
        const elapsed = now - finishedTime;
        calculatedDownloadTimeRemaining = Math.max(0, Math.floor((downloadTimeout * 1000 - elapsed) / 1000));

        console.log(`[SDC-THRPAGES] Calculated downloadTimeRemaining for task ${task.id}: ${calculatedDownloadTimeRemaining}s (finishedAt: ${task.finishedAt}, elapsed: ${Math.round(elapsed/1000)}s)`);
      }

      // 检查文件是否过期
      if (calculatedDownloadTimeRemaining !== null && calculatedDownloadTimeRemaining <= 0) {
        isDownloadExpired = true;
        calculatedDownloadStatus = 'EXPIRED';
      } else if (task.outputFile) {
        // 只有在文件存在且未过期时才生成下载URL
        // TODO: 这里应该检查文件是否真实存在，与单页面工具保持一致
        resultUrl = `/api/v1/sdc-thrpages/${task.id}/download`;
        logUrl = `/api/v1/sdc-thrpages/${task.id}/download?type=log`;

        // 设置下载状态
        if (calculatedDownloadStatus === 'NOT_DOWNLOADED') {
          calculatedDownloadStatus = 'AVAILABLE';
        }
      } else {
        // 任务完成但没有输出文件
        calculatedDownloadStatus = 'NOT_DOWNLOADED';
      }
    } else {
      // 任务未完成
      calculatedDownloadStatus = 'NOT_DOWNLOADED';
    }

    res.json({
      success: true,
      data: {
        id: task.id,
        taskId: task.id,
        status: task.status,
        progress: task.progress || 0,
        currentStep: task.currentStep || '',
        resultUrl,
        logUrl,
        errorMessage: task.errorMessage,
        downloadStatus: calculatedDownloadStatus,
        downloadTimeRemaining: calculatedDownloadTimeRemaining,
        isDownloadExpired,
        deploymentMode: task.deploymentMode || 'ecs_only',
        parameters: task.parameters,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        queuedAt: task.queuedAt,
        // 多页面交互模式：持续时间从queuedAt开始计算
        duration: calculateDuration(task.createdAt, task.finishedAt, task.queuedAt),
        tool: task.tool
      }
    });

  } catch (error) {
    console.error('获取任务状态失败:', error);
    res.status(500).json({
      error: '获取任务状态失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 删除任务和相关数据
 */
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!task) {
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    // 使用统一的CleanupService清理所有目录（jobs + temp + logs）
    // 这是用户主动删除任务的操作，需要清理所有数据
    const cleanupResult = await CleanupService.cleanupFailedTask(taskId, 'sdc', 'all');

    // 删除任务记录
    await prisma.task.delete({
      where: { id: taskId }
    });

    res.json({
      success: true,
      message: '任务删除成功',
      data: {
        taskId,
        deletedAt: new Date().toISOString(),
        cleanedDirectories: cleanupResult.cleanedDirectories
      }
    });

  } catch (error) {
    console.error('删除任务失败:', error);
    res.status(500).json({
      error: '删除任务失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * DataSav: 保存isDirty状态为true的sheet数据到数据库
 */
export const saveDataToDatabase = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '用户未认证' });
    }

    const { taskId, dirtySheetData } = req.body;

    if (!taskId || !dirtySheetData || !Array.isArray(dirtySheetData)) {
      return res.status(400).json({ error: '缺少必要参数: taskId, dirtySheetData' });
    }

    console.log(`🔄 [DATA-SAV] 开始保存isDirty状态的数据: 任务=${taskId}, sheets=${dirtySheetData.map(s => s.sheetName).join(', ')}`);

    // 保存isDirty状态的sheet数据
    const result = await ExcelThrpagesService.saveDirtySheetData(
      taskId,
      userId,
      dirtySheetData
    );

    res.json({
      success: true,
      message: `成功保存 ${result.savedSheets.length} 个sheet的数据`,
      data: {
        savedSheets: result.savedSheets,
        validationResults: result.validationResults
      }
    });

  } catch (error) {
    console.error('保存数据失败:', error);
    res.status(500).json({
      error: '保存数据失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * DataChk: 同步数据库数据到Excel文件并执行检查脚本
 */
export const checkDataConsistency = async (req: Request, res: Response) => {
  let operationLogger: any = null;

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '用户未认证' });
    }

    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: '缺少必要参数: taskId' });
    }

    // 创建操作日志记录器
    operationLogger = createOperationLogger(taskId, 'datachk');

    // 使用runWithInterceptedConsole包装业务逻辑，捕获console输出（包括ExcelThrpagesService中的日志）
    const result = await operationLogger.runWithInterceptedConsole(async () => {
      operationLogger.stepStart('INIT', `开始SDC工具数据检查: 任务=${taskId}, 用户=${userId}`);

      console.log(`🔍 [DATA-CHK] 开始数据检查: 任务=${taskId}`);

      // 1. 同步数据库数据到Excel文件
      operationLogger.stepStart('SYNC', '开始同步数据库数据到Excel文件');
      const taskDir = path.join(process.env.TEMP_UPLOAD_DIR!, taskId);
      const dcontPath = path.join(taskDir, 'dcont.xlsx');
      operationLogger.info(`任务目录: ${taskDir}`);
      operationLogger.info(`Excel文件路径: ${dcontPath}`);

      const syncResult = await ExcelThrpagesService.syncDatabaseToExcelFile(
        taskId,
        userId,
        dcontPath
      );

      if (!syncResult.success) {
        operationLogger.stepFailed('SYNC', '数据同步失败，Excel与数据库不一致', syncResult.validationResults);
        console.error(`❌ [DATA-CHK] 数据同步失败，Excel与数据库不一致:`, syncResult.validationResults);
        return { error: 'SYNC_FAILED', syncResult };
      }

      operationLogger.stepComplete('SYNC', '数据库数据同步到Excel文件完成');

      // 2. 执行sdc_dg_chk.py脚本
      operationLogger.stepStart('SCRIPT', '开始执行SDC数据检查脚本');
      console.log('🐍 [DATA-CHK] 开始执行数据检查脚本...');
      const pythonScript = path.join(process.cwd(), 'src/tools/sdc_dg_chk.py');
      operationLogger.info(`Python脚本路径: ${pythonScript}`);

      const rptContent = await new Promise<any>((resolve, reject) => {
        const pythonArgs = [
          pythonScript,
          'sdc_dg_chk',
          '-taskid',
          taskId,
          '-chk'
        ];

        const pythonCmd = getPythonCommand(pythonArgs);
        operationLogger.info(`Python命令: ${pythonCmd}`);
        console.log('🐍 [DATA-CHK] Python命令:', pythonCmd);

        const pythonProcess = spawnPython(pythonArgs, {
          env: {
            ...process.env,
            TEMP_UPLOAD_DIR: process.env.TEMP_UPLOAD_DIR,
            TASK_LOGS_DIR: process.env.TASK_LOGS_DIR,
            CURRENT_TASK_ID: taskId
          },
          cwd: process.cwd()
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout?.on('data', (data: any) => {
          const output = data.toString();
          stdout += output;
          operationLogger.info(`Python stdout: ${output.trim()}`);
          console.log('🐍 [DATA-CHK] Python stdout:', output.trim());
        });

        pythonProcess.stderr?.on('data', (data: any) => {
          const output = data.toString();
          stderr += output;
          operationLogger.warn(`Python stderr: ${output.trim()}`);
          console.log('🐍 [DATA-CHK] Python stderr:', output.trim());
        });

        pythonProcess.on('close', async (code: number) => {
          operationLogger.info(`Python脚本执行完成，退出码: ${code}`);
          console.log(`🐍 [DATA-CHK] Python脚本执行完成，退出码: ${code}`);

          // 读取full_chk.rpt文件内容
          const logsDir = path.join(process.env.TASK_LOGS_DIR!, taskId);
          const fullChkRptPath = path.join(logsDir, 'full_chk.rpt');
          operationLogger.info(`检查报告路径: ${fullChkRptPath}`);

          let rptFileContent = '';
          try {
            if (await fsPromises.access(fullChkRptPath).then(() => true).catch(() => false)) {
              rptFileContent = await fsPromises.readFile(fullChkRptPath, 'utf-8');
              operationLogger.success(`读取检查报告成功: 大小 ${rptFileContent.length} 字符`);
              console.log(`📄 [DATA-CHK] 读取检查报告: ${fullChkRptPath}, 大小: ${rptFileContent.length} 字符`);
            } else {
              operationLogger.warn(`检查报告文件不存在: ${fullChkRptPath}`);
              console.warn(`⚠️ [DATA-CHK] 检查报告文件不存在: ${fullChkRptPath}`);
            }
          } catch (error) {
            operationLogger.error('读取检查报告失败', error);
            console.error(`❌ [DATA-CHK] 读取检查报告失败:`, error);
          }

          if (code === 0) {
            operationLogger.stepComplete('SCRIPT', 'SDC数据检查脚本执行成功');
            console.log('✅ [DATA-CHK] sdc_dg_chk.py执行成功:', stdout);

            // 检查报告中是否有错误或警告
            const hasErrors = /ERROR|error/i.test(rptFileContent);
            const hasWarnings = /WARN|warn/i.test(rptFileContent);

            operationLogger.info(`报告检查结果: 错误=${hasErrors}, 警告=${hasWarnings}`);
            console.log(`🔍 [DATA-CHK] 报告检查结果: 错误=${hasErrors}, 警告=${hasWarnings}`);

            resolve({
              content: rptFileContent,
              hasErrors,
              hasWarnings,
              isValid: !hasErrors && !hasWarnings
            });
          } else {
            operationLogger.stepFailed('SCRIPT', 'SDC数据检查脚本执行失败', stderr || stdout);
            console.error('❌ [DATA-CHK] sdc_dg_chk.py执行失败:', stderr || stdout);
            reject(new Error(`Python脚本执行失败: ${stderr || stdout}`));
          }
        });
      });

      return { syncResult, rptContent };
    });

    // 检查是否有错误
    if ((result as any).error === 'SYNC_FAILED') {
      return res.status(500).json({
        error: '数据同步失败',
        message: 'Excel文件与数据库数据不一致，请检查数据完整性',
        details: (result as any).syncResult.validationResults
      });
    }

    // 记录操作完成
    operationLogger.complete(true, '数据检查完成，所有步骤执行成功');

    res.json({
      success: true,
      message: '数据检查完成',
      data: {
        taskId,
        validationResults: result.syncResult.validationResults,
        checkReport: result.rptContent?.content || null,
        hasErrors: result.rptContent?.hasErrors || false,
        hasWarnings: result.rptContent?.hasWarnings || false,
        isValid: result.rptContent?.isValid || false,
        reportPath: path.join(process.env.TASK_LOGS_DIR!, taskId, 'full_chk.rpt'),
        downloadUrl: `/api/v1/sdc-thrpages/download-report/${taskId}`,
        logPath: operationLogger?.getLogFilePath()
      }
    });

  } catch (error) {
    // 记录操作失败
    if (operationLogger) {
      operationLogger.complete(false, `数据检查失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }

    console.error('数据检查失败:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '数据检查失败',
      error: '数据检查失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 下载检查报告文件
 */
export const downloadCheckReport = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    if (!taskId) {
      return res.status(400).json({ message: 'Task ID is required.' });
    }

    // 验证任务是否属于当前用户
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId
      }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found or access denied.' });
    }

    // 构建报告文件路径
    const reportPath = path.join(process.env.TASK_LOGS_DIR!, taskId, 'full_chk.rpt');

    // 检查文件是否存在
    try {
      await fsPromises.access(reportPath);
    } catch (error) {
      return res.status(404).json({ message: 'Report file not found.' });
    }

    // 设置响应头为在浏览器中显示（不下载）
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="full_chk_${taskId}.rpt"`);

    // 发送文件
    res.sendFile(reportPath);

  } catch (error) {
    console.error('下载报告文件失败:', error);
    res.status(500).json({
      message: '下载报告文件失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 下载任务结果文件
 */
export const downloadTaskResult = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { type = 'result' } = req.query;
    const userId = req.user?.id;

    // 验证任务权限
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        tool: {
          select: {
            name: true
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: '任务未找到或无权限访问' });
    }

    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ error: '只有已完成的任务才能下载结果' });
    }

    if (!task.outputFile) {
      return res.status(404).json({ error: '结果文件不存在' });
    }

    // 检查下载时间是否过期
    if (task.downloadTimeRemaining !== null && task.downloadTimeRemaining <= 0) {
      return res.status(410).json({ error: '下载时间已过期，请重新运行任务' });
    }

    // 构建文件路径
    const outputDir = path.join(process.cwd(), 'jobs', taskId, 'output');
    const filePath = path.join(outputDir, task.outputFile);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '结果文件不存在' });
    }

    // 获取文件信息
    const stats = await fsPromises.stat(filePath);

    // 设置下载响应头
    res.setHeader('Content-Disposition', `attachment; filename="${task.outputFile}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 更新下载状态
    await prisma.task.update({
      where: { id: taskId },
      data: {
        downloadStatus: 'DOWNLOADED'
      }
    });

    // 创建文件流并发送
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error: Error) => {
      console.error('文件流错误:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: '文件下载失败' });
      }
    });

  } catch (error) {
    console.error('下载任务结果失败:', error);
    res.status(500).json({
      error: '下载失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 检查用户权限状态（调试用）
 */
export const checkPermissionStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    // 获取用户订阅信息
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
      include: { plan: true },
    });

    const userType = subscription ? 'PROFESSIONAL' : 'FREE';
    const limits = userType === 'FREE'
      ? { maxConcurrentTasks: 3, totalUsageLimit: 20, monthlyLimit: null }
      : { maxConcurrentTasks: 5, totalUsageLimit: null, monthlyLimit: 200 };

    // 检查当前并发任务数
    const runningTasks = await prisma.task.count({
      where: {
        userId: userId,
        status: { in: ['PENDING', 'RUNNING'] }
      }
    });

    // 检查总使用次数（免费用户）
    let totalUsage = 0;
    if (userType === 'FREE') {
      totalUsage = await prisma.task.count({
        where: { userId: userId }
      });
    }

    // 检查月度使用次数（专业用户）
    let monthlyUsage = 0;
    if (userType === 'PROFESSIONAL') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      monthlyUsage = await prisma.task.count({
        where: {
          userId: userId,
          createdAt: { gte: monthStart, lte: monthEnd }
        }
      });
    }

    res.json({
      userId,
      userType,
      subscription: subscription ? {
        id: subscription.id,
        planName: subscription.plan?.name,
        status: subscription.status,
        endDate: subscription.endDate
      } : null,
      limits,
      usage: {
        runningTasks,
        totalUsage,
        monthlyUsage
      },
      permissionChecks: {
        concurrentTasksOk: runningTasks < limits.maxConcurrentTasks,
        totalUsageOk: userType === 'PROFESSIONAL' || totalUsage < (limits.totalUsageLimit || 0),
        monthlyUsageOk: userType === 'FREE' || monthlyUsage < (limits.monthlyLimit || 0)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Permission status check error:', error);
    res.status(500).json({
      error: 'Failed to check permission status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * 初始化数据库表结构
 */
export const initializeDatabaseSchema = async (req: Request, res: Response) => {
  try {
    // 记录当前环境信息用于调试
    console.log(`🔍 [INIT-DB] 当前环境信息:`, {
      NODE_ENV: process.env.NODE_ENV,
      DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
      timestamp: new Date().toISOString()
    });

    // 允许的环境：
    // 1. 开发环境 (NODE_ENV !== 'production')
    // 2. ECS Only部署模式 (DEPLOYMENT_MODE === 'ecs_only')
    // 3. 本地测试环境 (包含localhost的URL)
    const isAllowedEnvironment =
      process.env.NODE_ENV !== 'production' ||
      process.env.DEPLOYMENT_MODE === 'ecs_only' ||
      (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('localhost'));

    if (!isAllowedEnvironment) {
      console.error(`❌ [INIT-DB] 当前环境不允许此操作:`, {
        NODE_ENV: process.env.NODE_ENV,
        DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
        FRONTEND_URL: process.env.FRONTEND_URL
      });
      return res.status(403).json({ error: '当前环境不允许此操作' });
    }

    console.log(`✅ [INIT-DB] 环境检查通过，开始初始化数据库表结构`);
    await ExcelThrpagesService.initializeSdcDatabaseSchemaHardcoded();

    res.json({
      success: true,
      message: 'SDC工具数据库表结构初始化成功',
      data: {
        toolType: 'sdc',
        initializedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('初始化数据库表结构失败:', error);
    res.status(500).json({
      error: '初始化数据库表结构失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 清理任务相关的数据库表格数据（a15步骤）
 * 在任务完成后调用，清理table_data表格数据，保留sheets和tables表模型
 */
export const cleanupTaskData = async (taskId: string) => {
  try {
    console.log(`🧹 [SDC-THRPAGES] 开始清理任务数据: ${taskId}`);

    // 使用统一的安全清理服务
    await TaskCleanupService.safeCleanupTask(taskId, 'sdc');

    console.log(`✅ [SDC-THRPAGES] 任务数据清理完成: ${taskId}`);

  } catch (error) {
    console.error(`❌ [SDC-THRPAGES] 清理任务数据失败: ${taskId}`, error);
    // 不抛出错误，避免影响主流程
  }
};
