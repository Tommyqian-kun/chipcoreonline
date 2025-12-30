import { AlipaySdk } from 'alipay-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const requiredEnv = [
  'ALIPAY_APP_ID',
  'ALIPAY_APP_PRIVATE_KEY_PATH',
  'ALIPAY_PUBLIC_KEY_PATH',
];

// In development, allow missing env vars
const isDev = process.env.NODE_ENV === 'development';
let alipaySdk: AlipaySdk | null = null;

// Check if all required env vars are present
const missingEnvVars = requiredEnv.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
  if (isDev) {
    console.warn(`⚠️ Alipay env variables missing: ${missingEnvVars.join(', ')}. Alipay will be disabled in development.`);
  } else {
    throw new Error(`Alipay env variables missing: ${missingEnvVars.join(', ')}. Please check your .env file.`);
  }
} else {
  const privateKeyPath = path.resolve(__dirname, process.env.ALIPAY_APP_PRIVATE_KEY_PATH!);
  const alipayPublicKeyPath = path.resolve(__dirname, process.env.ALIPAY_PUBLIC_KEY_PATH!);

  // Pre-flight checks for key files
  if (!fs.existsSync(privateKeyPath)) {
    if (isDev) {
      console.warn(`⚠️ Alipay private key file not found at: ${privateKeyPath}. Alipay will be disabled.`);
    } else {
      throw new Error(`Alipay private key file not found at: ${privateKeyPath}`);
    }
  } else if (!fs.existsSync(alipayPublicKeyPath)) {
    if (isDev) {
      console.warn(`⚠️ Alipay public key file not found at: ${alipayPublicKeyPath}. Alipay will be disabled.`);
    } else {
      throw new Error(`Alipay public key file not found at: ${alipayPublicKeyPath}`);
    }
  } else {
    try {
      alipaySdk = new AlipaySdk({
        appId: process.env.ALIPAY_APP_ID!,
        privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
        alipayPublicKey: fs.readFileSync(alipayPublicKeyPath, 'utf8'),
        gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do', // Use stable sandbox environment gateway
      });
      console.log('✅ Alipay SDK initialized successfully.');
    } catch (error) {
      if (isDev) {
        console.warn('⚠️ Failed to initialize Alipay SDK in development:', error);
      } else {
        console.error('❌ Failed to initialize Alipay SDK:', error);
        throw error;
      }
    }
  }
}

export default alipaySdk; 