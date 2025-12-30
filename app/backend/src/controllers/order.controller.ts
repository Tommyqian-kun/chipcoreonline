import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

const orderCreationSchema = z.object({
  planId: z.string().cuid(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  paymentMethod: z.nativeEnum(PaymentMethod),
});

/**
 * @description Create a new order
 * @route POST /api/orders
 */
export const createOrder = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  console.log('📋 订单创建请求参数:', JSON.stringify(req.body, null, 2));

  const validation = orderCreationSchema.safeParse(req.body);
  if (!validation.success) {
    console.error('❌ 参数验证失败:', validation.error.errors);
    return res.status(400).json({
      message: '参数验证失败',
      errors: validation.error.errors
    });
  }

  try {
    const { planId, billingCycle, paymentMethod } = validation.data;
    const result = await orderService.createOrderAndInitiatePayment(
      req.user.id,
      planId,
      billingCycle,
      paymentMethod
    );
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating order', error: (error as Error).message });
  }
};

/**
 * @description Get orders for the current user
 * @route GET /api/orders
 */
export const getMyOrders = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const orders = await orderService.findOrdersByUserId(req.user.id, page, limit);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving orders', error: (error as Error).message });
  }
};

/**
 * @description Get the status of a specific order
 * @route GET /api/orders/:orderId/status
 */
export const getOrderStatus = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { orderId } = req.params;
  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  try {
    const orderStatus = await orderService.getOrderStatus(userId, orderId);
    if (!orderStatus) {
      return res.status(404).json({ message: 'Order not found or access denied' });
    }
    res.status(200).json(orderStatus);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching order status', error });
  }
};

export const getMyOrderById = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const { orderId } = req.params;

  try {
    const order = await orderService.getOrderById(orderId, req.user.id);
    res.json(order);
  } catch (error) {
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ message: 'Error retrieving order', error: (error as Error).message });
  }
}; 