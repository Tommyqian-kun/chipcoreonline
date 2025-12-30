import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import wechatpay, { wechatConfig } from '../config/wechatpay';

const router = Router();

// Note: Alipay notifications are sent as x-www-form-urlencoded
// The main express app should have `express.urlencoded({ extended: true })` middleware.
router.post('/notify/alipay', paymentController.handleAlipayNotification);

// WeChat Pay notification handling
// 处理微信支付回调通知
router.post('/notify/wechat', paymentController.handleWechatPayNotification);

export default router; 