/**
 * OrderService 单元测试
 * 测试订单管理相关功能
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 模拟订单状态枚举
enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

enum OrderType {
  SUBSCRIPTION = 'subscription',
  ADD_ON = 'add_on',
  RENEWAL = 'renewal',
  UPGRADE = 'upgrade',
}

// 模拟订单数据
interface MockOrder {
  id: string;
  userId: string;
  planId: string;
  type: OrderType;
  status: OrderStatus;
  amount: number;
  currency: string;
  paymentId?: string;
  subscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

// 模拟订单项
interface MockOrderItem {
  id: string;
  orderId: string;
  itemType: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// 模拟订单服务
class MockOrderService {
  private orders: Map<string, MockOrder> = new Map();
  private orderItems: Map<string, MockOrderItem[]> = new Map();
  private planPrices: Map<string, number> = new Map();

  constructor() {
    // 初始化套餐价格
    this.planPrices.set('plan-free', 0);
    this.planPrices.set('plan-basic', 99);
    this.planPrices.set('plan-pro', 299);
    this.planPrices.set('plan-enterprise', 999);
  }

  async createOrder(
    userId: string,
    planId: string,
    type: OrderType,
    metadata?: Record<string, any>
  ): Promise<MockOrder> {
    const planPrice = this.planPrices.get(planId);
    if (planPrice === undefined) {
      throw new Error('套餐不存在');
    }

    const order: MockOrder = {
      id: `order-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId,
      planId,
      type,
      status: OrderStatus.PENDING,
      amount: planPrice,
      currency: 'CNY',
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(orderId: string): Promise<MockOrder | null> {
    return this.orders.get(orderId) || null;
  }

  async getUserOrders(userId: string): Promise<MockOrder[]> {
    const userOrders: MockOrder[] = [];
    for (const order of this.orders.values()) {
      if (order.userId === userId) {
        userOrders.push(order);
      }
    }
    return userOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getActiveSubscription(userId: string): Promise<MockOrder | null> {
    for (const order of this.orders.values()) {
      if (
        order.userId === userId &&
        order.type === OrderType.SUBSCRIPTION &&
        order.status === OrderStatus.ACTIVE
      ) {
        return order;
      }
    }
    return null;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    paymentId?: string
  ): Promise<MockOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    order.status = status;
    order.updatedAt = new Date();

    if (status === OrderStatus.PAID && !order.paidAt) {
      order.paidAt = new Date();
    }

    if (paymentId) {
      order.paymentId = paymentId;
    }

    this.orders.set(orderId, order);
    return order;
  }

  async activateOrder(
    orderId: string,
    subscriptionId: string,
    durationDays: number
  ): Promise<MockOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== OrderStatus.PAID) {
      throw new Error('只能激活已支付的订单');
    }

    order.status = OrderStatus.ACTIVE;
    order.subscriptionId = subscriptionId;
    order.expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    return order;
  }

  async cancelOrder(orderId: string, reason?: string): Promise<MockOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status === OrderStatus.ACTIVE || order.status === OrderStatus.PAID) {
      throw new Error('已支付或激活的订单不能取消');
    }

    order.status = OrderStatus.CANCELLED;
    order.metadata = { ...order.metadata, cancelReason: reason };
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    return order;
  }

  async refundOrder(orderId: string, reason?: string): Promise<MockOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.ACTIVE) {
      throw new Error('只能退款已支付或激活的订单');
    }

    order.status = OrderStatus.REFUNDED;
    order.metadata = { ...order.metadata, refundReason: reason };
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    return order;
  }

  async checkOrderExpiry(orderId: string): Promise<{ isExpired: boolean; daysRemaining?: number }> {
    const order = this.orders.get(orderId);
    if (!order || !order.expiresAt) {
      return { isExpired: false };
    }

    const now = new Date();
    const isExpired = now > order.expiresAt;

    if (isExpired) {
      order.status = OrderStatus.EXPIRED;
      order.updatedAt = now;
      this.orders.set(orderId, order);
      return { isExpired: true, daysRemaining: 0 };
    }

    const daysRemaining = Math.floor(
      (order.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    return { isExpired: false, daysRemaining };
  }

  async canUserSubmitOrder(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    // 检查是否有待支付订单
    for (const order of this.orders.values()) {
      if (order.userId === userId && order.status === OrderStatus.PENDING) {
        return { allowed: false, reason: '有待支付的订单' };
      }
    }

    // 检查是否有激活的订阅订单
    for (const order of this.orders.values()) {
      if (order.userId === userId && order.status === OrderStatus.ACTIVE) {
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  async calculateOrderTotal(items: Array<{ itemType: string; itemId: string; quantity: number }>): Promise<number> {
    let total = 0;
    for (const item of items) {
      let unitPrice = 0;

      if (item.itemType === 'plan') {
        unitPrice = this.planPrices.get(item.itemId) || 0;
      }

      total += unitPrice * item.quantity;
    }

    return total;
  }

  async applyDiscount(orderId: string, discountCode: string, discountPercent: number): Promise<MockOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new Error('只能对待支付订单应用折扣');
    }

    const discount = Math.floor(order.amount * (discountPercent / 100));
    order.amount = Math.max(0, order.amount - discount);
    order.metadata = { ...order.metadata, discountCode, discountPercent };
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    return order;
  }

  async addOrderItem(
    orderId: string,
    itemType: string,
    itemId: string,
    quantity: number,
    unitPrice: number
  ): Promise<MockOrderItem> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    const item: MockOrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      orderId,
      itemType,
      itemId,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
    };

    const items = this.orderItems.get(orderId) || [];
    items.push(item);
    this.orderItems.set(orderId, items);

    return item;
  }

  async getOrderItems(orderId: string): Promise<MockOrderItem[]> {
    return this.orderItems.get(orderId) || [];
  }
}

describe('OrderService - 订单创建', () => {
  let service: MockOrderService;

  beforeEach(() => {
    service = new MockOrderService();
  });

  it('应该成功创建订阅订单', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    expect(order.id).toBeDefined();
    expect(order.userId).toBe('user-001');
    expect(order.planId).toBe('plan-pro');
    expect(order.type).toBe(OrderType.SUBSCRIPTION);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.amount).toBe(299);
  });

  it('应该成功创建增值服务订单', async () => {
    const order = await service.createOrder('user-002', 'plan-basic', OrderType.ADD_ON);

    expect(order.type).toBe(OrderType.ADD_ON);
    expect(order.amount).toBe(99);
  });

  it('应该成功创建续费订单', async () => {
    const order = await service.createOrder('user-003', 'plan-pro', OrderType.RENEWAL);

    expect(order.type).toBe(OrderType.RENEWAL);
  });

  it('应该成功创建升级订单', async () => {
    const order = await service.createOrder('user-004', 'plan-enterprise', OrderType.UPGRADE);

    expect(order.type).toBe(OrderType.UPGRADE);
    expect(order.amount).toBe(999);
  });

  it('免费套餐价格应该为0', async () => {
    const order = await service.createOrder('user-005', 'plan-free', OrderType.SUBSCRIPTION);

    expect(order.amount).toBe(0);
  });

  it('不存在的套餐应该抛出错误', async () => {
    await expect(
      service.createOrder('user-006', 'plan-nonexistent', OrderType.SUBSCRIPTION)
    ).rejects.toThrow('套餐不存在');
  });

  it('应该保存订单元数据', async () => {
    const metadata = { source: 'web', campaign: 'summer2024' };
    const order = await service.createOrder('user-007', 'plan-pro', OrderType.SUBSCRIPTION, metadata);

    expect(order.metadata).toEqual(metadata);
  });
});

describe('OrderService - 订单查询', () => {
  let service: MockOrderService;

  beforeEach(() => {
    service = new MockOrderService();
  });

  it('应该能通过ID查询订单', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    const found = await service.getOrder(order.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(order.id);
  });

  it('不存在的订单应该返回null', async () => {
    const found = await service.getOrder('nonexistent');
    expect(found).toBeNull();
  });

  it('应该能查询用户的所有订单', async () => {
    await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.createOrder('user-001', 'plan-basic', OrderType.ADD_ON);
    await service.createOrder('user-002', 'plan-pro', OrderType.SUBSCRIPTION);

    const userOrders = await service.getUserOrders('user-001');

    expect(userOrders).toHaveLength(2);
    expect(userOrders.every(o => o.userId === 'user-001')).toBe(true);
  });

  it('用户订单应该按时间倒序排列', async () => {
    await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await new Promise(resolve => setTimeout(resolve, 10));
    await service.createOrder('user-001', 'plan-basic', OrderType.ADD_ON);

    const userOrders = await service.getUserOrders('user-001');

    const firstType = userOrders[0].type;
    const secondType = userOrders[1].type;
    expect(firstType).toBe(OrderType.ADD_ON);
    expect(secondType).toBe(OrderType.SUBSCRIPTION);
  });

  it('应该能查询用户的激活订阅', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    await service.activateOrder(order.id, 'sub-001', 30);

    const activeSub = await service.getActiveSubscription('user-001');

    expect(activeSub).toBeDefined();
    expect(activeSub?.status).toBe(OrderStatus.ACTIVE);
    expect(activeSub?.subscriptionId).toBe('sub-001');
  });
});

describe('OrderService - 订单状态更新', () => {
  let service: MockOrderService;
  let order: MockOrder;

  beforeEach(async () => {
    service = new MockOrderService();
    order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
  });

  it('应该能更新订单为已支付', async () => {
    const updated = await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');

    expect(updated.status).toBe(OrderStatus.PAID);
    expect(updated.paymentId).toBe('pay-001');
    expect(updated.paidAt).toBeDefined();
  });

  it('应该能激活订单', async () => {
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    const activated = await service.activateOrder(order.id, 'sub-001', 30);

    expect(activated.status).toBe(OrderStatus.ACTIVE);
    expect(activated.subscriptionId).toBe('sub-001');
    expect(activated.expiresAt).toBeDefined();
  });

  it('不能激活未支付的订单', async () => {
    await expect(service.activateOrder(order.id, 'sub-001', 30)).rejects.toThrow('只能激活已支付的订单');
  });

  it('应该能取消订单', async () => {
    const cancelled = await service.cancelOrder(order.id, '用户主动取消');

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.metadata?.cancelReason).toBe('用户主动取消');
  });

  it('不能取消已支付的订单', async () => {
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');

    await expect(service.cancelOrder(order.id)).rejects.toThrow('已支付或激活的订单不能取消');
  });

  it('应该能退款订单', async () => {
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    const refunded = await service.refundOrder(order.id, '用户申请退款');

    expect(refunded.status).toBe(OrderStatus.REFUNDED);
    expect(refunded.metadata?.refundReason).toBe('用户申请退款');
  });

  it('不能退款未支付的订单', async () => {
    await expect(service.refundOrder(order.id)).rejects.toThrow('只能退款已支付或激活的订单');
  });
});

describe('OrderService - 订单过期检查', () => {
  let service: MockOrderService;

  beforeEach(() => {
    service = new MockOrderService();
  });

  it('应该检测到过期订单', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    await service.activateOrder(order.id, 'sub-001', 30);

    // 模拟31天后
    (order as any).expiresAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    const check = await service.checkOrderExpiry(order.id);

    expect(check.isExpired).toBe(true);
    expect(check.daysRemaining).toBe(0);
    expect(order.status).toBe(OrderStatus.EXPIRED);
  });

  it('应该计算剩余天数', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    await service.activateOrder(order.id, 'sub-001', 30);

    // 模拟10天后过期
    (order as any).expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    const check = await service.checkOrderExpiry(order.id);

    expect(check.isExpired).toBe(false);
    expect(check.daysRemaining).toBe(10);
  });

  it('没有过期时间的订单不应该过期', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    const check = await service.checkOrderExpiry(order.id);

    expect(check.isExpired).toBe(false);
  });
});

describe('OrderService - 订单提交限制', () => {
  let service: MockOrderService;

  beforeEach(() => {
    service = new MockOrderService();
  });

  it('有待支付订单应该限制提交', async () => {
    await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    const check = await service.canUserSubmitOrder('user-001');

    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('有待支付的订单');
  });

  it('有激活订阅应该允许提交', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');
    await service.activateOrder(order.id, 'sub-001', 30);

    const check = await service.canUserSubmitOrder('user-001');

    expect(check.allowed).toBe(true);
  });

  it('没有待支付订单应该允许提交', async () => {
    await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.cancelOrder('order-001', 'test');

    const check = await service.canUserSubmitOrder('user-001');

    expect(check.allowed).toBe(true);
  });
});

describe('OrderService - 订单金额计算', () => {
  let service: MockOrderService;

  beforeEach(() => {
    service = new MockOrderService();
  });

  it('应该正确计算订单总价', async () => {
    const items = [
      { itemType: 'plan', itemId: 'plan-pro', quantity: 1 },
      { itemType: 'plan', itemId: 'plan-basic', quantity: 2 },
    ];

    const total = await service.calculateOrderTotal(items);

    expect(total).toBe(299 + 99 * 2);
  });

  it('空订单应该为0元', async () => {
    const total = await service.calculateOrderTotal([]);
    expect(total).toBe(0);
  });

  it('应该能应用折扣码', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    const discounted = await service.applyDiscount(order.id, 'SUMMER2024', 20);

    expect(discounted.amount).toBe(299 - Math.floor(299 * 0.2));
    expect(discounted.metadata?.discountCode).toBe('SUMMER2024');
    expect(discounted.metadata?.discountPercent).toBe(20);
  });

  it('不能对非待支付订单应用折扣', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
    await service.updateOrderStatus(order.id, OrderStatus.PAID, 'pay-001');

    await expect(service.applyDiscount(order.id, 'SUMMER2024', 20))
      .rejects.toThrow('只能对待支付订单应用折扣');
  });

  it('100%折扣应该使订单价格为0', async () => {
    const order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);

    const discounted = await service.applyDiscount(order.id, 'FREE100', 100);

    expect(discounted.amount).toBe(0);
  });
});

describe('OrderService - 订单项管理', () => {
  let service: MockOrderService;
  let order: MockOrder;

  beforeEach(async () => {
    service = new MockOrderService();
    order = await service.createOrder('user-001', 'plan-pro', OrderType.SUBSCRIPTION);
  });

  it('应该能添加订单项', async () => {
    const item = await service.addOrderItem(order.id, 'plan', 'plan-pro', 1, 299);

    expect(item.id).toBeDefined();
    expect(item.orderId).toBe(order.id);
    expect(item.itemType).toBe('plan');
    expect(item.itemId).toBe('plan-pro');
    expect(item.quantity).toBe(1);
    expect(item.unitPrice).toBe(299);
    expect(item.totalPrice).toBe(299);
  });

  it('应该能查询订单的所有项', async () => {
    await service.addOrderItem(order.id, 'plan', 'plan-pro', 1, 299);
    await service.addOrderItem(order.id, 'addon', 'extra-quota', 5, 10);

    const items = await service.getOrderItems(order.id);

    expect(items).toHaveLength(2);
    expect(items[0].itemId).toBe('plan-pro');
    expect(items[1].itemId).toBe('extra-quota');
  });

  it('不存在的订单应该不能添加项', async () => {
    await expect(
      service.addOrderItem('nonexistent', 'plan', 'plan-pro', 1, 299)
    ).rejects.toThrow('订单不存在');
  });

  it('应该正确计算订单项总价', async () => {
    const item = await service.addOrderItem(order.id, 'addon', 'extra-quota', 5, 10);

    expect(item.totalPrice).toBe(50);
  });
});
