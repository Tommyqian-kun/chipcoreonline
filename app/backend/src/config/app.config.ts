import { env } from './env-validation';

/**
 * 应用程序配置
 * 集中管理所有配置项，避免配置散落在代码中
 */
export const appConfig = {
  // 服务器配置
  server: {
    port: parseInt(env.PORT || '8080'),
    host: env.HOST || '0.0.0.0',
    nodeEnv: env.NODE_ENV || 'development',
  },

  // 数据库配置
  database: {
    url: env.DATABASE_URL,
    maxConnections: parseInt(env.DB_MAX_CONNECTIONS || '10'),
    connectionTimeout: parseInt(env.DB_CONNECTION_TIMEOUT || '60000'),
  },

  // Redis配置
  redis: {
    url: env.REDIS_URL,
    maxRetries: parseInt(env.REDIS_MAX_RETRIES || '3'),
    retryDelayOnFailover: parseInt(env.REDIS_RETRY_DELAY || '100'),
  },

  // JWT配置
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: env.JWT_ISSUER || 'chipcore-api',
  },

  // 邮件配置
  email: {
    host: env.EMAIL_HOST,
    port: parseInt(env.EMAIL_PORT || '587'),
    secure: env.EMAIL_SECURE === 'true',
    user: env.EMAIL_USER,
    password: env.EMAIL_PASSWORD,
    from: env.EMAIL_FROM || 'noreply@chipcore.com',
  },

  // 阿里云OSS配置
  oss: {
    region: env.OSS_REGION,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
    bucket: env.OSS_BUCKET,
    endpoint: env.OSS_ENDPOINT,
    stsRoleArn: env.OSS_STS_ROLE_ARN,
  },

  // 支付配置
  payment: {
    alipay: {
      appId: env.ALIPAY_APP_ID,
      privateKey: env.ALIPAY_PRIVATE_KEY,
      publicKey: env.ALIPAY_PUBLIC_KEY,
      gateway: env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
      notifyUrl: env.ALIPAY_NOTIFY_URL,
      returnUrl: env.ALIPAY_RETURN_URL,
    },
    wechat: {
      appId: env.WECHAT_APP_ID,
      mchId: env.WECHAT_MCH_ID,
      key: env.WECHAT_KEY,
      certPath: env.WECHAT_CERT_PATH,
      keyPath: env.WECHAT_KEY_PATH,
      notifyUrl: env.WECHAT_NOTIFY_URL,
    },
  },

  // 文件上传配置
  upload: {
    maxFileSize: parseInt(env.MAX_FILE_SIZE || '104857600'), // 100MB
    maxFiles: parseInt(env.MAX_FILES || '10'),
    allowedTypes: ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls'],
    // 注意：临时目录配置已移除，统一使用 TEMP_UPLOAD_DIR 环境变量
    // 通过 TEMP_PATHS.ROOT 或直接使用 process.env.TEMP_UPLOAD_DIR 访问
  },

  // 任务执行配置
  task: {
    queueName: env.TASK_QUEUE_NAME || 'task_queue',
    maxRetries: parseInt(env.TASK_MAX_RETRIES || '3'),
    timeout: parseInt(env.TASK_TIMEOUT || '1800000'), // 30分钟
    pollingInterval: parseInt(env.TASK_POLLING_INTERVAL || '3000'),
  },

  // Docker配置
  docker: {
    registry: env.DOCKER_REGISTRY || 'registry.cn-hangzhou.aliyuncs.com',
    namespace: env.DOCKER_NAMESPACE || 'chipcore',
    pullTimeout: parseInt(env.DOCKER_PULL_TIMEOUT || '300000'), // 5分钟
  },

  // 安全配置
  security: {
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS || '12'),
    rateLimitWindow: parseInt(env.RATE_LIMIT_WINDOW || '900000'), // 15分钟
    rateLimitMax: parseInt(env.RATE_LIMIT_MAX || '100'),
    corsOrigins: env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },

  // 日志配置
  logging: {
    level: env.LOG_LEVEL || 'info',
    format: env.LOG_FORMAT || 'json',
    maxFiles: parseInt(env.LOG_MAX_FILES || '5'),
    maxSize: env.LOG_MAX_SIZE || '10m',
  },

  // 监控配置
  monitoring: {
    enabled: env.MONITORING_ENABLED === 'true',
    endpoint: env.MONITORING_ENDPOINT,
    interval: parseInt(env.MONITORING_INTERVAL || '60000'), // 1分钟
  },

  // 开发环境配置
  development: {
    enableSwagger: env.NODE_ENV === 'development',
    enableDebugLogs: env.DEBUG_LOGS === 'true',
    mockPayments: env.MOCK_PAYMENTS === 'true',
  },
};

/**
 * 验证必需的配置项
 */
export const validateConfig = (): void => {
  const requiredConfigs = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
  ];

  const missingConfigs = requiredConfigs.filter(config => !process.env[config]);

  if (missingConfigs.length > 0) {
    throw new Error(`Missing required environment variables: ${missingConfigs.join(', ')}`);
  }

  // 验证JWT密钥长度
  if (appConfig.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // 验证数据库URL格式
  if (!appConfig.database.url.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }
};

export default appConfig;
