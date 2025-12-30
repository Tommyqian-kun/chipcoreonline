import { Router } from 'express';
import { createOrder, getMyOrders, getMyOrderById } from '../controllers/order.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 创建订单
router.post('/', authenticateToken, createOrder);

// 获取当前用户的订单
router.get('/', authenticateToken, getMyOrders);

// 获取特定订单状态
router.get('/:orderId', authenticateToken, getMyOrderById);

export default router; 