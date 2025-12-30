import { Request, Response } from 'express';
import * as subscriptionService from '../services/subscription.service';
import * as planFeaturesService from '../services/plan-features.service';
import { prisma } from '../utils/database';

/**
 * @description Get the current user's subscription details.
 * @route GET /api/subscriptions/me
 */
export const getMySubscription = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  try {
    const subscription = await subscriptionService.findSubscriptionByUserId(req.user.id);

    // 符合真实业务逻辑：所有用户都应该有订阅状态，免费用户返回免费计划信息
    if (!subscription) {
      // 免费用户：从数据库获取真实的免费计划信息（不再使用硬编码）
      const freePlanFeatures = await planFeaturesService.getPlanFeatures('free');
      const usageStats = await planFeaturesService.getUserUsageStats(req.user.id, freePlanFeatures.features);

      const freeSubscription = {
        id: null,
        userId: req.user.id,
        planId: freePlanFeatures.id, // 使用数据库中的真实ID
        planName: freePlanFeatures.name,
        status: 'ACTIVE',
        startDate: req.user.createdAt,
        endDate: null, // 免费计划无过期时间
        usageLimit: {
          totalTasks: freePlanFeatures.features.totalUsageLimit,
          concurrentTasks: freePlanFeatures.features.maxConcurrentTasks
        },
        usageStats,
        features: freePlanFeatures.featureList,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt
      };
      return res.json(freeSubscription);
    }

    // 专业用户：返回实际订阅信息，并添加使用统计和权益信息
    const enhancedSubscription = await enhanceSubscriptionWithUsageStats(subscription, req.user.id);
    res.json(enhancedSubscription);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving subscription', error: (error as Error).message });
  }
};

/**
 * 增强订阅信息，添加使用统计和权益详情
 */
const enhanceSubscriptionWithUsageStats = async (subscription: any, userId: string) => {
  // 获取订阅计划的权益信息
  const planFeatures = await planFeaturesService.getPlanFeatures(subscription.planId || subscription.plan?.id);

  // 获取用户使用统计
  const usageStats = await planFeaturesService.getUserUsageStats(userId, planFeatures.features);

  return {
    ...subscription,
    usageStats,
    features: planFeatures.featureList
  };
};

/**
 * @description Cancel a subscription (disable auto-renewal).
 * @route DELETE /api/subscriptions/me
 */
export const cancelMySubscription = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  try {
    const subscription = await subscriptionService.cancelSubscription(req.user.id);
    res.json(subscription);
  } catch (error) {
     if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ message: 'Error canceling subscription', error: (error as Error).message });
  }
}; 