import { PaymentMethod } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import * as paymentService from './payment.service';
import { prisma } from '../utils/database';
import { z } from 'zod';
import { CurrencyCalculator } from '../utils/decimal';
import logger from '../config/logger';
import alipaySdk from '../config/alipay';
import { redisPool } from './redis-pool.service';

/**
 * 获取Redis客户端（使用连接池）
 * 统一使用redisPool，避免创建独立连接
 */
function getRedisClient() {
  return redisPool.getClient();
}

// Define BillingCycle enum locally since it's not in the schema
enum BillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

/**
 * 获取增强的分布式锁（非侵入式）
 * 保持原有锁机制，增加心跳和健康检查
 */
async function acquireEnhancedLock(key: string, ttl: number = 300): Promise<{
  acquired: boolean;
  lockId?: string;
  release?: () => Promise<void>;
}> {
  const lockId = require('uuid').v4();
  const redis = getRedisClient();

  try {
    const result = await redis.set(key, lockId, 'EX', ttl, 'NX');

    if (result === 'OK') {
      // 启动心跳续期
      const heartbeat = setInterval(async () => {
        try {
          const current = await redis.get(key);
          if (current === lockId) {
            await redis.expire(key, ttl);
          } else {
            clearInterval(heartbeat);
          }
        } catch (error) {
          logger.error({ error, key, lockId }, 'Lock heartbeat error');
          clearInterval(heartbeat);
        }
      }, ttl * 1000 / 3);

      return {
        acquired: true,
        lockId,
        release: async () => {
          clearInterval(heartbeat);
          const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          await redis.eval(luaScript, 1, key, lockId);
        }
      };
    }

    return { acquired: false };
  } catch (error) {
    logger.error({ error, key }, 'Failed to acquire enhanced lock');
    return { acquired: false };
  }
}



/**
 * Creates an order and initiates the payment process.
 * @param userId The ID of the user creating the order.
 * @param planId The ID of the selected plan.
 * @param billingCycle The billing cycle (MONTHLY or YEARLY).
 * @param paymentMethod The chosen payment method (ALIPAY or WECHAT).
 * @returns The created order and payment details (e.g., QR code).
 */
export const createOrderAndInitiatePayment = async (
  userId: string,
  planId: string,
  billingCycle: 'MONTHLY' | 'YEARLY',
  paymentMethod: PaymentMethod,
) => {
  // 1. Fetch plan details to get the price
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new Error('Plan not found');
  }

  // 2. Determine the amount based on the billing cycle
  const amount =
    billingCycle === BillingCycle.YEARLY
      ? plan.priceYear
      : plan.priceMonth;
  
  const amountDecimal = CurrencyCalculator.fromDatabase(amount);
  if (!CurrencyCalculator.isValidAmount(amountDecimal)) {
    throw new Error("Plan price must be positive.");
  }

  // 3. Create the order in the database with 'PENDING' status
  const order = await prisma.order.create({
    data: {
      userId,
      planId,
      amount,
      status: 'PENDING',
      paymentMethod: paymentMethod,
    },
  });

  // 5. Initiate payment with the selected provider
  let paymentDetails;
  if (paymentMethod === 'ALIPAY') {
    paymentDetails = await paymentService.createAlipayPayment(order);
  } else if (paymentMethod === 'WECHAT') {
    paymentDetails = await paymentService.createWechatPayPayment(order);
  } else {
    throw new Error('Unsupported payment method');
  }

  // 6. Return order and payment details to the controller
  return { order, paymentDetails };
};

/**
 * Finds all orders for a given user with pagination.
 * @param userId The user's ID.
 * @param page The page number for pagination.
 * @param limit The number of items per page.
 * @returns A paginated list of the user's orders.
 */
export const findOrdersByUserId = async (userId: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        plan: {
          select: { name: true },
        },
      },
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  // 转换数据格式，确保前端需要的字段都存在
  const formattedOrders = orders.map(order => ({
    id: order.id,
    orderNo: order.id, // 使用id作为orderNo，确保唯一性
    planName: order.plan.name,
    amount: Number(order.amount), // 转换为数字类型
    status: order.status,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }));

  return {
    data: formattedOrders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getOrderById = async (orderId: string, userId: string) => {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
      userId: userId, // Ensure user owns the order
    },
    include: {
      plan: {
        select: { name: true },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found or you do not have permission to view it.');
  }

  return order;
};

/**
 * Gets the status of a specific order for a user.
 * @param userId The user's ID.
 * @param orderId The order ID.
 * @returns The order status or null if not found or access denied.
 */
export const getOrderStatus = async (userId: string, orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, userId: true },
  });

  // Ensure the user owns this order
  if (!order || order.userId !== userId) {
    return null;
  }

  return { status: order.status };
};

/**
 * 处理支付宝支付回调通知（带签名验证和幂等性保证）
 * @param params 支付宝回调参数
 */
export const processAlipayNotification = async (params: any) => {
  const orderId = params.out_trade_no;
  const tradeStatus = params.trade_status;
  const gatewayTransactionId = params.trade_no;

  // 1. 验证签名（防止伪造通知）
  if (!alipaySdk) {
    logger.error('Alipay SDK not initialized');
    throw new Error('Alipay SDK not initialized');
  }

  const signVerified = alipaySdk.checkNotifySign(params);
  if (!signVerified) {
    logger.error({
      orderId,
      params: JSON.stringify(params),
      ip: params.ip,
      userAgent: params.user_agent
    }, 'Alipay signature verification failed - POSSIBLE ATTACK');

    throw new Error('Invalid signature');
  }

  logger.info({
    orderId,
    gatewayTransactionId
  }, 'Alipay notification signature verified');

  // 2. 检查是否为成功支付通知
  if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
    logger.info({
      orderId,
      tradeStatus,
      paymentProvider: 'alipay'
    }, 'Received non-successful Alipay notification');
    return;
  }

  // 3. 使用增强的分布式锁确保幂等性
  const lockKey = `payment_callback_${orderId}_${gatewayTransactionId}`;
  const lockResult = await acquireEnhancedLock(lockKey, 300);

  if (!lockResult.acquired) {
    logger.warn({
      orderId,
      gatewayTransactionId,
      paymentProvider: 'alipay'
    }, 'Duplicate payment callback ignored due to lock');
    return;
  }

  try {

  await prisma.$transaction(async (tx) => {
    // 1. Find the order and lock it for update
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    // 2. Idempotency check: If order is already paid, do nothing.
    if (order.status === 'PAID') {
      logger.info({
        orderId,
        paymentProvider: 'alipay'
      }, 'Order already processed, skipping duplicate notification');
      return;
    }
    
    if (order.status !== 'PENDING') {
        throw new Error(`Order ${orderId} is not in PENDING state, but in ${order.status}.`);
    }

    // 3. Update the order status
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paymentId: gatewayTransactionId,
      },
    });

    // 4. Create or update the user's subscription
    const plan = await tx.plan.findUnique({ where: { id: updatedOrder.planId } });
    if (!plan) throw new Error(`Plan ${updatedOrder.planId} not found`);

    const currentSubscription = await tx.subscription.findUnique({
        where: { userId: updatedOrder.userId }
    });
    
    const orderAmount = CurrencyCalculator.fromDatabase(updatedOrder.amount);
    const yearlyPrice = CurrencyCalculator.fromDatabase(plan.priceYear);
    const billingCycle = CurrencyCalculator.compare(orderAmount, yearlyPrice) === 0 ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const monthsToAdd = billingCycle === BillingCycle.YEARLY ? 12 : 1;

    if (currentSubscription && currentSubscription.status === 'ACTIVE') {
      // Extend existing subscription
      const newEndDate = new Date(currentSubscription.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + monthsToAdd);

      await tx.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          planId: updatedOrder.planId,
          endDate: newEndDate,
        },
      });
    } else {
      // Create new subscription or reactivate expired one
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + monthsToAdd);
      
      await tx.subscription.upsert({
        where: { userId: updatedOrder.userId },
        update: {
            planId: updatedOrder.planId,
            orderId: updatedOrder.id,
            status: 'ACTIVE',
            startDate: startDate,
            endDate: endDate,
        },
        create: {
            userId: updatedOrder.userId,
            planId: updatedOrder.planId,
            orderId: updatedOrder.id,
            status: 'ACTIVE',
            startDate: startDate,
            endDate: endDate,
        }
      });
    }
  });

  logger.info({
    orderId,
    gatewayTransactionId,
    paymentProvider: 'alipay'
  }, 'Alipay payment notification processed successfully');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      gatewayTransactionId,
      paymentProvider: 'alipay'
    }, 'Error processing Alipay payment notification');
    throw error;
  } finally {
    // 释放增强的分布式锁
    if (lockResult.release) {
      await lockResult.release();
    }
  }
};

/**
 * 处理微信支付成功回调通知（带幂等性保证）
 * @param orderId 应用内部订单ID
 * @param gatewayTransactionId 微信支付交易ID
 * @param notificationData 完整的解密通知数据
 */
export const processWechatPaymentSuccess = async (
  orderId: string,
  gatewayTransactionId: string,
  notificationData: any,
) => {
  // 使用增强的分布式锁确保幂等性（非侵入式增强）
  const lockKey = `payment_callback_${orderId}_${gatewayTransactionId}`;
  const lockResult = await acquireEnhancedLock(lockKey, 300); // 5分钟锁定时间

  if (!lockResult.acquired) {
    logger.warn({
      orderId,
      gatewayTransactionId,
      paymentProvider: 'wechat'
    }, 'Duplicate payment callback ignored due to lock');
    return;
  }

  try {
  await prisma.$transaction(async (tx) => {
    // 1. Find the order and lock it for update
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    // 2. Idempotency check: If order is already paid, do nothing.
    if (order.status === 'PAID') {
      logger.info({
        orderId,
        paymentProvider: 'wechat'
      }, 'Order already processed, skipping duplicate notification');
      return;
    }

    if (order.status !== 'PENDING') {
      throw new Error(`Order ${orderId} is not in PENDING state, but in ${order.status}.`);
    }

    // 3. Update the order status
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paymentId: gatewayTransactionId,
      },
    });

    // 4. Create or update the user's subscription
    const plan = await tx.plan.findUnique({ where: { id: updatedOrder.planId } });
    if (!plan) throw new Error(`Plan ${updatedOrder.planId} not found`);

    const currentSubscription = await tx.subscription.findUnique({
      where: { userId: updatedOrder.userId },
    });

    const orderAmount = CurrencyCalculator.fromDatabase(updatedOrder.amount);
    const yearlyPrice = CurrencyCalculator.fromDatabase(plan.priceYear);
    const billingCycle = CurrencyCalculator.compare(orderAmount, yearlyPrice) === 0 ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const monthsToAdd = billingCycle === BillingCycle.YEARLY ? 12 : 1;

    if (currentSubscription && currentSubscription.status === 'ACTIVE') {
      // Extend existing subscription
      const newEndDate = new Date(currentSubscription.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + monthsToAdd);

      await tx.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          planId: updatedOrder.planId,
          endDate: newEndDate,
        },
      });
    } else {
      // Create new subscription or reactivate expired one
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + monthsToAdd);

      await tx.subscription.upsert({
        where: { userId: updatedOrder.userId },
        update: {
          planId: updatedOrder.planId,
          orderId: updatedOrder.id,
          status: 'ACTIVE',
          startDate: startDate,
          endDate: endDate,
        },
        create: {
          userId: updatedOrder.userId,
          planId: updatedOrder.planId,
          orderId: updatedOrder.id,
          status: 'ACTIVE',
          startDate: startDate,
          endDate: endDate,
        },
      });
    }
  });

  logger.info({
    orderId,
    gatewayTransactionId,
    paymentProvider: 'wechat'
  }, 'WeChat payment notification processed successfully');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      gatewayTransactionId,
      paymentProvider: 'wechat'
    }, 'Error processing WeChat payment notification');
    throw error;
  } finally {
    // 释放增强的分布式锁
    if (lockResult.release) {
      await lockResult.release();
    }
  }
};

export const OrderCreationSchema = z.object({
  planId: z.string().uuid(),
  // ... existing code ...
}); 