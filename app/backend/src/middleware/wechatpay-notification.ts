import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../config/logger';
import wechatpay from '../config/wechatpay';

/**
 * 微信支付回调通知接口
 */
interface WechatPayNotificationRequest extends Request {
  notification?: any;
}

/**
 * 微信支付回调通知结构
 */
interface WechatPayNotification {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  resource: {
    algorithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
}

/**
 * 微信支付签名验证和解密中间件
 *
 * 功能：
 * 1. 验证微信支付回调的签名
 * 2. 解密回调通知数据
 * 3. 将解密后的数据附加到 req.notification
 *
 * 使用场景：
 * - 在微信支付回调路由中使用
 * - POST /api/v1/payment/notify/wechat
 *
 * 安全保障：
 * - 验证签名防止伪造通知
 * - 解密数据保护隐私信息
 * - 记录所有验证失败尝试
 */
export const wechatPayNotificationMiddleware = async (
  req: WechatPayNotificationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 检查微信支付SDK是否已初始化
    if (!wechatpay) {
      logger.error('WeChat Pay SDK not initialized');
      return res.status(500).json({ code: 'FAIL', message: '支付服务未初始化' });
    }

    // 获取微信支付配置
    const { wechatConfig } = await import('../config/wechatpay');
    if (!wechatConfig) {
      logger.error('WeChat Pay config not available');
      return res.status(500).json({ code: 'FAIL', message: '支付配置不可用' });
    }

    // 获取回调数据
    const notification = req.body as WechatPayNotification;

    if (!notification) {
      logger.warn('Empty notification body received');
      return res.status(400).json({ code: 'FAIL', message: '通知数据为空' });
    }

    // 验证必要字段
    if (!notification.id || !notification.resource || !notification.resource.ciphertext) {
      logger.warn({ notification }, 'Invalid notification format');
      return res.status(400).json({ code: 'FAIL', message: '通知格式无效' });
    }

    // 步骤1: 验证签名
    // 获取请求头中的签名信息
    const timestamp = req.headers['wechatpay-timestamp'] as string;
    const nonce = req.headers['wechatpay-nonce'] as string;
    const signature = req.headers['wechatpay-signature'] as string;
    const serial = req.headers['wechatpay-serial'] as string;

    if (!timestamp || !nonce || !signature || !serial) {
      logger.warn({
        headers: {
          'wechatpay-timestamp': !!timestamp,
          'wechatpay-nonce': !!nonce,
          'wechatpay-signature': !!signature,
          'wechatpay-serial': !!serial
        }
      }, 'Missing WeChat Pay signature headers');
      return res.status(400).json({ code: 'FAIL', message: '缺少签名验证头' });
    }

    // 构建待签名串
    const message = `${timestamp}\n${nonce}\n${JSON.stringify(req.body)}\n`;

    // 使用公钥验证签名
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message, 'utf8');
    verify.end();

    const signatureVerified = verify.verify(
      {
        key: wechatConfig.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING
      },
      Buffer.from(signature, 'base64')
    );

    if (!signatureVerified) {
      logger.warn({
        timestamp,
        nonce,
        serial,
        body: req.body
      }, 'WeChat Pay signature verification failed');
      return res.status(400).json({ code: 'FAIL', message: '签名验证失败' });
    }

    logger.info({
      notificationId: notification.id,
      eventType: notification.event_type,
      serial
    }, 'WeChat Pay signature verified');

    // 步骤2: 解密通知数据
    const { resource } = notification;
    const { algorithm, ciphertext, associated_data, nonce: resourceNonce } = resource;

    if (algorithm !== 'AEAD_AES_256_GCM') {
      logger.warn({ algorithm }, 'Unsupported encryption algorithm');
      return res.status(400).json({ code: 'FAIL', message: '不支持的加密算法' });
    }

    // 解密数据
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(wechatConfig.apiv3Key, 'base64'), Buffer.from(resourceNonce, 'base64'));

    decipher.setAuthTag(Buffer.from(ciphertext, 'base64').slice(-16));
    decipher.setAAD(Buffer.from(associated_data, 'base64'));

    const encryptedText = Buffer.from(ciphertext, 'base64').slice(0, -16);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const decryptedData = decrypted.toString('utf8');
    const decryptedObj = JSON.parse(decryptedData);

    // 将解密后的数据附加到请求对象
    req.notification = {
      ...decryptedObj,
      notification_id: notification.id,
      event_type: notification.event_type
    };

    logger.info({
      notificationId: notification.id,
      eventType: notification.event_type,
      outTradeNo: decryptedObj.out_trade_no,
      transactionId: decryptedObj.transaction_id
    }, 'WeChat Pay notification decrypted successfully');

    next();
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error processing WeChat Pay notification');

    return res.status(500).json({
      code: 'FAIL',
      message: '通知处理失败'
    });
  }
};

/**
 * 验证微信支付回调IP白名单（可选增强）
 *
 * 微信支付建议验证回调IP是否来自微信服务器
 * 这可以进一步防止伪造通知
 */
export const wechatPayIpWhitelistMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 微信支付回调IP白名单
  const WECHAT_PAY_IP_WHITELIST = process.env.WECHAT_PAY_IP_WHITELIST
    ? process.env.WECHAT_PAY_IP_WHITELIST.split(',').map(ip => ip.trim())
    : [];

  // 如果没有配置白名单，跳过验证（开发环境）
  if (WECHAT_PAY_IP_WHITELIST.length === 0) {
    logger.debug('WeChat Pay IP whitelist not configured, skipping validation');
    return next();
  }

  // 获取客户端IP
  const clientIp = req.ip ||
                  req.connection.remoteAddress ||
                  req.socket.remoteAddress ||
                  req.headers['x-forwarded-for'] as string ||
                  '';

  // 处理x-forwarded-for可能有多个IP的情况
  const ips = clientIp.split(',').map((ip: string) => ip.trim());
  const firstIp = ips[0];

  // 验证IP
  const ipAllowed = WECHAT_PAY_IP_WHITELIST.some(whitelistIp => {
    // 支持IP段匹配 (如 192.168.1.*)
    if (whitelistIp.includes('*')) {
      const prefix = whitelistIp.replace('*', '');
      return firstIp.startsWith(prefix);
    }
    return firstIp === whitelistIp;
  });

  if (!ipAllowed) {
    logger.warn({
      clientIp: firstIp,
      whitelist: WECHAT_PAY_IP_WHITELIST
    }, 'WeChat Pay notification from non-whitelisted IP');

    return res.status(403).json({
      code: 'FAIL',
      message: 'IP地址不在白名单中'
    });
  }

  logger.debug({
    clientIp: firstIp
  }, 'WeChat Pay notification IP validated');

  next();
};
