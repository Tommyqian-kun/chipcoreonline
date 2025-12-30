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
  // Implementation of createSubscription function
}; 