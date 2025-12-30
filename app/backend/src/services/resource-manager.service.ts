import { Redis } from 'ioredis';
import logger from '../config/logger';

/**
 * 可释放资源接口
 */
interface DisposableResource {
  dispose(): Promise<void>;
  getResourceId(): string;
  getResourceType(): string;
}

/**
 * Redis连接包装器
 */
class ManagedRedisConnection implements DisposableResource {
  constructor(private redis: Redis, private connectionId: string) {}

  getRedis(): Redis {
    return this.redis;
  }

  async dispose(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info({ connectionId: this.connectionId }, 'Redis connection disposed');
    } catch (error) {
      logger.error({ error, connectionId: this.connectionId }, 'Error disposing Redis connection');
    }
  }

  getResourceId(): string {
    return this.connectionId;
  }

  getResourceType(): string {
    return 'redis_connection';
  }
}

/**
 * WebSocket连接包装器
 */
class ManagedWebSocketConnection implements DisposableResource {
  constructor(private socketId: string, private userId: string, private cleanupCallback: () => void) {}

  async dispose(): Promise<void> {
    try {
      this.cleanupCallback();
      logger.info({ socketId: this.socketId, userId: this.userId }, 'WebSocket connection disposed');
    } catch (error) {
      logger.error({ error, socketId: this.socketId }, 'Error disposing WebSocket connection');
    }
  }

  getResourceId(): string {
    return this.socketId;
  }

  getResourceType(): string {
    return 'websocket_connection';
  }
}

/**
 * 临时文件包装器
 */
class ManagedTempFile implements DisposableResource {
  constructor(private filePath: string) {}

  async dispose(): Promise<void> {
    try {
      const fs = require('fs').promises;
      await fs.unlink(this.filePath);
      logger.info({ filePath: this.filePath }, 'Temporary file disposed');
    } catch (error) {
      // 文件可能已经被删除，这是正常的
      if (error instanceof Error && (error as any).code !== 'ENOENT') {
        logger.error({ error, filePath: this.filePath }, 'Error disposing temporary file');
      }
    }
  }

  getResourceId(): string {
    return this.filePath;
  }

  getResourceType(): string {
    return 'temp_file';
  }
}

/**
 * 资源生命周期管理器
 * 统一管理系统中的各种资源，防止泄漏
 */
export class ResourceManager {
  private resources: Map<string, DisposableResource> = new Map();
  private resourceTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每5分钟检查一次过期资源
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, 5 * 60 * 1000);

    // 进程退出时清理所有资源
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * 分配资源
   */
  async allocateResource<T extends DisposableResource>(
    resourceId: string,
    factory: () => Promise<T>,
    ttl: number = 30 * 60 * 1000 // 默认30分钟TTL
  ): Promise<T> {
    try {
      // 如果资源已存在，先清理
      if (this.resources.has(resourceId)) {
        await this.releaseResource(resourceId);
      }

      const resource = await factory();
      this.resources.set(resourceId, resource);

      // 设置自动清理定时器
      const timer = setTimeout(async () => {
        logger.warn({ 
          resourceId, 
          resourceType: resource.getResourceType() 
        }, 'Resource TTL expired, auto-releasing');
        await this.releaseResource(resourceId);
      }, ttl);

      this.resourceTimers.set(resourceId, timer);

      logger.info({
        resourceId,
        resourceType: resource.getResourceType(),
        ttl
      }, 'Resource allocated');

      return resource;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        resourceId
      }, 'Failed to allocate resource');
      throw error;
    }
  }

  /**
   * 释放资源
   */
  async releaseResource(resourceId: string): Promise<void> {
    try {
      const resource = this.resources.get(resourceId);
      if (!resource) {
        logger.warn({ resourceId }, 'Attempted to release non-existent resource');
        return;
      }

      // 清理定时器
      const timer = this.resourceTimers.get(resourceId);
      if (timer) {
        clearTimeout(timer);
        this.resourceTimers.delete(resourceId);
      }

      // 释放资源
      await resource.dispose();
      this.resources.delete(resourceId);

      logger.info({
        resourceId,
        resourceType: resource.getResourceType()
      }, 'Resource released');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        resourceId
      }, 'Error releasing resource');
    }
  }

  /**
   * 获取资源
   */
  getResource<T extends DisposableResource>(resourceId: string): T | null {
    return this.resources.get(resourceId) as T || null;
  }

  /**
   * 延长资源TTL
   */
  extendResourceTTL(resourceId: string, additionalTtl: number): void {
    const timer = this.resourceTimers.get(resourceId);
    const resource = this.resources.get(resourceId);

    if (timer && resource) {
      clearTimeout(timer);
      
      const newTimer = setTimeout(async () => {
        logger.warn({ 
          resourceId, 
          resourceType: resource.getResourceType() 
        }, 'Extended resource TTL expired, auto-releasing');
        await this.releaseResource(resourceId);
      }, additionalTtl);

      this.resourceTimers.set(resourceId, newTimer);

      logger.info({
        resourceId,
        additionalTtl
      }, 'Resource TTL extended');
    }
  }

  /**
   * 创建Redis连接资源
   */
  async createRedisConnection(connectionId: string, redisUrl: string): Promise<ManagedRedisConnection> {
    return await this.allocateResource(
      connectionId,
      async () => {
        const redis = new Redis(redisUrl);
        return new ManagedRedisConnection(redis, connectionId);
      },
      60 * 60 * 1000 // Redis连接1小时TTL
    );
  }

  /**
   * 创建WebSocket连接资源
   */
  async createWebSocketConnection(
    socketId: string, 
    userId: string, 
    cleanupCallback: () => void
  ): Promise<ManagedWebSocketConnection> {
    return await this.allocateResource(
      socketId,
      async () => new ManagedWebSocketConnection(socketId, userId, cleanupCallback),
      24 * 60 * 60 * 1000 // WebSocket连接24小时TTL
    );
  }

  /**
   * 创建临时文件资源
   */
  async createTempFile(filePath: string): Promise<ManagedTempFile> {
    return await this.allocateResource(
      filePath,
      async () => new ManagedTempFile(filePath),
      2 * 60 * 60 * 1000 // 临时文件2小时TTL
    );
  }

  /**
   * 定期清理检查
   */
  private async performPeriodicCleanup(): Promise<void> {
    const resourceCount = this.resources.size;
    const timerCount = this.resourceTimers.size;

    logger.info({
      resourceCount,
      timerCount
    }, 'Performing periodic resource cleanup check');

    // 检查是否有泄漏的资源（有资源但没有定时器）
    for (const [resourceId, resource] of this.resources.entries()) {
      if (!this.resourceTimers.has(resourceId)) {
        logger.warn({
          resourceId,
          resourceType: resource.getResourceType()
        }, 'Found leaked resource without timer, cleaning up');
        await this.releaseResource(resourceId);
      }
    }
  }

  /**
   * 获取资源统计信息
   */
  getResourceStats(): {
    totalResources: number;
    resourcesByType: Record<string, number>;
    activeTimers: number;
  } {
    const resourcesByType: Record<string, number> = {};
    
    for (const resource of this.resources.values()) {
      const type = resource.getResourceType();
      resourcesByType[type] = (resourcesByType[type] || 0) + 1;
    }

    return {
      totalResources: this.resources.size,
      resourcesByType,
      activeTimers: this.resourceTimers.size
    };
  }

  /**
   * 优雅关闭，释放所有资源
   */
  async shutdown(): Promise<void> {
    logger.info('Starting resource manager shutdown');

    // 清理定期检查定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 释放所有资源
    const resourceIds = Array.from(this.resources.keys());
    await Promise.all(resourceIds.map(id => this.releaseResource(id)));

    logger.info('Resource manager shutdown completed');
  }
}

// 单例实例
let resourceManager: ResourceManager | null = null;

export const getResourceManager = (): ResourceManager => {
  if (!resourceManager) {
    resourceManager = new ResourceManager();
    logger.info('Resource manager initialized');
  }
  return resourceManager;
};
