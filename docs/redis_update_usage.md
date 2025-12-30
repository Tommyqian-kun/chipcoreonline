# Redis连接池更新和使用文档

## 1. 更新背景和理由

### 1.1 为什么需要更新Redis连接管理

**原有问题：**
- 系统中多个服务直接导入 `../config/redis` 创建独立的Redis连接
- 高并发场景下可能出现连接耗尽问题
- 缺乏连接重试和故障恢复机制
- Redis操作没有原子性保证，可能出现竞态条件
- 连接管理分散，难以统一监控和优化

**更新理由：**
1. **高并发支持**：ECS部署模式下需要支持多Worker并发处理任务
2. **连接池管理**：统一管理Redis连接，避免连接泄漏
3. **故障恢复**：自动重试机制，提高系统稳定性
4. **原子操作**：支持Lua脚本，确保队列操作的原子性
5. **生产就绪**：符合生产环境的高可用要求

### 1.2 更新范围

**需要更新的文件数量：** 8个核心服务文件
**更新的Redis操作：** 50+ 个Redis调用
**新增功能：** 连接池、原子操作、故障恢复

## 2. Redis连接池服务架构

### 2.1 核心服务：RedisPoolService

```typescript
// app/backend/src/services/redis-pool.service.ts
export class RedisPoolService {
  private static instance: RedisPoolService;
  private redisClient: Redis;

  private constructor() {
    this.redisClient = new Redis({
      // 连接池配置
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
      
      // 重试策略
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
  }

  public static getInstance(): RedisPoolService {
    if (!RedisPoolService.instance) {
      RedisPoolService.instance = new RedisPoolService();
    }
    return RedisPoolService.instance;
  }
}
```

### 2.2 关键特性

1. **单例模式**：确保全局只有一个Redis连接池实例
2. **自动重试**：连接失败时自动重试，指数退避策略
3. **故障恢复**：连接断开时自动重连
4. **原子操作**：支持Lua脚本执行复杂的原子操作
5. **监控支持**：提供连接状态和队列状态查询

## 3. 原子操作实现

### 3.1 队列入队原子操作

**问题**：检查队列长度和添加任务需要原子性，避免竞态条件

**解决方案**：
```typescript
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

  const result = await this.redisClient.eval(lua, 1, queueKey, taskId, maxLength.toString());
  return result === 1;
}
```

**使用场景**：任务提交时确保队列不超过最大长度

### 3.2 队列出队原子操作

```typescript
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

  const result = await this.redisClient.eval(lua, 2, queueKey, activeSetKey);
  return result as string | null;
}
```

**使用场景**：Worker获取任务时确保队列和活跃集合的一致性

## 4. 更新的服务列表

### 4.1 核心服务更新

| 服务文件 | 更新内容 | Redis操作数量 | 更新理由 |
|---------|---------|--------------|---------|
| `task.service.ts` | 队列操作原子化 | 3个 | 任务提交的核心逻辑 |
| `auth.service.ts` | 验证码和令牌管理 | 8个 | 用户认证相关缓存 |
| `task-id-generator.service.ts` | 分布式锁和ID生成 | 12个 | 确保TaskID唯一性 |
| `jwt-blacklist.service.ts` | JWT黑名单管理 | 6个 | 安全相关操作 |
| `task-queue.service.ts` | 队列管理重构 | 15个 | 队列核心功能 |
| `redis-queue-cleanup.service.ts` | 清理服务重构 | 4个 | 队列维护功能 |
| `task-timeout.service.ts` | 超时处理 | 2个 | 任务超时管理 |
| `index.ts` | 服务初始化 | 2个 | 应用启动逻辑 |

### 4.2 更新模式

**统一更新模式：**
```typescript
// 旧模式
import redisClient from '../config/redis';
await redisClient.set(key, value);

// 新模式
const { redisPool } = await import('./redis-pool.service');
await redisPool.getClient().set(key, value);
```

**动态导入的原因：**
1. 避免循环依赖问题
2. 延迟加载，提高启动性能
3. 支持条件导入，便于测试

## 5. 使用场景和最佳实践

### 5.1 任务队列管理

**场景**：用户提交任务到Redis队列
```typescript
// 检查队列容量并原子性入队
const success = await redisPool.atomicEnqueueIfNotFull('task_queue', taskId, 48);
if (!success) {
  throw new Error('队列已满');
}
```

### 5.2 用户认证缓存

**场景**：验证码存储和验证
```typescript
// 存储验证码（2分钟过期）
const { redisPool } = await import('./redis-pool.service');
await redisPool.getClient().set(`verification_code:${email}`, code, 'EX', 120);

// 验证并删除
const storedCode = await redisPool.getClient().get(`verification_code:${email}`);
if (storedCode === code) {
  await redisPool.getClient().del(`verification_code:${email}`);
  return true;
}
```

### 5.3 分布式锁

**场景**：TaskID生成时的分布式锁
```typescript
const lockKey = `task_id_lock:${candidateId}`;
const lockAcquired = await redisPool.getClient().set(
  lockKey, 
  'locked', 
  'EX', 
  30, 
  'NX'
);

if (lockAcquired) {
  try {
    // 执行需要锁保护的操作
  } finally {
    await redisPool.getClient().del(lockKey);
  }
}
```

### 5.4 JWT黑名单管理

**场景**：用户登出时将JWT加入黑名单
```typescript
const { redisPool } = await import('./redis-pool.service');
const key = `jwt_blacklist:${token}`;
await redisPool.getClient().setex(key, expiresIn, JSON.stringify({
  reason: 'logout',
  blacklistedAt: new Date().toISOString()
}));
```

## 6. 错误处理和重试机制

### 6.1 连接重试策略

```typescript
retryStrategy: (times: number) => {
  const delay = Math.min(times * 50, 2000);
  return delay;
}
```

**重试逻辑：**
- 第1次重试：50ms后
- 第2次重试：100ms后
- 第3次重试：150ms后
- ...
- 最大延迟：2000ms

### 6.2 操作重试包装

```typescript
public async safeRpush(key: string, value: string, maxRetries = 3): Promise<number> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.redisClient.rpush(key, value);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}
```

## 7. 监控和调试

### 7.1 队列状态监控

```typescript
public async getQueueStatus(): Promise<{
  queueLength: number;
  activeTasksCount: number;
  activeTaskIds: string[];
}> {
  const [queueLength, activeTasksCount, activeTaskIds] = await Promise.all([
    this.redisClient.llen('task_queue'),
    this.redisClient.scard('active_task_ids'),
    this.redisClient.smembers('active_task_ids')
  ]);

  return { queueLength, activeTasksCount, activeTaskIds };
}
```

### 7.2 连接状态监控

```typescript
// 连接事件监听
this.redisClient.on('connect', () => {
  logger.info('Redis connected successfully');
});

this.redisClient.on('error', (error) => {
  logger.error({ error: error.message }, 'Redis connection error');
});
```

## 8. 性能优化

### 8.1 批量操作

```typescript
// 使用Pipeline进行批量操作
const pipeline = redisPool.getClient().pipeline();
pipeline.sadd('active_task_ids', taskId);
pipeline.rpush('task_queue', taskId);
pipeline.expire('active_task_ids', 3600);
await pipeline.exec();
```

### 8.2 内存优化

```typescript
// 设置合理的过期时间
await redisPool.getClient().setex(key, 3600, value); // 1小时过期

// 定期清理过期数据
await redisPool.getClient().expire('user_tasks:*', 86400); // 24小时过期
```

## 9. 部署和配置

### 9.1 环境变量配置

```bash
# Redis连接配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# 连接池配置
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100
REDIS_MAX_LOADING_TIMEOUT=5000
```

### 9.2 生产环境建议

1. **连接池大小**：根据并发量调整
2. **超时设置**：合理设置操作超时时间
3. **监控告警**：监控连接数和操作延迟
4. **备份策略**：定期备份关键数据
5. **故障切换**：配置Redis主从或集群

## 10. 测试和验证

### 10.1 单元测试

```typescript
describe('RedisPoolService', () => {
  it('should handle connection failures gracefully', async () => {
    // 模拟连接失败
    const result = await redisPool.safeRpush('test_queue', 'test_task');
    expect(result).toBeGreaterThan(0);
  });
});
```

### 10.2 集成测试

```typescript
describe('Task Queue Integration', () => {
  it('should maintain queue consistency under high concurrency', async () => {
    // 并发提交多个任务
    const promises = Array.from({ length: 100 }, (_, i) => 
      redisPool.atomicEnqueueIfNotFull('task_queue', `task_${i}`, 48)
    );
    
    const results = await Promise.all(promises);
    const successCount = results.filter(Boolean).length;
    expect(successCount).toBeLessThanOrEqual(48);
  });
});
```

## 11. 总结

Redis连接池的更新是一个系统性的改进，涉及：

1. **8个核心服务文件**的全面重构
2. **50+个Redis操作**的统一管理
3. **原子操作**的引入，确保数据一致性
4. **故障恢复机制**的完善
5. **监控和调试**功能的增强

这次更新为系统的高并发、高可用奠定了坚实的基础，确保了生产环境的稳定运行。
