import axios from 'axios';
import crypto from 'crypto';

/**
 * 支付测试模拟器
 * 用于模拟支付宝和微信支付的完整流程测试
 */

interface PaymentSimulatorOptions {
  baseUrl: string;
  orderId: string;
  paymentMethod: 'ALIPAY' | 'WECHAT_PAY';
  amount: string;
}

export class PaymentSimulator {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  /**
   * 模拟支付宝支付成功回调
   */
  async simulateAlipaySuccess(orderId: string, amount: string) {
    console.log('🔄 模拟支付宝支付成功回调...');
    
    // 模拟支付宝回调参数
    const notifyParams = {
      app_id: process.env.ALIPAY_APP_ID || '9021000122671080',
      auth_app_id: process.env.ALIPAY_APP_ID || '9021000122671080',
      buyer_id: '2088102177846875',
      buyer_logon_id: 'csq***@sandbox.com',
      buyer_pay_amount: amount,
      charset: 'utf-8',
      gmt_create: new Date().toISOString().replace('T', ' ').substring(0, 19),
      gmt_payment: new Date().toISOString().replace('T', ' ').substring(0, 19),
      notify_id: `notify_${Date.now()}`,
      notify_time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      notify_type: 'trade_status_sync',
      out_trade_no: orderId,
      receipt_amount: amount,
      seller_email: 'test@sandbox.com',
      seller_id: '2088102177649450',
      subject: `Membership Subscription - ${orderId}`,
      total_amount: amount,
      trade_no: `2025070822001446870${Math.floor(Math.random() * 1000000)}`,
      trade_status: 'TRADE_SUCCESS',
      version: '1.0',
      sign_type: 'RSA2',
      sign: 'mock_signature_for_testing'
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/payment/notify/alipay`,
        notifyParams,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('✅ 支付宝回调模拟成功:', response.status);
      return response.data;
    } catch (error) {
      console.error('❌ 支付宝回调模拟失败:', error);
      throw error;
    }
  }

  /**
   * 模拟微信支付成功回调
   */
  async simulateWechatSuccess(orderId: string, amount: string) {
    console.log('🔄 模拟微信支付成功回调...');
    
    // 微信支付回调是加密的JSON格式
    const notifyData = {
      id: `notify_${Date.now()}`,
      create_time: new Date().toISOString(),
      event_type: 'TRANSACTION.SUCCESS',
      resource_type: 'encrypt-resource',
      resource: {
        original_type: 'transaction',
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext: 'mock_encrypted_data',
        associated_data: 'transaction',
        nonce: 'mock_nonce'
      },
      summary: '支付成功'
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/payment/notify/wechat`,
        notifyData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Wechatpay-Signature': 'mock_signature',
            'Wechatpay-Timestamp': Math.floor(Date.now() / 1000).toString(),
            'Wechatpay-Nonce': 'mock_nonce',
            'Wechatpay-Serial': process.env.WECHAT_CERTIFICATE_SERIAL_NO || 'mock_serial',
          },
        }
      );

      console.log('✅ 微信支付回调模拟成功:', response.status);
      return response.data;
    } catch (error) {
      console.error('❌ 微信支付回调模拟失败:', error);
      throw error;
    }
  }

  /**
   * 检查订单状态
   */
  async checkOrderStatus(orderId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/orders/${orderId}`);
      console.log('📊 订单状态:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ 检查订单状态失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户订阅状态
   */
  async checkUserSubscription(userId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/users/${userId}/subscription`);
      console.log('👤 用户订阅状态:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ 检查用户订阅失败:', error);
      throw error;
    }
  }

  /**
   * 完整的支付流程测试
   */
  async runCompletePaymentTest(options: PaymentSimulatorOptions) {
    console.log('🚀 开始完整支付流程测试...');
    console.log('📋 测试参数:', options);

    try {
      // 1. 检查初始订单状态
      console.log('\n1️⃣ 检查初始订单状态...');
      const initialOrder = await this.checkOrderStatus(options.orderId);
      
      if (initialOrder.status !== 'PENDING') {
        throw new Error(`订单状态异常: ${initialOrder.status}`);
      }

      // 2. 模拟支付成功
      console.log('\n2️⃣ 模拟支付成功...');
      if (options.paymentMethod === 'ALIPAY') {
        await this.simulateAlipaySuccess(options.orderId, options.amount);
      } else {
        await this.simulateWechatSuccess(options.orderId, options.amount);
      }

      // 3. 等待回调处理
      console.log('\n3️⃣ 等待回调处理...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. 检查订单状态更新
      console.log('\n4️⃣ 检查订单状态更新...');
      const updatedOrder = await this.checkOrderStatus(options.orderId);
      
      if (updatedOrder.status === 'PAID') {
        console.log('✅ 订单状态更新成功: PENDING → PAID');
      } else {
        console.log('❌ 订单状态更新失败:', updatedOrder.status);
      }

      // 5. 检查用户权限升级
      console.log('\n5️⃣ 检查用户权限升级...');
      // 这里需要用户ID，可以从订单中获取
      if (updatedOrder.userId) {
        await this.checkUserSubscription(updatedOrder.userId);
      }

      console.log('\n🎉 支付流程测试完成!');
      return {
        success: true,
        initialOrder,
        updatedOrder,
        paymentMethod: options.paymentMethod
      };

    } catch (error) {
      console.error('\n❌ 支付流程测试失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// 导出单例实例
export const paymentSimulator = new PaymentSimulator();

// 命令行测试函数
export async function testPaymentFlow(orderId: string, paymentMethod: 'ALIPAY' | 'WECHAT_PAY', amount: string = '0.01') {
  const simulator = new PaymentSimulator();
  return await simulator.runCompletePaymentTest({
    baseUrl: 'http://localhost:8080',
    orderId,
    paymentMethod,
    amount
  });
}
