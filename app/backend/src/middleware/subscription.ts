import { Response, NextFunction, Request } from 'express';
import { prisma } from '../utils/database';
import logger from '../config/logger';
import { userConcurrentCheck } from '../services/user-concurrent-check.service';

// 用户类型和限制配置
const USER_LIMITS = {
  FREE: {
    maxConcurrentTasks: 3,
    totalUsageLimit: 20, // 总使用次数限制
    monthlyLimit: null, // 免费用户无月度限制
  },
  PROFESSIONAL: {
    maxConcurrentTasks: 5,
    totalUsageLimit: null, // 专业用户无总次数限制
    monthlyLimit: 200, // 月度使用次数限制
  }
};

/**
 * 检查用户任务执行权限的中间件
 * 支持免费用户和专业用户的不同限制策略
 */
export const checkTaskExecutionPermission = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated.' });
  }

  try {
    // 1. 获取用户的活跃订阅信息
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE',
        endDate: {
          gt: new Date(),
        },
      },
      include: {
        plan: true,
      },
    });

    // 2. 确定用户类型（免费用户或专业用户）
    const userType = subscription ? 'PROFESSIONAL' : 'FREE';
    const limits = USER_LIMITS[userType];

    console.log(`🔍 [PERMISSION] 开始检查任务执行权限 - 用户: ${userId}, 用户类型: ${userType}, 限制:`, limits);
    logger.info({
      userId,
      userType,
      limits
    }, 'Checking task execution permission');

    // 3. 【原子性并发检查】使用Redis Lua脚本确保检查和预留的原子性
    const concurrentCheckResult = await userConcurrentCheck.atomicCheckAndReserveConcurrentSlot(
      userId,
      limits.maxConcurrentTasks
    );

    if (!concurrentCheckResult.allowed) {
      console.log(`🚫 [PERMISSION] 并发任务数超限 - 用户: ${userId}, 当前任务: ${concurrentCheckResult.currentCount}, 限制: ${limits.maxConcurrentTasks}, 用户类型: ${userType}`);
      return res.status(429).json({  // 使用429表示暂时不可用
        message: `当前系统繁忙，您已有${concurrentCheckResult.currentCount}个任务正在处理，${userType === 'FREE' ? '免费用户' : '专业用户'}最多同时执行${limits.maxConcurrentTasks}个任务。请稍后再试。`,
        code: 'CONCURRENT_LIMIT_EXCEEDED',
        data: {
          current: concurrentCheckResult.currentCount,
          limit: limits.maxConcurrentTasks,
          userType,
          retryAfter: 60  // 建议客户端60秒后重试
        }
      });
    }

    console.log(`✅ [PERMISSION] 并发检查通过 - 用户: ${userId}, 预留后计数: ${concurrentCheckResult.currentCount}`);
    logger.info({
      userId,
      userType,
      currentCount: concurrentCheckResult.currentCount,
      maxLimit: limits.maxConcurrentTasks
    }, 'Concurrent slot reserved successfully');

    // 4. 检查免费用户总使用次数限制
    if (userType === 'FREE' && limits.totalUsageLimit) {
      const totalUsage = await prisma.task.count({
        where: {
          userId: userId
        }
      });

      if (totalUsage >= limits.totalUsageLimit) {
        console.log(`🚫 [PERMISSION] 免费用户使用次数达到上限 - 用户: ${userId}, 已使用: ${totalUsage}, 限制: ${limits.totalUsageLimit}`);
        // 使用次数超限，释放已预留的并发槽位
        await userConcurrentCheck.releaseConcurrentSlot(userId);
        return res.status(403).json({
          message: `您的免费使用次数已达上限（${limits.totalUsageLimit}次）。请升级到专业版继续享受完整的工具服务。`,
          code: 'TOTAL_USAGE_LIMIT_EXCEEDED',
          data: {
            used: totalUsage,
            limit: limits.totalUsageLimit,
            userType: 'FREE'
          },
          redirectTo: '/membership'
        });
      }
    }

    // 5. 检查专业用户月度使用次数限制
    if (userType === 'PROFESSIONAL' && limits.monthlyLimit) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthlyUsage = await prisma.task.count({
        where: {
          userId: userId,
          createdAt: {
            gte: monthStart,
            lte: monthEnd
          }
        }
      });

      if (monthlyUsage >= limits.monthlyLimit) {
        console.log(`🚫 [PERMISSION] 专业用户月度使用次数达到上限 - 用户: ${userId}, 本月已使用: ${monthlyUsage}, 限制: ${limits.monthlyLimit}`);
        // 月度使用超限，释放已预留的并发槽位
        await userConcurrentCheck.releaseConcurrentSlot(userId);
        return res.status(403).json({
          message: `您本月的使用额度已消耗完毕（${limits.monthlyLimit}次）。请等待下月重置或联系客服。`,
          code: 'MONTHLY_LIMIT_EXCEEDED',
          data: {
            used: monthlyUsage,
            limit: limits.monthlyLimit,
            resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
            userType: 'PROFESSIONAL'
          }
        });
      }
    }

    // 6. 所有检查通过，允许执行任务
    // 将预留信息附加到请求对象，供后续步骤使用
    (req as any).concurrentSlotReserved = true;
    (req as any).concurrentCheckResult = concurrentCheckResult;

    logger.info({
      userId,
      userType,
      currentCount: concurrentCheckResult.currentCount,
      maxLimit: limits.maxConcurrentTasks,
      message: 'Task execution permission granted'
    }, 'Permission check passed');

    next();
  } catch (error) {
    // 发生异常时释放已预留的槽位
    try {
      await userConcurrentCheck.releaseConcurrentSlot(userId);
    } catch (releaseError) {
      logger.error({
        error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
        userId
      }, 'Failed to release concurrent slot during error handling');
    }

    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in subscription check middleware');

    res.status(500).json({
      message: 'Internal server error during permission check.',
      code: 'INTERNAL_ERROR'
    });
  }
};