import { prisma } from '../utils/database';

/**
 * 计划权益服务
 * 提供统一的权益配置管理，确保所有权益信息都从数据库获取
 */

// 移除硬编码的免费计划配置，改为从数据库获取

/**
 * 将数据库中的features字段映射为统一的权益配置
 */
const mapDatabaseFeaturesToStandardFormat = (dbFeatures: any, planName?: string) => {
  return {
    // 并发任务数
    maxConcurrentTasks: dbFeatures.concurrentTasks || dbFeatures.maxConcurrentTasks || dbFeatures.parallelTasks || 1,

    // ECS Only模式：区分总量限制和月度限制
    monthlyLimit: dbFeatures.monthlyUsageLimit || null,
    totalUsageLimit: dbFeatures.totalUsageLimit || null,

    // 支持级别
    supportLevel: dbFeatures.supportLevel || 'basic',

    // 高级功能访问
    accessToAdvancedTools: dbFeatures.advancedFeatures || false,

    // 定制化服务
    customizationService: dbFeatures.customService || false,

    // 技术资讯次数
    monthlyTechConsultations: dbFeatures.emailConsultations || 0,

    // 咨询方式（ECS Only模式支持线上交流）
    consultationMethod: dbFeatures.onlineConsultation ? 'online_or_email' : 'email',

    // API访问
    apiAccess: dbFeatures.apiAccess || false,

    // 存储空间（ECS Only模式使用MB）
    storageSpaceMB: dbFeatures.storageSpaceMB || (dbFeatures.storageGB ? dbFeatures.storageGB * 1024 : 20),

    // ECS Only模式：2分钟限时下载
    downloadTimeoutMinutes: dbFeatures.downloadTimeoutMinutes || 2,
    autoCleanup: dbFeatures.autoCleanup !== false, // 默认为true

    // 计费类型
    billingType: dbFeatures.billingType || 'monthly_usage',

    // 优先支持
    prioritySupport: dbFeatures.supportLevel === 'priority' || dbFeatures.supportLevel === 'dedicated' || false
  };
};

/**
 * 获取计划的详细权益信息
 * 所有计划（包括免费计划）都从数据库获取，符合真实生产应用场景
 */
export const getPlanFeatures = async (planId: string) => {
  // 统一从数据库获取计划信息，不再区分免费和付费
  let plan;

  if (planId === 'free') {
    // 免费计划：查找价格为0的计划或名称为Free的计划
    plan = await prisma.plan.findFirst({
      where: {
        OR: [
          { name: { contains: 'Free', mode: 'insensitive' } },
          { priceMonth: 0 }
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        priceMonth: true,
        priceYear: true,
        features: true
      }
    });
  } else {
    // 其他计划：按ID查找
    plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        name: true,
        description: true,
        priceMonth: true,
        priceYear: true,
        features: true
      }
    });
  }

  if (!plan) {
    throw new Error(`Plan ${planId} not found in database`);
  }

  // 解析并映射features JSON字段为统一格式
  const dbFeatures = plan.features as any;
  const standardFeatures = mapDatabaseFeaturesToStandardFormat(dbFeatures, plan.name);

  return {
    ...plan,
    features: standardFeatures,
    featureList: generateFeatureList(standardFeatures)
  };
};

/**
 * 根据features配置生成权益列表
 */
const generateFeatureList = (features: any): string[] => {
  const featureList: string[] = [];

  // ECS Only模式：区分总量限制和月度限制
  if (features.totalUsageLimit) {
    featureList.push(`总共${features.totalUsageLimit}次工具试用`);
  } else if (features.monthlyLimit) {
    featureList.push(`每月${features.monthlyLimit}次工具使用`);
  } else {
    featureList.push('无限制工具使用');
  }

  // 并发任务数
  if (features.maxConcurrentTasks) {
    featureList.push(`${features.maxConcurrentTasks}个并发任务`);
  }

  // 技术资讯服务
  if (features.monthlyTechConsultations) {
    const consultationDesc = features.consultationMethod === 'online_or_email'
      ? '一对一技术资讯（线上交流或邮件方式）'
      : '技术资讯（邮件方式）';

    if (features.totalUsageLimit) {
      // Free用户：总量限制
      featureList.push(`${features.monthlyTechConsultations}次${consultationDesc}`);
    } else {
      // Pro用户：月度限制
      featureList.push(`每月${features.monthlyTechConsultations}次${consultationDesc}`);
    }
  }

  // 高级功能
  if (features.accessToAdvancedTools) {
    featureList.push('支持工具高级功能');
  } else {
    featureList.push('工具部分功能受限制');
  }

  // 定制化服务
  if (features.customizationService) {
    featureList.push('提供定制化技术服务');
  } else {
    featureList.push('不提供定制化技术服务');
  }

  // API访问
  if (features.apiAccess) {
    featureList.push('部分工具提供API接口');
  }

  // 存储空间（ECS Only模式使用MB）
  if (features.storageSpaceMB) {
    featureList.push(`${features.storageSpaceMB}MB存储空间`);
  }

  // ECS Only模式：2分钟限时下载并自动清除
  if (features.downloadTimeoutMinutes && features.autoCleanup) {
    featureList.push(`${features.downloadTimeoutMinutes}分钟限时下载并自动清除任务数据`);
  }

  return featureList;
};

/**
 * 获取用户的使用统计信息
 */
export const getUserUsageStats = async (userId: string, planFeatures: any) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [totalUsage, monthlyUsage, runningTasks] = await Promise.all([
    // 总使用次数
    prisma.task.count({
      where: { userId }
    }),
    // 本月使用次数
    prisma.task.count({
      where: {
        userId,
        createdAt: {
          gte: monthStart,
          lte: monthEnd
        }
      }
    }),
    // 当前运行中的任务数
    prisma.task.count({
      where: {
        userId,
        status: {
          in: ['PENDING', 'RUNNING']
        }
      }
    })
  ]);

  return {
    totalUsage,
    monthlyUsage,
    runningTasks,
    monthlyLimit: planFeatures.monthlyLimit,
    totalUsageLimit: planFeatures.totalUsageLimit,
    maxConcurrentTasks: planFeatures.maxConcurrentTasks,
    monthlyRemaining: planFeatures.monthlyLimit ? Math.max(0, planFeatures.monthlyLimit - monthlyUsage) : null,
    totalRemaining: planFeatures.totalUsageLimit ? Math.max(0, planFeatures.totalUsageLimit - totalUsage) : null,
    resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  };
};

/**
 * 获取所有可用的计划列表
 * 统一从数据库获取，不再特殊处理免费计划
 */
export const getAllPlans = async () => {
  const plans = await prisma.plan.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      priceMonth: true,
      priceYear: true,
      features: true
    },
    orderBy: { priceMonth: 'asc' }
  });

  // 统一处理所有计划，包括免费计划
  return plans.map(plan => {
    const dbFeatures = plan.features as any;
    const standardFeatures = mapDatabaseFeaturesToStandardFormat(dbFeatures, plan.name);

    return {
      ...plan,
      features: standardFeatures,
      featureList: generateFeatureList(standardFeatures)
    };
  });
};
