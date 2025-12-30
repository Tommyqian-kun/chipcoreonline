/**
 * 系统信息控制器
 * 提供系统状态、部署模式等信息
 */

import { Request, Response } from 'express';
import { DeploymentModeService } from '../services/deployment-mode.service';
import { ToolMappingService } from '../services/tool-mapping.service';
import { TaskTimeoutService } from '../services/task-timeout.service';
import { prisma } from '../utils/database';
import logger from '../config/logger';

/**
 * 获取部署模式信息
 */
export const getDeploymentMode = async (req: Request, res: Response) => {
    try {
        const deploymentMode = DeploymentModeService.getDeploymentMode();
        const storageService = DeploymentModeService.getStorageService();
        const config = DeploymentModeService.getConfigSummary();

        res.json({
            success: true,
            data: {
                mode: deploymentMode,
                storage: storageService,
                config: config
            }
        });

        logger.info({
            deploymentMode,
            storageService
        }, 'Deployment mode info requested');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to get deployment mode info');

        res.status(500).json({
            success: false,
            message: 'Failed to get deployment mode information'
        });
    }
};

/**
 * 获取系统状态信息
 */
export const getSystemStatus = async (req: Request, res: Response) => {
    try {
        // 获取基本系统信息
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const deploymentMode = DeploymentModeService.getDeploymentMode();

        // 检查数据库连接
        let dbStatus = 'connected';
        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch (error) {
            dbStatus = 'disconnected';
        }

        // 获取任务统计
        const taskStats = await prisma.task.groupBy({
            by: ['status'],
            _count: {
                status: true
            }
        });

        const taskCounts = taskStats.reduce((acc, stat) => {
            acc[stat.status] = stat._count.status;
            return acc;
        }, {} as Record<string, number>);

        res.json({
            success: true,
            data: {
                uptime: Math.floor(uptime),
                memory: {
                    used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                    total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                    usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) // %
                },
                deploymentMode,
                database: {
                    status: dbStatus
                },
                tasks: taskCounts,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to get system status');

        res.status(500).json({
            success: false,
            message: 'Failed to get system status'
        });
    }
};

/**
 * 健康检查端点
 */
export const getHealthCheck = async (req: Request, res: Response) => {
    try {
        // 检查数据库连接
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            deploymentMode: DeploymentModeService.getDeploymentMode()
        });

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Health check failed');

        res.status(503).json({
            success: false,
            status: 'unhealthy',
            message: 'Service unavailable',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * 获取工具映射信息
 */
export const getToolMappings = async (req: Request, res: Response) => {
    try {
        const mappings = await ToolMappingService.getAllMappings();
        const deploymentMode = DeploymentModeService.getDeploymentMode();

        res.json({
            success: true,
            data: {
                mappings,
                deploymentMode,
                totalTools: mappings.length
            }
        });

        logger.info({
            totalMappings: mappings.length,
            deploymentMode
        }, 'Tool mappings requested');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to get tool mappings');

        res.status(500).json({
            success: false,
            message: 'Failed to get tool mappings'
        });
    }
};

/**
 * 获取工具映射统计信息
 */
export const getToolMappingStats = async (req: Request, res: Response) => {
    try {
        const stats = await ToolMappingService.getMappingStats();
        const deploymentMode = DeploymentModeService.getDeploymentMode();

        res.json({
            success: true,
            data: {
                ...stats,
                deploymentMode
            }
        });

        logger.info({
            stats,
            deploymentMode
        }, 'Tool mapping stats requested');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to get tool mapping stats');

        res.status(500).json({
            success: false,
            message: 'Failed to get tool mapping stats'
        });
    }
};

/**
 * 获取任务超时配置
 */
export const getTimeoutConfig = async (req: Request, res: Response) => {
    try {
        const config = TaskTimeoutService.getTimeoutConfig();

        res.json({
            success: true,
            data: config
        });

        logger.info(config, 'Timeout config requested');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to get timeout config');

        res.status(500).json({
            success: false,
            message: 'Failed to get timeout config'
        });
    }
};

/**
 * 手动触发超时检查
 */
export const triggerTimeoutCheck = async (req: Request, res: Response) => {
    try {
        const result = await TaskTimeoutService.triggerTimeoutCheck();

        res.json({
            success: true,
            data: result
        });

        logger.info(result, 'Manual timeout check triggered');

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to trigger timeout check');

        res.status(500).json({
            success: false,
            message: 'Failed to trigger timeout check'
        });
    }
};
