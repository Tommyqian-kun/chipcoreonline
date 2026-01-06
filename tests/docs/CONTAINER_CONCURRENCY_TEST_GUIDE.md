# 容器执行和高并发测试指南

## 1. 概述

本指南涵盖LogicCore系统中容器执行机制和高并发场景的测试方法，包括Docker容器管理、任务并发处理、性能测试、压力测试等。

## 2. 环境设置

### 2.1 前置要求

```bash
# 安装Docker测试工具
npm install --save-dev dockerode
npm install --save-dev @types/dockerode

# 安装性能测试工具
npm install --save-dev autocannon
npm install --save-dev loadtest

# 安装Python测试工具
pip install docker pytest-asyncio locust
```

### 2.2 Docker测试配置

```bash
# app/backend/.env.test
# 容器配置
DOCKER_NETWORK="logiccore_test"
CONTAINER_TIMEOUT=180000  # 3分钟
CONTAINER_MEMORY_LIMIT="512m"
CONTAINER_CPU_LIMIT="1.0"

# 输入输出路径
CONTAINER_INPUT_PATH="/data/input"
CONTAINER_OUTPUT_PATH="/data/output"
CONTAINER_LOG_PATH="/data/logs"

# Host挂载路径
ECS_JOBS_DIR="/tmp/test/jobs"
ECS_DOCKER_DIR="/tmp/test/docker"
```

### 2.3 测试Docker环境

```bash
# 创建测试网络
docker network create logiccore_test

# 创建测试目录
mkdir -p /tmp/test/jobs
mkdir -p /tmp/test/docker

# 验证Docker可用
docker ps
docker images | grep logiccore
```

### 2.4 准备测试镜像

```bash
# 构建测试镜像
cd build_images/sdcgen
docker build -t logiccore/sdcgen:test .

cd ../upfgen
docker build -t logiccore/upfgen:test .

# 验证镜像
docker images | grep logiccore
```

## 3. Docker容器执行测试

**文件位置**: `tests/integration/container/container-execution.test.ts`

### 3.1 测试项列表

#### 3.1.1 容器启动和管理

1. **容器创建测试**
   - 测试能创建SDC工具容器
   - 测试能创建UPF工具容器
   - 测试容器使用正确的镜像
   - 测试容器配置正确的网络

2. **容器挂载测试**
   - 测试输入文件正确挂载（只读）
   - 测试输出目录正确挂载（读写）
   - 测试日志目录正确挂载
   - 测试挂载路径权限正确

3. **容器环境变量测试**
   - 测试正确传递任务参数
   - 测试环境变量格式正确
   - 测试敏感信息不在环境变量中

4. **容器资源限制测试**
   - 测试内存限制生效
   - 测试CPU限制生效
   - 测试超时自动终止

5. **容器清理测试**
   - 测试执行成功后容器删除
   - 测试执行失败后容器删除
   - 测试强制删除容器
   - 测试容器卷清理

#### 3.1.2 容器执行流程

1. **SDC工具执行测试**
   - 测试能执行SDC生成工具
   - 测试能处理成功场景
   - 测试能处理失败场景
   - 测试能生成正确的输出文件

2. **UPF工具执行测试**
   - 测试能执行UPF生成工具
   - 测试能处理多文件输入
   - 测试能生成正确的输出

3. **容器日志捕获测试**
   - 测试能捕获容器stdout
   - 测试能捕获容器stderr
   - 测试日志正确保存到文件

4. **容器退出码处理测试**
   - 测试退出码0表示成功
   - 测试非0退出码表示失败
   - 测试能从退出码判断错误类型

### 3.2 测试数据准备

```bash
# 测试输入数据结构
/tmp/test/jobs/{taskId}/
├── input/
│   ├── hier.yaml
│   ├── vlog.v
│   └── config.yaml
├── output/           # 容器执行后生成
└── logs/             # 容器日志

# 测试文件
tests/integration/container/fixtures/
├── sdc/
│   ├── valid_hier.yaml
│   ├── invalid_hier.yaml
│   └── test_vlog.v
└── upf/
    ├── test_hier.yaml
    ├── test_pvlog.v
    └── test_pobj.tcl
```

### 3.3 测试流程示例

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Docker from 'dockerode';
import { ContainerManager } from '@/services/container-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Docker容器执行 - SDC工具', () => {
  let docker: Docker;
  let containerManager: ContainerManager;
  const testTaskId = 'test-sdc-container-001';

  beforeAll(async () => {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    containerManager = new ContainerManager(docker);

    // 准备测试输入数据
    const inputDir = path.join('/tmp/test/jobs', testTaskId, 'input');
    await fs.mkdir(inputDir, { recursive: true });

    // 复制测试文件
    const fixturePath = path.join(__dirname, 'fixtures/sdc');
    await fs.copyFile(
      path.join(fixturePath, 'valid_hier.yaml'),
      path.join(inputDir, 'hier.yaml')
    );
    await fs.copyFile(
      path.join(fixturePath, 'test_vlog.v'),
      path.join(inputDir, 'vlog.v')
    );
  });

  afterAll(async () => {
    // 清理测试目录
    await fs.rm('/tmp/test/jobs', { recursive: true, force: true });
  });

  it('应该成功创建并启动SDC容器', async () => {
    const container = await containerManager.createContainer({
      taskId: testTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:test',
      inputPath: path.join('/tmp/test/jobs', testTaskId, 'input'),
      outputPath: path.join('/tmp/test/jobs', testTaskId, 'output'),
      logPath: path.join('/tmp/test/jobs', testTaskId, 'logs'),
    });

    // 验证容器创建
    expect(container.id).toBeDefined();

    // 验证容器状态
    const info = await container.inspect();
    expect(info.State.Status).toBe('created');

    // 验证挂载点
    const mounts = info.Mounts || [];
    const inputMount = mounts.find(m => m.Destination === '/data/input');
    expect(inputMount).toBeDefined();
    expect(inputMount?.RW).toBe(false); // 只读

    const outputMount = mounts.find(m => m.Destination === '/data/output');
    expect(outputMount).toBeDefined();
    expect(outputMount?.RW).toBe(true); // 读写

    // 清理
    await container.remove({ force: true });
  });

  it('应该正确执行SDC工具并生成输出', async () => {
    const result = await containerManager.runContainer({
      taskId: testTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:test',
      inputPath: path.join('/tmp/test/jobs', testTaskId, 'input'),
      outputPath: path.join('/tmp/test/jobs', testTaskId, 'output'),
      logPath: path.join('/tmp/test/jobs', testTaskId, 'logs'),
      timeout: 60000, // 60秒
    });

    // 验证执行结果
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.outputPath).toBeDefined();

    // 验证输出文件存在
    const outputFiles = await fs.readdir(result.outputPath);
    expect(outputFiles.length).toBeGreaterThan(0);
    expect(outputFiles).toContain('output.xlsx');

    // 验证日志文件存在
    const logFiles = await fs.readdir(path.join('/tmp/test/jobs', testTaskId, 'logs'));
    expect(logFiles.length).toBeGreaterThan(0);
  });

  it('应该处理容器执行失败的情况', async () => {
    // 准备无效输入数据
    const invalidTaskId = 'test-invalid-001';
    const inputDir = path.join('/tmp/test/jobs', invalidTaskId, 'input');
    await fs.mkdir(inputDir, { recursive: true });

    await fs.writeFile(
      path.join(inputDir, 'hier.yaml'),
      'invalid: yaml: content:' // 无效的YAML
    );

    const result = await containerManager.runContainer({
      taskId: invalidTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:test',
      inputPath: inputDir,
      outputPath: path.join('/tmp/test/jobs', invalidTaskId, 'output'),
      logPath: path.join('/tmp/test/jobs', invalidTaskId, 'logs'),
      timeout: 30000,
    });

    // 验证失败处理
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeDefined();

    // 验证容器仍被清理
    const containers = await docker.listContainers({ all: true });
    const testContainer = containers.find(c =>
      c.Names.some(n => n.includes(invalidTaskId))
    );
    expect(testContainer).toBeUndefined();
  });

  it('应该在超时时终止容器', async () => {
    // 使用一个会长时间运行的镜像
    const longTaskId = 'test-timeout-001';

    const result = await containerManager.runContainer({
      taskId: longTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:test',
      inputPath: path.join('/tmp/test/jobs', testTaskId, 'input'),
      outputPath: path.join('/tmp/test/jobs', longTaskId, 'output'),
      logPath: path.join('/tmp/test/jobs', longTaskId, 'logs'),
      timeout: 1000, // 1秒超时
      command: 'sleep 100', // 会执行100秒的命令
    });

    // 验证超时处理
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');

    // 验证容器被终止
    const containers = await docker.listContainers({ all: true });
    const timeoutContainer = containers.find(c =>
      c.Names.some(n => n.includes(longTaskId))
    );
    expect(timeoutContainer?.State).not.toBe('running');
  });

  it('应该正确捕获容器日志', async () => {
    const logTaskId = 'test-log-001';

    await containerManager.runContainer({
      taskId: logTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:test',
      inputPath: path.join('/tmp/test/jobs', testTaskId, 'input'),
      outputPath: path.join('/tmp/test/jobs', logTaskId, 'output'),
      logPath: path.join('/tmp/test/jobs', logTaskId, 'logs'),
      timeout: 30000,
    });

    // 读取日志文件
    const logFiles = await fs.readdir(path.join('/tmp/test/jobs', logTaskId, 'logs'));
    const logContent = await fs.readFile(
      path.join('/tmp/test/jobs', logTaskId, 'logs', logFiles[0]),
      'utf-8'
    );

    // 验证日志包含预期内容
    expect(logContent).toContain('SDC');
    expect(logContent.length).toBeGreaterThan(0);
  });
});
```

### 3.4 结果判断标准

- ✅ 容器成功创建和启动
- ✅ 文件正确挂载（输入只读、输出读写）
- ✅ 环境变量正确设置
- ✅ 资源限制生效
- ✅ 执行成功时输出文件存在
- ✅ 执行失败时错误信息清晰
- ✅ 超时时容器被终止
- ✅ 容器执行后被清理
- ✅ 日志正确保存

## 4. 并发测试

**文件位置**: `tests/performance/concurrent-tasks/concurrent-execution.test.ts`

### 4.1 测试项列表

#### 4.1.1 并发任务提交

1. **并发提交测试**
   - 测试能同时提交多个任务
   - 测试每个任务获得唯一ID
   - 测试所有任务都正确入队

2. **并发限制测试**
   - 测试队列上限48个严格限制
   - 测试超过上限时返回错误
   - 测试队列有空位时能继续提交

3. **用户并发限制测试**
   - 测试免费用户并发限制（1个）
   - 测试付费用户并发限制（根据订阅）
   - 测试超过限制时返回明确的错误

#### 4.1.2 并发任务执行

1. **多Worker并发测试**
   - 测试多个Worker同时运行
   - 测试每个Worker处理不同任务
   - 测试任务不会重复处理

2. **资源竞争测试**
   - 测试并发访问数据库
   - 测试并发访问Redis
   - 测试并发写文件
   - 测试无数据竞争和死锁

3. **并发执行性能测试**
   - 测试10个并发任务的执行时间
   - 测试50个并发任务的执行时间
   - 测试系统在高并发下的稳定性

#### 4.1.3 容器并发执行

1. **多容器并发测试**
   - 测试能同时运行多个容器
   - 测试每个容器独立运行
   - 测试容器间不相互影响

2. **容器资源限制测试**
   - 测试并发容器内存使用不超限
   - 测试并发容器CPU使用合理
   - 测试Docker Daemon能处理

### 4.2 测试数据准备

```typescript
// 生成测试任务
const generateTestTasks = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `concurrent-task-${i}`,
    toolId: i % 2 === 0 ? 'sdc-gen' : 'upf-gen',
    modName: `test_module_${i}`,
    userId: 'test-concurrent-user',
  }));
};
```

### 4.3 测试流程示例

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';

describe('并发任务提交', () => {
  let authToken: string;
  let redis: Redis;

  beforeAll(async () => {
    // 登录获取token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'concurrent@example.com', password: 'Test123456!' });
    authToken = loginResponse.body.token;

    // 连接Redis
    redis = new Redis({ port: 6380 });
    await redis.del('task_queue');
  });

  afterAll(async () => {
    await redis.del('task_queue');
    await redis.quit();
  });

  it('应该能同时提交10个任务', async () => {
    const taskCount = 10;

    // 并发提交10个任务
    const submitPromises = Array.from({ length: taskCount }, (_, i) =>
      request(app)
        .post('/api/v1/sdc-thrpages/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', `test_module_${i}`)
        .field('isFlat', 'false')
        .attach('hierYamlFile', 'test_data/upload_data/sdcgen/hier.yaml')
        .attach('vlogFile', 'test_data/upload_data/sdcgen/vlog.v')
    );

    const responses = await Promise.all(submitPromises);

    // 验证所有提交都成功
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBeDefined();
    });

    // 验证所有任务ID唯一
    const taskIds = responses.map(r => r.body.taskId);
    const uniqueTaskIds = new Set(taskIds);
    expect(uniqueTaskIds.size).toBe(taskCount);

    // 验证队列长度
    const queueLength = await redis.llen('task_queue');
    expect(queueLength).toBe(taskCount);
  });

  it('队列满时应该拒绝新任务', async () => {
    // 填满队列
    for (let i = 0; i < 48; i++) {
      await redis.lpush('task_queue', `fill-task-${i}`);
    }

    // 尝试提交第49个任务
    const response = await request(app)
      .post('/api/v1/sdc-thrpages/initialize')
      .set('Authorization', `Bearer ${authToken}`)
      .field('modName', 'overflow_task')
      .field('isFlat', 'false')
      .attach('hierYamlFile', 'test_data/upload_data/sdcgen/hier.yaml')
      .attach('vlogFile', 'test_data/upload_data/sdcgen/vlog.v');

    expect(response.status).toBe(429); // Too Many Requests
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('队列已满');
  });

  it('应该尊重用户并发限制', async () => {
    // 创建免费用户（限制1个并发）
    const freeUserResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'freeuser@example.com',
        password: 'Test123456!',
        username: 'freeuser',
      });
    const freeUserToken = freeUserResponse.body.token;

    // 提交第一个任务
    const task1 = await request(app)
      .post('/api/v1/sdc-thrpages/initialize')
      .set('Authorization', `Bearer ${freeUserToken}`)
      .field('modName', 'task1')
      .attach('hierYamlFile', 'test_data/upload_data/sdcgen/hier.yaml')
      .attach('vlogFile', 'test_data/upload_data/sdcgen/vlog.v');

    expect(task1.status).toBe(201);

    // 尝试提交第二个任务（应该被拒绝）
    const task2 = await request(app)
      .post('/api/v1/sdc-thrpages/initialize')
      .set('Authorization', `Bearer ${freeUserToken}`)
      .field('modName', 'task2')
      .attach('hierYamlFile', 'test_data/upload_data/sdcgen/hier.yaml')
      .attach('vlogFile', 'test_data/upload_data/sdcgen/vlog.v');

    expect(task2.status).toBe(429);
    expect(task2.body.message).toContain('并发限制');
  });
});

describe('并发任务执行', () => {
  it('多个Worker应该能并发处理任务', async () => {
    const workerCount = 3;
    const taskCount = 10;

    // 创建多个Worker
    const workers = Array.from({ length: workerCount }, (_, i) =>
      new ToolWorker({
        redisUrl: 'redis://localhost:6380',
        workerId: `worker-${i}`,
        mockMode: false, // 使用真实执行
      })
    );

    // 启动所有Worker
    await Promise.all(workers.map(w => w.start()));

    // 入队10个任务
    for (let i = 0; i < taskCount; i++) {
      await redis.lpush('task_queue', `concurrent-exec-task-${i}`);
    }

    // 等待所有任务完成
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 验证所有任务都完成
    const completedTasks = await prisma.task.findMany({
      where: {
        id: { startsWith: 'concurrent-exec-task-' },
        status: 'COMPLETED',
      },
    });

    expect(completedTasks.length).toBe(taskCount);

    // 停止所有Worker
    await Promise.all(workers.map(w => w.stop()));
  });
});
```

## 5. 压力测试

**文件位置**: `tests/performance/stress/load-test.ts`

### 5.1 使用autocannon进行HTTP压力测试

```typescript
import autocannon from 'autocannon';

describe('HTTP API压力测试', () => {
  it('登录API应该能承受100 RPS', async () => {
    const result = await autocannon({
      url: 'http://localhost:8080/api/v1/auth/login',
      connections: 10,
      duration: 10,
      pipelining: 10,
      requests: [
        {
          method: 'POST',
          path: '/api/v1/auth/login',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'Test123456!',
          }),
        },
      ],
    });

    console.log('压力测试结果:', result);
    expect(result.non2xx).toBe(0);
    expect(result.latency).toBeDefined();
    expect(result.requests.mean).toBeGreaterThan(100);
  });
});
```

### 5.2 使用Locust进行Python压力测试

```python
# tests/performance/stress/locustfile.py
from locust import HttpUser, task, between

class LogicCoreUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        # 登录
        response = self.client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "Test123456!"
        })
        self.token = response.json()["token"]

    @task(3)
    def get_tasks(self):
        self.client.get("/api/v1/tasks", headers={
            "Authorization": f"Bearer {self.token}"
        })

    @task(1)
    def create_sdc_task(self):
        # 创建SDC任务
        pass

    @task(1)
    def submit_task(self):
        # 提交任务
        pass
```

运行压力测试：

```bash
# 运行Locust
locust -f tests/performance/stress/locustfile.py --host=http://localhost:8080

# 或使用headless模式
locust -f tests/performance/stress/locustfile.py --host=http://localhost:8080 --headless -u 100 -r 10 -t 1m
```

### 5.3 性能基准

| 操作 | 目标响应时间 | 目标吞吐量 |
|-----|------------|-----------|
| 登录 | < 100ms | > 100 RPS |
| 创建任务 | < 500ms | > 50 RPS |
| 查询任务 | < 100ms | > 200 RPS |
| 提交任务 | < 200ms | > 50 RPS |
| 下载结果 | < 1s | > 20 RPS |

## 6. 资源监控测试

### 6.1 监控指标

```typescript
describe('资源监控', () => {
  it('应该监控容器资源使用', async () => {
    const docker = new Docker();
    const container = await docker.createContainer({
      Image: 'logiccore/sdcgen:test',
      Cmd: ['sleep', '60'],
    });

    await container.start();

    // 获取容器统计信息
    const stats = await container.stats({ stream: false });

    // 验证资源使用
    expect(stats.cpu_stats).toBeDefined();
    expect(stats.memory_stats).toBeDefined();
    expect(stats.memory_stats.usage).toBeLessThan(512 * 1024 * 1024); // < 512MB

    await container.remove({ force: true });
  });

  it('应该监控系统资源', async () => {
    const usage = process.cpuUsage();
    const memory = process.memoryUsage();

    expect(memory.heapUsed).toBeLessThan(1024 * 1024 * 1024); // < 1GB
  });
});
```

### 6.2 性能指标

```typescript
// 记录性能指标
const performanceMetrics = {
  requestDuration: [],
  taskExecutionTime: [],
  queueWaitTime: [],
  memoryUsage: [],
  cpuUsage: [],
};

// 分析性能指标
function analyzePerformance(metrics: any) {
  return {
    avgRequestDuration: average(metrics.requestDuration),
    p95RequestDuration: percentile(metrics.requestDuration, 95),
    avgTaskExecutionTime: average(metrics.taskExecutionTime),
    maxMemoryUsage: Math.max(...metrics.memoryUsage),
  };
}
```

## 7. 测试覆盖率目标

| 模块 | 测试覆盖率 | 说明 |
|-----|-----------|------|
| 容器管理 | 80% | Docker操作复杂 |
| 容器执行 | 85% | 核心功能 |
| 并发控制 | 85% | 关键功能 |
| 资源限制 | 75% | 边缘情况多 |
| 错误恢复 | 80% | 异常处理重要 |

## 8. 额外要求

### 8.1 性能要求

- 单个容器启动时间 < 5秒
- 容器执行时间符合预期（SDC < 2分钟，UPF < 3分钟）
- 并发执行不显著增加单个任务时间
- 内存使用稳定，无泄漏

### 8.2 稳定性要求

- 系统能连续运行24小时无崩溃
- 能处理1000个任务/小时
- 错误率 < 1%
- 资源使用不超过限制

### 8.3 可恢复性要求

- Worker崩溃能自动重启
- 任务失败能自动重试
- Docker Daemon重启不影响任务
- 数据库连接池自动恢复

## 9. 常见问题

### Q1: 如何测试Docker相关功能但不真正运行容器？

使用Mock Dockerode：

```typescript
const mockDocker = {
  createContainer: vi.fn().mockResolvedValue({
    start: vi.fn(),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: vi.fn(),
  }),
};
```

### Q2: 如何模拟长时间运行的任务？

使用setTimeout：

```typescript
async function runLongTask() {
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

### Q3: 如何测试资源限制？

使用cgroup限制或容器统计：

```typescript
const stats = await container.stats({ stream: false });
const memoryUsage = stats.memory_stats.usage;
const cpuUsage = stats.cpu_stats.cpu_usage.total_usage;
```

## 10. CI/CD集成

```yaml
# .github/workflows/performance-test.yml
name: 性能测试
on:
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨2点运行
  workflow_dispatch:

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: 运行压力测试
        run: |
          npm run test:stress
      - name: 上传测试报告
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: tests/reports/performance/
```
