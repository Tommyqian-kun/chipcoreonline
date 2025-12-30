/**
 * 配置路由
 * 提供前端配置信息的API路由
 */

import { Router } from 'express';
import { getToolPageMethod, getFrontendConfig } from '../controllers/config.controller';

const router = Router();

// 获取工具页面模式配置
router.get('/tool-page-method', getToolPageMethod);

// 获取所有前端配置
router.get('/frontend', getFrontendConfig);

export default router;
