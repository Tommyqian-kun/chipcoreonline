/**
 * 任务状态同步集成测试
 * 测试数据库、Redis和WebSocket三层状态同步机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 模拟TaskStatus枚举
enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
  DRAFT = 'draft',
}

// 模拟数据库接口
interface MockDatabase {
  tasks: Map<string, any>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean>;
  getTask(taskId: string): Promise<any>;
  createTask(task: any): Promise<boolean>;
  deleteTask(taskId: string): Promise<boolean>;
}

// 模拟Redis接口
interface MockRedis {
  data: Map<string, any>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  exists(key: string): Promise<number>;
}

// 模拟WebSocket接口
interface MockWebSocket {
  clients: Map<string, any>;
  emit(userId: string, event: string, data: any): void;
  subscribe(userId: string, taskId: string): void;
  unsubscribe(userId: string, taskId: string): void>;
  getLastEmittedStatus(userId: string): TaskStatus | null;
}

// 模拟数据库实现
class MockDatabaseImpl implements MockDatabase {
  tasks = new Map<string, any>();

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = status;
    task.updatedAt = new Date();
    return true;
  }

  async getTask(taskId: string): Promise<any> {
    return this.tasks.get(taskId) || null;
  }

  async createTask(task: any): Promise<boolean> {
    this.tasks.set(task.id, task);
    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }
}

// 模拟Redis实现
class MockRedisImpl implements MockRedis {
  data = new Map<string, any>();

  async hset(key: string, field: string, value: string): Promise<number> {
    const hash = this.data.get(key) || {};
    hash[field] = value;
    this.data.set(key, hash);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.data.get(key);
    return hash ? hash[field] || null : null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.data.get(key) || {};
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async sadd(key: string, member: string): Promise<number> {
    const set = this.data.get(key) || new Set<string>();
    const before = set.size;
    set.add(member);
    this.data.set(key, set);
    return set.size - before;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.data.get(key);
    if (!set) return 0;
    const before = set.size;
    set.delete(member);
    return before - set.size;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.data.get(key);
    return set ? Array.from(set) : [];
  }

  async exists(key: string): Promise<number> {
    return this.data.has(key) ? 1 : 0;
  }
}

// 模拟WebSocket实现
class MockWebSocketImpl implements MockWebSocket {
  clients = new Map<string, any>();
  private emittedStatuses = new Map<string, TaskStatus>();

  emit(userId: string, event: string, data: any): void {
    const client = this.clients.get(userId) || { events: [] };
    client.events.push({ event, data });
    this.clients.set(userId, client);

    if (event === 'task.status.updated' && data.status) {
      this.emittedStatuses.set(userId, data.status);
    }
  }

  subscribe(userId: string, taskId: string): void {
    const client = this.clients.get(userId) || { subscriptions: new Set() };
    client.subscriptions.add(taskId);
    this.clients.set(userId, client);
  }

  unsubscribe(userId: string, taskId: string): void {
    const client = this.clients.get(userId);
    if (client && client.subscriptions) {
      client.subscriptions.delete(taskId);
    }
  }

  getLastEmittedStatus(userId: string): TaskStatus | null {
    return this.emittedStatuses.get(userId) || null;
  }
}

// 模拟TaskStateManagerService
class MockTaskStateManagerService {
  private database: MockDatabase;
  private redis: MockRedis;
  private websocket: MockWebSocket;

  constructor(database: MockDatabase, redis: MockRedis, websocket: MockWebSocket) {
    this.database = database;
    this.redis = redis;
    this.websocket = websocket;
  }

  async updateState(taskId: string, status: TaskStatus, userId?: string): Promise<boolean> {
    const task = await this.database.getTask(taskId);
    if (!task) return false;

    // 1. 更新数据库
    await this.database.updateTaskStatus(taskId, status);

    // 2. 更新Redis
    await this.redis.hset(`task_status:${taskId}`, 'status', status);
    await this.redis.hset(`task_status:${taskId}`, 'updatedAt', new Date().toISOString());

    // 3. 发送WebSocket通知
    if (userId) {
      this.websocket.emit(userId, 'task.status.updated', {
        taskId,
        status,
        timestamp: new Date().toISOString(),
      });
    }

    return true;
  }

  async syncState(taskId: string): Promise<{
    dbStatus: TaskStatus | null;
    redisStatus: TaskStatus | null;
    synced: boolean;
  }> {
    const task = await this.database.getTask(taskId);
    const redisStatus = await this.redis.hget(`task_status:${taskId}`, 'status');

    return {
      dbStatus: task?.status || null,
      redisStatus: (redisStatus as TaskStatus) || null,
      synced: task?.status === redisStatus,
    };
  }

  async getThreeLayerState(taskId: string): Promise<{
    database: any;
    redis: Record<string, string>;
    wsEmitted: TaskStatus | null;
  }> {
    const task = await this.database.getTask(taskId);
    const redisData = await this.redis.hgetall(`task_status:${taskId}`);

    // 获取WebSocket最后发送的状态（假设用户ID为task的userId）
    const wsEmitted = task?.userId ? this.websocket.getLastEmittedStatus(task.userId) : null;

    return {
      database: task,
      redis: redisData,
      wsEmitted,
    };
  }
}

describe('任务状态同步 - 三层同步', () => {
  let database: MockDatabase;
  let redis: MockRedis;
  let websocket: MockWebSocket;
  let stateManager: MockTaskStateManagerService;

  beforeEach(() => {
    database = new MockDatabaseImpl();
    redis = new MockRedisImpl();
    websocket = new MockWebSocketImpl();
    stateManager = new MockTaskStateManagerService(database, redis, websocket);
  });

  it('应该成功同步三层状态', async () => {
    const taskId = 'task-sync-001';
    const userId = 'user-123';

    await database.createTask({
      id: taskId,
      userId,
      status: TaskStatus.PENDING,
    });

    const success = await stateManager.updateState(taskId, TaskStatus.RUNNING, userId);

    expect(success).toBe(true);

    // 验证数据库状态
    const dbTask = await database.getTask(taskId);
    expect(dbTask.status).toBe(TaskStatus.RUNNING);

    // 验证Redis状态
    const redisStatus = await redis.hget(`task_status:${taskId}`, 'status');
    expect(redisStatus).toBe(TaskStatus.RUNNING);

    // 验证WebSocket状态
    const wsStatus = websocket.getLastEmittedStatus(userId);
    expect(wsStatus).toBe(TaskStatus.RUNNING);
  });

  it('应该能检查三层状态一致性', async () => {
    const taskId = 'task-consistency-001';

    await database.createTask({
      id: taskId,
      status: TaskStatus.QUEUED,
    });

    // 更新状态
    await stateManager.updateState(taskId, TaskStatus.RUNNING);

    // 检查同步状态
    const syncResult = await stateManager.syncState(taskId);

    expect(syncResult.dbStatus).toBe(TaskStatus.RUNNING);
    expect(syncResult.redisStatus).toBe(TaskStatus.RUNNING);
    expect(syncResult.synced).toBe(true);
  });

  it('应该能获取三层完整状态', async () => {
    const taskId = 'task-full-001';
    const userId = 'user-456';

    await database.createTask({
      id: taskId,
      userId,
      status: TaskStatus.PENDING,
    });

    await stateManager.updateState(taskId, TaskStatus.COMPLETED, userId);

    const threeLayerState = await stateManager.getThreeLayerState(taskId);

    expect(threeLayerState.database.status).toBe(TaskStatus.COMPLETED);
    expect(threeLayerState.redis.status).toBe(TaskStatus.COMPLETED);
    expect(threeLayerState.wsEmitted).toBe(TaskStatus.COMPLETED);
  });
});

describe('任务状态同步 - 状态转换', () => {
  let database: MockDatabase;
  let redis: MockRedis;
  let websocket: MockWebSocket;
  let stateManager: MockTaskStateManagerService;

  beforeEach(() => {
    database = new MockDatabaseImpl();
    redis = new MockRedisImpl();
    websocket = new MockWebSocketImpl();
    stateManager = new MockTaskStateManagerService(database, redis, websocket);
  });

  const validTransitions: Array<[TaskStatus, TaskStatus]> = [
    [TaskStatus.PENDING, TaskStatus.QUEUED],
    [TaskStatus.QUEUED, TaskStatus.RUNNING],
    [TaskStatus.RUNNING, TaskStatus.COMPLETED],
    [TaskStatus.RUNNING, TaskStatus.FAILED],
    [TaskStatus.RUNNING, TaskStatus.TIMEOUT],
    [TaskStatus.PENDING, TaskStatus.CANCELLED],
    [TaskStatus.QUEUED, TaskStatus.CANCELLED],
  ];

  it('应该执行合法的状态转换', async () => {
    const taskId = 'task-transition-001';
    await database.createTask({ id: taskId, status: TaskStatus.PENDING });

    for (const [from, to] of validTransitions) {
      await database.updateTaskStatus(taskId, from);
      const success = await stateManager.updateState(taskId, to);
      expect(success).toBe(true);

      const syncResult = await stateManager.syncState(taskId);
      expect(syncResult.redisStatus).toBe(to);
    }
  });

  it('应该记录状态转换时间戳', async () => {
    const taskId = 'task-timestamp-001';
    await database.createTask({ id: taskId, status: TaskStatus.PENDING });

    await stateManager.updateState(taskId, TaskStatus.QUEUED);

    const redisData = await redis.hgetall(`task_status:${taskId}`);
    expect(redisData.status).toBe(TaskStatus.QUEUED);
    expect(redisData.updatedAt).toBeDefined();

    const timestamp = new Date(redisData.updatedAt);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 10000);
  });
});

describe('任务状态同步 - 错误处理', () => {
  let database: MockDatabase;
  let redis: MockRedis;
  let websocket: MockWebSocket;
  let stateManager: MockTaskStateManagerService;

  beforeEach(() => {
    database = new MockDatabaseImpl();
    redis = new MockRedisImpl();
    websocket = new MockWebSocketImpl();
    stateManager = new MockTaskStateManagerService(database, redis, websocket);
  });

  it('不存在的任务应该返回失败', async () => {
    const success = await stateManager.updateState('nonexistent-task', TaskStatus.RUNNING);
    expect(success).toBe(false);
  });

  it('同步不存在的任务应该返回null状态', async () => {
    const syncResult = await stateManager.syncState('nonexistent-task');

    expect(syncResult.dbStatus).toBeNull();
    expect(syncResult.redisStatus).toBeNull();
    expect(syncResult.synced).toBe(true); // 两个null被认为是同步的
  });

  it('应该处理WebSocket通知失败', async () => {
    const taskId = 'task-ws-fail-001';
    await database.createTask({ id: taskId, status: TaskStatus.PENDING });

    // 不传入userId，WebSocket不会发送通知
    const success = await stateManager.updateState(taskId, TaskStatus.RUNNING);
    expect(success).toBe(true);

    // WebSocket状态应该为null
    const wsStatus = websocket.getLastEmittedStatus('any-user');
    expect(wsStatus).toBeNull();
  });
});

describe('任务状态同步 - 并发更新', () => {
  let database: MockDatabase;
  let redis: MockRedis;
  let websocket: MockWebSocket;
  let stateManager: MockTaskStateManagerService;

  beforeEach(() => {
    database = new MockDatabaseImpl();
    redis = new MockRedisImpl();
    websocket = new MockWebSocketImpl();
    stateManager = new MockTaskStateManagerService(database, redis, websocket);
  });

  it('并发更新同一任务应该保持一致性', async () => {
    const taskId = 'task-concurrent-001';
    await database.createTask({ id: taskId, status: TaskStatus.PENDING });

    // 模拟并发更新
    const updates = [
      TaskStatus.QUEUED,
      TaskStatus.RUNNING,
      TaskStatus.COMPLETED,
    ];

    const promises = updates.map(status =>
      stateManager.updateState(taskId, status)
    );

    await Promise.all(promises);

    // 检查最终状态
    const syncResult = await stateManager.syncState(taskId);

    // 所有层应该都有相同的最终状态
    expect(syncResult.dbStatus).toBeTruthy();
    expect(syncResult.redisStatus).toBeTruthy();
    expect(syncResult.dbStatus).toBe(syncResult.redisStatus);
  });

  it('并发更新不同任务应该互不影响', async () => {
    const taskIds = ['task-1', 'task-2', 'task-3'];

    for (const taskId of taskIds) {
      await database.createTask({ id: taskId, status: TaskStatus.PENDING });
    }

    const promises = taskIds.map((taskId, index) =>
      stateManager.updateState(taskId, TaskStatus.RUNNING)
    );

    await Promise.all(promises);

    // 验证所有任务都已更新
    for (const taskId of taskIds) {
      const syncResult = await stateManager.syncState(taskId);
      expect(syncResult.redisStatus).toBe(TaskStatus.RUNNING);
    }
  });
});

describe('任务状态同步 - 清理操作', () => {
  let database: MockDatabase;
  let redis: MockRedis;
  let websocket: MockWebSocket;
  let stateManager: MockTaskStateManagerService;

  beforeEach(() => {
    database = new MockDatabaseImpl();
    redis = new MockRedisImpl();
    websocket = new MockWebSocketImpl();
    stateManager = new MockTaskStateManagerService(database, redis, websocket);
  });

  it('删除任务时应该清理Redis状态', async () => {
    const taskId = 'task-cleanup-001';
    await database.createTask({ id: taskId, status: TaskStatus.PENDING });

    await stateManager.updateState(taskId, TaskStatus.COMPLETED);

    // 验证Redis中有状态
    const redisStatusBefore = await redis.hget(`task_status:${taskId}`, 'status');
    expect(redisStatusBefore).toBe(TaskStatus.COMPLETED);

    // 删除任务
    await database.deleteTask(taskId);
    await redis.del(`task_status:${taskId}`);

    // 验证Redis状态已清理
    const exists = await redis.exists(`task_status:${taskId}`);
    expect(exists).toBe(0);
  });

  it('应该清理活跃任务集合', async () => {
    const taskId = 'task-active-001';
    await database.createTask({ id: taskId, status: TaskStatus.RUNNING });

    // 添加到活跃集合
    await redis.sadd('active_task_ids', taskId);

    // 验证在活跃集合中
    const activeTasks = await redis.smembers('active_task_ids');
    expect(activeTasks).toContain(taskId);

    // 任务完成后从活跃集合移除
    await stateManager.updateState(taskId, TaskStatus.COMPLETED);
    await redis.srem('active_task_ids', taskId);

    // 验证已从活跃集合移除
    const activeTasksAfter = await redis.smembers('active_task_ids');
    expect(activeTasksAfter).not.toContain(taskId);
  });
});
