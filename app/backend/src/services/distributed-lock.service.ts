import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

/**
 * 锁句柄接口
 */
export interface LockHandle {
  lockId: string;
  key: string;
  acquired: boolean;
  release(): Promise<void>;
  extend(ttl: number): Promise<boolean>;
  isValid(): Promise<boolean>;
}

/**
 * 分布式锁实现类
 */
class DistributedLockHandle implements LockHandle {
  private heartbeatInterval?: NodeJS.Timeout;
  private isReleased = false;

  constructor(
    public readonly lockId: string,
    public readonly key: string,
    public readonly acquired: boolean,
    private readonly redis: Redis,
    private readonly lockService: DistributedLockService,
    private readonly initialTtl: number
  ) {
    if (acquired) {
      this.startHeartbeat();
    }
  }

  /**
   * 启动心跳续期
   */
  private startHeartbeat(): void {
    // 每TTL的1/3时间续期一次
    const heartbeatInterval = Math.max(1000, this.initialTtl * 1000 / 3);
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        const extended = await this.extend(this.initialTtl);
        if (!extended) {
          logger.warn({
            lockId: this.lockId,
            key: this.key
          }, 'Failed to extend lock, stopping heartbeat');
          this.stopHeartbeat();
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          lockId: this.lockId,
          key: this.key
        }, 'Error during lock heartbeat');
      }
    }, heartbeatInterval);

    logger.debug({
      lockId: this.lockId,
      key: this.key,
      heartbeatInterval
    }, 'Lock heartbeat started');
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * 释放锁
   */
  async release(): Promise<void> {
    if (this.isReleased) {
      return;
    }

    this.stopHeartbeat();
    this.isReleased = true;

    try {
      await this.lockService.releaseLock(this.key, this.lockId);
      logger.info({
        lockId: this.lockId,
        key: this.key
      }, 'Lock released successfully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        lockId: this.lockId,
        key: this.key
      }, 'Error releasing lock');
    }
  }

  /**
   * 延长锁的TTL
   */
  async extend(ttl: number): Promise<boolean> {
    if (this.isReleased) {
      return false;
    }

    try {
      const result = await this.lockService.extendLock(this.key, this.lockId, ttl);
      if (result) {
        logger.debug({
          lockId: this.lockId,
          key: this.key,
          ttl
        }, 'Lock extended successfully');
      }
      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        lockId: this.lockId,
        key: this.key,
        ttl
      }, 'Error extending lock');
      return false;
    }
  }

  /**
   * 检查锁是否仍然有效
   */
  async isValid(): Promise<boolean> {
    if (this.isReleased) {
      return false;
    }

    try {
      const currentLockId = await this.redis.get(this.key);
      return currentLockId === this.lockId;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        lockId: this.lockId,
        key: this.key
      }, 'Error checking lock validity');
      return false;
    }
  }
}

/**
 * 增强的分布式锁服务
 * 支持自动续期、死锁检测、锁健康监控
 */
export class DistributedLockService {
  private activeLocks: Map<string, LockHandle> = new Map();
  private lockMetrics = {
    acquired: 0,
    released: 0,
    failed: 0,
    expired: 0
  };

  constructor(private redis: Redis) {
    // 启动锁健康检查
    this.startLockHealthCheck();
  }

  /**
   * 获取锁
   */
  async acquireLock(
    key: string, 
    ttl: number = 300, // 默认5分钟
    retryAttempts: number = 3,
    retryDelay: number = 100
  ): Promise<LockHandle> {
    const lockId = uuidv4();
    let attempt = 0;

    while (attempt < retryAttempts) {
      try {
        const acquired = await this.redis.set(key, lockId, 'EX', ttl, 'NX');
        
        const lockHandle = new DistributedLockHandle(
          lockId,
          key,
          acquired === 'OK',
          this.redis,
          this,
          ttl
        );

        if (acquired === 'OK') {
          this.activeLocks.set(key, lockHandle);
          this.lockMetrics.acquired++;
          
          logger.info({
            lockId,
            key,
            ttl,
            attempt: attempt + 1
          }, 'Lock acquired successfully');

          return lockHandle;
        }

        // 获取锁失败，等待后重试
        if (attempt < retryAttempts - 1) {
          await this.sleep(retryDelay * Math.pow(2, attempt)); // 指数退避
        }

      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          key,
          lockId,
          attempt: attempt + 1
        }, 'Error acquiring lock');
      }

      attempt++;
    }

    this.lockMetrics.failed++;
    
    // 返回未获取到的锁句柄
    const failedHandle = new DistributedLockHandle(lockId, key, false, this.redis, this, ttl);
    
    logger.warn({
      key,
      retryAttempts,
      lockId
    }, 'Failed to acquire lock after all attempts');

    return failedHandle;
  }

  /**
   * 释放锁（内部方法）
   */
  async releaseLock(key: string, lockId: string): Promise<void> {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, key, lockId);
      
      if (result === 1) {
        this.activeLocks.delete(key);
        this.lockMetrics.released++;
        logger.debug({ key, lockId }, 'Lock released via Lua script');
      } else {
        logger.warn({ key, lockId }, 'Lock was not owned by this instance');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        lockId
      }, 'Error in lock release Lua script');
      throw error;
    }
  }

  /**
   * 延长锁（内部方法）
   */
  async extendLock(key: string, lockId: string, ttl: number): Promise<boolean> {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, key, lockId, ttl);
      return result === 1;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        lockId,
        ttl
      }, 'Error in lock extend Lua script');
      return false;
    }
  }

  /**
   * 启动锁健康检查
   */
  private startLockHealthCheck(): void {
    setInterval(async () => {
      await this.performLockHealthCheck();
    }, 60000); // 每分钟检查一次
  }

  /**
   * 执行锁健康检查
   */
  private async performLockHealthCheck(): Promise<void> {
    const staleKeys: string[] = [];

    for (const [key, lockHandle] of this.activeLocks.entries()) {
      try {
        const isValid = await lockHandle.isValid();
        if (!isValid) {
          staleKeys.push(key);
          this.lockMetrics.expired++;
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          key
        }, 'Error during lock health check');
        staleKeys.push(key);
      }
    }

    // 清理过期的锁
    for (const key of staleKeys) {
      this.activeLocks.delete(key);
      logger.warn({ key }, 'Removed stale lock from active locks');
    }

    if (staleKeys.length > 0 || this.activeLocks.size > 0) {
      logger.info({
        activeLocks: this.activeLocks.size,
        staleLocksRemoved: staleKeys.length,
        metrics: this.lockMetrics
      }, 'Lock health check completed');
    }
  }

  /**
   * 获取锁统计信息
   */
  getLockMetrics(): {
    activeLocks: number;
    totalAcquired: number;
    totalReleased: number;
    totalFailed: number;
    totalExpired: number;
  } {
    return {
      activeLocks: this.activeLocks.size,
      totalAcquired: this.lockMetrics.acquired,
      totalReleased: this.lockMetrics.released,
      totalFailed: this.lockMetrics.failed,
      totalExpired: this.lockMetrics.expired
    };
  }

  /**
   * 强制释放所有锁（用于优雅关闭）
   */
  async releaseAllLocks(): Promise<void> {
    const lockKeys = Array.from(this.activeLocks.keys());
    
    logger.info({ lockCount: lockKeys.length }, 'Releasing all active locks');

    await Promise.all(
      lockKeys.map(async (key) => {
        const lockHandle = this.activeLocks.get(key);
        if (lockHandle) {
          await lockHandle.release();
        }
      })
    );

    this.activeLocks.clear();
    logger.info('All locks released');
  }

  /**
   * 辅助方法：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例实例
let distributedLockService: DistributedLockService | null = null;

export const initializeDistributedLock = (redis: Redis): DistributedLockService => {
  if (!distributedLockService) {
    distributedLockService = new DistributedLockService(redis);
    logger.info('Distributed lock service initialized');
  }
  return distributedLockService;
};

export const getDistributedLockService = (): DistributedLockService | null => {
  return distributedLockService;
};
