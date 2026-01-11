import { redisPool } from './redis-pool.service';
import { prisma } from '../utils/database';
import logger from '../config/logger';

/**
 * 用户并发限制原子检查服务
 * 使用Redis Lua脚本确保检查和资源分配的原子性
 *
 * 核心原理：
 * 1. 在订阅中间件检查时预留并发槽位
 * 2. 任务完成/失败时释放槽位
 * 3. 使用Lua脚本保证原子性
 * 4. 定期从数据库同步状态保证一致性
 */
export class UserConcurrentCheckService {
  private static instance: UserConcurrentCheckService;
  private readonly USER_CONCURRENT_PREFIX = 'user_concurrent:';

  private constructor() {}

  /**
   * 动态计算槽位TTL
   *
   * 基于实际任务执行时间计算，确保槽位不会在任务执行期间过期
   *
   * @returns TTL秒数
   */
  private getSlotExpireSeconds(): number {
    // 从环境变量读取超时配置，与task-timeout.service.ts保持一致
    const queueWaitTimeoutMinutes = parseInt(process.env.QUEUE_WAIT_TIMEOUT_MINUTES || '35');
    const containerStartupTimeoutSeconds = 180; // 3分钟固定
    const executionTimeoutMinutes = parseInt(process.env.CONTAINER_EXECUTION_TIMEOUT_MINUTES || '3');
    const bufferSeconds = 300; // 5分钟额外缓冲

    // 计算总TTL（转换为秒）
    const queueWaitSeconds = queueWaitTimeoutMinutes * 60;
    const executionTimeoutSeconds = executionTimeoutMinutes * 60;

    const totalTTL = queueWaitSeconds + containerStartupTimeoutSeconds + executionTimeoutSeconds + bufferSeconds;

    logger.debug({
      queueWaitMinutes: queueWaitTimeoutMinutes,
      executionTimeoutMinutes: executionTimeoutMinutes,
      totalTTLSeconds: totalTTL,
      totalTTLHours: (totalTTL / 3600).toFixed(2)
    }, 'Calculated dynamic slot TTL');

    return totalTTL;
  }

  /**
   * 刷新用户槽位的TTL
   * 在任务状态更新时调用，确保槽位不会过早过期
   *
   * @param userId 用户ID
   */
  async refreshSlotTTL(userId: string): Promise<void> {
    try {
      const redis = redisPool.getClient();
      const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;
      const newTTL = this.getSlotExpireSeconds();

      await redis.expire(userKey, newTTL);

      logger.debug({
        userId,
        newTTL,
        newTTLHours: (newTTL / 3600).toFixed(2)
      }, 'Slot TTL refreshed');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Failed to refresh slot TTL');
    }
  }

  public static getInstance(): UserConcurrentCheckService {
    if (!UserConcurrentCheckService.instance) {
      UserConcurrentCheckService.instance = new UserConcurrentCheckService();
    }
    return UserConcurrentCheckService.instance;
  }

  /**
   * 原子性地检查并预留用户并发资源槽位
   *
   * Lua脚本执行逻辑：
   * 1. 获取用户当前的并发任务计数
   * 2. 如果计数 < 最大并发数，则递增计数（预留槽位）
   * 3. 如果计数 >= 最大并发数，返回拒绝
   * 4. 设置过期时间防止槽位永久占用
   *
   * @param userId 用户ID
   * @param maxConcurrent 用户最大并发数限制
   * @returns 检查结果
   */
  async atomicCheckAndReserveConcurrentSlot(
    userId: string,
    maxConcurrent: number
  ): Promise<{ allowed: boolean; currentCount: number; reserved: boolean }> {
    // Lua脚本：原子性检查和预留
    const luaScript = `
      local userKey = KEYS[1]
      local maxConcurrent = tonumber(ARGV[1])
      local timestamp = ARGV[2]
      local expireSeconds = tonumber(ARGV[3])

      -- 获取当前用户的并发任务计数
      local current = redis.call('HGET', userKey, 'count')
      local currentCount = current and tonumber(current) or 0

      -- 检查是否超过限制
      if currentCount < maxConcurrent then
        -- 未超限，预留槽位：递增计数
        local newCount = redis.call('HINCRBY', userKey, 'count', 1)
        redis.call('HSET', userKey, 'last_update', timestamp)
        redis.call('HSET', userKey, 'last_reserved', timestamp)
        redis.call('EXPIRE', userKey, expireSeconds)
        return {1, newCount}
      else
        -- 已超限，拒绝请求
        return {0, currentCount}
      end
    `;

    try {
      const redis = redisPool.getClient();
      const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;
      const timestamp = Date.now();
      const slotExpireSeconds = this.getSlotExpireSeconds(); // 使用动态计算的TTL

      // 执行Lua脚本
      const result = await redis.eval(
        luaScript,
        1, // keys数量
        userKey, // KEYS[1]
        maxConcurrent.toString(), // ARGV[1]
        timestamp.toString(), // ARGV[2]
        slotExpireSeconds.toString() // ARGV[3] - 使用动态TTL
      ) as number[];

      const allowed = result[0] === 1;
      const currentCount = result[1];

      logger.info({
        userId,
        maxConcurrent,
        currentCount,
        allowed,
        operation: 'atomic_check_and_reserve'
      }, 'Atomic concurrent check completed');

      return { allowed, currentCount, reserved: allowed };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        maxConcurrent
      }, 'Atomic concurrent check failed');
      throw error;
    }
  }

  /**
   * 释放用户并发槽位（带重试）
   *
   * 在以下情况调用：
   * 1. 任务完成（COMPLETED）
   * 2. 任务失败（FAILED）
   * 3. 任务取消（CANCELLED）
   * 4. 任务提交失败需要回滚
   *
   * @param userId 用户ID
   * @param maxRetries 最大重试次数（默认3次）
   */
  async releaseConcurrentSlotWithRetry(userId: string, maxRetries = 3): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.releaseConcurrentSlot(userId);
        logger.info({
          userId,
          attempt,
          maxRetries
        }, 'Slot released with retry successful');
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn({
          userId,
          attempt,
          maxRetries,
          error: lastError.message
        }, 'Slot release attempt failed, retrying...');

        // 指数退避：100ms, 200ms, 400ms
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        }
      }
    }

    // 所有重试都失败
    logger.error({
      userId,
      maxRetries,
      error: lastError?.message
    }, 'Slot release failed after all retries');

    return false;
  }

  /**
   * 释放用户并发槽位
   *
   * 在以下情况调用：
   * 1. 任务完成（COMPLETED）
   * 2. 任务失败（FAILED）
   * 3. 任务取消（CANCELLED）
   * 4. 任务提交失败需要回滚
   *
   * @param userId 用户ID
   */
  async releaseConcurrentSlot(userId: string): Promise<void> {
    const luaScript = `
      local userKey = KEYS[1]

      -- 获取当前计数
      local current = redis.call('HGET', userKey, 'count')
      local currentCount = current and tonumber(current) or 0

      -- 递减计数（最小为0）
      if currentCount > 0 then
        local newCount = redis.call('HINCRBY', userKey, 'count', -1)
        redis.call('HSET', userKey, 'last_released', ARGV[1])
        return newCount
      else
        return 0
      end
    `;

    try {
      const redis = redisPool.getClient();
      const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;
      const timestamp = Date.now();

      const newCount = await redis.eval(
        luaScript,
        1,
        userKey,
        timestamp.toString()
      ) as number;

      logger.info({
        userId,
        newCount,
        operation: 'release_concurrent_slot'
      }, 'Released concurrent slot');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Failed to release concurrent slot');
      // 不抛出异常，避免影响主流程
    }
  }

  /**
   * 获取用户当前的并发任务数（从Redis）
   *
   * @param userId 用户ID
   * @returns 当前并发任务数
   */
  async getUserConcurrentCount(userId: string): Promise<number> {
    try {
      const redis = redisPool.getClient();
      const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;
      const count = await redis.hget(userKey, 'count');
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Failed to get user concurrent count');
      return 0;
    }
  }

  /**
   * 从数据库同步用户的并发状态到Redis
   *
   * 使用场景：
   * 1. 服务启动时初始化
   * 2. 定期同步任务（由定时任务调用）
   * 3. 发现不一致时手动触发
   *
   * @param userId 用户ID（可选，不传则同步所有用户）
   */
  async syncFromDatabase(userId?: string): Promise<{
    syncedUsers: number;
    totalSlotsSynced: number;
  }> {
    try {
      let usersToSync: Array<{ userId: string; count: number }>;

      if (userId) {
        // 同步单个用户
        const dbCount = await prisma.task.count({
          where: {
            userId,
            status: { in: ['PENDING', 'RUNNING'] }
          }
        });
        usersToSync = [{ userId, count: dbCount }];
      } else {
        // 同步所有有活跃任务的用户
        const activeTasks = await prisma.task.groupBy({
          by: ['userId'],
          where: {
            status: { in: ['PENDING', 'RUNNING'] }
          },
          _count: {
            userId: true
          }
        });

        usersToSync = activeTasks.map(({ userId, _count }) => ({
          userId,
          count: _count.userId
        }));
      }

      // 批量更新Redis
      const redis = redisPool.getClient();
      const slotExpireSeconds = this.getSlotExpireSeconds(); // 使用动态TTL
      let totalSlotsSynced = 0;

      for (const { userId, count } of usersToSync) {
        const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;
        await redis.hset(userKey, 'count', count);
        await redis.hset(userKey, 'last_sync', Date.now());
        await redis.expire(userKey, slotExpireSeconds); // 使用动态TTL
        totalSlotsSynced += count;
      }

      logger.info({
        userId: userId || 'all',
        syncedUsers: usersToSync.length,
        totalSlotsSynced,
        operation: 'sync_from_database'
      }, 'Synced concurrent count from database');

      return {
        syncedUsers: usersToSync.length,
        totalSlotsSynced
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Failed to sync from database');
      throw error;
    }
  }

  /**
   * 清理过期的用户并发记录
   *
   * 定期清理任务，防止Redis中积累过多无效记录
   */
  async cleanupExpiredSlots(): Promise<{
    cleanedCount: number;
  }> {
    try {
      const redis = redisPool.getClient();
      const pattern = `${this.USER_CONCURRENT_PREFIX}*`;
      const keys = await redis.keys(pattern);

      let cleanedCount = 0;
      const slotExpireSeconds = this.getSlotExpireSeconds(); // 使用动态TTL

      for (const key of keys) {
        // 检查是否有设置过期时间
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // 没有过期时间，设置默认过期时间
          await redis.expire(key, slotExpireSeconds);
          cleanedCount++;
        }
      }

      logger.info({
        cleanedCount,
        totalKeys: keys.length,
        defaultTTL: slotExpireSeconds
      }, 'Cleanup expired slots completed');

      return { cleanedCount };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to cleanup expired slots');
      return { cleanedCount: 0 };
    }
  }

  /**
   * 获取服务状态统计信息
   */
  async getStats(): Promise<{
    totalUsersWithSlots: number;
    totalReservedSlots: number;
  }> {
    try {
      const redis = redisPool.getClient();
      const pattern = `${this.USER_CONCURRENT_PREFIX}*`;
      const keys = await redis.keys(pattern);

      let totalReservedSlots = 0;

      for (const key of keys) {
        const count = await redis.hget(key, 'count');
        if (count) {
          totalReservedSlots += parseInt(count, 10);
        }
      }

      return {
        totalUsersWithSlots: keys.length,
        totalReservedSlots
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get stats');
      return {
        totalUsersWithSlots: 0,
        totalReservedSlots: 0
      };
    }
  }
}

// 导出单例实例
export const userConcurrentCheck = UserConcurrentCheckService.getInstance();
