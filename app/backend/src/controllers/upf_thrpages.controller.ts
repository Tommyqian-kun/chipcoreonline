/**
 * UPF工具多页面交互控制器
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
import { redisPool } from '../services/redis-pool.service';
import { DeploymentModeService } from '../services/deployment-mode.service';
import { initializeTaskLogger, logToTaskFile, logErrorToTaskFile, cleanupTaskLogger } from '../utils/task-logger';
import { createOperationLogger } from '../utils/operation-logger';
import { CleanupService } from '../services/cleanup.service';

const prisma = new PrismaClient();

/**
 * 初始化多页面交互任务
 */
export const initializeTask = async (req: Request, res: Response) => {
  // TaskLogger变量，需要在整个函数中使用
  let taskLogger: any = null;
  let taskId: string = '';

  try {
    const { modName, isFlat, version } = req.body;
    const userId = req.user?.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // 提前验证用户和文件
    if (!userId) {
      return res.status(401).json({ error: '用户未认证' });
    }

    // UPF工具需要4个文件：hier.yaml, pvlog.v, pobj.tcl, pcell.yaml
    if (!files?.hierYamlFile?.[0] || !files?.pvlogFile?.[0] || !files?.pobjTclFile?.[0] || !files?.pcellYamlFile?.[0]) {
      return res.status(400).json({ error: '必须上传hier.yaml、pvlog.v、pobj.tcl和pcell.yaml文件' });
    }

    // 【设计说明】移除了队列上限检查
    // 原因：
    // 1. DRAFT任务不入队，不占用队列槽位
    // 2. 用户可以随时创建DRAFT任务进行编辑
    // 3. 真正的队列限制在submitTask时检查（已使用原子操作）
    // 4. 这样可以保证用户体验：用户上传的文件不会丢失，DRAFT任务可以稍后提交
    //
    // 业务流程：
    // 1. initializeTask: 创建DRAFT任务（不检查队列）
    // 2. 用户编辑Excel（可能数小时）
    // 3. submitTask: 检查队列并入队（如果队列满，返回友好提示，DRAFT任务保留）

    // 创建任务ID
    taskId = uuidv4();

    // 初始化日志文件
    taskLogger = await initializeTaskLogger(taskId, 'UPF');

    // 使用runWithInterceptedConsole包装整个业务逻辑，捕获所有console输出
    await taskLogger.runWithInterceptedConsole(async () => {
      console.log('🚀 [UPF-THRPAGES] 初始化任务开始');
      console.log('📋 [UPF-THRPAGES] 请求参数:', { userId, modName, isFlat, version });
      console.log('📁 [UPF-THRPAGES] 上传文件:', files ? Object.keys(files) : 'no files');
      if (files) {
        Object.entries(files).forEach(([key, fileArray]) => {
          fileArray.forEach((file, index) => {
            console.log(`📄 [UPF-THRPAGES] 文件 ${key}[${index}]:`, {
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype
            });
          });
        });
      }

      console.log('✅ [UPF-THRPAGES] 文件上传验证通过');
      console.log('🆔 [UPF-THRPAGES] 生成任务ID:', taskId);

      // 使用环境变量创建正确的目录路径
      const tempUploadDir = process.env.TEMP_UPLOAD_DIR!;
      const taskLogsDir = process.env.TASK_LOGS_DIR!;
      console.log('📂 [UPF-THRPAGES] 环境变量目录:', { tempUploadDir, taskLogsDir });

      const taskDir = path.join(tempUploadDir, taskId);
      const logsDir = path.join(taskLogsDir, taskId);
      console.log('📁 [UPF-THRPAGES] 任务目录:', { taskDir, logsDir });

      // 创建temp和logs目录 - 设置权限为750（所有者读写执行，组读执行，其他无权限）
      await fsPromises.mkdir(taskDir, { recursive: true });
      await fsPromises.mkdir(logsDir, { recursive: true, mode: 0o750 });
      // 如果日志目录已存在，也需要设置权限
      try {
        await fsPromises.chmod(logsDir, 0o750);
      } catch (error) {
        console.error('⚠️ 无法设置日志目录权限:', error);
      }
      console.log('✅ [UPF-THRPAGES] 目录创建成功');

      // 获取或创建UPF工具信息
      console.log('🔍 [UPF-THRPAGES] 查找UPF工具...');

      // 先查看数据库中所有工具
      const allTools = await prisma.tool.findMany({
        select: { id: true, name: true, toolType: true }
      });
      console.log('📋 [UPF-THRPAGES] 数据库中的所有工具:', allTools);

      let tool = await prisma.tool.findFirst({
        where: {
          OR: [
            { name: 'UPF Generator' },
            { name: 'upf-generator' },
            { toolType: 'upf' },
            { toolType: 'upfgen' }
          ]
        }
      });

      if (!tool) {
        console.log('🔧 [UPF-THRPAGES] UPF工具未找到，正在创建...');
        tool = await prisma.tool.create({
          data: {
            name: 'UPF Generator',
            toolType: 'upfgen',
            description: 'Unified Power Format Generator Tool',
            version: '1.0.0',
            dockerImage: 'logiccore/upf-generator:latest',
            inputSchema: {
              type: 'object',
              properties: {
                modName: { type: 'string' },
                version: { type: 'string' },
                isFlat: { type: 'boolean' }
              }
            }
          }
        });
        console.log('✅ [UPF-THRPAGES] UPF工具创建成功:', tool.id);
      } else {
        console.log('✅ [UPF-THRPAGES] UPF工具找到:', { id: tool.id, name: tool.name, toolType: tool.toolType });
      }

      // 创建任务数据库记录
      console.log('💾 [UPF-THRPAGES] 创建任务数据库记录...');
      const task = await prisma.task.create({
        data: {
          id: taskId,
          userId,
          toolId: tool.id,
          status: 'DRAFT' as TaskStatus,
          parameters: {
            modName,
            version: version || '2.1',
            isFlat,
            toolType: 'upfgen',
            isMultiPage: true,
            pageMethod: 'multi'
          },
          deploymentMode: 'ecs_only',
          localStoragePath: taskDir
        }
      });
      console.log('✅ [UPF-THRPAGES] 任务数据库记录创建成功');

      // 直接保存上传的文件到任务目录
      const hierYamlPath = path.join(taskDir, 'hier.yaml');
      const pvlogPath = path.join(taskDir, 'pvlog.v');
      const pobjTclPath = path.join(taskDir, 'pobj.tcl');
      const pcellYamlPath = path.join(taskDir, 'pcell.yaml');
      console.log('💾 [UPF-THRPAGES] 保存上传文件:', { hierYamlPath, pvlogPath, pobjTclPath, pcellYamlPath });

      await fsPromises.writeFile(hierYamlPath, files.hierYamlFile[0].buffer);
      await fsPromises.writeFile(pvlogPath, files.pvlogFile[0].buffer);
      await fsPromises.writeFile(pobjTclPath, files.pobjTclFile[0].buffer);
      await fsPromises.writeFile(pcellYamlPath, files.pcellYamlFile[0].buffer);
      console.log('✅ [UPF-THRPAGES] 文件保存成功');

      // 调用upf_dg_gen.py生成pcont.xlsx
      const pcontPath = path.join(taskDir, 'pcont.xlsx');
      const pythonScript = path.join(process.cwd(), 'src/tools/upf_dg_gen.py');
      console.log('🐍 [UPF-THRPAGES] 准备执行Python脚本:', { pythonScript, pcontPath, taskId: task.id });

      await new Promise<void>((resolve, reject) => {
        // 正确的Python脚本调用参数：python upf_dg_gen.py upf_dg_gen -taskid <taskid> -dg
        const pythonArgs = [
          pythonScript,
          'upf_dg_gen',
          '-taskid',
          task.id,
          '-dg'
        ];
        const pythonCmd = getPythonCommand(pythonArgs);
        console.log('🐍 [UPF-THRPAGES] Python命令:', pythonCmd);

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
          console.log('🐍 [UPF-THRPAGES] Python stdout:', output.trim());
        });

        pythonProcess.stderr?.on('data', (data: any) => {
          const output = data.toString();
          stderr += output;
          console.log('🐍 [UPF-THRPAGES] Python stderr:', output.trim());
        });

        pythonProcess.on('close', (code: number) => {
          console.log(`🐍 [UPF-THRPAGES] Python脚本执行完成，退出码: ${code}`);
          if (code === 0) {
            console.log('✅ [UPF-THRPAGES] upf_dg_gen.py执行成功:', stdout);
            resolve();
          } else {
            console.error('❌ [UPF-THRPAGES] upf_dg_gen.py执行失败:', stderr || stdout);
            reject(new Error(`Python脚本执行失败: ${stderr || stdout}`));
          }
        });
      });

      // 检查pcont.xlsx文件是否生成
      console.log('📄 [UPF-THRPAGES] 检查pcont.xlsx文件是否生成:', pcontPath);
      try {
        await fsPromises.access(pcontPath);
        console.log('✅ [UPF-THRPAGES] pcont.xlsx文件存在');
      } catch (error) {
        console.error('❌ [UPF-THRPAGES] pcont.xlsx文件不存在:', error);
        throw new Error('pcont.xlsx文件生成失败');
      }

      // 确保数据库模板表结构已初始化
      console.log('🔧 [UPF-THRPAGES] 检查数据库模板表结构...');
      const existingSheets = await prisma.sheet.findMany({
        where: { toolType: 'upf' }
      });

      if (existingSheets.length === 0) {
        console.log('🔧 [UPF-THRPAGES] 数据库模板表结构不存在，正在使用动态解析初始化...');
        await ExcelThrpagesService.initializeDatabaseSchema('upf');
        console.log('✅ [UPF-THRPAGES] 数据库模板表结构初始化完成');
      } else {
        console.log('✅ [UPF-THRPAGES] 数据库模板表结构已存在');
      }

      // 为当前任务创建独立的表结构副本
      console.log('🔧 [UPF-THRPAGES] 为当前任务创建独立的表结构副本...');

      // 先清理可能存在的旧的任务表结构
      console.log('🧹 [UPF-THRPAGES] 清理可能存在的旧任务表结构...');
      await prisma.table.deleteMany({
        where: {
          toolType: 'upf',
          taskId: task.id
        } as any
      });

      await ExcelThrpagesService.createTaskSpecificTableStructure(task.id, userId, 'upf');
      console.log('✅ [UPF-THRPAGES] 任务特定表结构创建完成');

      // UPF工具特有的第二次数据库初始化：更新所有表格的动态列结构（任务特定）
      console.log('🔄 [UPF-THRPAGES] UPF第二次数据库初始化：更新所有表格的动态列结构...');
      await ExcelThrpagesService.updateTaskSpecificDynamicTableColumns(task.id, pcontPath);
      console.log('✅ [UPF-THRPAGES] 所有表格的动态列结构更新完成');

      // 解析生成的pcont.xlsx文件并更新数据库
      console.log('📊 [UPF-THRPAGES] 开始解析Excel文件...');
      await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, pcontPath, 'upf');
      console.log('✅ [UPF-THRPAGES] Excel文件解析完成');

      // 验证Excel ↔ 数据库数据一致性
      console.log('🔍 [UPF-THRPAGES] 开始验证Excel ↔ 数据库数据一致性...');

      // 在验证前添加短暂延迟，确保数据库更新完全生效
      console.log('⏳ [UPF-THRPAGES] 等待数据库更新完全生效...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
        task.id,
        userId,
        pcontPath,
        true  // 跳过下拉验证，因为UPF工具生成的Excel文件不包含下拉验证
      );

      if (!validation.isConsistent) {
        console.error(`❌ [UPF-THRPAGES] Excel ↔ 数据库数据不一致: 发现 ${validation.differences.length} 处不一致`);
        console.error('📋 [UPF-THRPAGES] 详细不一致信息:');

        // 将所有不一致信息输出
        validation.differences.forEach((diff, index) => {
          console.error(`[${index + 1}/${validation.differences.length}] ${JSON.stringify(diff, null, 2)}`);
        });

        console.error('=== 数据验证失败详情结束 ===');
        throw new Error(`数据验证失败: 发现 ${validation.differences.length} 处不一致`);
      }
      console.log('✅ [UPF-THRPAGES] Excel ↔ 数据库数据验证通过');

      console.log('🎉 [UPF-THRPAGES] 任务初始化完全成功！');
    });

    // 清理task logger
    if (taskLogger) {
      cleanupTaskLogger(taskId);
    }

    // 【修复】DRAFT状态的任务不应占用并发槽位，立即释放
    // 订阅中间件在initialize时预留了槽位，但DRAFT任务还未真正执行
    // 真正的并发检查应该在submitTask时进行
    // 使用带重试的方法提高可靠性，但不改变业务逻辑
    try {
      const { userConcurrentCheck } = await import('../services/user-concurrent-check.service');
      const releaseSuccess = await userConcurrentCheck.releaseConcurrentSlotWithRetry(userId);
      if (releaseSuccess) {
        console.log(`✅ [UPF-THRPAGES] DRAFT任务不占用并发槽位，已释放: 用户=${userId}, 任务=${taskId}`);
      } else {
        console.error(`⚠️ [UPF-THRPAGES] DRAFT任务槽位释放失败（已重试）: 用户=${userId}, 任务=${taskId}`);
      }
    } catch (releaseError) {
      console.error(`⚠️ [UPF-THRPAGES] 释放DRAFT任务并发槽位异常:`, releaseError);
      // 不影响主流程，继续返回成功
      // TTL机制会在约43分钟后自动清理槽位
    }

    res.json({
      success: true,
      message: '任务初始化成功',
      taskId,
      data: {
        taskId,
        modName,
        version: version || '2.1',
        isFlat,
        status: 'DRAFT' as TaskStatus,
        createdAt: new Date()
      }
    });

  } catch (error) {
    // 如果初始化失败，槽位会被订阅中间件的异常处理逻辑自动释放
    // 不重新抛出错误，避免双重释放
    if (taskLogger) {
      console.error('初始化任务失败:', error);
      taskLogger.logError('初始化任务失败', error);
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

    // 获取所有sheet信息（使用标准化工具类型）
    const taskToolType = (task.parameters as any)?.toolType || 'upf';
    const normalizedToolType = taskToolType === 'upfgen' ? 'upf' : taskToolType;
    const sheets = await prisma.sheet.findMany({
      where: { toolType: normalizedToolType },
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
    const pcontPath = path.join(taskDir, 'pcont.xlsx');

    // 1. 将数据库数据同步到pcont.xlsx文件
    await ExcelThrpagesService.syncDatabaseToExcel(taskId, pcontPath);

    // 2. 生成JSON格式文件
    await ExcelThrpagesService.generateJsonFiles(taskId, taskDir);

    // 3. 调用upf_dg_chk.py脚本检查数据
    const pythonScript = path.join(process.cwd(), 'app/backend/src/tools/upf_dg_chk.py');

    const checkResult = await new Promise<{ success: boolean; message: string; details?: string }>((resolve) => {
      const pythonArgs = [
        pythonScript,
        'upf_dg_chk',
        '-taskid',
        taskId,
        '-chk'
      ];

      const pythonCmd = getPythonCommand(pythonArgs);
      console.log('🐍 [CHECK-TASK-DATA] Python命令:', pythonCmd);

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
        console.log('🐍 [CHECK-TASK-DATA] Python stdout:', output.trim());
      });

      pythonProcess.stderr?.on('data', (data: any) => {
        const output = data.toString();
        stderr += output;
        console.log('🐍 [CHECK-TASK-DATA] Python stderr:', output.trim());
      });

      pythonProcess.on('close', (code: number) => {
        console.log(`🐍 [CHECK-TASK-DATA] Python脚本执行完成，退出码: ${code}`);
        if (code === 0) {
          console.log('✅ [CHECK-TASK-DATA] upf_dg_chk.py执行成功:', stdout);
          resolve({
            success: true,
            message: '数据检查通过',
            details: stdout
          });
        } else {
          console.error('❌ [CHECK-TASK-DATA] upf_dg_chk.py执行失败:', stderr);
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
 *
 * 【重要】这是真正执行任务的时机，需要检查并发限制
 * initializeTask只是创建DRAFT草稿，不占用并发槽位
 * submitTask才是真正执行，此时应该检查和预留并发槽位
 */
export const submitTask = async (req: Request, res: Response) => {
  let operationLogger: any = null;
  let slotReserved = false; // 标记是否预留了并发槽位

  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    // 验证用户ID
    if (!userId) {
      return res.status(401).json({ error: '未授权访问' });
    }

    // 创建操作日志记录器
    operationLogger = createOperationLogger(taskId, 'submission');

    // 使用runWithInterceptedConsole包装业务逻辑，捕获console输出
    await operationLogger.runWithInterceptedConsole(async () => {
      operationLogger.stepStart('INIT', `开始UPF工具任务提交: 任务=${taskId}, 用户=${userId}`);

      // 【新增】获取用户订阅信息，确定并发限制
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: userId,
          status: 'ACTIVE',
          endDate: { gt: new Date() }
        },
        include: { plan: true }
      });

      const userType = subscription ? 'PROFESSIONAL' : 'FREE';
      const maxConcurrentTasks = userType === 'PROFESSIONAL' ? 5 : 3;

      // 【新增】原子性并发检查和槽位预留
      operationLogger.stepStart('CONCURRENT_CHECK', '检查并发限制并预留槽位');
      const { userConcurrentCheck } = await import('../services/user-concurrent-check.service');
      const concurrentCheckResult = await userConcurrentCheck.atomicCheckAndReserveConcurrentSlot(
        userId,
        maxConcurrentTasks
      );

      if (!concurrentCheckResult.allowed) {
        operationLogger.stepFailed('CONCURRENT_CHECK', `并发任务数超限: ${concurrentCheckResult.currentCount}/${maxConcurrentTasks}`);
        throw new Error(`当前系统繁忙，您已有${concurrentCheckResult.currentCount}个任务正在处理，最多同时执行${maxConcurrentTasks}个任务。请稍后再试。`);
      }

      slotReserved = true; // 标记槽位已预留
      operationLogger.stepComplete('CONCURRENT_CHECK', `并发检查通过，当前任务数: ${concurrentCheckResult.currentCount}`);
      console.log(`✅ [UPF-THRPAGES] 并发检查通过: 用户=${userId}, 当前任务数=${concurrentCheckResult.currentCount}, 限制=${maxConcurrentTasks}`);

      // 验证任务权限
      operationLogger.stepStart('AUTH', '验证任务权限');
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId }
      });

      if (!task) {
        operationLogger.stepFailed('AUTH', '任务未找到或无权限访问');
        throw new Error('任务未找到或无权限访问');
      }

      operationLogger.stepComplete('AUTH', '任务权限验证通过');

      // 将任务加入Redis队列（使用原子操作确保队列检查和入队的原子性）
      operationLogger.stepStart('QUEUE', '将任务加入Redis队列');
      operationLogger.info(`队列名称: task_queue`);
      console.log(`🔄 [UPF-THRPAGES] 将任务加入Redis队列:`, { taskId, queueName: 'task_queue' });
      const maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE || '48');
      const enqueueSuccess = await redisPool.atomicEnqueueIfNotFull('task_queue', taskId, maxQueueSize);

      if (!enqueueSuccess) {
        operationLogger.stepFailed('QUEUE', '任务队列已满');
        throw new Error('任务队列已满，请稍后再试');
      }

      // 验证任务是否成功入队
      const redis = redisPool.getClient();
      const queueLength = await redis.llen('task_queue');
      operationLogger.stepComplete('QUEUE', `任务入队成功，当前队列长度: ${queueLength}`);
      console.log(`✅ [UPF-THRPAGES] 任务入队成功:`, { taskId, currentQueueLength: queueLength });

      // 更新任务状态
      operationLogger.stepStart('STATUS', '更新任务状态为PENDING');
      console.log(`📝 [UPF-THRPAGES] 更新任务状态为PENDING:`, { taskId });
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'PENDING' as TaskStatus,
          queuedAt: new Date()
        }
      });
      operationLogger.stepComplete('STATUS', '任务状态更新完成');
      console.log(`✅ [UPF-THRPAGES] 任务状态更新完成:`, { taskId, status: 'PENDING' });

      // 标记任务提交成功，槽位保持预留状态（将在任务完成时释放）
      slotReserved = false;
    });

    // 记录操作完成
    operationLogger.complete(true, '任务提交完成，已加入执行队列');

    // 获取当前队列长度用于响应
    const currentQueueLength = await redisPool.getClient().llen('task_queue');

    res.json({
      success: true,
      message: '任务已提交执行',
      data: {
        taskId,
        status: 'PENDING',
        submittedAt: new Date().toISOString(),
        queueLength: currentQueueLength,
        logPath: operationLogger?.getLogFilePath()
      }
    });

  } catch (error) {
    // 【新增】如果提交失败且槽位已预留，需要释放槽位（使用带重试的方法提高可靠性）
    if (slotReserved) {
      try {
        const { userConcurrentCheck } = await import('../services/user-concurrent-check.service');
        const releaseSuccess = await userConcurrentCheck.releaseConcurrentSlotWithRetry(req.user?.id || '');
        if (releaseSuccess) {
          console.log(`✅ [UPF-THRPAGES] 提交失败，已释放并发槽位: 用户=${req.user?.id}`);
        } else {
          console.error(`⚠️ [UPF-THRPAGES] 释放并发槽位失败（重试后仍失败）: 用户=${req.user?.id}`);
        }
      } catch (releaseError) {
        console.error(`⚠️ [UPF-THRPAGES] 释放并发槽位异常:`, releaseError);
      }
    }

    // 记录操作失败
    if (operationLogger) {
      operationLogger.complete(false, `任务提交失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }

    console.error('提交任务失败:', error);

    // 返回适当的错误响应
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    if (errorMessage.includes('并发') || errorMessage.includes('系统繁忙')) {
      res.status(429).json({  // 429 Too Many Requests
        error: errorMessage,
        code: 'CONCURRENT_LIMIT_EXCEEDED'
      });
    } else {
      res.status(500).json({
        error: '提交任务失败',
        details: errorMessage
      });
    }
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
      const startTime = queuedAt ? new Date(queuedAt).getTime() : new Date(createdAt).getTime();
      const endTime = new Date(finishedAt).getTime();
      const durationMs = endTime - startTime;
      return Math.max(0, Math.round(durationMs / 1000));
    };

    // 计算下载URL和相关状态
    let resultUrl = null;
    let logUrl = null;
    let isDownloadExpired = false;
    let calculatedDownloadTimeRemaining = task.downloadTimeRemaining;
    let calculatedDownloadStatus = task.downloadStatus || 'NOT_DOWNLOADED';

    if (task.status === 'COMPLETED') {
      // 动态计算下载剩余时间
      if (task.finishedAt) {
        const downloadTimeout = DeploymentModeService.getDownloadTimeout();
        const finishedTime = new Date(task.finishedAt).getTime();
        const now = Date.now();
        const elapsed = now - finishedTime;
        calculatedDownloadTimeRemaining = Math.max(0, Math.floor((downloadTimeout * 1000 - elapsed) / 1000));

        console.log(`[UPF-THRPAGES] Calculated downloadTimeRemaining for task ${task.id}: ${calculatedDownloadTimeRemaining}s (finishedAt: ${task.finishedAt}, elapsed: ${Math.round(elapsed/1000)}s)`);
      }

      // 检查文件是否过期
      if (calculatedDownloadTimeRemaining !== null && calculatedDownloadTimeRemaining <= 0) {
        isDownloadExpired = true;
        calculatedDownloadStatus = 'EXPIRED';
      } else if (task.outputFile) {
        resultUrl = `/api/v1/upf-thrpages/${task.id}/download`;
        logUrl = `/api/v1/upf-thrpages/${task.id}/download?type=log`;

        if (calculatedDownloadStatus === 'NOT_DOWNLOADED') {
          calculatedDownloadStatus = 'AVAILABLE';
        }
      } else {
        calculatedDownloadStatus = 'NOT_DOWNLOADED';
      }
    } else {
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
    const cleanupResult = await CleanupService.cleanupFailedTask(taskId, 'upf', 'all');

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
 * 清理任务相关的数据库表格数据（a15步骤）
 * 在任务完成后调用，清理table_data表格数据，保留sheets和tables表模型
 */
export const cleanupTaskData = async (taskId: string) => {
  try {
    console.log(`🧹 [UPF-THRPAGES] 开始清理任务数据: ${taskId}`);

    // 使用统一的安全清理服务
    await TaskCleanupService.safeCleanupTask(taskId, 'upf');

    console.log(`✅ [UPF-THRPAGES] 任务数据清理完成: ${taskId}`);

  } catch (error) {
    console.error(`❌ [UPF-THRPAGES] 清理任务数据失败: ${taskId}`, error);
    // 不抛出错误，避免影响主流程
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
      operationLogger.stepStart('INIT', `开始UPF工具数据检查: 任务=${taskId}, 用户=${userId}`);

      console.log(`🔍 [DATA-CHK] 开始数据检查: 任务=${taskId}`);

      // 1. 同步数据库数据到Excel文件
      operationLogger.stepStart('SYNC', '开始同步数据库数据到Excel文件');
      const taskDir = path.join(process.env.TEMP_UPLOAD_DIR!, taskId);
      const pcontPath = path.join(taskDir, 'pcont.xlsx');
      operationLogger.info(`任务目录: ${taskDir}`);
      operationLogger.info(`Excel文件路径: ${pcontPath}`);

      const syncResult = await ExcelThrpagesService.syncDatabaseToExcelFile(
        taskId,
        userId,
        pcontPath
      );

      if (!syncResult.success) {
        operationLogger.stepFailed('SYNC', '数据同步失败，Excel与数据库不一致', syncResult.validationResults);
        console.error(`❌ [DATA-CHK] 数据同步失败，Excel与数据库不一致:`, syncResult.validationResults);
        return { error: 'SYNC_FAILED', syncResult };
      }

      operationLogger.stepComplete('SYNC', '数据库数据同步到Excel文件完成');

      // 2. 生成JSON格式文件
      operationLogger.stepStart('JSON', '开始生成JSON格式文件');
      console.log('📄 [DATA-CHK] 开始生成JSON格式文件...');
      try {
        await ExcelThrpagesService.generateJsonFiles(taskId, taskDir);
        operationLogger.stepComplete('JSON', 'JSON文件生成完成');
        console.log('✅ [DATA-CHK] JSON文件生成完成');
      } catch (error) {
        operationLogger.stepFailed('JSON', 'JSON文件生成失败', error);
        console.error('❌ [DATA-CHK] JSON文件生成失败:', error);
        return { error: 'JSON_FAILED', errorMessage: error instanceof Error ? error.message : String(error) };
      }

      // 3. 执行upf_dg_chk.py脚本
      operationLogger.stepStart('SCRIPT', '开始执行UPF数据检查脚本');
      console.log('🐍 [DATA-CHK] 开始执行数据检查脚本...');
      const pythonScript = path.join(process.cwd(), 'src/tools/upf_dg_chk.py');
      operationLogger.info(`Python脚本路径: ${pythonScript}`);

      const rptContent = await new Promise<any>((resolve, reject) => {
        const pythonArgs = [
          pythonScript,
          'upf_dg_chk',
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
            operationLogger.stepComplete('SCRIPT', 'UPF数据检查脚本执行成功');
            console.log('✅ [DATA-CHK] upf_dg_chk.py执行成功:', stdout);

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
            operationLogger.stepFailed('SCRIPT', 'UPF数据检查脚本执行失败', stderr || stdout);
            console.error('❌ [DATA-CHK] upf_dg_chk.py执行失败:', stderr || stdout);
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

    if ((result as any).error === 'JSON_FAILED') {
      return res.status(500).json({
        error: 'JSON文件生成失败',
        message: '无法生成数据检查所需的JSON文件',
        details: (result as any).errorMessage
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
        downloadUrl: `/api/v1/upf-thrpages/download-report/${taskId}`,
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

    // 发送文件
    res.sendFile(filePath);

  } catch (error) {
    console.error('下载任务结果失败:', error);
    res.status(500).json({
      error: '下载任务结果失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
};


