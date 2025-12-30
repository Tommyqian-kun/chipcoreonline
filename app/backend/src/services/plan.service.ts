import { prisma } from '../utils/database';

/**
 * Find all plans.
 * @returns A list of plans.
 */
export const findAllPlans = async () => {
  return prisma.plan.findMany({
    orderBy: {
      priceMonth: 'asc',
    },
  });
}; 