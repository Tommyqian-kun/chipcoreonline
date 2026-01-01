/**
 * SDC工具多页面交互API路由
 * 提供初始化、数据保存、数据检查等功能的RESTful API
 */

import { Router, Request, Response, type RequestHandler } from 'express';
import { authenticateToken } from '../middleware/auth';
import { checkTaskExecutionPermission } from '../middleware/subscription';
import { validate } from '../middleware/validate';
import * as sdcThrpagesController from '../controllers/sdc_thrpages.controller';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';

const router = Router();

/**
 * 类型安全的 multer 中间件包装器
 * 解决 multer 与 Express 4.x/5.x 类型兼容性问题
 */
const wrapMulter = (middleware: any): RequestHandler => {
  return middleware as unknown as RequestHandler;
};

// 配置文件上传 - 使用内存存储，直接保存到目标目录
const upload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，避免临时文件
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB限制
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'hierYamlFile' && (file.originalname.endsWith('.yaml') || file.originalname.endsWith('.yml'))) {
      cb(null, true);
    } else if (file.fieldname === 'vlogFile' && file.originalname.endsWith('.v')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// 验证schemas
const initializeTaskSchema = z.object({
  body: z.object({
    modName: z.string().min(1, "模块名称不能为空").regex(/^[a-zA-Z0-9_]+$/, "模块名称只能包含字母、数字和下划线"),
    isFlat: z.string().transform((val) => val === 'true').default('false')
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

const checkDataSchema = z.object({
  params: z.object({
    taskId: z.string().min(1, "任务ID不能为空")
  })
});

const submitTaskSchema = z.object({
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
 * @route   POST /api/v1/sdc-thrpages/initialize
 * @desc    初始化多页面交互任务
 * @access  Private
 */
router.post(
  '/initialize',
  authenticateToken,
  checkTaskExecutionPermission,
  wrapMulter(upload.fields([
    { name: 'hierYamlFile', maxCount: 1 },
    { name: 'vlogFile', maxCount: 1 }
  ])),
  validate(initializeTaskSchema),
  sdcThrpagesController.initializeTask
);

/**
 * @route   GET /api/v1/sdc-thrpages/:taskId/sheets
 * @desc    获取任务的所有sheet信息
 * @access  Private
 */
router.get(
  '/:taskId/sheets',
  authenticateToken,
  sdcThrpagesController.getTaskSheets
);

/**
 * @route   GET /api/v1/sdc-thrpages/:taskId/sheet/:sheetName
 * @desc    获取指定sheet的表格数据
 * @access  Private
 */
router.get(
  '/:taskId/sheet/:sheetName',
  authenticateToken,
  validate(getSheetDataSchema),
  sdcThrpagesController.getSheetData
);

/**
 * @route   POST /api/v1/sdc-thrpages/:taskId/sheet/:sheetName/save
 * @desc    保存指定sheet的表格数据
 * @access  Private
 */
router.post(
  '/:taskId/sheet/:sheetName/save',
  authenticateToken,
  validate(saveSheetDataSchema),
  sdcThrpagesController.saveSheetData
);

/**
 * @route   POST /api/v1/sdc-thrpages/:taskId/check
 * @desc    检查任务数据
 * @access  Private
 */
router.post(
  '/:taskId/check',
  authenticateToken,
  validate(checkDataSchema),
  sdcThrpagesController.checkTaskData
);

/**
 * @route   POST /api/v1/sdc-thrpages/:taskId/submit
 * @desc    提交任务执行
 * @access  Private
 */
router.post(
  '/:taskId/submit',
  authenticateToken,
  validate(submitTaskSchema),
  sdcThrpagesController.submitTask
);

/**
 * @route   GET /api/v1/sdc-thrpages/:taskId/status
 * @desc    获取任务状态
 * @access  Private
 */
router.get(
  '/:taskId/status',
  authenticateToken,
  sdcThrpagesController.getTaskStatus
);

/**
 * @route   DELETE /api/v1/sdc-thrpages/:taskId
 * @desc    删除任务和相关数据
 * @access  Private
 */
router.delete(
  '/:taskId',
  authenticateToken,
  sdcThrpagesController.deleteTask
);

/**
 * @route   POST /api/v1/sdc-thrpages/data-sav
 * @desc    DataSav: 保存isDirty状态为true的sheet数据到数据库
 * @access  Private
 */
router.post(
  '/data-sav',
  authenticateToken,
  validate(saveDataSchema),
  sdcThrpagesController.saveDataToDatabase
);

/**
 * @route   POST /api/v1/sdc-thrpages/data-chk
 * @desc    DataChk: 同步数据库数据到Excel文件并执行检查脚本
 * @access  Private
 */
router.post(
  '/data-chk',
  authenticateToken,
  validate(checkDataConsistencySchema),
  sdcThrpagesController.checkDataConsistency
);

/**
 * @route   GET /api/v1/sdc-thrpages/init-schema
 * @desc    初始化数据库表结构（仅开发环境）
 * @access  Private
 */
router.post(
  '/init-schema',
  authenticateToken,
  sdcThrpagesController.initializeDatabaseSchema
);

/**
 * @route   GET /api/v1/sdc-thrpages/auth-status
 * @desc    检查用户认证状态（调试用）
 * @access  Public
 */
router.get('/auth-status', (req: Request, res: Response) => {
  const token = req.cookies.access_token;

  res.json({
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    cookies: Object.keys(req.cookies),
    headers: {
      authorization: req.headers.authorization,
      cookie: req.headers.cookie ? 'present' : 'missing'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/v1/sdc-thrpages/permission-status
 * @desc    检查用户权限状态（调试用）
 * @access  Private
 */
router.get('/permission-status', authenticateToken, sdcThrpagesController.checkPermissionStatus);

/**
 * @route   GET /api/v1/sdc-thrpages/:taskId/download
 * @desc    下载任务结果文件
 * @access  Private
 */
router.get(
  '/:taskId/download',
  authenticateToken,
  sdcThrpagesController.downloadTaskResult
);

/**
 * @route   GET /api/v1/sdc-thrpages/download-report/:taskId
 * @desc    下载检查报告文件
 * @access  Private
 */
router.get('/download-report/:taskId', authenticateToken, sdcThrpagesController.downloadCheckReport);

export default router;
