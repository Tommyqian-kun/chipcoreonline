import { prisma } from '../utils/database';

/**
 * Finds a user's subscription, including the plan details.
 * @param userId The user's ID.
 * @returns The subscription object or null if not found.
 */
export const findSubscriptionByUserId = async (userId: string) => {
  return prisma.subscription.findUnique({
    where: { userId },
    include: {
      plan: true, // Include related plan details
    },
  });
};

/**
 * Cancels a user's subscription by disabling auto-renewal.
 * @param userId The user's ID.
 */
export const cancelSubscription = async (userId: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    throw new Error('Subscription not found.');
  }

  return prisma.subscription.update({
    where: { userId },
    data: {
      status: 'CANCELED',
    },
  });
};

/**
 * Creates a new subscription for a user.
 * @param userId - The ID of the user.
 */
export const createSubscription = async (userId: string) => {
  // 默认创建Free订阅（与注册逻辑保持一致）
  const freePlan = await prisma.plan.findFirst({
    where: { name: 'Free' }
  });

  if (!freePlan) {
    throw new Error('Free plan not found.');
  }

  // Free用户订阅永久有效（10年后过期）
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 10);

  return prisma.subscription.create({
    data: {
      userId,
      planId: freePlan.id,
      status: 'ACTIVE',
      startDate: new Date(),
      endDate
    }
  });
}; 