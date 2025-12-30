import WechatPay from 'wechatpay-node-v3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const requiredEnv = ['WECHAT_APP_ID', 'WECHAT_MCH_ID', 'WECHAT_API_V3_KEY', 'WECHAT_CERTIFICATE_SERIAL_NO'];
const isDev = process.env.NODE_ENV === 'development';
let wechatPay: WechatPay | null = null;
let wechatConfig: any = null;

const missingEnvVars = requiredEnv.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
  if (isDev) {
    console.warn(`⚠️ WeChat Pay env variables missing: ${missingEnvVars.join(', ')}. WeChat Pay will be disabled in development.`);
  } else {
    throw new Error(`WeChat Pay env variables missing: ${missingEnvVars.join(', ')}. Please check your .env file.`);
  }
} else {
  // Define paths
  const privateKeyPath = path.resolve(__dirname, './wechat_dev_private.pem');

  // Pre-flight check for private key
  if (!fs.existsSync(privateKeyPath)) {
    if (isDev) {
      console.warn(`⚠️ WeChat Pay private key file not found at: ${privateKeyPath}. WeChat Pay will be disabled.`);
    } else {
      throw new Error(`WeChat Pay private key file not found at: ${privateKeyPath}`);
    }
  } else {
    // 微信支付配置需要公钥证书
    const publicKeyPath = path.resolve(__dirname, './wechat_dev_public.pem');
    
    if (!fs.existsSync(publicKeyPath)) {
      if (isDev) {
        console.warn(`⚠️ WeChat Pay public key file not found at: ${publicKeyPath}. WeChat Pay will be disabled.`);
      } else {
        throw new Error(`WeChat Pay public key file not found at: ${publicKeyPath}`);
      }
    } else {
      wechatConfig = {
        appid: process.env.WECHAT_APP_ID,
        mchid: process.env.WECHAT_MCH_ID,
        serial_no: process.env.WECHAT_CERTIFICATE_SERIAL_NO,
        privateKey: fs.readFileSync(privateKeyPath),
        publicKey: fs.readFileSync(publicKeyPath), // 添加公钥
        apiv3Key: process.env.WECHAT_API_V3_KEY,
      };
    }

    try {
      // @ts-ignore
      wechatPay = new WechatPay(wechatConfig);
      console.log('✅ WeChat Pay SDK initialized successfully.');
    } catch (error) {
      if (isDev) {
        console.warn('⚠️ Failed to initialize WechatPay SDK in development:', error);
      } else {
        console.error('❌ Failed to initialize WechatPay SDK:', error);
        throw new Error('Could not initialize WechatPay. Please check your configuration.');
      }
    }
  }
}

export { wechatConfig };
export default wechatPay; 