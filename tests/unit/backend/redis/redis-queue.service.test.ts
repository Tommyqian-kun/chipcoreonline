/**
 * Redis队列服务单元测试
 * 测试Redis队列操作、活跃任务管理和分布式锁功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    lpush: vi.fn(),
    rpop: vi.fn(),
    llen: vi.fn(),
    lindex: vi.fn(),
    lrange: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    sismember: vi.fn(),
    scard: vi.fn(),
    smembers: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    incr: vi.fn(),
    quit: vi.fn(),
    flushdb: vi.fn(),
    exists: vi.fn(),
  };

  return {
    default: vi.fn(() => mockRedis),
  };
});

// 模拟RedisQueueService类
class MockRedisQueueService {
  private redis: any;
  private readonly maxQueueSize: number;

  constructor(redis: any, maxQueueSize = 48) {
    this.redis = redis;
    this.maxQueueSize = maxQueueSize;
  }

  async enqueue(taskId: string): Promise<{ success: boolean; queueLength?: number; error?: string }> {
    const currentLength = await this.redis.llen('task_queue');

    if (currentLength >= this.maxQueueSize) {
      return { success: false, error: '队列已满' };
    }

    const newLength = await this.redis.lpush('task_queue', taskId);
    return { success: true, queueLength: newLength };
  }

  async dequeue(): Promise<string | null> {
    return await this.redis.rpop('task_queue');
  }

  async addActiveTask(taskId: string): Promise<void> {
    await this.redis.sadd('active_task_ids', taskId);
  }

  async removeActiveTask(taskId: string): Promise<void> {
    await this.redis.srem('active_task_ids', taskId);
  }

  async getActiveTasks(): Promise<string[]> {
    return await this.redis.smembers('active_task_ids');
  }

  async getActiveTaskCount(): Promise<number> {
    return await this.redis.scard('active_task_ids');
  }

  async isActiveTask(taskId: string): Promise<boolean> {
    const result = await this.redis.sismember('active_task_ids', taskId);
    return result === 1;
  }

  async getQueueLength(): Promise<number> {
    return await this.redis.llen('task_queue');
  }

  async acquireLock(taskId: string, workerId: string, ttl = 30000): Promise<boolean> {
    const lockKey = `taskid_lock:${taskId}`;
    const lockValue = `${workerId}:${Date.now()}`;
    const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');
    return result === 'OK';
  }

  async releaseLock(taskId: string, workerId: string): Promise<boolean> {
    const lockKey = `taskid_lock:${taskId}`;
    const lockValue = await this.redis.get(lockKey);
    if (lockValue && lockValue.startsWith(workerId)) {
      await this.redis.del(lockKey);
      return true;
    }
    return false;
  }
}

describe('Redis队列服务 - 任务入队', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该成功将任务加入队列', async () => {
    const taskId = 'task-test-001';
    mockRedis.llen.mockResolvedValue(10);
    mockRedis.lpush.mockResolvedValue(11);

    const result = await queueService.enqueue(taskId);

    expect(result.success).toBe(true);
    expect(result.queueLength).toBe(11);
    expect(mockRedis.lpush).toHaveBeenCalledWith('task_queue', taskId);
  });

  it('队列满时应该拒绝入队', async () => {
    const taskId = 'task-test-002';
    mockRedis.llen.mockResolvedValue(48);

    const result = await queueService.enqueue(taskId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('队列已满');
    expect(mockRedis.lpush).not.toHaveBeenCalled();
  });

  it('应该检查队列长度是否在上限内', async () => {
    mockRedis.llen.mockResolvedValue(10);

    const currentLength = await queueService.getQueueLength();
    expect(currentLength).toBe(10);
    expect(currentLength).toBeLessThan(48);
  });

  it('应该支持自定义队列上限', async () => {
    const customQueueService = new MockRedisQueueService(mockRedis, 100);
    mockRedis.llen.mockResolvedValue(99);

    const result = await customQueueService.enqueue('task-test');

    expect(result.success).toBe(true);
  });
});

describe('Redis队列服务 - 任务出队', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该按FIFO顺序出队', async () => {
    mockRedis.rpop.mockResolvedValueOnce('task-001')
                   .mockResolvedValueOnce('task-002')
                   .mockResolvedValueOnce(null);

    const task1 = await queueService.dequeue();
    expect(task1).toBe('task-001');

    const task2 = await queueService.dequeue();
    expect(task2).toBe('task-002');

    const task3 = await queueService.dequeue();
    expect(task3).toBeNull();
  });

  it('空队列应该返回null', async () => {
    mockRedis.rpop.mockResolvedValue(null);

    const task = await queueService.dequeue();
    expect(task).toBeNull();
  });

  it('出队应该调用rpop方法', async () => {
    mockRedis.rpop.mockResolvedValue('task-001');

    await queueService.dequeue();

    expect(mockRedis.rpop).toHaveBeenCalledWith('task_queue');
  });
});

describe('Redis队列服务 - 活跃任务管理', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该添加活跃任务', async () => {
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.scard.mockResolvedValue(1);

    await queueService.addActiveTask('task-001');

    expect(mockRedis.sadd).toHaveBeenCalledWith('active_task_ids', 'task-001');
  });

  it('应该移除活跃任务', async () => {
    mockRedis.srem.mockResolvedValue(1);

    await queueService.removeActiveTask('task-001');

    expect(mockRedis.srem).toHaveBeenCalledWith('active_task_ids', 'task-001');
  });

  it('应该返回所有活跃任务', async () => {
    const activeTasks = ['task-001', 'task-002', 'task-003'];
    mockRedis.smembers.mockResolvedValue(activeTasks);

    const tasks = await queueService.getActiveTasks();

    expect(tasks).toHaveLength(3);
    expect(tasks).toContain('task-001');
    expect(tasks).toContain('task-002');
    expect(tasks).toContain('task-003');
  });

  it('应该返回活跃任务数量', async () => {
    mockRedis.scard.mockResolvedValue(5);

    const count = await queueService.getActiveTaskCount();

    expect(count).toBe(5);
    expect(mockRedis.scard).toHaveBeenCalledWith('active_task_ids');
  });

  it('应该检查任务是否活跃', async () => {
    mockRedis.sismember.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const isActive1 = await queueService.isActiveTask('task-001');
    const isActive2 = await queueService.isActiveTask('task-999');

    expect(isActive1).toBe(true);
    expect(isActive2).toBe(false);
  });
});

describe('Redis队列服务 - 分布式锁', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该成功获取锁', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const acquired = await queueService.acquireLock('task-001', 'worker-1', 30000);

    expect(acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'taskid_lock:task-001',
      expect.stringContaining('worker-1'),
      'PX',
      30000,
      'NX'
    );
  });

  it('应该阻止重复获取锁', async () => {
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const acquired1 = await queueService.acquireLock('task-001', 'worker-1', 30000);
    const acquired2 = await queueService.acquireLock('task-001', 'worker-2', 30000);

    expect(acquired1).toBe(true);
    expect(acquired2).toBe(false);
  });

  it('应该成功释放锁', async () => {
    mockRedis.get.mockResolvedValue('worker-1:1234567890');
    mockRedis.del.mockResolvedValue(1);

    const released = await queueService.releaseLock('task-001', 'worker-1');

    expect(released).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith('taskid_lock:task-001');
  });

  it('应该只能释放自己持有的锁', async () => {
    mockRedis.get.mockResolvedValue('worker-1:1234567890');

    const released = await queueService.releaseLock('task-001', 'worker-2');

    expect(released).toBe(false);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('释放不存在的锁应该返回false', async () => {
    mockRedis.get.mockResolvedValue(null);

    const released = await queueService.releaseLock('task-001', 'worker-1');

    expect(released).toBe(false);
  });
});

describe('Redis队列服务 - 边界条件测试', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该处理空的任务ID', async () => {
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.lpush.mockResolvedValue(1);

    const result = await queueService.enqueue('');

    expect(result.success).toBe(true);
  });

  it('应该处理超长的任务ID', async () => {
    const longTaskId = 'task-' + 'a'.repeat(1000);
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.lpush.mockResolvedValue(1);

    const result = await queueService.enqueue(longTaskId);

    expect(result.success).toBe(true);
  });

  it('应该处理零TTL的锁', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const acquired = await queueService.acquireLock('task-001', 'worker-1', 0);

    expect(acquired).toBe(true);
  });

  it('应该处理非常大的TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const acquired = await queueService.acquireLock('task-001', 'worker-1', 86400000);

    expect(acquired).toBe(true);
  });
});

describe('Redis队列服务 - 并发场景测试', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该处理并发入队', async () => {
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.lpush.mockResolvedValue(1);

    const promises = Array.from({ length: 10 }, (_, i) =>
      queueService.enqueue(`task-${i}`)
    );

    const results = await Promise.all(promises);

    results.forEach(result => {
      expect(result.success).toBe(true);
    });
    expect(mockRedis.lpush).toHaveBeenCalledTimes(10);
  });

  it('应该处理并发出队', async () => {
    const tasks = ['task-001', 'task-002', 'task-003', 'task-004', 'task-005'];
    let index = 0;
    mockRedis.rpop.mockImplementation(() => Promise.resolve(tasks[index++] || null));

    const promises = Array.from({ length: 5 }, () => queueService.dequeue());
    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    expect(results).toContain('task-001');
    expect(results).toContain('task-002');
  });

  it('应该处理并发活跃任务操作', async () => {
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.srem.mockResolvedValue(1);
    mockRedis.scard.mockResolvedValue(5);

    const promises = [
      queueService.addActiveTask('task-001'),
      queueService.addActiveTask('task-002'),
      queueService.addActiveTask('task-003'),
      queueService.removeActiveTask('task-001'),
      queueService.getActiveTaskCount(),
    ];

    await Promise.all(promises);

    expect(mockRedis.sadd).toHaveBeenCalledTimes(3);
    expect(mockRedis.srem).toHaveBeenCalledTimes(1);
  });
});

describe('Redis队列服务 - 错误处理', () => {
  let mockRedis: any;
  let queueService: MockRedisQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    const Redis = require('ioredis').default;
    mockRedis = new Redis();
    queueService = new MockRedisQueueService(mockRedis);
  });

  it('应该处理Redis连接错误', async () => {
    mockRedis.llen.mockRejectedValue(new Error('Redis连接失败'));

    await expect(queueService.getQueueLength()).rejects.toThrow('Redis连接失败');
  });

  it('应该处理入队失败', async () => {
    mockRedis.llen.mockResolvedValue(10);
    mockRedis.lpush.mockRejectedValue(new Error('写入失败'));

    await expect(queueService.enqueue('task-001')).rejects.toThrow('写入失败');
  });

  it('应该处理出队失败', async () => {
    mockRedis.rpop.mockRejectedValue(new Error('读取失败'));

    await expect(queueService.dequeue()).rejects.toThrow('读取失败');
  });

  it('应该处理活跃任务操作失败', async () => {
    mockRedis.sadd.mockRejectedValue(new Error('集合操作失败'));

    await expect(queueService.addActiveTask('task-001')).rejects.toThrow('集合操作失败');
  });
});
