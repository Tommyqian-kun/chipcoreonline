import Redis from 'ioredis';
import logger from '../config/logger';

/**
 * Redis连接池服务
 * 解决高并发下的Redis连接管理和并发安全问题
 */
export class RedisPoolService {
  private static instance: RedisPoolService;
  private redisClient: Redis;

  private constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),

      // 连接池配置
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,

      // 连接池大小
      lazyConnect: true,
      keepAlive: 30000,

      // 重试配置
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },

      // 连接事件处理
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      }
    };

    this.redisClient = new Redis(redisConfig);

    // 连接事件监听
    this.redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redisClient.on('error', (error) => {
      logger.error({ error: error.message }, 'Redis connection error');
    });

    this.redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  public static getInstance(): RedisPoolService {
    if (!RedisPoolService.instance) {
      RedisPoolService.instance = new RedisPoolService();
    }
    return RedisPoolService.instance;
  }

  public getClient(): Redis {
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
   * 关闭连接
   */
  public async disconnect(): Promise<void> {
    try {
      await this.redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error closing Redis connection');
    }
  }
}

// 导出单例实例
export const redisPool = RedisPoolService.getInstance();
