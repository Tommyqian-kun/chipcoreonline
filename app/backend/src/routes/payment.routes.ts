import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { wechatPayNotificationMiddleware, wechatPayIpWhitelistMiddleware } from '../middleware/wechatpay-notification';

const router = Router();

// Note: Alipay notifications are sent as x-www-form-urlencoded
// The main express app should have `express.urlencoded({ extended: true })` middleware.
// 支付宝回调处理（已有签名验证）
router.post('/notify/alipay', paymentController.handleAlipayNotification);

// WeChat Pay notification handling
// 处理微信支付回调通知（添加签名验证和解密中间件）
router.post(
  '/notify/wechat',
  wechatPayIpWhitelistMiddleware, // 可选的IP白名单验证
  wechatPayNotificationMiddleware, // 签名验证和解密
  paymentController.handleWechatPayNotification
);

export default router; 