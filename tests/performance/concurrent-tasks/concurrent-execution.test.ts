/**
 * 并发任务执行测试
 * 测试并发任务提交、执行和资源竞争场景
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
}

// 模拟任务对象
interface MockTask {
  id: string;
  userId: string;
  toolId: string;
  status: TaskStatus;
  createdAt: Date;
  priority?: number;
}

// 模拟队列管理器
class MockQueueManager {
  private queue: string[] = [];
  private maxQueueSize = 48;
  private activeTasks = new Set<string>();

  async enqueue(taskId: string): Promise<{ success: boolean; queueLength?: number; error?: string }> {
    if (this.queue.length >= this.maxQueueSize) {
      return { success: false, error: '队列已满' };
    }

    // 检查重复
    if (this.queue.includes(taskId)) {
      return { success: false, error: '任务已在队列中' };
    }

    this.queue.unshift(taskId);
    return { success: true, queueLength: this.queue.length };
  }

  async dequeue(): Promise<string | null> {
    return this.queue.pop() || null;
  }

  async getQueueLength(): Promise<number> {
    return this.queue.length;
  }

  async addActiveTask(taskId: string): Promise<void> {
    this.activeTasks.add(taskId);
  }

  async removeActiveTask(taskId: string): Promise<void> {
    this.activeTasks.delete(taskId);
  }

  async getActiveTaskCount(): Promise<number> {
    return this.activeTasks.size;
  }

  async isUserAtLimit(userId: string, limit: number): Promise<boolean> {
    const userActiveTasks = Array.from(this.activeTasks).filter(id => id.startsWith(userId));
    return userActiveTasks.length >= limit;
  }

  clear(): void {
    this.queue = [];
    this.activeTasks.clear();
  }
}

// 模拟任务管理器
class MockTaskManager {
  private tasks = new Map<string, MockTask>();

  async createTask(task: Omit<MockTask, 'id' | 'createdAt'>): Promise<MockTask> {
    const newTask: MockTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date(),
    };
    this.tasks.set(newTask.id, newTask);
    return newTask;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = status;
    return true;
  }

  async getTask(taskId: string): Promise<MockTask | null> {
    return this.tasks.get(taskId) || null;
  }

  async getUserActiveTaskCount(userId: string): Promise<number> {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.userId === userId && task.status === TaskStatus.RUNNING) {
        count++;
      }
    }
    return count;
  }
}

// 模拟并发任务提交器
class MockConcurrentSubmitter {
  private queueManager: MockQueueManager;
  private taskManager: MockTaskManager;

  constructor(queueManager: MockQueueManager, taskManager: MockTaskManager) {
    this.queueManager = queueManager;
    this.taskManager = taskManager;
  }

  async submitTask(
    userId: string,
    toolId: string,
    userConcurrencyLimit: number
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    // 检查用户并发限制
    const activeCount = await this.taskManager.getUserActiveTaskCount(userId);
    if (activeCount >= userConcurrencyLimit) {
      return { success: false, error: '用户并发限制' };
    }

    // 创建任务
    const task = await this.taskManager.createTask({
      userId,
      toolId,
      status: TaskStatus.PENDING,
    });

    // 入队
    const enqueueResult = await this.queueManager.enqueue(task.id);
    if (!enqueueResult.success) {
      return { success: false, error: enqueueResult.error };
    }

    // 更新状态
    await this.taskManager.updateTaskStatus(task.id, TaskStatus.QUEUED);

    return { success: true, taskId: task.id };
  }

  async processQueue(concurrency: number): Promise<MockTask[]> {
    const processedTasks: MockTask[] = [];

    for (let i = 0; i < concurrency; i++) {
      const taskId = await this.queueManager.dequeue();
      if (!taskId) break;

      await this.queueManager.addActiveTask(taskId);
      await this.taskManager.updateTaskStatus(taskId, TaskStatus.RUNNING);

      const task = await this.taskManager.getTask(taskId);
      if (task) {
        processedTasks.push(task);
      }
    }

    return processedTasks;
  }
}

describe('并发任务提交', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  afterEach(() => {
    queueManager.clear();
  });

  it('应该能同时提交10个任务', async () => {
    const taskCount = 10;
    const userId = 'user-concurrent-001';

    const promises = Array.from({ length: taskCount }, () =>
      submitter.submitTask(userId, 'sdc-gen', 10)
    );

    const results = await Promise.all(promises);

    // 验证所有提交都成功
    results.forEach(result => {
      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
    });

    // 验证所有任务ID唯一
    const taskIds = results.map(r => r.taskId).filter((id): id is string => !!id);
    const uniqueTaskIds = new Set(taskIds);
    expect(uniqueTaskIds.size).toBe(taskCount);
  });

  it('应该拒绝超过队列上限的提交', async () => {
    // 填满队列
    for (let i = 0; i < 48; i++) {
      await queueManager.enqueue(`fill-task-${i}`);
    }

    const result = await submitter.submitTask('user-overflow', 'sdc-gen', 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe('队列已满');
  });

  it('应该防止重复提交同一任务', async () => {
    const taskId = 'task-duplicate-001';
    await queueManager.enqueue(taskId);

    const result1 = await queueManager.enqueue(taskId);
    const result2 = await queueManager.enqueue(taskId);

    expect(result1.success).toBe(false);
    expect(result1.error).toBe('任务已在队列中');
  });

  it('应该尊重用户并发限制', async () => {
    const userId = 'user-limited-001';
    const limit = 2;

    // 提交3个任务
    const results = await Promise.all([
      submitter.submitTask(userId, 'sdc-gen', limit),
      submitter.submitTask(userId, 'sdc-gen', limit),
      submitter.submitTask(userId, 'sdc-gen', limit),
    ]);

    // 前两个应该成功，第三个应该失败
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(false);
    expect(results[2].error).toBe('用户并发限制');
  });
});

describe('并发任务执行', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('应该能并发处理多个任务', async () => {
    const taskCount = 10;
    const userId = 'user-exec-001';

    // 提交任务
    for (let i = 0; i < taskCount; i++) {
      await submitter.submitTask(userId, 'sdc-gen', 20);
    }

    // 处理队列
    const processedTasks = await submitter.processQueue(taskCount);

    expect(processedTasks).toHaveLength(taskCount);
    processedTasks.forEach(task => {
      expect(task.status).toBe(TaskStatus.RUNNING);
    });
  });

  it('处理后的任务应该添加到活跃集合', async () => {
    await submitter.submitTask('user-active-001', 'sdc-gen', 10);
    await submitter.submitTask('user-active-001', 'sdc-gen', 10);
    await submitter.submitTask('user-active-001', 'sdc-gen', 10);

    await submitter.processQueue(3);

    const activeCount = await queueManager.getActiveTaskCount();
    expect(activeCount).toBe(3);
  });

  it('并发的任务应该获得唯一ID', async () => {
    const promises = Array.from({ length: 20 }, (_, i) =>
      submitter.submitTask(`user-unique-${i % 5}`, 'sdc-gen', 10)
    );

    const results = await Promise.all(promises);
    const taskIds = results
      .map(r => r.taskId)
      .filter((id): id is string => !!id);

    const uniqueIds = new Set(taskIds);
    expect(uniqueIds.size).toBe(20);
  });
});

describe('资源竞争测试', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('并发访问队列不应该导致数据丢失', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      queueManager.enqueue(`task-race-${i}`)
    );

    const results = await Promise.all(promises);

    results.forEach(result => {
      expect(result.success).toBe(true);
    });

    const queueLength = await queueManager.getQueueLength();
    expect(queueLength).toBe(50);
  });

  it('并发访问任务管理器应该正确更新状态', async () => {
    const taskIds: string[] = [];

    // 创建20个任务
    for (let i = 0; i < 20; i++) {
      const task = await taskManager.createTask({
        userId: 'user-race',
        toolId: 'sdc-gen',
        status: TaskStatus.PENDING,
      });
      taskIds.push(task.id);
    }

    // 并发更新状态
    const updatePromises = taskIds.map(taskId =>
      taskManager.updateTaskStatus(taskId, TaskStatus.RUNNING)
    );

    const results = await Promise.all(updatePromises);

    results.forEach(result => {
      expect(result).toBe(true);
    });

    // 验证所有任务状态都已更新
    for (const taskId of taskIds) {
      const task = await taskManager.getTask(taskId);
      expect(task?.status).toBe(TaskStatus.RUNNING);
    }
  });

  it('并发活跃任务操作应该正确', async () => {
    const taskIds = Array.from({ length: 10 }, (_, i) => `task-concurrent-${i}`);

    // 并发添加活跃任务
    const addPromises = taskIds.map(taskId =>
      queueManager.addActiveTask(taskId)
    );

    await Promise.all(addPromises);

    const activeCount = await queueManager.getActiveTaskCount();
    expect(activeCount).toBe(10);

    // 并发移除活跃任务
    const removePromises = taskIds.slice(0, 5).map(taskId =>
      queueManager.removeActiveTask(taskId)
    );

    await Promise.all(removePromises);

    const finalCount = await queueManager.getActiveTaskCount();
    expect(finalCount).toBe(5);
  });
});

describe('并发执行性能', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('10个并发任务应该在合理时间内完成', async () => {
    const taskCount = 10;
    const startTime = Date.now();

    const promises = Array.from({ length: taskCount }, () =>
      submitter.submitTask('user-perf-001', 'sdc-gen', 20)
    );

    await Promise.all(promises);

    const duration = Date.now() - startTime;

    // 10个任务应该在100ms内完成（模拟环境）
    expect(duration).toBeLessThan(100);
  });

  it('50个并发任务应该保持稳定', async () => {
    const taskCount = 50;
    const startTime = Date.now();

    const promises = Array.from({ length: taskCount }, () =>
      submitter.submitTask(`user-perf-${Math.floor(Math.random() * 10)}`, 'sdc-gen', 20)
    );

    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;

    // 验证所有操作成功
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(taskCount);

    // 性能应该保持稳定
    expect(duration).toBeLessThan(500);
  });
});

describe('并发错误处理', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('部分失败不应该影响其他任务', async () => {
    const userId = 'user-partial-fail';

    // 提交超过用户限制的任务
    const results = await Promise.all([
      submitter.submitTask(userId, 'sdc-gen', 2),
      submitter.submitTask(userId, 'sdc-gen', 2),
      submitter.submitTask(userId, 'sdc-gen', 2),
      submitter.submitTask(userId, 'sdc-gen', 2),
    ]);

    // 前两个应该成功，后两个应该失败
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    expect(successCount).toBe(2);
    expect(failureCount).toBe(2);
  });

  it('应该处理队列满时的并发提交', async () => {
    // 填满队列到47
    for (let i = 0; i < 47; i++) {
      await queueManager.enqueue(`fill-${i}`);
    }

    // 并发提交5个任务，只有第一个应该成功
    const results = await Promise.all([
      submitter.submitTask('user-queue-test-1', 'sdc-gen', 10),
      submitter.submitTask('user-queue-test-2', 'sdc-gen', 10),
      submitter.submitTask('user-queue-test-3', 'sdc-gen', 10),
      submitter.submitTask('user-queue-test-4', 'sdc-gen', 10),
      submitter.submitTask('user-queue-test-5', 'sdc-gen', 10),
    ]);

    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(1);
  });
});

describe('并发边界条件', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('应该处理零并发任务', async () => {
    const results = await Promise.all([]);

    expect(results).toHaveLength(0);
  });

  it('应该处理单个并发任务', async () => {
    const result = await submitter.submitTask('user-single-001', 'sdc-gen', 10);

    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();
  });

  it('应该处理大量并发任务', async () => {
    const taskCount = 100;
    const userIds = Array.from({ length: 10 }, (_, i) => `user-load-${i}`);

    // 分散到不同用户
    const promises = Array.from({ length: taskCount }, (_, i) =>
      submitter.submitTask(userIds[i % userIds.length], 'sdc-gen', 20)
    );

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.success).length;
    // 由于队列限制48，一些任务应该失败
    expect(successCount).toBeGreaterThan(0);
    expect(successCount).toBeLessThanOrEqual(48);
  });
});

describe('并发状态同步', () => {
  let queueManager: MockQueueManager;
  let taskManager: MockTaskManager;
  let submitter: MockConcurrentSubmitter;

  beforeEach(() => {
    queueManager = new MockQueueManager();
    taskManager = new MockTaskManager();
    submitter = new MockConcurrentSubmitter(queueManager, taskManager);
  });

  it('并发提交应该保持状态一致性', async () => {
    const userId = 'user-sync-001';
    const taskCount = 10;

    // 并发提交任务
    const submitPromises = Array.from({ length: taskCount }, () =>
      submitter.submitTask(userId, 'sdc-gen', 20)
    );

    const submitResults = await Promise.all(submitPromises);

    // 验证所有任务都已创建且状态为QUEUED
    const taskIds = submitResults
      .map(r => r.taskId)
      .filter((id): id is string => !!id);

    const queueLength = await queueManager.getQueueLength();
    expect(queueLength).toBe(taskCount);

    // 验证任务状态
    for (const taskId of taskIds) {
      const task = await taskManager.getTask(taskId);
      expect(task?.status).toBe(TaskStatus.QUEUED);
    }
  });

  it('并发处理应该正确更新活跃任务', async () => {
    const taskCount = 10;
    const userId = 'user-sync-002';

    // 提交任务
    for (let i = 0; i < taskCount; i++) {
      await submitter.submitTask(userId, 'sdc-gen', 20);
    }

    // 处理任务
    await submitter.processQueue(taskCount);

    // 验证活跃任务数量
    const activeCount = await queueManager.getActiveTaskCount();
    expect(activeCount).toBe(taskCount);
  });
});
