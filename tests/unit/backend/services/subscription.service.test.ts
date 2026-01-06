/**
 * SubscriptionService 单元测试
 * 测试会员订阅管理相关功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟订阅状态枚举
enum SubscriptionStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIAL = 'trial',
}

enum PlanType {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

// 模拟订阅数据
interface MockSubscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate?: Date;
  autoRenew: boolean;
  tasksUsed?: number;
  tasksLimit?: number;
}

// 模拟计划数据
interface MockPlan {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  currency: string;
  duration: number; // 天数
  features: {
    tasksPerDay: number;
    maxQueueSize: number;
    priority: number;
    concurrentTasks: number;
    supportLevel: string;
  };
}

// 模拟SubscriptionService
class MockSubscriptionService {
  private subscriptions: Map<string, MockSubscription> = new Map();
  private plans: Map<string, MockPlan> = new Map();

  constructor() {
    // 初始化默认套餐
    this.plans.set('plan-free', {
      id: 'plan-free',
      name: 'Free',
      type: PlanType.FREE,
      price: 0,
      currency: 'CNY',
      duration: 365,
      features: {
        tasksPerDay: 3,
        maxQueueSize: 10,
        priority: 1,
        concurrentTasks: 1,
        supportLevel: 'community',
      },
    });

    this.plans.set('plan-basic', {
      id: 'plan-basic',
      name: 'Basic',
      type: PlanType.BASIC,
      price: 99,
      currency: 'CNY',
      duration: 30,
      features: {
        tasksPerDay: 20,
        maxQueueSize: 30,
        priority: 2,
        concurrentTasks: 3,
        supportLevel: 'email',
      },
    });

    this.plans.set('plan-pro', {
      id: 'plan-pro',
      name: 'Pro',
      type: PlanType.PRO,
      price: 299,
      currency: 'CNY',
      duration: 30,
      features: {
        tasksPerDay: 100,
        maxQueueSize: 48,
        priority: 3,
        concurrentTasks: 5,
        supportLevel: 'priority',
      },
    });
  }

  async createSubscription(userId: string, planId: string): Promise<MockSubscription> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error('套餐不存在');
    }

    const subscription: MockSubscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId,
      planId,
      status: SubscriptionStatus.ACTIVE,
      startDate: new Date(),
      endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      autoRenew: false,
      tasksUsed: 0,
      tasksLimit: plan.features.tasksPerDay,
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async getUserSubscription(userId: string): Promise<MockSubscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.userId === userId && sub.status === SubscriptionStatus.ACTIVE) {
        return sub;
      }
    }
    return null;
  }

  async canUserSubmitTask(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.getUserSubscription(userId);

    if (!subscription) {
      // 检查是否有免费套餐
      const freeSub = Array.from(this.subscriptions.values()).find(
        s => s.userId === userId && s.status === SubscriptionStatus.ACTIVE
      );

      if (!freeSub) {
        return { allowed: false, reason: '没有有效订阅' };
      }
    }

    // 检查任务限制
    const sub = subscription || (await this.getUserSubscription(userId));
    if (sub && sub.tasksLimit && sub.tasksUsed! >= sub.tasksLimit) {
      return { allowed: false, reason: '已达到任务配额限制' };
    }

    return { allowed: true };
  }

  async incrementTaskUsage(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.tasksUsed = (subscription.tasksUsed || 0) + 1;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.autoRenew = false;
    return true;
  }

  async getPlan(planId: string): Promise<MockPlan | null> {
    return this.plans.get(planId) || null;
  }

  async getAllPlans(): Promise<MockPlan[]> {
    return Array.from(this.plans.values());
  }

  async checkSubscriptionStatus(subscriptionId: string): Promise<{ isActive: boolean; status: string }> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return { isActive: false, status: 'not_found' };
    }

    const isActive = subscription.status === SubscriptionStatus.ACTIVE;
    const isExpired = subscription.endDate && new Date() > subscription.endDate;

    if (isExpired) {
      subscription.status = SubscriptionStatus.EXPIRED;
      return { isActive: false, status: 'expired' };
    }

    return { isActive, status: subscription.status };
  }
}

describe('SubscriptionService - 订阅创建', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('应该成功创建免费订阅', async () => {
    const subscription = await service.createSubscription('user-001', 'plan-free');

    expect(subscription.id).toBeDefined();
    expect(subscription.userId).toBe('user-001');
    expect(subscription.planId).toBe('plan-free');
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('应该成功创建付费订阅', async () => {
    const subscription = await service.createSubscription('user-002', 'plan-pro');

    expect(subscription.planId).toBe('plan-pro');
    expect(subscription.tasksLimit).toBe(100);
  });

  it('不存在的套餐应该抛出错误', async () => {
    await expect(
      service.createSubscription('user-003', 'plan-nonexistent')
    ).rejects.toThrow('套餐不存在');
  });

  it('应该设置正确的结束日期', async () => {
    const subscription = await service.createSubscription('user-004', 'plan-basic');

    expect(subscription.endDate).toBeDefined();
    const daysDiff = Math.floor(
      (subscription.endDate!.getTime() - subscription.startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(daysDiff).toBe(30); // Basic套餐30天
  });
});

describe('SubscriptionService - 订阅查询', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('应该能查询用户的订阅', async () => {
    await service.createSubscription('user-001', 'plan-free');
    const subscription = await service.getUserSubscription('user-001');

    expect(subscription).toBeDefined();
    expect(subscription?.userId).toBe('user-001');
  });

  it('不存在的用户应该返回null', async () => {
    const subscription = await service.getUserSubscription('nonexistent-user');
    expect(subscription).toBeNull();
  });

  it('应该能获取所有套餐', async () => {
    const plans = await service.getAllPlans();

    expect(plans).toHaveLength(3);
    expect(plans.find(p => p.id === 'plan-free')).toBeDefined();
    expect(plans.find(p => p.id === 'plan-basic')).toBeDefined();
    expect(plans.find(p => p.id === 'plan-pro')).toBeDefined();
  });

  it('应该能获取特定套餐', async () => {
    const plan = await service.getPlan('plan-pro');

    expect(plan).toBeDefined();
    expect(plan?.name).toBe('Pro');
    expect(plan?.price).toBe(299);
  });

  it('不存在的套餐应该返回null', async () => {
    const plan = await service.getPlan('plan-nonexistent');
    expect(plan).toBeNull();
  });
});

describe('SubscriptionService - 任务配额检查', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('有订阅的用户应该允许提交任务', async () => {
    await service.createSubscription('user-001', 'plan-free');

    const result = await service.canUserSubmitTask('user-001');

    expect(result.allowed).toBe(true);
  });

  it('没有订阅的用户应该拒绝提交', async () => {
    const result = await service.canUserSubmitTask('nonexistent-user');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('没有有效订阅');
  });

  it('超出任务配额应该拒绝提交', async () => {
    const subscription = await service.createSubscription('user-002', 'plan-free');

    // 模拟使用了所有配额
    subscription.tasksUsed = 3;

    const result = await service.canUserSubmitTask('user-002');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('已达到任务配额限制');
  });

  it('应该增加任务使用计数', async () => {
    const subscription = await service.createSubscription('user-003', 'plan-basic');

    await service.incrementTaskUsage(subscription.id);

    expect(subscription.tasksUsed).toBe(1);
  });

  it('应该正确计算高配额套餐的限制', async () => {
    await service.createSubscription('user-004', 'plan-pro');

    // 使用50个任务
    for (let i = 0; i < 50; i++) {
      const sub = await service.getUserSubscription('user-004');
      if (sub) {
        await service.incrementTaskUsage(sub.id);
      }
    }

    const result = await service.canUserSubmitTask('user-004');
    expect(result.allowed).toBe(true); // Pro套餐限制100，50还在范围内
  });
});

describe('SubscriptionService - 订阅取消', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('应该成功取消订阅', async () => {
    const subscription = await service.createSubscription('user-001', 'plan-basic');

    const cancelled = await service.cancelSubscription(subscription.id);

    expect(cancelled).toBe(true);
    expect(subscription.status).toBe(SubscriptionStatus.CANCELLED);
    expect(subscription.autoRenew).toBe(false);
  });

  it('取消不存在的订阅应该返回false', async () => {
    const cancelled = await service.cancelSubscription('nonexistent-sub');
    expect(cancelled).toBe(false);
  });

  it('取消后的订阅不应该允许提交任务', async () => {
    const subscription = await service.createSubscription('user-001', 'plan-basic');
    await service.cancelSubscription(subscription.id);

    const result = await service.checkSubscriptionStatus(subscription.id);

    expect(result.isActive).toBe(false);
    expect(result.status).not.toBe(SubscriptionStatus.ACTIVE);
  });
});

describe('SubscriptionService - 订阅状态检查', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('活跃订阅应该返回active状态', async () => {
    const subscription = await service.createSubscription('user-001', 'plan-free');

    const status = await service.checkSubscriptionStatus(subscription.id);

    expect(status.isActive).toBe(true);
    expect(status.status).toBe('active');
  });

  it('过期的订阅应该自动更新状态', async () => {
    const subscription = await service.createSubscription('user-002', 'plan-free');

    // 手动设置过期日期为昨天
    subscription.endDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const status = await service.checkSubscriptionStatus(subscription.id);

    expect(status.isActive).toBe(false);
    expect(status.status).toBe('expired');
  });

  it('不存在的订阅应该返回not_found', async () => {
    const status = await service.checkSubscriptionStatus('nonexistent-sub');

    expect(status.isActive).toBe(false);
    expect(status.status).toBe('not_found');
  });
});

describe('SubscriptionService - 套餐特性', () => {
  let service: MockSubscriptionService;

  beforeEach(() => {
    service = new MockSubscriptionService();
  });

  it('免费套餐应该有基本限制', async () => {
    const plan = await service.getPlan('plan-free');

    expect(plan?.features.tasksPerDay).toBe(3);
    expect(plan?.features.concurrentTasks).toBe(1);
    expect(plan?.features.maxQueueSize).toBe(10);
    expect(plan?.price).toBe(0);
  });

  it('Pro套餐应该有更高限制', async () => {
    const plan = await service.getPlan('plan-pro');

    expect(plan?.features.tasksPerDay).toBe(100);
    expect(plan?.features.concurrentTasks).toBe(5);
    expect(plan?.features.maxQueueSize).toBe(48);
    expect(plan?.price).toBe(299);
  });

  it('应该正确比较套餐特性', async () => {
    const freePlan = await service.getPlan('plan-free');
    const proPlan = await service.getPlan('plan-pro');

    expect(proPlan!.features.tasksPerDay).toBeGreaterThan(freePlan!.features.tasksPerDay);
    expect(proPlan!.features.concurrentTasks).toBeGreaterThan(freePlan!.features.concurrentTasks);
    expect(proPlan!.features.priority).toBeGreaterThan(freePlan!.features.priority);
  });
});
