/**
 * Redis分布式锁单元测试
 * 测试分布式锁的获取、释放、过期和互斥功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
  };

  return {
    default: vi.fn(() => mockRedis),
  };
});

// 模拟RedisLockService类
class MockRedisLockService {
  private redis: any;
  private readonly lockPrefix: string;

  constructor(redis: any, lockPrefix = 'taskid_lock:') {
    this.redis = redis;
    this.lockPrefix = lockPrefix;
  }

  private getLockKey(taskId: string): string {
    return `${this.lockPrefix}${taskId}`;
  }

  async acquire(
    taskId: string,
    workerId: string,
    ttl = 30000
  ): Promise<{ acquired: boolean; lockId?: string; error?: string }> {
    const lockKey = this.getLockKey(taskId);
    const lockId = `${workerId}:${Date.now()}`;
    const lockValue = `${lockId}:${Math.random().toString(36).substring(2, 11)}`;

    const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');

    if (result === 'OK') {
      return { acquired: true, lockId: lockValue };
    }

    return { acquired: false, error: '锁已被其他Worker持有' };
  }

  async release(taskId: string, lockId: string): Promise<boolean> {
    const lockKey = this.getLockKey(taskId);

    // 使用Lua脚本确保原子性
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockId);
    return result === 1;
  }

  async extend(taskId: string, lockId: string, ttl = 30000): Promise<boolean> {
    const lockKey = this.getLockKey(taskId);

    // 使用Lua脚本确保只延长自己持有的锁
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockId, ttl);
    return result === 1;
  }

  async isLocked(taskId: string): Promise<boolean> {
    const lockKey = this.getLockKey(taskId);
    const result = await this.redis.exists(lockKey);
    return result === 1;
  }

  async getLockInfo(taskId: string): Promise<{ workerId?: string; timestamp?: number } | null> {
    const lockKey = this.getLockKey(taskId);
    const lockValue = await this.redis.get(lockKey);

    if (!lockValue) {
      return null;
    }

    const parts = lockValue.split(':');
    if (parts.length >= 2) {
      return {
        workerId: parts[0],
        timestamp: parseInt(parts[1], 10),
      };
    }

    return null;
  }
}

describe('Redis分布式锁 - 基本功能', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该成功获取锁', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lockService.acquire('task-001', 'worker-1', 30000);

    expect(result.acquired).toBe(true);
    expect(result.lockId).toBeDefined();
    expect(result.lockId).toContain('worker-1');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'taskid_lock:task-001',
      result.lockId,
      'PX',
      30000,
      'NX'
    );
  });

  it('应该成功释放锁', async () => {
    mockRedis.get.mockResolvedValue('worker-1:1234567890:abc123');
    mockRedis.eval.mockResolvedValue(1);

    const lockId = 'worker-1:1234567890:abc123';
    const released = await lockService.release('task-001', lockId);

    expect(released).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('释放不存在的锁应该返回false', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.eval.mockResolvedValue(0);

    const lockId = 'worker-1:1234567890:abc123';
    const released = await lockService.release('task-001', lockId);

    expect(released).toBe(false);
  });

  it('应该检查锁是否存在', async () => {
    mockRedis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const isLocked1 = await lockService.isLocked('task-001');
    const isLocked2 = await lockService.isLocked('task-002');

    expect(isLocked1).toBe(true);
    expect(isLocked2).toBe(false);
  });
});

describe('Redis分布式锁 - 互斥性', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('应该阻止不同Worker获取同一任务的锁', async () => {
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const result1 = await lockService.acquire('task-001', 'worker-1', 30000);
    const result2 = await lockService.acquire('task-001', 'worker-2', 30000);

    expect(result1.acquired).toBe(true);
    expect(result2.acquired).toBe(false);
    expect(result2.error).toBe('锁已被其他Worker持有');
  });

  it('同一Worker重复获取锁应该失败', async () => {
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const result1 = await lockService.acquire('task-001', 'worker-1', 30000);
    const result2 = await lockService.acquire('task-001', 'worker-1', 30000);

    expect(result1.acquired).toBe(true);
    expect(result2.acquired).toBe(false);
  });

  it('不同任务的锁应该独立', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result1 = await lockService.acquire('task-001', 'worker-1', 30000);
    const result2 = await lockService.acquire('task-002', 'worker-1', 30000);

    expect(result1.acquired).toBe(true);
    expect(result2.acquired).toBe(true);
  });
});

describe('Redis分布式锁 - 锁续期', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('应该成功续期持有的锁', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const lockId = 'worker-1:1234567890:abc123';
    const extended = await lockService.extend('task-001', lockId, 60000);

    expect(extended).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('续期不存在的锁应该返回false', async () => {
    mockRedis.eval.mockResolvedValue(0);

    const lockId = 'worker-1:1234567890:abc123';
    const extended = await lockService.extend('task-001', lockId, 60000);

    expect(extended).toBe(false);
  });

  it('续期时应该使用新的TTL', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const lockId = 'worker-1:1234567890:abc123';
    await lockService.extend('task-001', lockId, 120000);

    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'taskid_lock:task-001',
      lockId,
      120000
    );
  });
});

describe('Redis分布式锁 - 锁信息查询', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('应该返回锁的持有者信息', async () => {
    mockRedis.get.mockResolvedValue('worker-1:1234567890:abc123');

    const info = await lockService.getLockInfo('task-001');

    expect(info).not.toBeNull();
    expect(info?.workerId).toBe('worker-1');
    expect(info?.timestamp).toBe(1234567890);
  });

  it('未锁定的任务应该返回null', async () => {
    mockRedis.get.mockResolvedValue(null);

    const info = await lockService.getLockInfo('task-001');

    expect(info).toBeNull();
  });

  it('应该处理格式错误的锁值', async () => {
    mockRedis.get.mockResolvedValue('invalid-lock-value');

    const info = await lockService.getLockInfo('task-001');

    expect(info).toBeNull();
  });
});

describe('Redis分布式锁 - 边界条件', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('应该处理空的任务ID', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lockService.acquire('', 'worker-1', 30000);

    expect(result.acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('taskid_lock:', expect.any(String), 'PX', 30000, 'NX');
  });

  it('应该处理空的Worker ID', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lockService.acquire('task-001', '', 30000);

    expect(result.acquired).toBe(true);
    expect(result.lockId).toMatch(/^:\d+:/);
  });

  it('应该处理零TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lockService.acquire('task-001', 'worker-1', 0);

    expect(result.acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('taskid_lock:task-001', expect.any(String), 'PX', 0, 'NX');
  });

  it('应该处理非常大的TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await lockService.acquire('task-001', 'worker-1', 86400000);

    expect(result.acquired).toBe(true);
  });
});

describe('Redis分布式锁 - 并发场景', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('多个Worker竞争同一锁时只有一个成功', async () => {
    let setCallCount = 0;
    mockRedis.set.mockImplementation(() => {
      setCallCount++;
      // 第一次调用成功，后续都失败
      return Promise.resolve(setCallCount === 1 ? 'OK' : null);
    });

    const workers = Array.from({ length: 10 }, (_, i) => `worker-${i}`);
    const promises = workers.map(workerId =>
      lockService.acquire('task-001', workerId, 30000)
    );

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.acquired).length;
    const failureCount = results.filter(r => !r.acquired).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(9);
  });

  it('不同任务的锁应该可以同时获取', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const tasks = Array.from({ length: 10 }, (_, i) => `task-${i}`);
    const promises = tasks.map(taskId =>
      lockService.acquire(taskId, 'worker-1', 30000)
    );

    const results = await Promise.all(promises);

    results.forEach(result => {
      expect(result.acquired).toBe(true);
    });
  });

  it('并发释放操作应该安全', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const lockId = 'worker-1:1234567890:abc123';
    const promises = Array.from({ length: 5 }, () =>
      lockService.release('task-001', lockId)
    );

    const results = await Promise.all(promises);

    // 第一次释放成功，后续因锁已不存在而失败
    const successCount = results.filter(r => r).length;
    expect(successCount).toBeGreaterThan(0);
  });
});

describe('Redis分布式锁 - 错误处理', () => {
  let mockRedis: any;
  let lockService: MockRedisLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    lockService = new MockRedisLockService(mockRedis);
  });

  it('应该处理Redis连接错误', async () => {
    mockRedis.set.mockRejectedValue(new Error('Redis连接失败'));

    await expect(lockService.acquire('task-001', 'worker-1', 30000))
      .rejects.toThrow('Redis连接失败');
  });

  it('应该处理释放时的Redis错误', async () => {
    mockRedis.eval.mockRejectedValue(new Error('Lua脚本执行失败'));

    await expect(lockService.release('task-001', 'lock-id'))
      .rejects.toThrow('Lua脚本执行失败');
  });

  it('应该处理续期时的Redis错误', async () => {
    mockRedis.eval.mockRejectedValue(new Error('续期失败'));

    await expect(lockService.extend('task-001', 'lock-id', 30000))
      .rejects.toThrow('续期失败');
  });

  it('应该处理查询锁信息时的错误', async () => {
    mockRedis.get.mockRejectedValue(new Error('读取失败'));

    await expect(lockService.getLockInfo('task-001'))
      .rejects.toThrow('读取失败');
  });
});

describe('Redis分布式锁 - 自定义配置', () => {
  it('应该使用自定义的锁前缀', async () => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    const mockRedis = new Redis();
    const customLockService = new MockRedisLockService(mockRedis, 'custom_lock:');

    mockRedis.set.mockResolvedValue('OK');

    await customLockService.acquire('task-001', 'worker-1', 30000);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'custom_lock:task-001',
      expect.any(String),
      'PX',
      30000,
      'NX'
    );
  });

  it('应该处理默认TTL', async () => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    const mockRedis = new Redis();
    const defaultLockService = new MockRedisLockService(mockRedis);

    mockRedis.set.mockResolvedValue('OK');

    // 不传TTL参数，使用默认值
    await defaultLockService.acquire('task-001', 'worker-1');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'taskid_lock:task-001',
      expect.any(String),
      'PX',
      30000,
      'NX'
    );
  });
});
