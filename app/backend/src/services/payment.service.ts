import alipaySdk from '../config/alipay';
import wechatPayApi from '../config/wechatpay';
import { Order, PaymentMethod } from '@prisma/client';
import { CurrencyCalculator } from '../utils/decimal';

const ALIPAY_NOTIFY_URL = process.env.ALIPAY_NOTIFY_URL || 'http://localhost:8080/api/payment/notify/alipay';
const WECHAT_NOTIFY_URL = process.env.WECHAT_NOTIFY_URL || 'http://localhost:8080/api/payment/notify/wechat';

/**
 * Creates an Alipay payment QR code for a given order.
 * @param order The order object from the database.
 * @returns The payment QR code URL.
 */
export const createAlipayPayment = async (order: Order) => {
  if (!alipaySdk) {
    throw new Error('Alipay SDK is not initialized. Please check the server configuration.');
  }
  try {
    const amountDecimal = CurrencyCalculator.fromDatabase(order.amount);
    const result = await alipaySdk.exec('alipay.trade.precreate', {
      notifyUrl: ALIPAY_NOTIFY_URL,
      bizContent: {
        out_trade_no: order.id,
        total_amount: CurrencyCalculator.format(amountDecimal),
        subject: `Membership Subscription - ${order.planId}`,
        // 可选：设置二维码过期时间
        timeout_express: '10m',
      },
    });

    if (result.code === '10000') {
      return {
        qrCode: result.qrCode,
      };
    } else {
      console.error('Alipay precreate failed:', result);
      throw new Error(`Alipay error: ${result.subMsg || result.msg}`);
    }
  } catch (error) {
    console.error('Error calling Alipay SDK:', error);
    throw error;
  }
};

/**
 * Creates a WeChat Pay Native payment QR code for a given order.
 * @param order The order object from the database.
 * @returns The payment QR code URL.
 */
export const createWechatPayPayment = async (order: Order) => {
  if (!wechatPayApi) {
    throw new Error('WeChat Pay SDK is not initialized. Please check the server configuration.');
  }

  try {
    // The wechatpay-node-v3 call is different
    const amountDecimal = CurrencyCalculator.fromDatabase(order.amount);
    const result = await wechatPayApi.transactions_native({
      description: `LogicCore Membership - ${order.planId}`,
      out_trade_no: order.id,
      notify_url: WECHAT_NOTIFY_URL,
      amount: {
        total: CurrencyCalculator.yuanToFen(amountDecimal), // WeChat Pay uses cents
      },
      // Optional: set QR code expiration time
      // time_expire: '2025-12-31T16:00:00+08:00',
    });

    // The wechatpay-node-v3 library returns the result directly.
    // On success, the result object contains the code_url
    if (result.data.code_url) {
      return {
        qrCode: result.data.code_url,
      };
    } else {
      console.error('WeChat Pay native payment failed:', result);
      // The library might return an object with an error message if it doesn't throw.
      const errorMessage = (result.data as any).message || 'Unknown error during WeChat Pay creation';
      throw new Error(`WeChat Pay error: ${errorMessage}`);
    }
  } catch (error: any) {
    console.error('Error calling WeChat Pay SDK:', error);
    // The library throws an error for HTTP failures, which might contain more details.
    const message = error.response?.data?.message || error.message || 'Failed to create WeChat Pay payment';
    throw new Error(message);
  }
};