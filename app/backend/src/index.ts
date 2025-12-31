import 'express-async-errors'; // Must be imported first
// 环境变量加载 - 必须在所有其他模块之前引入
import './envLoader';
// 环境变量验证 - 必须在envLoader之后引入
import { env } from './config/env-validation';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { initializeWebSocket } from './services/websocket.service';
import { initializeMonitoring } from './services/monitoring.service';
import { initializeBackupService } from './services/backup.service';
import { initializeDistributedLock } from './services/distributed-lock.service';
import { initializeTaskStateManager } from './services/task-state-manager.service';
import { getResourceManager } from './services/resource-manager.service';
// Redis连接池将在需要时动态导入
import {
  apiVersionMiddleware,
  responseFormatMiddleware,
  deprecationNoticeMiddleware,
  getVersionStats
} from './middleware/api-version';
import authRoutes from './routes/auth.routes';
import orderRoutes from './routes/order.routes';
import subscriptionRoutes from './routes/subscription.routes';
import userRoutes from './routes/user.routes';
import paymentRoutes from './routes/payment.routes';
import planRoutes from './routes/plan.routes';
import taskRoutes from './routes/task.routes';
import adminRoutes from './routes/admin.routes';
import feedbackRoutes from './routes/feedback.routes';
import templateRoutes from './routes/template.routes';
import downloadRoutes from './routes/download.routes';
import ecsFileRoutes from './routes/ecs-file.routes';
import adminTaskRoutes from './routes/admin-task.routes';
import systemRoutes from './routes/system.routes';
import sdcThrpagesRoutes from './routes/sdc_thrpages.routes';
import upfThrpagesRoutes from './routes/upf_thrpages.routes';
import configRoutes from './routes/config.routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDb } from './config/database';
import { DeploymentModeService } from './services/deployment-mode.service';
import { CleanupService } from './services/cleanup.service';
import { TaskTimeoutService } from './services/task-timeout.service';
import { TaskConsistencyService } from './services/task-consistency.service';
import { TaskRetryService } from './services/task-retry.service';
import { TaskLogCleanupService } from './services/task-log-cleanup.service';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { ECS_LOCAL_PATHS } from './config/paths';
import { ToolMappingService } from './services/tool-mapping.service';
import logger, { requestLogger } from './config/logger';
import * as fs from 'fs';

const app = express();
const PORT = env.PORT;

// Worker服务将由WorkerService管理，移除重复实现

async function startServer() {
  // --- Service Initialization ---
  
  /*
  try {
    await initializeWechatPayPlatformCert();
    console.log('✅ WeChat Pay SDK initialized successfully.');
  } catch(error) {
    console.error('❌ Failed to initialize WeChat Pay SDK:', error);
  }
  */

  // --- Essential Middleware ---
  
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds - 更适合开发和测试环境的频率限制
    max: 5, // limit each IP to 5 auth requests per 30 seconds
    message: 'Too many authentication attempts, please try again in 30 seconds.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(generalLimiter);

  // Request logging middleware
  app.use(requestLogger);

  app.use(cors({
    origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'], // 暴露Content-Disposition头给前端
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // --- API Routes ---
  const apiV1Router = express.Router();
  
  apiV1Router.use('/auth', authLimiter, authRoutes);
  apiV1Router.use('/users', userRoutes);
  apiV1Router.use('/plans', planRoutes);
  apiV1Router.use('/orders', orderRoutes);
  apiV1Router.use('/payment', paymentRoutes);
  apiV1Router.use('/subscriptions', subscriptionRoutes);
  apiV1Router.use('/tasks', taskRoutes);
  apiV1Router.use('/admin', adminRoutes);
  apiV1Router.use('/feedback', feedbackRoutes);
  apiV1Router.use('/templates', templateRoutes);
  apiV1Router.use('/download', downloadRoutes);
  apiV1Router.use('/system', systemRoutes);
  apiV1Router.use('/sdc-thrpages', sdcThrpagesRoutes);
  apiV1Router.use('/upf-thrpages', upfThrpagesRoutes);
  apiV1Router.use('/config', configRoutes);

  // ECS Only模式专用路由
  if (DeploymentModeService.isEcsOnlyMode()) {
    apiV1Router.use('/ecs-files', ecsFileRoutes);
  }

  // 管理员路由（支持双部署模式）
  apiV1Router.use('/admin', adminTaskRoutes);

  // Initialize services with Redis pool
  const { redisPool } = await import('./services/redis-pool.service');
  const redis = redisPool.getClient();
  const monitoringService = initializeMonitoring(redis);
  const backupService = initializeBackupService(redis);
  const distributedLockService = initializeDistributedLock(redis);
  const taskStateManager = initializeTaskStateManager();
  const resourceManager = getResourceManager();

  // Initialize deployment mode specific services
  await initializeDeploymentModeServices();

  // Add API version management middleware
  app.use('/api', apiVersionMiddleware);
  app.use('/api', responseFormatMiddleware);
  app.use('/api', deprecationNoticeMiddleware);

  // Add monitoring middleware
  app.use(monitoringService.requestMonitoringMiddleware);

  // Health check endpoint with detailed monitoring
  app.get('/health', async (req, res) => {
    try {
      const healthStatus = await monitoringService.getHealthStatus();
      const statusCode = healthStatus.status === 'healthy' ? 200 :
                        healthStatus.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(healthStatus);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Metrics endpoint
  app.get('/metrics', (req, res) => {
    const metrics = monitoringService.getMetrics();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  });

  // System services status endpoint
  app.get('/admin/services/status', (req, res) => {
    const servicesStatus = {
      distributedLock: distributedLockService.getLockMetrics(),
      taskStateManager: taskStateManager.getStats(),
      resourceManager: resourceManager.getResourceStats(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: servicesStatus
    });
  });

  // API version information endpoint
  app.get('/api/version', async (req, res) => {
    const versionStats = await getVersionStats();
    res.json({
      success: true,
      data: versionStats,
      timestamp: new Date().toISOString()
    });
  });

  // Backup management endpoints (admin only)
  app.post('/admin/backup', async (req, res) => {
    try {
      const result = await backupService.performFullBackup();
      res.json({
        success: result.success,
        data: result,
        message: result.success ? 'Backup completed successfully' : 'Backup failed'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Backup operation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/admin/backup/history', async (req, res) => {
    try {
      const history = await backupService.getBackupHistory();
      res.json({
        success: true,
        data: history,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get backup history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api', (req, res) => res.send('ChipCore API is running!'));
  app.use('/api/v1', apiV1Router);

  // Initialize database and other services
  initializeDb();

  // Initialize SDC multi-page database schema if needed
  try {
    const { ExcelThrpagesService } = await import('./services/excel_thrpages.service');
    const { prisma } = await import('./utils/database');

    // Check if SDC schema is already initialized
    const existingSdcSheets = await prisma.sheet.findMany({
      where: { toolType: 'sdc' }
    });

    if (existingSdcSheets.length === 0) {
      logger.info('🔄 Initializing SDC multi-page database schema using dynamic parsing...');
      await ExcelThrpagesService.initializeDatabaseSchema('sdc');
      logger.info('✅ SDC multi-page database schema initialized successfully');
    } else {
      logger.info(`✅ SDC multi-page database schema already exists (${existingSdcSheets.length} sheets)`);
    }
    // 不需要$disconnect()，使用共享的prisma实例
  } catch (error) {
    logger.error('❌ Failed to initialize SDC multi-page database schema:', error);
  }

  // Initialize UPF multi-page database schema if needed
  try {
    const { ExcelThrpagesService } = await import('./services/excel_thrpages.service');
    const { prisma } = await import('./utils/database');

    // Check if UPF schema is already initialized
    const existingUpfSheets = await prisma.sheet.findMany({
      where: { toolType: 'upf' }
    });

    if (existingUpfSheets.length === 0) {
      logger.info('🔄 Initializing UPF multi-page database schema using dynamic parsing...');
      await ExcelThrpagesService.initializeDatabaseSchema('upf');
      logger.info('✅ UPF multi-page database schema initialized successfully');
    } else {
      logger.info(`✅ UPF multi-page database schema already exists (${existingUpfSheets.length} sheets)`);
    }
    // 不需要$disconnect()，使用共享的prisma实例
  } catch (error) {
    logger.error('❌ Failed to initialize UPF multi-page database schema:', error);
    // 不要阻塞启动，继续执行
  }

  // Initialize tool mapping service
  try {
    await ToolMappingService.initialize();
    logger.info('✅ Tool mapping service initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize tool mapping service:', error);
  }

  // Initialize task timeout monitoring
  try {
    TaskTimeoutService.startTimeoutMonitoring();
    logger.info('✅ Task timeout monitoring started successfully');
  } catch (error) {
    logger.error({ error }, '❌ Failed to start task timeout monitoring');
  }

  // Initialize task consistency monitoring
  try {
    TaskConsistencyService.startPeriodicConsistencyCheck(5); // 每5分钟检查一次
    logger.info('✅ Task consistency monitoring started successfully');
  } catch (error) {
    logger.error({ error }, '❌ Failed to start task consistency monitoring');
  }

  // Worker service will be started later in the initialization sequence

  // Initialize task retry service (异步执行，不阻塞启动)
  TaskRetryService.initializeRetryService().catch(error => {
    logger.error({ error }, '❌ Failed to initialize task retry service');
  });

  // Initialize task log cleanup service
  try {
    TaskLogCleanupService.startLogCleanupService();
    logger.info('✅ Task log cleanup service started successfully');
  } catch (error) {
    logger.error({ error }, '❌ Failed to start task log cleanup service');
  }

  // 【新增】Initialize user concurrent state sync
  // 从数据库同步活跃任务的用户并发状态到Redis
  try {
    const { userConcurrentCheck } = await import('./services/user-concurrent-check.service');
    const syncResult = await userConcurrentCheck.syncFromDatabase();
    logger.info({
      syncedUsers: syncResult.syncedUsers,
      totalSlotsSynced: syncResult.totalSlotsSynced
    }, '✅ User concurrent state sync completed');
  } catch (error) {
    logger.error({ error }, '❌ Failed to sync user concurrent state');
  }

  // --- Global Error Handler ---
  // This must be the last middleware
  app.use(errorHandler);

  // --- Start HTTP Server with WebSocket Support ---
  const server = createServer(app);

  // Initialize WebSocket service
  const webSocketService = initializeWebSocket(server);
  logger.info('WebSocket service initialized');

  // Start scheduled backups if enabled
  if (process.env.ENABLE_SCHEDULED_BACKUPS === 'true') {
    backupService.startScheduledBackups();
    logger.info('Scheduled backups enabled');
  }

  // Auto-start Worker processes for task execution using WorkerService
  try {
    const { workerService } = await import('./services/workerService');

    logger.info('Starting Worker service...');
    const workerStarted = await workerService.startWorker();

    if (workerStarted) {
      logger.info('✅ Worker service started successfully');

      // 获取Worker状态信息
      const workerStatus = workerService.getStatus();
      logger.info({
        processId: workerStatus.processId,
        startTime: workerStatus.startTime,
        isRunning: workerStatus.isRunning
      }, 'Worker service status');
    } else {
      logger.warn('⚠️ Worker service failed to start - tasks may not be processed');
    }
  } catch (error) {
    logger.error({ error }, '❌ Failed to initialize Worker service');
  }

  server.listen(PORT, () => {
    logger.info(`🚀 Backend server is running at http://localhost:${PORT}`);
    logger.info('WebSocket server is ready for connections');
    logger.info('All services initialized successfully');
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    try {
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Stop task state manager
      taskStateManager.stop();

      // Release all distributed locks
      await distributedLockService.releaseAllLocks();

      // Shutdown resource manager
      await resourceManager.shutdown();

      // Stop cleanup service
      CleanupService.stopCleanupService();

      // Stop Worker service
      try {
        const { workerService } = await import('./services/workerService');
        await workerService.stopWorker();
        logger.info('Worker service stopped');
      } catch (error) {
        logger.error({ error }, 'Error stopping Worker service');
      }

      // Shutdown worker service handled by WorkerService

      // Close Redis connection
      await redisPool.disconnect();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

/**
 * 初始化部署模式相关服务
 */
async function initializeDeploymentModeServices(): Promise<void> {
  const deploymentMode = DeploymentModeService.getDeploymentMode();

  logger.info({
    deploymentMode,
    config: DeploymentModeService.getConfigSummary()
  }, 'Initializing deployment mode services');

  if (DeploymentModeService.isEcsOnlyMode()) {
    logger.info('Starting in ECS Only mode');

    // 验证ECS Only配置
    const configValidation = DeploymentModeService.validateEcsOnlyConfig();
    if (!configValidation.valid) {
      logger.error({
        errors: configValidation.errors
      }, 'ECS Only configuration validation failed');
      throw new Error(`ECS Only configuration invalid: ${configValidation.errors.join(', ')}`);
    }

    // 创建必要的本地目录
    await createEcsLocalDirectories();

    // 启动清理服务
    CleanupService.startCleanupService();

    logger.info('ECS Only mode services initialized successfully');
  } else {
    logger.info('Starting in ECS + OSS + ACR mode');
  }
}

/**
 * 创建ECS本地目录结构
 */
async function createEcsLocalDirectories(): Promise<void> {
  try {
    const directories = [
      ECS_LOCAL_PATHS.ROOT,
      ECS_LOCAL_PATHS.JOBS,
      ECS_LOCAL_PATHS.TEMPLATES,
      ECS_LOCAL_PATHS.DOCKER,
      ECS_LOCAL_PATHS.getImagesDir(),
      ECS_LOCAL_PATHS.getVolumesDir()
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
        logger.info({ directory: dir }, 'Created ECS local directory');
      }
    }

    logger.info({
      directories: directories.length,
      rootPath: ECS_LOCAL_PATHS.ROOT
    }, 'ECS local directories initialized');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'Failed to create ECS local directories');
    throw error;
  }
}

startServer().catch(error => {
  logger.error({ error }, '❌ Failed to start server');
  process.exit(1);
});