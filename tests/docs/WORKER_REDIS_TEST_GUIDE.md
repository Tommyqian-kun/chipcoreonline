# Worker和Redis队列测试指南

## 1. 概述

Worker和Redis队列是LogicCore任务执行系统的核心组件。本指南涵盖任务队列管理、Worker处理逻辑、分布式锁、任务状态同步等功能的测试方法。

## 2. 环境设置

### 2.1 前置要求

```bash
# 安装Python测试依赖
pip install pytest pytest-asyncio pytest-cov pytest-mock

# 安装Node.js测试依赖
npm install --save-dev vitest
npm install --save-dev ioredis
```

### 2.2 Redis测试配置

```bash
# app/backend/.env.test
REDIS_URL="redis://localhost:6380"
REDIS_QUEUE_KEY="task_queue"
REDIS_ACTIVE_TASKS_KEY="active_task_ids"
REDIS_LOCK_PREFIX="taskid_lock:"

# 队列配置
MAX_QUEUE_SIZE=48
QUEUE_TIMEOUT=300
WORKER_CONCURRENCY=3
```

### 2.3 启动测试Redis

```bash
# 启动测试Redis实例
docker-compose -f app/docker-compose.test.yml up -d redis

# 验证Redis连接
docker exec -it app_redis_test_1 redis-cli -p 6380 ping
```

### 2.4 测试数据结构

Redis中的数据结构：

```
task_queue                    # List - 任务队列
active_task_ids              # Set  - 活跃任务ID集合
taskid_lock:{taskId}         # String - 任务级分布式锁
task_status:{taskId}         # Hash - 任务状态信息
task_progress:{taskId}       # Hash - 任务进度信息
```

## 3. Redis队列测试

**文件位置**: `tests/unit/backend/redis/redis-queue.test.ts`

### 3.1 测试项列表

#### 3.1.1 任务入队测试

1. **基本入队功能**
   - 测试能将任务ID加入队列
   - 测试入队返回当前队列长度
   - 测试队列操作是原子的

2. **队列上限测试**
   - 测试队列达到48个上限时拒绝入队
   - 测试上限可配置
   - 测试达到上限时返回明确的错误信息

3. **优先级队列测试**
   - 测试支持高优先级任务
   - 测试高优先级任务先出队

4. **重复入队测试**
   - 测试同一任务不能重复入队
   - 测试重复入队时返回错误

#### 3.1.2 任务出队测试

1. **基本出队功能**
   - 测试能从队列取出任务（FIFO）
   - 测试空队列返回null
   - 测试出队后任务从队列移除

2. **阻塞出队测试**
   - 测试队列为空时阻塞等待
   - 测试有新任务时立即返回
   - 测试阻塞超时机制

3. **批量出队测试**
   - 测试能一次取出多个任务
   - 测试批量取出不超过Worker并发数

#### 3.1.3 活跃任务管理测试

1. **添加活跃任务**
   - 测试任务开始执行时添加到活跃集合
   - 测试不能重复添加
   - 测试能查询当前活跃任务数量

2. **移除活跃任务**
   - 测试任务完成时从活跃集合移除
   - 测试移除不存在的任务不报错
   - 测试能列出所有活跃任务ID

3. **活跃任务超时清理**
   - 测试超时的活跃任务自动清理
   - 测试超时时间可配置

### 3.2 测试数据准备

```typescript
// 测试任务ID
const testTaskIds = [
  'task-sdc-001',
  'task-sdc-002',
  'task-upf-001',
];

// 测试任务对象
const createTestTask = (id: string) => ({
  id,
  toolId: id.includes('sdc') ? 'sdc-gen' : 'upf-gen',
  status: 'QUEUED',
  createdAt: new Date(),
});
```

### 3.3 测试流程示例

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { RedisQueueService } from '@/services/redis-queue.service';

describe('Redis队列服务 - 任务入队', () => {
  let redis: Redis;
  let queueService: RedisQueueService;

  beforeEach(async () => {
    // 连接测试Redis
    redis = new Redis({ port: 6380, host: 'localhost' });
    queueService = new RedisQueueService(redis);

    // 清空测试数据
    await redis.del('task_queue');
    await redis.del('active_task_ids');
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('应该成功将任务加入队列', async () => {
    const taskId = 'task-test-001';

    const result = await queueService.enqueue(taskId);

    // 验证返回值
    expect(result.success).toBe(true);
    expect(result.queueLength).toBe(1);

    // 验证Redis状态
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(1);

    const taskInQueue = await redis.lindex('task_queue', 0);
    expect(taskInQueue).toBe(taskId);
  });

  it('应该拒绝超过队列上限的入队', async () => {
    // 填满队列（48个任务）
    for (let i = 0; i < 48; i++) {
      await redis.lpush('task_queue', `task-${i}`);
    }

    // 尝试加入第49个任务
    const result = await queueService.enqueue('task-49');

    expect(result.success).toBe(false);
    expect(result.error).toContain('队列已满');

    // 验证队列长度仍然是48
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(48);
  });

  it('应该防止重复入队', async () => {
    const taskId = 'task-duplicate-001';

    // 第一次入队
    const result1 = await queueService.enqueue(taskId);
    expect(result1.success).toBe(true);

    // 第二次入队
    const result2 = await queueService.enqueue(taskId);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('已在队列中');

    // 验证队列中只有一个
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(1);
  });
});

describe('Redis队列服务 - 任务出队', () => {
  let redis: Redis;
  let queueService: RedisQueueService;

  beforeEach(async () => {
    redis = new Redis({ port: 6380 });
    queueService = new RedisQueueService(redis);
  });

  afterEach(async () => {
    await redis.del('task_queue');
    await redis.quit();
  });

  it('应该按FIFO顺序出队', async () => {
    // 按顺序入队
    await queueService.enqueue('task-001');
    await queueService.enqueue('task-002');
    await queueService.enqueue('task-003');

    // 出队应该按顺序
    const task1 = await queueService.dequeue();
    expect(task1).toBe('task-001');

    const task2 = await queueService.dequeue();
    expect(task2).toBe('task-002');

    const task3 = await queueService.dequeue();
    expect(task3).toBe('task-003');
  });

  it('空队列应该返回null', async () => {
    const task = await queueService.dequeue();
    expect(task).toBeNull();
  });

  it('出队应该将任务从队列移除', async () => {
    await queueService.enqueue('task-001');

    const queueLengthBefore = await redis.llen('task_queue');
    expect(queueLengthBefore).toBe(1);

    await queueService.dequeue();

    const queueLengthAfter = await redis.llen('task_queue');
    expect(queueLengthAfter).toBe(0);
  });
});

describe('Redis队列服务 - 活跃任务管理', () => {
  let redis: Redis;
  let queueService: RedisQueueService;

  beforeEach(async () => {
    redis = new Redis({ port: 6380 });
    queueService = new RedisQueueService(redis);
    await redis.del('active_task_ids');
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('应该添加活跃任务', async () => {
    const taskId = 'task-active-001';

    await queueService.addActiveTask(taskId);

    // 验证任务在活跃集合中
    const isMember = await redis.sismember('active_task_ids', taskId);
    expect(isMember).toBe(1);

    // 验证活跃任务数量
    const count = await redis.scard('active_task_ids');
    expect(count).toBe(1);
  });

  it('应该移除活跃任务', async () => {
    const taskId = 'task-active-001';

    await queueService.addActiveTask(taskId);
    await queueService.removeActiveTask(taskId);

    // 验证任务已移除
    const isMember = await redis.sismember('active_task_ids', taskId);
    expect(isMember).toBe(0);
  });

  it('应该返回所有活跃任务', async () => {
    await queueService.addActiveTask('task-001');
    await queueService.addActiveTask('task-002');
    await queueService.addActiveTask('task-003');

    const activeTasks = await queueService.getActiveTasks();

    expect(activeTasks).toHaveLength(3);
    expect(activeTasks).toContain('task-001');
    expect(activeTasks).toContain('task-002');
    expect(activeTasks).toContain('task-003');
  });

  it('应该防止重复添加活跃任务', async () => {
    const taskId = 'task-duplicate';

    await queueService.addActiveTask(taskId);
    await queueService.addActiveTask(taskId);

    const count = await redis.scard('active_task_ids');
    expect(count).toBe(1); // Set特性，自动去重
  });
});
```

### 3.4 结果判断标准

- ✅ 队列操作符合Redis数据结构语义
- ✅ FIFO顺序正确
- ✅ 队列上限严格控制
- ✅ 并发安全（使用分布式锁）
- ✅ 错误处理完善
- ✅ 活跃任务集合正确维护

## 4. 分布式锁测试

**文件位置**: `tests/unit/backend/redis/redis-lock.test.ts`

### 4.1 测试项列表

1. **获取锁测试**
   - 测试能获取任务锁
   - 测试锁的过期时间设置
   - 测试锁的值包含标识信息

2. **锁互斥测试**
   - 测试同一任务同时只能有一个Worker获取锁
   - 测试已持有的锁不能再次获取

3. **释放锁测试**
   - 测试能释放持有的锁
   - 测试只能释放自己持有的锁
   - 测试释放不存在的锁不报错

4. **锁过期测试**
   - 测试锁过期后自动释放
   - 测试过期后其他Worker能获取锁

5. **锁续期测试**
   - 测试能续期持有的锁
   - 测试续期失败时锁仍会过期

### 4.2 测试流程示例

```typescript
describe('分布式锁服务', () => {
  let redis: Redis;
  let lockService: RedisLockService;

  beforeEach(async () => {
    redis = new Redis({ port: 6380 });
    lockService = new RedisLockService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('应该成功获取锁', async () => {
    const taskId = 'task-lock-001';
    const workerId = 'worker-1';

    const result = await lockService.acquire(taskId, workerId, 30000);

    expect(result.acquired).toBe(true);
    expect(result.lockId).toBeDefined();

    // 验证Redis中的锁
    const lockKey = `taskid_lock:${taskId}`;
    const lockValue = await redis.get(lockKey);
    expect(lockValue).toBeDefined();
  });

  it('应该阻止重复获取锁', async () => {
    const taskId = 'task-lock-002';
    const worker1 = 'worker-1';
    const worker2 = 'worker-2';

    // worker1获取锁
    const result1 = await lockService.acquire(taskId, worker1, 30000);
    expect(result1.acquired).toBe(true);

    // worker2尝试获取相同任务的锁
    const result2 = await lockService.acquire(taskId, worker2, 30000);
    expect(result2.acquired).toBe(false);
  });

  it('应该成功释放锁', async () => {
    const taskId = 'task-lock-003';
    const workerId = 'worker-1';

    // 获取锁
    await lockService.acquire(taskId, workerId, 30000);

    // 释放锁
    const released = await lockService.release(taskId, workerId);
    expect(released).toBe(true);

    // 验证锁已删除
    const lockKey = `taskid_lock:${taskId}`;
    const lockExists = await redis.exists(lockKey);
    expect(lockExists).toBe(0);
  });

  it('应该只能释放自己持有的锁', async () => {
    const taskId = 'task-lock-004';
    const worker1 = 'worker-1';
    const worker2 = 'worker-2';

    // worker1获取锁
    await lockService.acquire(taskId, worker1, 30000);

    // worker2尝试释放锁
    const released = await lockService.release(taskId, worker2);
    expect(released).toBe(false);

    // worker1的锁仍然存在
    const lockKey = `taskid_lock:${taskId}`;
    const lockExists = await redis.exists(lockKey);
    expect(lockExists).toBe(1);
  });

  it('锁应该自动过期', async () => {
    const taskId = 'task-lock-expire';
    const workerId = 'worker-1';

    // 获取1秒过期的锁
    await lockService.acquire(taskId, workerId, 1000);

    // 等待1.5秒
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 验证锁已过期
    const lockKey = `taskid_lock:${taskId}`;
    const lockExists = await redis.exists(lockKey);
    expect(lockExists).toBe(0);
  });
});
```

## 5. Worker测试

**文件位置**: `tests/integration/worker/worker.test.ts`

### 5.1 测试项列表

#### 5.1.1 Worker启动和停止

1. **Worker启动测试**
   - 测试Worker能成功启动
   - 测试Worker连接到Redis
   - 测试Worker注册心跳

2. **Worker停止测试**
   - 测试Worker能优雅停止
   - 测试停止前完成当前任务
   - 测试停止后不再接受新任务

3. **Worker心跳测试**
   - 测试定期发送心跳
   - 测试心跳超时检测
   - 测试心跳失败时重新连接

#### 5.1.2 任务处理

1. **任务获取测试**
   - 测试Worker从队列获取任务
   - 测试获取任务时加分布式锁
   - 测试获取失败时重试

2. **任务执行测试**
   - 测试能执行SDC工具任务
   - 测试能执行UPF工具任务
   - 测试执行时记录进度
   - 测试执行超时处理

3. **任务完成处理**
   - 测试成功完成时更新状态
   - 测试失败时记录错误信息
   - 测试完成后释放锁
   - 测试完成后从活跃任务移除

### 5.2 测试数据准备

```bash
# 测试Docker镜像
docker build -t logiccore/sdcgen:test -f build_images/sdcgen/Dockerfile .
docker build -t logiccore/upfgen:test -f build_images/upfgen/Dockerfile .

# 测试输入数据
tests/integration/worker/fixtures/
├── sdc/
│   ├── hier.yaml
│   ├── vlog.v
│   └── expected_output.xlsx
└── upf/
    ├── hier.yaml
    ├── pvlog.v
    ├── pobj.tcl
    ├── pcell.yaml
    └── expected_output.xlsx
```

### 5.3 Mock Docker容器

由于真实Docker执行可能较慢，测试时可以使用Mock：

```typescript
// tests/integration/worker/mocks/container-manager.mock.ts
export class MockContainerManager {
  async runContainer(taskId: string, toolType: string, inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    error?: string;
  }> {
    // 模拟容器执行
    await new Promise(resolve => setTimeout(resolve, 100));

    // 返回成功结果
    return {
      success: true,
      outputPath: `/tmp/test/output/${taskId}.xlsx`,
    };
  }
}
```

### 5.4 测试流程示例

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ToolWorker } from '@/workers/toolWorker';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';

describe('Worker - 任务处理', () => {
  let worker: ToolWorker;
  let redis: Redis;
  let testTaskId: string;

  beforeAll(async () => {
    // 连接Redis
    redis = new Redis({ port: 6380 });

    // 创建测试任务
    const task = await prisma.task.create({
      data: {
        toolId: 'sdc-gen',
        status: 'QUEUED',
        userId: 'test-user',
        modName: 'test_module',
        uploadFilePath: '/path/to/upload.xlsx',
      },
    });
    testTaskId = task.id;

    // 将任务加入队列
    await redis.lpush('task_queue', testTaskId);

    // 启动Worker
    worker = new ToolWorker({
      redisUrl: 'redis://localhost:6380',
      workerId: 'test-worker-1',
      mockMode: true, // 使用Mock模式
    });

    await worker.start();
  });

  afterAll(async () => {
    await worker.stop();
    await redis.quit();
    await prisma.task.delete({ where: { id: testTaskId } });
  });

  it('应该从队列获取任务', async () => {
    // Worker应该已经获取了任务
    const activeTasks = await redis.smembers('active_task_ids');
    expect(activeTasks).toContain(testTaskId);

    // 队列应该为空
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(0);
  }, { timeout: 5000 });

  it('应该更新任务状态为RUNNING', async () => {
    // 等待任务开始处理
    await new Promise(resolve => setTimeout(resolve, 1000));

    const task = await prisma.task.findUnique({
      where: { id: testTaskId },
    });

    expect(task?.status).toBe('RUNNING');
  }, { timeout: 5000 });

  it('应该记录任务进度', async () => {
    const progress = await redis.hgetall(`task_progress:${testTaskId}`);

    expect(progress).toBeDefined();
    expect(progress.status).toBeDefined();
    expect(parseInt(progress.percent || '0')).toBeGreaterThanOrEqual(0);
  }, { timeout: 10000 });

  it('应该完成任务并更新状态', async () => {
    // 等待任务完成
    await new Promise(resolve => setTimeout(resolve, 5000));

    const task = await prisma.task.findUnique({
      where: { id: testTaskId },
    });

    expect(task?.status).toBe('COMPLETED');
    expect(task?.outputFilePath).toBeDefined();

    // 验证任务从活跃集合移除
    const activeTasks = await redis.smembers('active_task_ids');
    expect(activeTasks).not.toContain(testTaskId);
  }, { timeout: 15000 });
});
```

### 5.5 结果判断标准

- ✅ Worker能正确启动和停止
- ✅ Worker能从队列获取任务
- ✅ 任务状态正确更新
- ✅ 进度信息正确记录
- ✅ 分布式锁正确使用
- ✅ 容器执行正确处理
- ✅ 错误情况正确处理

## 6. 任务状态同步测试

**文件位置**: `tests/integration/worker/task-state-sync.test.ts`

### 6.1 测试项列表

1. **三层状态同步测试**
   - 测试数据库、Redis、WebSocket三者状态一致
   - 测试状态更新时三层都同步
   - 测试任一层失败时的处理

2. **状态转换测试**
   - 测试所有合法的状态转换
   - 测试非法转换被拒绝
   - 测试状态转换触发正确的后续操作

3. **状态一致性检查测试**
   - 测试能检测不一致的状态
   - 测试能修复不一致的状态
   - 测试定期一致性检查

### 6.2 测试流程示例

```typescript
describe('任务状态同步', () => {
  it('应该保持三层状态一致', async () => {
    const taskId = 'task-sync-001';

    // 创建任务
    await prisma.task.create({
      data: { id: taskId, status: 'QUEUED' },
    });

    // 更新状态为RUNNING
    await taskStateService.updateState(taskId, 'RUNNING');

    // 验证数据库
    const dbTask = await prisma.task.findUnique({ where: { id: taskId } });
    expect(dbTask?.status).toBe('RUNNING');

    // 验证Redis
    const redisStatus = await redis.hget(`task_status:${taskId}`, 'status');
    expect(redisStatus).toBe('RUNNING');

    // 验证WebSocket（需要mock WebSocket客户端）
    expect(wsClient.lastEmittedStatus).toBe('RUNNING');
  });
});
```

## 7. 并发测试

**文件位置**: `tests/performance/concurrent-tasks/concurrent-queue.test.ts`

### 7.1 测试项列表

1. **并发入队测试**
   - 测试多个Worker同时入队
   - 测试并发入队的数据一致性
   - 测试并发入队的性能

2. **并发出队测试**
   - 测试多个Worker同时出队
   - 测试任务不会被多个Worker获取
   - 测试并发出队的性能

3. **高并发压力测试**
   - 测试队列在100个并发请求下的表现
   - 测试Redis连接池的处理能力
   - 测试系统在高并发下的稳定性

### 7.2 测试流程示例

```typescript
describe('并发队列操作', () => {
  it('多个Worker并发入队应该正确处理', async () => {
    const workerCount = 10;
    const tasksPerWorker = 5;

    // 创建多个Worker实例
    const workers = Array.from({ length: workerCount }, (_, i) =>
      new RedisQueueService(new Redis({ port: 6380 }))
    );

    // 并发入队
    const enqueuePromises = workers.flatMap((worker, workerIndex) =>
      Array.from({ length: tasksPerWorker }, (_, taskIndex) =>
        worker.enqueue(`task-${workerIndex}-${taskIndex}`)
      )
    );

    const results = await Promise.all(enqueuePromises);

    // 验证所有入队都成功
    results.forEach(result => {
      expect(result.success).toBe(true);
    });

    // 验证队列长度
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(workerCount * tasksPerWorker);
  });

  it('多个Worker并发出队应该不重复获取任务', async () => {
    // 先入队50个任务
    for (let i = 0; i < 50; i++) {
      await redis.lpush('task_queue', `task-${i}`);
    }

    // 创建10个Worker并发出队
    const workers = Array.from({ length: 10 }, () =>
      new RedisQueueService(new Redis({ port: 6380 }))
    );

    const dequeuePromises = workers.map(worker => worker.dequeue());
    const tasks = await Promise.all(dequeuePromises);

    // 验证获取的任务都是唯一的
    const uniqueTasks = new Set(tasks.filter(t => t !== null));
    expect(uniqueTasks.size).toBe(10);

    // 验证队列长度减少
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(40);
  });
});
```

## 8. 测试覆盖率目标

| 模块 | 测试覆盖率 | 说明 |
|-----|-----------|------|
| Redis队列操作 | 90% | 核心功能，需要高覆盖 |
| 分布式锁 | 95% | 并发安全关键 |
| Worker任务处理 | 85% | 复杂业务逻辑 |
| 任务状态同步 | 85% | 三层同步重要 |
| 并发处理 | 80% | 边缘情况多 |

## 9. 额外要求

### 9.1 性能要求

- 入队操作响应时间 < 10ms
- 出队操作响应时间 < 10ms
- 分布式锁获取 < 5ms
- Worker启动时间 < 5秒
- 任务获取延迟 < 1秒

### 9.2 稳定性要求

- Worker能自动重连Redis
- 任务失败能自动重试（最多3次）
- 死锁能自动检测和恢复
- 内存使用稳定（无泄漏）

### 9.3 监控要求

```typescript
// 测试监控指标
const metrics = {
  queueLength: await redis.llen('task_queue'),
  activeTaskCount: await redis.scard('active_task_ids'),
  workerCount: await getWorkerCount(),
  avgTaskDuration: await getAvgTaskDuration(),
  errorRate: await getErrorRate(),
};

expect(metrics.queueLength).toBeLessThanOrEqual(48);
expect(metrics.errorRate).toBeLessThan(0.05); // 错误率 < 5%
```

## 10. 常见问题

### Q1: 如何测试需要Docker的功能？

使用Mock容器管理器，避免真实Docker调用：

```typescript
const mockContainer = {
  runContainer: vi.fn().mockResolvedValue({
    success: true,
    outputPath: '/tmp/output.xlsx',
  }),
};
```

### Q2: 如何测试WebSocket通信？

使用Mock WebSocket客户端：

```typescript
const mockWsClient = {
  emit: vi.fn(),
  lastEmittedStatus: null,
};
```

### Q3: 如何模拟长时间运行的任务？

使用setTimeout模拟任务执行时间：

```typescript
async function runLongTask(taskId: string) {
  await updateTaskStatus(taskId, 'RUNNING');
  await new Promise(resolve => setTimeout(resolve, 5000));
  await updateTaskStatus(taskId, 'COMPLETED');
}
```
