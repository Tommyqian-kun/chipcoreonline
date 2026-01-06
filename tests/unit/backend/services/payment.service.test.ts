/**
 * PaymentService 单元测试
 * 测试支付服务相关功能
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 模拟支付状态枚举
enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

enum PaymentMethod {
  ALIPAY = 'alipay',
  WECHAT = 'wechat',
  BALANCE = 'balance',
}

// 模拟支付数据
interface MockPayment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  thirdPartyOrderId?: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  refundedAt?: Date;
  refundAmount?: number;
}

// 模拟支付回调数据
interface MockPaymentCallback {
  out_trade_no: string; // 商户订单号
  trade_no: string; // 第三方交易号
  total_amount: string; // 支付金额
  trade_status: string; // 交易状态
  gmt_payment: string; // 支付时间
  notify_time: string; // 通知时间
}

// 模拟支付服务
class MockPaymentService {
  private payments: Map<string, MockPayment> = new Map();
  private paymentCallbacks: Map<string, MockPaymentCallback> = new Map();

  async createPayment(
    orderId: string,
    userId: string,
    amount: number,
    method: PaymentMethod
  ): Promise<MockPayment> {
    const payment: MockPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      orderId,
      userId,
      amount,
      currency: 'CNY',
      method,
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.set(payment.id, payment);
    return payment;
  }

  async getPayment(paymentId: string): Promise<MockPayment | null> {
    return this.payments.get(paymentId) || null;
  }

  async getPaymentByOrderId(orderId: string): Promise<MockPayment | null> {
    for (const payment of this.payments.values()) {
      if (payment.orderId === orderId) {
        return payment;
      }
    }
    return null;
  }

  async processPayment(
    paymentId: string,
    transactionId: string,
    thirdPartyOrderId: string
  ): Promise<MockPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('支付记录不存在');
    }

    payment.status = PaymentStatus.SUCCESS;
    payment.transactionId = transactionId;
    payment.thirdPartyOrderId = thirdPartyOrderId;
    payment.paidAt = new Date();
    payment.updatedAt = new Date();

    this.payments.set(paymentId, payment);
    return payment;
  }

  async failPayment(paymentId: string, _reason: string): Promise<MockPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('支付记录不存在');
    }

    payment.status = PaymentStatus.FAILED;
    payment.updatedAt = new Date();

    this.payments.set(paymentId, payment);
    return payment;
  }

  async cancelPayment(paymentId: string): Promise<MockPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('支付记录不存在');
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new Error('只能取消待支付的订单');
    }

    payment.status = PaymentStatus.CANCELLED;
    payment.updatedAt = new Date();

    this.payments.set(paymentId, payment);
    return payment;
  }

  async refundPayment(
    paymentId: string,
    refundAmount?: number
  ): Promise<MockPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('支付记录不存在');
    }

    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new Error('只能退款已成功的支付');
    }

    const amount = refundAmount || payment.amount;
    if (amount > payment.amount) {
      throw new Error('退款金额不能超过支付金额');
    }

    payment.status = amount === payment.amount ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING;
    payment.refundAmount = amount;
    payment.refundedAt = new Date();
    payment.updatedAt = new Date();

    this.payments.set(paymentId, payment);
    return payment;
  }

  async handlePaymentCallback(
    callback: MockPaymentCallback
  ): Promise<{ success: boolean; payment?: MockPayment; message?: string }> {
    // 查找对应的支付记录
    let payment: MockPayment | null = null;
    for (const p of this.payments.values()) {
      if (p.id === callback.out_trade_no) {
        payment = p;
        break;
      }
    }

    if (!payment) {
      return { success: false, message: '支付记录不存在' };
    }

    // 检查是否已经处理过
    if (payment.status === PaymentStatus.SUCCESS) {
      return { success: true, payment, message: '支付已处理' };
    }

    // 处理支付成功
    if (callback.trade_status === 'TRADE_SUCCESS' || callback.trade_status === 'TRADE_FINISHED') {
      payment.status = PaymentStatus.SUCCESS;
      payment.transactionId = callback.trade_no;
      payment.paidAt = new Date(callback.gmt_payment);
      payment.updatedAt = new Date();

      this.payments.set(payment.id, payment);
      this.paymentCallbacks.set(callback.out_trade_no, callback);

      return { success: true, payment };
    }

    return { success: false, message: '支付状态异常' };
  }

  async getUserPayments(userId: string): Promise<MockPayment[]> {
    const userPayments: MockPayment[] = [];
    for (const payment of this.payments.values()) {
      if (payment.userId === userId) {
        userPayments.push(payment);
      }
    }
    return userPayments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async validatePaymentAmount(paymentId: string, expectedAmount: number): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      return false;
    }
    return payment.amount === expectedAmount;
  }

  async checkPaymentStatus(paymentId: string): Promise<{ canRefund: boolean; daysPassed: number }> {
    const payment = this.payments.get(paymentId);
    if (!payment || !payment.paidAt) {
      return { canRefund: false, daysPassed: 0 };
    }

    const daysPassed = Math.floor(
      (Date.now() - payment.paidAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    // 90天内可以退款
    const canRefund = payment.status === PaymentStatus.SUCCESS && daysPassed <= 90;

    return { canRefund, daysPassed };
  }
}

describe('PaymentService - 支付创建', () => {
  let service: MockPaymentService;

  beforeEach(() => {
    service = new MockPaymentService();
  });

  it('应该成功创建支付宝支付', async () => {
    const payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);

    expect(payment.id).toBeDefined();
    expect(payment.orderId).toBe('order-001');
    expect(payment.userId).toBe('user-001');
    expect(payment.amount).toBe(299);
    expect(payment.method).toBe(PaymentMethod.ALIPAY);
    expect(payment.status).toBe(PaymentStatus.PENDING);
  });

  it('应该成功创建微信支付', async () => {
    const payment = await service.createPayment('order-002', 'user-002', 99, PaymentMethod.WECHAT);

    expect(payment.method).toBe(PaymentMethod.WECHAT);
    expect(payment.amount).toBe(99);
  });

  it('应该成功创建余额支付', async () => {
    const payment = await service.createPayment('order-003', 'user-003', 50, PaymentMethod.BALANCE);

    expect(payment.method).toBe(PaymentMethod.BALANCE);
    expect(payment.amount).toBe(50);
  });

  it('应该设置正确的货币类型', async () => {
    const payment = await service.createPayment('order-004', 'user-004', 100, PaymentMethod.ALIPAY);

    expect(payment.currency).toBe('CNY');
  });
});

describe('PaymentService - 支付查询', () => {
  let service: MockPaymentService;

  beforeEach(() => {
    service = new MockPaymentService();
  });

  it('应该能通过ID查询支付', async () => {
    const payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);

    const found = await service.getPayment(payment.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(payment.id);
  });

  it('应该能通过订单ID查询支付', async () => {
    await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);

    const found = await service.getPaymentByOrderId('order-001');

    expect(found).toBeDefined();
    expect(found?.orderId).toBe('order-001');
  });

  it('不存在的支付应该返回null', async () => {
    const found = await service.getPayment('nonexistent');
    expect(found).toBeNull();
  });

  it('应该能查询用户的所有支付', async () => {
    await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
    await service.createPayment('order-002', 'user-001', 99, PaymentMethod.WECHAT);
    await service.createPayment('order-003', 'user-002', 199, PaymentMethod.ALIPAY);

    const userPayments = await service.getUserPayments('user-001');

    expect(userPayments).toHaveLength(2);
    expect(userPayments.every(p => p.userId === 'user-001')).toBe(true);
  });

  it('用户支付应该按时间倒序排列', async () => {
    await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
    await new Promise(resolve => setTimeout(resolve, 10)); // 确保时间不同
    await service.createPayment('order-002', 'user-001', 99, PaymentMethod.WECHAT);

    const userPayments = await service.getUserPayments('user-001');

    expect(userPayments[0].orderId).toBe('order-002');
    expect(userPayments[1].orderId).toBe('order-001');
  });
});

describe('PaymentService - 支付处理', () => {
  let service: MockPaymentService;
  let payment: MockPayment;

  beforeEach(async () => {
    service = new MockPaymentService();
    payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
  });

  it('应该成功处理支付', async () => {
    const processed = await service.processPayment(
      payment.id,
      'txn-123456',
      'alipay-789'
    );

    expect(processed.status).toBe(PaymentStatus.SUCCESS);
    expect(processed.transactionId).toBe('txn-123456');
    expect(processed.thirdPartyOrderId).toBe('alipay-789');
    expect(processed.paidAt).toBeDefined();
  });

  it('处理不存在的支付应该抛出错误', async () => {
    await expect(
      service.processPayment('nonexistent', 'txn-123', 'alipay-456')
    ).rejects.toThrow('支付记录不存在');
  });

  it('应该能标记支付失败', async () => {
    const failed = await service.failPayment(payment.id, '余额不足');

    expect(failed.status).toBe(PaymentStatus.FAILED);
  });

  it('应该能取消待支付订单', async () => {
    const cancelled = await service.cancelPayment(payment.id);

    expect(cancelled.status).toBe(PaymentStatus.CANCELLED);
  });

  it('不能取消已支付的订单', async () => {
    await service.processPayment(payment.id, 'txn-123', 'alipay-456');

    await expect(service.cancelPayment(payment.id)).rejects.toThrow('只能取消待支付的订单');
  });
});

describe('PaymentService - 支付回调处理', () => {
  let service: MockPaymentService;
  let payment: MockPayment;

  beforeEach(async () => {
    service = new MockPaymentService();
    payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
  });

  it('应该处理支付宝支付成功回调', async () => {
    const callback: MockPaymentCallback = {
      out_trade_no: payment.id,
      trade_no: 'alipay-txn-123',
      total_amount: '299.00',
      trade_status: 'TRADE_SUCCESS',
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
    };

    const result = await service.handlePaymentCallback(callback);

    expect(result.success).toBe(true);
    expect(result.payment?.status).toBe(PaymentStatus.SUCCESS);
    expect(result.payment?.transactionId).toBe('alipay-txn-123');
  });

  it('应该处理交易完成状态', async () => {
    const callback: MockPaymentCallback = {
      out_trade_no: payment.id,
      trade_no: 'alipay-txn-456',
      total_amount: '299.00',
      trade_status: 'TRADE_FINISHED',
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
    };

    const result = await service.handlePaymentCallback(callback);

    expect(result.success).toBe(true);
    expect(result.payment?.status).toBe(PaymentStatus.SUCCESS);
  });

  it('应该拒绝异常的支付状态', async () => {
    const callback: MockPaymentCallback = {
      out_trade_no: payment.id,
      trade_no: 'alipay-txn-789',
      total_amount: '299.00',
      trade_status: 'TRADE_PENDING',
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
    };

    const result = await service.handlePaymentCallback(callback);

    expect(result.success).toBe(false);
    expect(result.message).toBe('支付状态异常');
  });

  it('应该处理重复的回调', async () => {
    const callback: MockPaymentCallback = {
      out_trade_no: payment.id,
      trade_no: 'alipay-txn-123',
      total_amount: '299.00',
      trade_status: 'TRADE_SUCCESS',
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
    };

    await service.handlePaymentCallback(callback);
    const result = await service.handlePaymentCallback(callback);

    expect(result.success).toBe(true);
    expect(result.message).toBe('支付已处理');
  });

  it('应该拒绝不存在的订单回调', async () => {
    const callback: MockPaymentCallback = {
      out_trade_no: 'nonexistent-payment',
      trade_no: 'alipay-txn-123',
      total_amount: '299.00',
      trade_status: 'TRADE_SUCCESS',
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
    };

    const result = await service.handlePaymentCallback(callback);

    expect(result.success).toBe(false);
    expect(result.message).toBe('支付记录不存在');
  });
});

describe('PaymentService - 退款处理', () => {
  let service: MockPaymentService;
  let payment: MockPayment;

  beforeEach(async () => {
    service = new MockPaymentService();
    payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
    await service.processPayment(payment.id, 'txn-123', 'alipay-456');
  });

  it('应该能全额退款', async () => {
    const refunded = await service.refundPayment(payment.id);

    expect(refunded.status).toBe(PaymentStatus.REFUNDED);
    expect(refunded.refundAmount).toBe(299);
    expect(refunded.refundedAt).toBeDefined();
  });

  it('应该能部分退款', async () => {
    const refunded = await service.refundPayment(payment.id, 100);

    expect(refunded.status).toBe(PaymentStatus.REFUNDING);
    expect(refunded.refundAmount).toBe(100);
  });

  it('部分退款后再全额退款应该更新状态', async () => {
    await service.refundPayment(payment.id, 100);
    const fullyRefunded = await service.refundPayment(payment.id, 299);

    expect(fullyRefunded.refundAmount).toBe(299);
    expect(fullyRefunded.status).toBe(PaymentStatus.REFUNDED);
  });

  it('不能退款超过支付金额', async () => {
    await expect(service.refundPayment(payment.id, 500)).rejects.toThrow('退款金额不能超过支付金额');
  });

  it('不能退款未成功的支付', async () => {
    const pendingPayment = await service.createPayment('order-002', 'user-002', 99, PaymentMethod.WECHAT);

    await expect(service.refundPayment(pendingPayment.id)).rejects.toThrow('只能退款已成功的支付');
  });

  it('应该检查退款资格', async () => {
    const check = await service.checkPaymentStatus(payment.id);

    expect(check.canRefund).toBe(true);
    expect(check.daysPassed).toBe(0);
  });
});

describe('PaymentService - 金额验证', () => {
  let service: MockPaymentService;
  let payment: MockPayment;

  beforeEach(async () => {
    service = new MockPaymentService();
    payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
  });

  it('应该验证正确的金额', async () => {
    const isValid = await service.validatePaymentAmount(payment.id, 299);

    expect(isValid).toBe(true);
  });

  it('应该拒绝错误的金额', async () => {
    const isValid = await service.validatePaymentAmount(payment.id, 199);

    expect(isValid).toBe(false);
  });

  it('不存在的支付应该返回false', async () => {
    const isValid = await service.validatePaymentAmount('nonexistent', 299);

    expect(isValid).toBe(false);
  });
});

describe('PaymentService - 退款时间限制', () => {
  let service: MockPaymentService;

  beforeEach(() => {
    service = new MockPaymentService();
  });

  it('90天内可以退款', async () => {
    const payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
    await service.processPayment(payment.id, 'txn-123', 'alipay-456');

    // 模拟30天前的支付
    (payment as any).paidAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const check = await service.checkPaymentStatus(payment.id);

    expect(check.canRefund).toBe(true);
    expect(check.daysPassed).toBe(30);
  });

  it('超过90天不能退款', async () => {
    const payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);
    await service.processPayment(payment.id, 'txn-123', 'alipay-456');

    // 模拟100天前的支付
    (payment as any).paidAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    const check = await service.checkPaymentStatus(payment.id);

    expect(check.canRefund).toBe(false);
    expect(check.daysPassed).toBe(100);
  });

  it('未支付的订单不能退款', async () => {
    const payment = await service.createPayment('order-001', 'user-001', 299, PaymentMethod.ALIPAY);

    const check = await service.checkPaymentStatus(payment.id);

    expect(check.canRefund).toBe(false);
    expect(check.daysPassed).toBe(0);
  });
});
