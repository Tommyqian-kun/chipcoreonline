import { Router } from 'express';
import { TaskLogCleanupService } from '../../services/task-log-cleanup.service';
import { authenticateToken, requireRole } from '../../middleware/auth';
import logger from '../../config/logger';
import { Role } from '@prisma/client';

const router = Router();

/**
 * 获取日志清理统计信息
 */
router.get('/stats', authenticateToken, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const stats = await TaskLogCleanupService.getCleanupStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        totalLogSizeMB: Math.round(stats.totalLogSize / (1024 * 1024) * 100) / 100,
        cleanupInterval: '2 hours',
        cleanupRules: [
          'Completed/Failed tasks: 24 hours after finish',
          'Max retries exceeded: 12 hours after creation',
          'All tasks: 7 days after creation',
          'Pending tasks: 48 hours timeout',
          'Running tasks: 6 hours timeout'
        ]
      }
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: '/admin/logs/stats'
    }, 'Failed to get log cleanup stats');

    res.status(500).json({
      success: false,
      error: 'Failed to get log cleanup statistics'
    });
  }
});

/**
 * 手动触发日志清理
 */
router.post('/cleanup', authenticateToken, requireRole(Role.ADMIN), async (req, res) => {
  try {
    logger.info({
      adminUserId: (req as any).user?.id,
      adminEmail: (req as any).user?.email
    }, 'Manual log cleanup triggered by admin');

    // 异步执行清理，不阻塞响应
    TaskLogCleanupService.manualCleanup().catch(error => {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Manual log cleanup failed');
    });

    res.json({
      success: true,
      message: 'Log cleanup process started',
      note: 'Cleanup is running in background, check logs for progress'
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: '/admin/logs/cleanup'
    }, 'Failed to trigger manual log cleanup');

    res.status(500).json({
      success: false,
      error: 'Failed to trigger log cleanup'
    });
  }
});

/**
 * 获取日志清理配置
 */
router.get('/config', authenticateToken, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const config = {
      cleanupInterval: '2 hours',
      logsBaseDir: process.env.TASK_LOGS_DIR || 'logs/',
      cleanupRules: {
        completedTasks: '24 hours after finish',
        failedTasks: '24 hours after finish',
        cancelledTasks: '24 hours after finish',
        maxRetriesExceeded: '12 hours after creation',
        allTasks: '7 days after creation',
        pendingTimeout: '48 hours',
        runningTimeout: '6 hours'
      },
      preserveRules: [
        'Active tasks (PENDING, RUNNING) within timeout',
        'Recently completed tasks (< 24 hours)',
        'Tasks with available retries (< 12 hours)',
        'All tasks created within 7 days'
      ]
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: '/admin/logs/config'
    }, 'Failed to get log cleanup config');

    res.status(500).json({
      success: false,
      error: 'Failed to get log cleanup configuration'
    });
  }
});

/**
 * 获取最近的日志清理历史
 */
router.get('/history', authenticateToken, requireRole(Role.ADMIN), async (req, res) => {
  try {
    // 这里可以从日志文件或数据库中获取清理历史
    // 目前返回模拟数据，实际实现可以根据需要扩展
    
    const history = [
      {
        timestamp: new Date().toISOString(),
        type: 'scheduled',
        cleanedCount: 0,
        preservedCount: 0,
        freedSpaceBytes: 0,
        status: 'pending'
      }
    ];

    res.json({
      success: true,
      data: {
        history,
        note: 'Log cleanup history tracking can be enhanced based on requirements'
      }
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: '/admin/logs/history'
    }, 'Failed to get log cleanup history');

    res.status(500).json({
      success: false,
      error: 'Failed to get log cleanup history'
    });
  }
});

export default router;
