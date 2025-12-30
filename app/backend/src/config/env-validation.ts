import { z } from 'zod';

// 环境变量验证schema
const envSchema = z.object({
  // 基础配置
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // 数据库配置
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  
  // JWT配置
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[dhms]$/, 'JWT_EXPIRES_IN must be in format like "1d", "24h", "1440m"').default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().optional().default('30d'),
  JWT_ISSUER: z.string().optional().default('chipcore-api'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),

  // 前端配置
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:3000'),
  HOST: z.string().optional().default('0.0.0.0'),
  
  // 支付配置 - 严格验证，确保生产环境的安全性
  ALIPAY_APP_ID: z.string().min(1, 'ALIPAY_APP_ID is required'),
  ALIPAY_APP_PRIVATE_KEY_PATH: z.string().min(1, 'ALIPAY_APP_PRIVATE_KEY_PATH is required'),
  ALIPAY_PUBLIC_KEY_PATH: z.string().min(1, 'ALIPAY_PUBLIC_KEY_PATH is required'),
  ALIPAY_NOTIFY_URL: z.string().url('ALIPAY_NOTIFY_URL must be a valid URL'),
  
  WECHAT_APP_ID: z.string().min(1, 'WECHAT_APP_ID is required'),
  WECHAT_MCH_ID: z.string().min(1, 'WECHAT_MCH_ID is required'),
  WECHAT_CERTIFICATE_SERIAL_NO: z.string().min(1, 'WECHAT_CERTIFICATE_SERIAL_NO is required'),
  WECHAT_API_V3_KEY: z.string().min(32, 'WECHAT_API_V3_KEY must be at least 32 characters'),
  WECHAT_NOTIFY_URL: z.string().url('WECHAT_NOTIFY_URL must be a valid URL'),
  API_BASE_URL: z.string().url('API_BASE_URL must be a valid URL').default('http://localhost:8080'),
  
  // 阿里云配置
  ALIYUN_ACCESS_KEY_ID: z.string().min(1, 'ALIYUN_ACCESS_KEY_ID is required'),
  ALIYUN_ACCESS_KEY_SECRET: z.string().min(1, 'ALIYUN_ACCESS_KEY_SECRET is required'),
  ALIYUN_RAM_ROLE_ARN: z.string().min(1, 'ALIYUN_RAM_ROLE_ARN is required'),
  ALIYUN_STS_REGION: z.string().default('cn-hangzhou'),
  
  // OSS配置
  OSS_REGION: z.string().default('cn-hangzhou'),
  OSS_BUCKET_USER_INPUT: z.string().min(1, 'OSS_BUCKET_USER_INPUT is required'),
  OSS_BUCKET_JOB_RESULTS: z.string().min(1, 'OSS_BUCKET_JOB_RESULTS is required'),
  OSS_BUCKET_JOB_LOGS: z.string().min(1, 'OSS_BUCKET_JOB_LOGS is required'),
  
  // Worker配置
  ECS_TOTAL_CPU: z.string().regex(/^\d+$/, 'ECS_TOTAL_CPU must be a number').default('8'),
  ECS_TOTAL_MEMORY_GB: z.string().regex(/^\d+$/, 'ECS_TOTAL_MEMORY_GB must be a number').default('64'),
  JOB_CPU_REQUEST: z.string().regex(/^\d+$/, 'JOB_CPU_REQUEST must be a number').default('2'),
  JOB_MEMORY_REQUEST_GB: z.string().regex(/^\d+$/, 'JOB_MEMORY_REQUEST_GB must be a number').default('16'),
  WORKER_ID: z.string().default('worker-main-01'),
  ECS_INSTANCE_ID: z.string().default('ecs-single-node-dev'),
  TASK_QUEUE_NAME: z.string().default('task_queue'),

  // Python配置
  PYTHON_PATH: z.string().optional(),

  // ECS Only模式配置
  DEPLOYMENT_MODE: z.enum(['ecs_only', 'ecs_oss_acr']).default('ecs_only'),
  ECS_LOCAL_STORAGE_ROOT: z.string().optional(),
  ECS_JOBS_DIR: z.string().optional(),
  ECS_TEMPLATES_DIR: z.string().optional(),
  ECS_DOCKER_DIR: z.string().optional(),
  ECS_TEMP_CLEANUP_INTERVAL: z.string().regex(/^\d+$/, 'ECS_TEMP_CLEANUP_INTERVAL must be a number').default('120'),
  ECS_MAX_STORAGE_SIZE: z.string().default('50GB'),
  ECS_FILE_DOWNLOAD_PORT: z.string().regex(/^\d+$/, 'ECS_FILE_DOWNLOAD_PORT must be a number').default('8081'),
  ECS_DOWNLOAD_TIMEOUT: z.string().regex(/^\d+$/, 'ECS_DOWNLOAD_TIMEOUT must be a number').default('120'),
  LOCAL_DOCKER_REGISTRY_ENABLED: z.string().default('true'),
  LOCAL_IMAGES_CACHE_SIZE: z.string().default('20GB'),
  TEMP_UPLOAD_DIR: z.string().optional(),
  TASK_LOGS_DIR: z.string().optional(),

  // 数据库连接配置（可选）
  DB_MAX_CONNECTIONS: z.string().regex(/^\d+$/, 'DB_MAX_CONNECTIONS must be a number').optional().default('10'),
  DB_CONNECTION_TIMEOUT: z.string().regex(/^\d+$/, 'DB_CONNECTION_TIMEOUT must be a number').optional().default('60000'),

  // Redis 配置（可选）
  REDIS_MAX_RETRIES: z.string().regex(/^\d+$/, 'REDIS_MAX_RETRIES must be a number').optional().default('3'),
  REDIS_RETRY_DELAY: z.string().regex(/^\d+$/, 'REDIS_RETRY_DELAY must be a number').optional().default('100'),

  // 邮件配置
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().regex(/^\d+$/, 'EMAIL_PORT must be a number').optional().default('587'),
  EMAIL_SECURE: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('noreply@chipcore.com'),
  EMAIL_PASSWORD: z.string().optional(), // 别名

  // OSS 额外配置（可选）
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),
  OSS_STS_ROLE_ARN: z.string().optional(),

  // 支付额外配置（可选）
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_GATEWAY: z.string().optional().default('https://openapi.alipay.com/gateway.do'),
  ALIPAY_RETURN_URL: z.string().optional(),
  WECHAT_KEY: z.string().optional(),
  WECHAT_CERT_PATH: z.string().optional(),
  WECHAT_KEY_PATH: z.string().optional(),

  // 文件上传配置（可选）
  MAX_FILE_SIZE: z.string().regex(/^\d+$/, 'MAX_FILE_SIZE must be a number').optional().default('104857600'),
  MAX_FILES: z.string().regex(/^\d+$/, 'MAX_FILES must be a number').optional().default('10'),

  // 任务配置（可选）
  TASK_MAX_RETRIES: z.string().regex(/^\d+$/, 'TASK_MAX_RETRIES must be a number').optional().default('3'),
  TASK_TIMEOUT: z.string().regex(/^\d+$/, 'TASK_TIMEOUT must be a number').optional().default('1800000'),
  TASK_POLLING_INTERVAL: z.string().regex(/^\d+$/, 'TASK_POLLING_INTERVAL must be a number').optional().default('3000'),

  // Docker 配置（可选）
  DOCKER_REGISTRY: z.string().optional().default('registry.cn-hangzhou.aliyuncs.com'),
  DOCKER_NAMESPACE: z.string().optional().default('chipcore'),
  DOCKER_PULL_TIMEOUT: z.string().regex(/^\d+$/, 'DOCKER_PULL_TIMEOUT must be a number').optional().default('300000'),

  // 安全配置（可选）
  BCRYPT_ROUNDS: z.string().regex(/^\d+$/, 'BCRYPT_ROUNDS must be a number').optional().default('12'),
  RATE_LIMIT_WINDOW: z.string().regex(/^\d+$/, 'RATE_LIMIT_WINDOW must be a number').optional().default('900000'),
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/, 'RATE_LIMIT_MAX must be a number').optional().default('100'),
  CORS_ORIGINS: z.string().optional(),

  // 日志配置（可选）
  LOG_LEVEL: z.string().optional().default('info'),
  LOG_FORMAT: z.string().optional().default('json'),
  LOG_MAX_FILES: z.string().regex(/^\d+$/, 'LOG_MAX_FILES must be a number').optional().default('5'),
  LOG_MAX_SIZE: z.string().optional().default('10m'),

  // 监控配置（可选）
  MONITORING_ENABLED: z.string().optional(),
  MONITORING_ENDPOINT: z.string().optional(),
  MONITORING_INTERVAL: z.string().regex(/^\d+$/, 'MONITORING_INTERVAL must be a number').optional().default('60000'),

  // 开发环境配置（可选）
  DEBUG_LOGS: z.string().optional(),
  MOCK_PAYMENTS: z.string().optional(),
});

// 验证环境变量
const validateEnv = () => {
  try {
    const result = envSchema.parse(process.env);
    
    // 转换数字类型
    return {
      ...result,
      PORT: parseInt(result.PORT),
      ECS_TOTAL_CPU: parseInt(result.ECS_TOTAL_CPU),
      ECS_TOTAL_MEMORY_GB: parseInt(result.ECS_TOTAL_MEMORY_GB),
      JOB_CPU_REQUEST: parseInt(result.JOB_CPU_REQUEST),
      JOB_MEMORY_REQUEST_GB: parseInt(result.JOB_MEMORY_REQUEST_GB),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nPlease check your .env file and ensure all required variables are set correctly.');
      process.exit(1);
    }
    throw error;
  }
};

export const env = validateEnv();

// 在开发环境下显示配置摘要
if (env.NODE_ENV === 'development') {
  console.log('✅ Environment variables validated successfully');
  console.log('📊 Configuration summary:');
  console.log(`  - Environment: ${env.NODE_ENV}`);
  console.log(`  - Port: ${env.PORT}`);
  console.log(`  - Database: ${env.DATABASE_URL.split('@')[1] || 'configured'}`);
  console.log(`  - Redis: ${env.REDIS_URL.split('@')[1] || 'configured'}`);
  console.log(`  - Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`  - Worker ID: ${env.WORKER_ID}`);
}

// 类型定义
export type EnvConfig = typeof env; 