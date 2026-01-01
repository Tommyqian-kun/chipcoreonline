/**
 * UPF工具多页面交互API路由
 * 提供初始化、数据保存、数据检查等功能的RESTful API
 */

import { Router, Request, Response, type RequestHandler } from 'express';
import { authenticateToken } from '../middleware/auth';
import { checkTaskExecutionPermission } from '../middleware/subscription';
import { validate } from '../middleware/validate';
import { validateUploadFiles } from '../middleware/file-upload-validation';
import * as upfThrpagesController from '../controllers/upf_thrpages.controller';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';

const router = Router();

// 类型安全的 multer 中间件包装器
const wrapMulter = (middleware: any): RequestHandler => {
  return middleware as unknown as RequestHandler;
};

// 配置文件上传 - 使用内存存储，直接保存到目标目录
const upload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，避免临时文件
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB限制
  fileFilter: (req, file, cb) => {
    // UPF工具需要4个文件：hier.yaml, pvlog.v, pobj.tcl, pcell.yaml
    if (file.fieldname === 'hierYamlFile' && (file.originalname.endsWith('.yaml') || file.originalname.endsWith('.yml'))) {
      cb(null, true);
    } else if (file.fieldname === 'pvlogFile' && file.originalname.endsWith('.v')) {
      cb(null, true);
    } else if (file.fieldname === 'pobjTclFile' && file.originalname.endsWith('.tcl')) {
      cb(null, true);
    } else if (file.fieldname === 'pcellYamlFile' && (file.originalname.endsWith('.yaml') || file.originalname.endsWith('.yml'))) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// 验证schemas
const initializeTaskSchema = z.object({
  body: z.object({
    modName: z.string().min(1, "模块名称不能为空").regex(/^[a-zA-Z0-9_]+$/, "模块名称只能包含字母、数字和下划线"),
    version: z.string().default('2.1'),
    isFlat: z.string().transform((val) => val === 'true').default('false')
  })
});

const getTaskSheetsSchema = z.object({
  params: z.object({
    taskId: z.string().min(1, "任务ID不能为空")
  })
});

const getSheetDataSchema = z.object({
  params: z.object({
    taskId: z.string().min(1, "任务ID不能为空"),
    sheetName: z.string().min(1, "Sheet名称不能为空")
  })
});

const saveSheetDataSchema = z.object({
  params: z.object({
    taskId: z.string().min(1, "任务ID不能为空"),
    sheetName: z.string().min(1, "Sheet名称不能为空")
  }),
  body: z.object({
    tables: z.array(z.object({
      table_name: z.string(),
      rows: z.array(z.any())
    }))
  })
});

const taskIdSchema = z.object({
  params: z.object({
    taskId: z.string().min(1, "任务ID不能为空")
  })
});

const saveDataSchema = z.object({
  body: z.object({
    taskId: z.string().min(1, "任务ID不能为空"),
    dirtySheetData: z.array(z.object({
      sheetName: z.string(),
      sheetId: z.string(),
      tables: z.array(z.object({
        tableId: z.string(),
        tableName: z.string(),
        data: z.array(z.any())
      }))
    }))
  })
});

const checkDataConsistencySchema = z.object({
  body: z.object({
    taskId: z.string().min(1, "任务ID不能为空")
  })
});

/**
 * @route   POST /api/v1/upf-thrpages/initialize
 * @desc    初始化多页面交互任务
 * @access  Private
 */
router.post(
  '/initialize',
  authenticateToken,
  checkTaskExecutionPermission,
  wrapMulter(upload.fields([
    { name: 'hierYamlFile', maxCount: 1 },
    { name: 'pvlogFile', maxCount: 1 },
    { name: 'pobjTclFile', maxCount: 1 },
    { name: 'pcellYamlFile', maxCount: 1 }
  ])),
  validateUploadFiles, // 文件安全验证中间件
  validate(initializeTaskSchema),
  upfThrpagesController.initializeTask
);

/**
 * @route   GET /api/v1/upf-thrpages/:taskId/sheets
 * @desc    获取任务的所有sheet信息
 * @access  Private
 */
router.get(
  '/:taskId/sheets',
  authenticateToken,
  validate(getTaskSheetsSchema),
  upfThrpagesController.getTaskSheets
);

/**
 * @route   GET /api/v1/upf-thrpages/:taskId/sheet/:sheetName
 * @desc    获取指定sheet的表格数据
 * @access  Private
 */
router.get(
  '/:taskId/sheet/:sheetName',
  authenticateToken,
  validate(getSheetDataSchema),
  upfThrpagesController.getSheetData
);

/**
 * @route   POST /api/v1/upf-thrpages/:taskId/sheet/:sheetName
 * @desc    保存指定sheet的表格数据
 * @access  Private
 */
router.post(
  '/:taskId/sheet/:sheetName',
  authenticateToken,
  validate(saveSheetDataSchema),
  upfThrpagesController.saveSheetData
);

/**
 * @route   GET /api/v1/upf-thrpages/:taskId/check
 * @desc    检查任务数据
 * @access  Private
 */
router.get(
  '/:taskId/check',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.checkTaskData
);

/**
 * @route   POST /api/v1/upf-thrpages/:taskId/submit
 * @desc    提交任务执行
 * @access  Private
 */
router.post(
  '/:taskId/submit',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.submitTask
);

/**
 * @route   GET /api/v1/upf-thrpages/:taskId/status
 * @desc    获取任务状态
 * @access  Private
 */
router.get(
  '/:taskId/status',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.getTaskStatus
);

/**
 * @route   DELETE /api/v1/upf-thrpages/:taskId
 * @desc    删除任务和相关数据
 * @access  Private
 */
router.delete(
  '/:taskId',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.deleteTask
);

/**
 * @route   POST /api/v1/upf-thrpages/save-data
 * @desc    DataSav: 保存isDirty状态为true的sheet数据到数据库
 * @access  Private
 */
router.post(
  '/save-data',
  authenticateToken,
  validate(saveDataSchema),
  upfThrpagesController.saveDataToDatabase
);

/**
 * @route   POST /api/v1/upf-thrpages/check-data
 * @desc    DataChk: 同步数据库数据到Excel文件并执行检查脚本
 * @access  Private
 */
router.post(
  '/check-data',
  authenticateToken,
  validate(checkDataConsistencySchema),
  upfThrpagesController.checkDataConsistency
);

/**
 * @route   GET /api/v1/upf-thrpages/download-report/:taskId
 * @desc    下载检查报告文件
 * @access  Private
 */
router.get(
  '/download-report/:taskId',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.downloadCheckReport
);

/**
 * @route   GET /api/v1/upf-thrpages/:taskId/download
 * @desc    下载任务结果文件
 * @access  Private
 */
router.get(
  '/:taskId/download',
  authenticateToken,
  validate(taskIdSchema),
  upfThrpagesController.downloadTaskResult
);

export default router;
