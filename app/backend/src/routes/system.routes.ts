/**
 * 系统信息路由
 * 提供系统状态、部署模式等信息的API端点
 */

import { Router } from 'express';
import * as systemController from '../controllers/system.controller';

const router = Router();

/**
 * @route   GET /api/v1/system/deployment-mode
 * @desc    获取当前部署模式信息
 * @access  Public
 */
router.get('/deployment-mode', systemController.getDeploymentMode);

/**
 * @route   GET /api/v1/system/status
 * @desc    获取系统状态信息
 * @access  Public
 */
router.get('/status', systemController.getSystemStatus);

/**
 * @route   GET /api/v1/system/health
 * @desc    健康检查端点
 * @access  Public
 */
router.get('/health', systemController.getHealthCheck);

/**
 * @route   GET /api/v1/system/tools
 * @desc    获取工具映射信息
 * @access  Public
 */
router.get('/tools', systemController.getToolMappings);

/**
 * @route   GET /api/v1/system/tools/stats
 * @desc    获取工具映射统计信息
 * @access  Public
 */
router.get('/tools/stats', systemController.getToolMappingStats);

/**
 * @route   GET /api/v1/system/timeout/config
 * @desc    获取任务超时配置
 * @access  Public
 */
router.get('/timeout/config', systemController.getTimeoutConfig);

/**
 * @route   POST /api/v1/system/timeout/check
 * @desc    手动触发超时检查
 * @access  Public
 */
router.post('/timeout/check', systemController.triggerTimeoutCheck);

export default router;
