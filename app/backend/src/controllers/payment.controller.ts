import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import alipaySdk from '../config/alipay';
import wechatPay from '../config/wechatpay';
import logger from '../config/logger';

interface AuthenticatedNotificationRequest extends Request {
  notification?: any;
}

/**
 * @description Handles Alipay webhook notifications.
 * @route POST /api/payment/notify/alipay
 */
export const handleAlipayNotification = async (req: Request, res: Response) => {
  if (!alipaySdk) {
    logger.error('Alipay SDK not initialized, cannot process notification');
    return res.status(500).send('failure');
  }

  const params = req.body;

  try {
    // 1. Verify the signature from Alipay
    const isVerified = alipaySdk.checkNotifySign(params);
    if (!isVerified) {
      logger.warn({
        paymentProvider: 'alipay',
        orderId: params.out_trade_no
      }, 'Alipay notification signature verification failed');
      return res.status(400).send('failure');
    }

    logger.info({
      paymentProvider: 'alipay',
      orderId: params.out_trade_no,
      signatureVerified: isVerified
    }, 'Alipay notification received');

    // 2. Process the business logic
    await orderService.processAlipayNotification(params);

    // 3. Respond to Alipay
    res.send('success');
  } catch (error) {
    logger.error({
      paymentProvider: 'alipay',
      error: error instanceof Error ? error.message : String(error)
    }, 'Error processing Alipay notification');
    res.status(500).send('failure');
  }
};

/**
 * @description Handles WeChat Pay webhook notifications.
 * @route POST /api/payment/notify/wechat
 */
export const handleWechatPayNotification = async (req: AuthenticatedNotificationRequest, res: Response) => {
  try {
    const notification = req.notification;

    if (!notification) {
      throw new Error('Decrypted notification data not found. Check middleware setup.');
    }

    logger.info({
      paymentProvider: 'wechat',
      orderId: notification.out_trade_no,
      hasNotification: !!notification
    }, 'WeChat Pay notification received');

    const {
      out_trade_no: orderNo,
      transaction_id: gatewayTransactionId,
      trade_state
    } = notification;

    if (trade_state !== 'SUCCESS') {
       logger.info({
         orderId: orderNo,
         tradeState: trade_state,
         paymentProvider: 'wechat'
       }, 'Received non-successful WeChat Pay notification');
       // Still respond with success to acknowledge receipt
       return res.status(200).json({ code: 'SUCCESS', message: 'Notification received but not a success state.' });
    }

    await orderService.processWechatPaymentSuccess(
      orderNo,
      gatewayTransactionId,
      notification
    );

    res.status(200).json({ code: 'SUCCESS', message: 'Processed successfully' });
  } catch (error: any) {
    logger.error({
      paymentProvider: 'wechat',
      error: error instanceof Error ? error.message : String(error)
    }, 'Error processing WeChat Pay notification');
    res.status(500).json({ code: 'FAIL', message: error.message || 'Internal Server Error' });
  }
}; 