import Redis from 'ioredis';
import logger from '../config/logger';

// ========================================
// Redis连接池配置
// ========================================
// 从环境变量读取配置，基于高并发场景优化
// 计算依据：MAX_CONCURRENT_TASKS=16，Redis单线程模型
// 主要配置超时和重试参数，而非连接数
const REDIS_CONNECT_TIMEOUT = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'); // 连接超时10秒
const REDIS_COMMAND_TIMEOUT = parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'); // 命令超时5秒
const REDIS_MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '3'); // 最大重试次数
const REDIS_RETRY_DELAY = parseInt(process.env.REDIS_RETRY_DELAY || '100'); // 重试延迟100ms
const REDIS_KEEP_ALIVE = parseInt(process.env.REDIS_KEEP_ALIVE || '30000'); // 保活30秒
const REDIS_ENABLE_OFFLINE_QUEUE = process.env.REDIS_ENABLE_OFFLINE_QUEUE === 'true'; // 离线队列
const REDIS_MAX_LOADING_TIMEOUT = parseInt(process.env.REDIS_MAX_LOADING_TIMEOUT || '5000'); // 加载超时

/**
 * Redis连接池服务
 * 解决高并发下的Redis连接管理和并发安全问题
 * 使用单例模式，全应用共享一个Redis连接
 */
export class RedisPoolService {
  private static instance: RedisPoolService;
  private redisClient: Redis;
  private isShuttingDown = false;
  private reconnectionAttempts = 0; // 跟踪重连次数

  private constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),

      // ✅ 连接超时配置
      connectTimeout: REDIS_CONNECT_TIMEOUT,

      // ✅ 命令超时配置（通过showVerboseError间接控制）
      // ioredis不直接支持commandTimeout，通过重试机制实现

      // 连接池配置
      maxRetriesPerRequest: REDIS_MAX_RETRIES,
      retryDelayOnFailover: REDIS_RETRY_DELAY,
      enableReadyCheck: true,
      maxLoadingTimeout: REDIS_MAX_LOADING_TIMEOUT,

      // ✅ 离线队列配置
      enableOfflineQueue: REDIS_ENABLE_OFFLINE_QUEUE,

      // 连接保活
      lazyConnect: true,
      keepAlive: REDIS_KEEP_ALIVE,

      // ✅ 优化的重试策略
      retryStrategy: (times: number) => {
        if (times > REDIS_MAX_RETRIES) {
          return null; // 停止重试
        }
        const delay = Math.min(times * REDIS_RETRY_DELAY, 2000);
        return delay;
      },

      // 连接事件处理
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      },

      // ✅ 连接名（用于调试）
      showFriendlyErrorStack: true,
    };

    this.redisClient = new Redis(redisConfig);

    // 连接事件监听
    this.redisClient.on('connect', () => {
      logger.info({
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db
      }, 'Redis connected successfully');
    });

    this.redisClient.on('ready', async () => {
      logger.info('Redis is ready to accept commands');

      // 如果是重连成功，恢复状态
      if (this.reconnectionAttempts > 0) {
        logger.info({
          reconnectionAttempts: this.reconnectionAttempts
        }, 'Redis reconnected successfully, recovering state...');

        try {
          await this.recoverConnectionState();
          this.reconnectionAttempts = 0; // 重置重连计数
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Failed to recover Redis state after reconnection');
        }
      }
    });

    this.redisClient.on('error', (error) => {
      if (!this.isShuttingDown) {
        logger.error({ error: error.message }, 'Redis connection error');
      }
    });

    this.redisClient.on('close', () => {
      if (!this.isShuttingDown) {
        logger.warn('Redis connection closed');
      }
    });

    this.redisClient.on('reconnecting', () => {
      this.reconnectionAttempts++;
      logger.warn({
        attempt: this.reconnectionAttempts,
        maxRetries: REDIS_MAX_RETRIES
      }, 'Redis reconnecting...');

      if (this.reconnectionAttempts > REDIS_MAX_RETRIES) {
        logger.error('Max Redis reconnection attempts reached, may require manual intervention');
      }
    });

    logger.info({
      connectTimeout: REDIS_CONNECT_TIMEOUT,
      commandTimeout: REDIS_COMMAND_TIMEOUT,
      maxRetries: REDIS_MAX_RETRIES,
      keepAlive: REDIS_KEEP_ALIVE
    }, 'Redis connection pool configured');
  }

  public static getInstance(): RedisPoolService {
    if (!RedisPoolService.instance) {
      RedisPoolService.instance = new RedisPoolService();
    }
    return RedisPoolService.instance;
  }

  /**
   * Redis重连后恢复状态
   *
   * 功能：
   * 1. 检查关键数据结构是否存在
   * 2. 记录队列和活跃任务状态
   * 3. 触发数据库同步以检测不一致
   *
   * 注意：此方法在Redis重连成功后自动调用
   */
  private async recoverConnectionState(): Promise<void> {
    try {
      // 检查task_queue是否存在
      const queueExists = await this.redisClient.exists('task_queue');
      const queueLength = queueExists ? await this.redisClient.llen('task_queue') : 0;

      // 检查active_task_ids是否存在
      const activeSetExists = await this.redisClient.exists('active_task_ids');
      const activeTasksCount = activeSetExists ? await this.redisClient.scard('active_task_ids') : 0;
      const activeTaskIds = activeSetExists ? await this.redisClient.smembers('active_task_ids') : [];

      logger.info({
        queueExists,
        queueLength,
        activeSetExists,
        activeTasksCount,
        activeTaskIds: activeTaskIds.length
      }, 'Redis state recovery check completed');

      // 如果活跃任务集合为空但队列有任务，或者反之，记录警告
      if (queueLength > 0 && activeTasksCount === 0) {
        logger.warn({
          queueLength,
          activeTasksCount
        }, 'Inconsistency detected: queue has tasks but no active task IDs');
      }

      if (queueLength === 0 && activeTasksCount > 0) {
        logger.warn({
          queueLength,
          activeTasksCount
        }, 'Inconsistency detected: active task IDs exist but queue is empty');
      }

      // 记录活跃任务ID列表用于排查
      if (activeTaskIds.length > 0) {
        logger.info({
          activeTaskIds: activeTaskIds.slice(0, 10), // 最多记录10个
          totalActive: activeTaskIds.length
        }, 'Active task IDs after reconnection');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during Redis state recovery');
      throw error;
    }
  }

  public getClient(): Redis {
    // 主动建立连接，确保启动时连接已就绪
    // 解决 lazyConnect=true + enableOfflineQueue=false 导致的启动时序问题
    // 当连接状态为 'wait' 时（使用 lazyConnect 时的初始状态），显式调用 connect() 建立连接
    if (this.redisClient.status === 'wait') {
      this.redisClient.connect().catch(err => {
        logger.error({ error: err.message }, 'Failed to establish Redis connection');
      });
    }
    return this.redisClient;
  }

  /**
   * 带重试的队列推送操作
   */
  public async safeRpush(key: string, value: string, maxRetries = 3): Promise<number> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.redisClient.rpush(key, value);
        logger.debug({ key, value, result }, 'Redis RPUSH successful');
        return result;
      } catch (error) {
        logger.warn({ 
          key, 
          value, 
          attempt: i + 1, 
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Redis RPUSH failed, retrying...');
        
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
    }
    throw new Error('Redis RPUSH operation failed after retries');
  }

  /**
   * 带重试的阻塞队列弹出操作
   */
  public async safeBlpop(key: string, timeout = 0, maxRetries = 3): Promise<[string, string] | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.redisClient.blpop(key, timeout);
        if (result) {
          logger.debug({ key, timeout, result }, 'Redis BLPOP successful');
        }
        return result;
      } catch (error) {
        logger.warn({ 
          key, 
          timeout, 
          attempt: i + 1, 
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Redis BLPOP failed, retrying...');
        
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
    }
    throw new Error('Redis BLPOP operation failed after retries');
  }

  /**
   * 带重试的集合操作
   */
  public async safeSadd(key: string, value: string, maxRetries = 3): Promise<number> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.redisClient.sadd(key, value);
        logger.debug({ key, value, result }, 'Redis SADD successful');
        return result;
      } catch (error) {
        logger.warn({ 
          key, 
          value, 
          attempt: i + 1, 
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Redis SADD failed, retrying...');
        
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
    }
    throw new Error('Redis SADD operation failed after retries');
  }

  /**
   * 带重试的集合移除操作
   */
  public async safeSrem(key: string, value: string, maxRetries = 3): Promise<number> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.redisClient.srem(key, value);
        logger.debug({ key, value, result }, 'Redis SREM successful');
        return result;
      } catch (error) {
        logger.warn({ 
          key, 
          value, 
          attempt: i + 1, 
          maxRetries,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Redis SREM failed, retrying...');
        
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      }
    }
    throw new Error('Redis SREM operation failed after retries');
  }

  /**
   * 原子操作：检查队列长度并添加任务
   */
  public async atomicEnqueueIfNotFull(queueKey: string, taskId: string, maxLength: number): Promise<boolean> {
    const lua = `
      local queueKey = KEYS[1]
      local taskId = ARGV[1]
      local maxLength = tonumber(ARGV[2])

      local currentLength = redis.call('LLEN', queueKey)
      if currentLength >= maxLength then
        return 0
      else
        redis.call('RPUSH', queueKey, taskId)
        redis.call('SADD', 'active_task_ids', taskId)
        return 1
      end
    `;

    try {
      const result = await this.redisClient.eval(lua, 1, queueKey, taskId, maxLength.toString());
      const success = result === 1;
      
      logger.info({
        queueKey,
        taskId,
        maxLength,
        success,
        currentLength: await this.redisClient.llen(queueKey)
      }, 'Atomic enqueue operation completed');
      
      return success;
    } catch (error) {
      logger.error({
        queueKey,
        taskId,
        maxLength,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Atomic enqueue operation failed');
      throw error;
    }
  }

  /**
   * 原子操作：从队列和活跃集合中移除任务
   */
  public async atomicDequeue(queueKey: string, activeSetKey: string): Promise<string | null> {
    const lua = `
      local queueKey = KEYS[1]
      local activeSetKey = KEYS[2]
      
      local taskId = redis.call('LPOP', queueKey)
      if taskId then
        redis.call('SREM', activeSetKey, taskId)
        return taskId
      else
        return nil
      end
    `;

    try {
      const result = await this.redisClient.eval(lua, 2, queueKey, activeSetKey);
      
      if (result) {
        logger.debug({
          queueKey,
          activeSetKey,
          taskId: result
        }, 'Atomic dequeue operation successful');
      }
      
      return result as string | null;
    } catch (error) {
      logger.error({
        queueKey,
        activeSetKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Atomic dequeue operation failed');
      throw error;
    }
  }

  /**
   * 获取队列状态信息
   */
  public async getQueueStatus(): Promise<{
    queueLength: number;
    activeTasksCount: number;
    activeTaskIds: string[];
  }> {
    try {
      const [queueLength, activeTasksCount, activeTaskIds] = await Promise.all([
        this.redisClient.llen('task_queue'),
        this.redisClient.scard('active_task_ids'),
        this.redisClient.smembers('active_task_ids')
      ]);

      return {
        queueLength,
        activeTasksCount,
        activeTaskIds
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get queue status');
      throw error;
    }
  }

  /**
   * 获取Redis连接池状态信息
   */
  public getPoolStatus(): {
    isConnected: boolean;
    status: string;
    pendingCommands: number;
    config: {
      connectTimeout: number;
      commandTimeout: number;
      maxRetries: number;
      keepAlive: number;
    };
  } {
    return {
      isConnected: this.redisClient.status === 'ready',
      status: this.redisClient.status,
      pendingCommands: (this.redisClient as any).pending || 0,
      config: {
        connectTimeout: REDIS_CONNECT_TIMEOUT,
        commandTimeout: REDIS_COMMAND_TIMEOUT,
        maxRetries: REDIS_MAX_RETRIES,
        keepAlive: REDIS_KEEP_ALIVE
      }
    };
  }

  /**
   * 优雅关闭连接
   */
  public async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    try {
      // 等待现有命令完成
      const pending = (this.redisClient as any).pending || 0;
      if (pending > 0) {
        logger.info({ pendingCommands: pending }, 'Waiting for pending Redis commands to complete...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 断开连接
      await this.redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error closing Redis connection');
      // 强制断开
      this.redisClient.disconnect();
    }
  }
}

// 导出单例实例
export const redisPool = RedisPoolService.getInstance();
