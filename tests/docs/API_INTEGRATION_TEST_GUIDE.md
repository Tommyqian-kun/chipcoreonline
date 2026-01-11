# API集成测试指南

## 1. 概述

API集成测试用于验证后端API端点的完整功能，包括请求处理、业务逻辑、数据库操作、返回格式等。与单元测试不同，API集成测试会启动真实的HTTP服务器和数据库，进行端到端的API调用测试。

## 2. 环境设置

### 2.1 前置要求

```bash
# 安装测试依赖
npm install --save-dev supertest
npm install --save-dev vitest
npm install --save-dev @types/supertest
```

### 2.2 测试数据库配置

使用独立的测试数据库，避免污染开发/生产数据：

```bash
# app/backend/.env.test
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/logiccore_test"
REDIS_URL="redis://localhost:6380"
PORT=8080
DEPLOYMENT_MODE="ecs_only"
```

### 2.3 启动测试环境

```bash
# 启动测试数据库和Redis
npm run test:env:up

# 等待服务就绪
docker-compose -f app/docker-compose.test.yml ps

# 初始化测试数据库
cd app
npm run db:push  # 使用DATABASE_URL指向测试数据库
npm run db:seed  # 初始化测试数据
```

### 2.4 测试服务器配置

创建测试专用的Express服务器实例：

```typescript
// tests/integration/setup/test-server.ts
import express from 'express';
import { prisma } from '@/lib/prisma';
import authRoutes from '@/routes/auth.routes';
import taskRoutes from '@/routes/task.routes';
import sdcThrpagesRoutes from '@/routes/sdc_thrpages.routes';

export async function createTestServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 注册路由
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/sdc-thrpages', sdcThrpagesRoutes);

  // 错误处理
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  });

  return app;
}
```

### 2.5 数据库清理工具

每个测试套件前后清理数据库：

```typescript
// tests/integration/setup/database.ts
import { prisma } from '@/lib/prisma';

export async function cleanDatabase() {
  // 按依赖顺序删除表
  await prisma.task.deleteMany({});
  await prisma.field.deleteMany({});
  await prisma.sheet.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.user.deleteMany({});
}

export async function seedTestData() {
  // 创建测试用户
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      passwordHash: '$2b$10$testhash',
      username: 'testuser',
    },
  });

  return { user };
}
```

### 2.6 运行API集成测试

```bash
# 运行所有API集成测试
npm run test:integration

# 运行特定测试套件
npm run test:integration -- tests/integration/auth/auth.test.ts

# 运行SDC工具API测试
npm run test:integration -- tests/integration/sdc-thrpages/

# 详细模式
npx vitest run --reporter=verbose tests/integration/
```

## 3. 认证API测试

**文件位置**: `tests/integration/auth/auth.test.ts`

### 3.1 测试项列表

1. **用户注册测试**
   - POST /api/v1/auth/register
   - 测试成功注册新用户
   - 测试邮箱已存在时返回错误
   - 测试邮箱格式验证
   - 测试密码强度验证
   - 测试返回JWT token

2. **用户登录测试**
   - POST /api/v1/auth/login
   - 测试正确凭据能登录
   - 测试错误密码返回401
   - 测试不存在的邮箱返回401
   - 测试返回JWT token和用户信息

3. **Token刷新测试**
   - POST /api/v1/auth/refresh
   - 测试能刷新有效token
   - 测试过期token无法刷新
   - 测试返回新的token

4. **获取当前用户测试**
   - GET /api/v1/auth/me
   - 测试有效token能获取用户信息
   - 测试无效token返回401
   - 测试返回的用户信息完整

### 3.2 测试数据准备

```typescript
// 测试用户数据
const testUsers = {
  valid: {
    email: 'test_auth@example.com',
    password: 'Test123456!',
    username: 'testauth',
  },
  existing: {
    email: 'existing@example.com',
    password: 'Test123456!',
  },
};
```

### 3.3 测试流程示例

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer } from '../setup/test-server';
import { cleanDatabase, seedTestData } from '../setup/database';

describe('POST /api/v1/auth/register - 用户注册', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestServer();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  it('应该成功注册新用户', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'newuser@example.com',
        password: 'Password123!',
        username: 'newuser',
      });

    // 验证HTTP状态码
    expect(response.status).toBe(201);

    // 验证响应结构
    expect(response.body).toMatchObject({
      success: true,
      message: expect.any(String),
      token: expect.any(String),
      user: {
        id: expect.any(String),
        email: 'newuser@example.com',
        username: 'newuser',
      },
    });

    // 验证token格式（JWT）
    expect(response.body.token.split('.')).toHaveLength(3);

    // 验证数据库中存在该用户
    const user = await prisma.user.findUnique({
      where: { email: 'newuser@example.com' },
    });
    expect(user).toBeDefined();
    expect(user?.passwordHash).not.toBe('Password123!'); // 密码已被hash
  });

  it('应该拒绝重复的邮箱', async () => {
    // 第一次注册
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        username: 'user1',
      });

    // 第二次注册相同邮箱
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        username: 'user2',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('邮箱已被注册');
  });

  it('应该验证邮箱格式', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email',
        password: 'Password123!',
        username: 'test',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('邮箱格式');
  });

  it('应该验证密码强度', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'weak', // 弱密码
        username: 'test',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('密码');
  });
});

describe('POST /api/v1/auth/login - 用户登录', () => {
  let testUser: any;

  beforeAll(async () => {
    await cleanDatabase();
    testUser = await seedTestData();
  });

  it('应该成功登录', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'Test123456!', // 假设测试用户密码
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe(testUser.email);
  });

  it('错误密码应该返回401', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword123!',
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});

describe('GET /api/v1/auth/me - 获取当前用户', () => {
  let authToken: string;

  beforeAll(async () => {
    // 登录获取token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123456!',
      });
    authToken = loginResponse.body.token;
  });

  it('应该返回当前用户信息', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.passwordHash).toBeUndefined(); // 不返回敏感信息
  });

  it('无效token应该返回401', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  it('缺少token应该返回401', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me');

    expect(response.status).toBe(401);
  });
});
```

### 3.4 结果判断标准

- ✅ HTTP状态码符合REST规范
- ✅ 响应包含success字段
- ✅ 成功时返回正确的数据
- ✅ 失败时返回清晰的错误信息
- ✅ JWT token格式正确
- ✅ 数据库状态正确更新
- ✅ 敏感信息（密码）不返回

## 4. 任务管理API测试

**文件位置**: `tests/integration/tasks/tasks.test.ts`

### 4.1 测试项列表

1. **创建任务测试**
   - POST /api/v1/tasks
   - 测试能创建SDC任务
   - 测试能创建UPF任务
   - 测试验证必需参数
   - 测试文件上传限制

2. **查询任务测试**
   - GET /api/v1/tasks/:id
   - 测试能查询自己的任务
   - 测试不能查询他人的任务
   - 测试不存在的任务返回404

3. **列表任务测试**
   - GET /api/v1/tasks
   - 测试能分页查询
   - 测试能按状态筛选
   - 测试能按工具类型筛选
   - 测试能按时间排序

4. **删除任务测试**
   - DELETE /api/v1/tasks/:id
   - 测试能删除DRAFT任务
   - 测试不能删除RUNNING任务
   - 测试删除后关联文件也被删除

5. **任务状态更新测试**
   - PATCH /api/v1/tasks/:id/status
   - 测试状态转换规则
   - 测试状态更新触发后续操作

### 4.2 测试流程示例

```typescript
describe('POST /api/v1/tasks - 创建任务', () => {
  let authToken: string;

  beforeAll(async () => {
    // 登录
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Test123456!' });
    authToken = loginResponse.body.token;
  });

  it('应该成功创建SDC任务', async () => {
    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        toolId: 'sdc-gen',
        modName: 'test_module',
        isFlat: false,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.task).toMatchObject({
      id: expect.any(String),
      status: 'DRAFT',
      toolId: 'sdc-gen',
      userId: expect.any(String),
    });

    // 验证数据库
    const task = await prisma.task.findUnique({
      where: { id: response.body.task.id },
    });
    expect(task).toBeDefined();
  });

  it('应该验证必需参数', async () => {
    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        toolId: 'sdc-gen',
        // 缺少modName
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
```

## 5. SDC工具API测试

**文件位置**: `tests/integration/sdc-thrpages/sdc-api.test.ts`

### 5.1 测试项列表

1. **初始化任务测试**
   - POST /api/v1/sdc-thrpages/initialize
   - 测试成功初始化SDC任务
   - 测试文件上传功能
   - 测试文件大小限制（5MB）
   - 测试文件类型验证
   - 测试参数验证（modName、isFlat）

2. **获取Sheet列表测试**
   - GET /api/v1/sdc-thrpages/:taskId/sheets
   - 测试返回所有Sheet定义
   - 测试Sheet结构正确
   - 测试不存在的任务返回404

3. **获取Sheet表格测试**
   - GET /api/v1/sdc-thrpages/sheets/:sheetId/tables?taskId=xxx
   - 测试返回Sheet中的所有表格
   - 测试表格包含columnsSchema
   - 测试不存在的Sheet返回404

4. **获取表格数据测试**
   - GET /api/v1/sdc-thrpages/tables/:tableId/data?taskId=xxx
   - 测试返回表格数据行
   - 测试返回列定义
   - 测试支持分页

5. **保存数据测试**
   - POST /api/v1/sdc-thrpages/data-sav
   - 测试能保存表格数据
   - 测试能保存多个Sheet数据
   - 测试数据验证
   - 测试权限控制（只能保存自己的任务）

6. **数据检查测试**
   - POST /api/v1/sdc-thrpages/data-chk
   - 测试能执行数据检查
   - 测试返回检查结果
   - 测试检查失败时返回错误信息

7. **提交任务测试**
   - POST /api/v1/sdc-thrpages/:taskId/submit
   - 测试能提交任务
   - 测试提交后状态变为PENDING
   - 测试任务入队
   - 测试不能重复提交
   - 测试数据未检查时不能提交

### 5.2 测试数据准备

```bash
# SDC测试文件
test_data/upload_data/sdcgen/
├── hier.yaml       # 层次结构文件
├── vlog.v          # Verilog网表
└── dcont.xlsx      # 预填充数据文件
```

### 5.3 测试流程示例

```typescript
describe('SDC工具API完整流程', () => {
  let authToken: string;
  let taskId: string;

  beforeAll(async () => {
    // 登录
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Test123456!' });
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // 清理
    if (taskId) {
      await request(app)
        .delete(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);
    }
  });

  describe('1. 初始化任务', () => {
    it('应该成功初始化SDC任务', async () => {
      const hierYamlPath = path.join(process.cwd(), 'test_data/upload_data/sdcgen/hier.yaml');
      const vlogPath = path.join(process.cwd(), 'test_data/upload_data/sdcgen/vlog.v');

      const response = await request(app)
        .post('/api/v1/sdc-thrpages/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        .field('isFlat', 'false')
        .attach('hierYamlFile', hierYamlPath)
        .attach('vlogFile', vlogPath);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBeDefined();

      taskId = response.body.taskId;
    });

    it('应该验证必需文件', async () => {
      const response = await request(app)
        .post('/api/v1/sdc-thrpages/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        .attach('hierYamlFile', path.join(process.cwd(), 'test_data/upload_data/sdcgen/hier.yaml'));
        // 缺少vlogFile

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('vlogFile');
    });
  });

  describe('2. 获取Sheet列表', () => {
    it('应该返回所有Sheet', async () => {
      const response = await request(app)
        .get(`/api/v1/sdc-thrpages/${taskId}/sheets`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.sheets)).toBe(true);

      // SDC工具应该有4个Sheet
      expect(response.body.sheets.length).toBe(4);

      // 验证Sheet名称
      const sheetNames = response.body.sheets.map(s => s.sheetName);
      expect(sheetNames).toContain('VarDef');
      expect(sheetNames).toContain('ClkDef');
      expect(sheetNames).toContain('IODly');
      expect(sheetNames).toContain('Exp');
    });
  });

  describe('3. 获取表格数据', () => {
    it('应该返回表格数据和列定义', async () => {
      const response = await request(app)
        .get(`/api/v1/sdc-thrpages/tables/TMVAR/data?taskId=${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tableId).toBe('TMVAR');
      expect(Array.isArray(response.body.rows)).toBe(true);
      expect(Array.isArray(response.body.columnsSchema)).toBe(true);
    });
  });

  describe('4. 保存数据', () => {
    it('应该成功保存表格数据', async () => {
      const dirtySheetData = [
        {
          sheetName: 'ClkDef',
          sheetId: 'ClkDef',
          tables: [
            {
              tableId: 'TMCLK',
              tableName: 'TMCLK',
              data: [
                {
                  ClkPin: 'clk',
                  ClkName: 'sys_clk',
                  ClkPeriod: '10',
                },
              ],
            },
          ],
        },
      ];

      const response = await request(app)
        .post('/api/v1/sdc-thrpages/data-sav')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
          dirtySheetData: dirtySheetData,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('5. 数据检查', () => {
    it('应该执行数据检查', async () => {
      const response = await request(app)
        .post('/api/v1/sdc-thrpages/data-chk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskId: taskId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeDefined();

      // 如果检查失败，应该有错误信息
      if (!response.body.success) {
        expect(response.body.errors).toBeDefined();
        expect(Array.isArray(response.body.errors)).toBe(true);
      }
    });
  });

  describe('6. 提交任务', () => {
    it('应该成功提交任务', async () => {
      const response = await request(app)
        .post(`/api/v1/sdc-thrpages/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toMatch(/PENDING|QUEUED/);

      // 验证任务在Redis队列中
      const queueLength = await redis.llen('task_queue');
      expect(queueLength).toBeGreaterThan(0);
    });
  });
});
```

### 5.4 结果判断标准

- ✅ API端点响应正确的HTTP状态码
- ✅ 响应数据结构符合预期
- ✅ 文件上传正确处理
- ✅ 数据验证生效
- ✅ 权限控制正确
- ✅ 数据库状态正确更新
- ✅ Redis队列操作正确

## 6. UPF工具API测试

**文件位置**: `tests/integration/upf-thrpages/upf-api.test.ts`

UPF工具的API结构与SDC类似，测试方法也类似。

### 6.1 测试项列表

1. **初始化任务测试**
   - POST /api/v1/upf-thrpages/initialize
   - 测试需要4个文件：hier.yaml、pvlog.v、pobj.tcl、pcell.yaml

2. **获取Sheet列表测试**
   - GET /api/v1/upf-thrpages/:taskId/sheets
   - UPF有4个Sheet：VarDef、PDomain、PStrategy、PMode

3. **保存、检查、提交测试**
   - 与SDC类似，只是端点路径为 `/api/v1/upf-thrpages/...`

### 6.2 测试数据准备

```bash
# UPF测试文件
test_data/upload_data/upfgen/
├── hier.yaml       # 层次结构文件
├── pvlog.v         # 电源网表
├── pobj.tcl        # 电源对象脚本
└── pcell.yaml      # 电源单元配置
```

## 7. 错误场景测试

### 7.1 认证错误测试

```typescript
describe('认证错误场景', () => {
  it('未认证访问应该返回401', async () => {
    const response = await request(app)
      .get('/api/v1/tasks');

    expect(response.status).toBe(401);
  });

  it('无效token应该返回401', async () => {
    const response = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  it('过期token应该返回401', async () => {
    const expiredToken = generateExpiredToken();
    const response = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });
});
```

### 7.2 权限错误测试

```typescript
describe('权限错误场景', () => {
  it('不能访问其他用户的任务', async () => {
    const user1Token = await login('user1@example.com');
    const user2Token = await login('user2@example.com');

    // user1创建任务
    const createResponse = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ toolId: 'sdc-gen', modName: 'test' });
    const taskId = createResponse.body.task.id;

    // user2尝试访问user1的任务
    const response = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(response.status).toBe(403);
  });
});
```

### 7.3 参数验证错误测试

```typescript
describe('参数验证错误场景', () => {
  it('缺少必需参数应该返回400', async () => {
    const response = await request(app)
      .post('/api/v1/sdc-thrpages/initialize')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ modName: 'test' }); // 缺少文件

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('无效的参数格式应该返回400', async () => {
    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        toolId: 'invalid-tool-id',
        modName: 'test',
      });

    expect(response.status).toBe(400);
  });
});
```

### 7.4 资源不存在测试

```typescript
describe('资源不存在场景', () => {
  it('查询不存在的任务应该返回404', async () => {
    const response = await request(app)
      .get('/api/v1/tasks/non-existent-task-id')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('不存在');
  });
});
```

### 7.5 并发冲突测试

```typescript
describe('并发冲突场景', () => {
  it('重复提交任务应该返回400', async () => {
    // 第一次提交
    await request(app)
      .post(`/api/v1/sdc-thrpages/${taskId}/submit`)
      .set('Authorization', `Bearer ${authToken}`);

    // 第二次提交
    const response = await request(app)
      .post(`/api/v1/sdc-thrpages/${taskId}/submit`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('已提交');
  });
});
```

## 8. 性能测试

### 8.1 响应时间测试

```typescript
describe('API响应时间', () => {
  it('登录API应该在1秒内响应', async () => {
    const start = Date.now();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Test123456!' });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  it('获取任务列表应该在500ms内响应', async () => {
    const start = Date.now();

    await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

### 8.2 并发请求测试

```typescript
describe('API并发处理', () => {
  it('应该能处理10个并发登录请求', async () => {
    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'Test123456!' })
    );

    const responses = await Promise.all(requests);

    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });
});
```

## 9. 测试覆盖率目标

| API模块 | 测试覆盖率 | 说明 |
|---------|-----------|------|
| 认证API | 90% | 安全相关，需要高覆盖 |
| 任务管理API | 85% | 核心业务逻辑 |
| SDC工具API | 85% | 复杂业务流程 |
| UPF工具API | 85% | 复杂业务流程 |
| 文件上传API | 80% | 边缘情况较多 |
| 错误处理 | 90% | 各种异常情况 |

## 10. 额外要求

### 10.1 测试隔离

- 每个测试套件前后清理数据库
- 使用事务回滚避免数据污染
- 每个测试独立，不依赖执行顺序

### 10.2 测试数据管理

- 使用固定格式的测试数据
- 测试数据不包含敏感信息
- 提供测试数据生成脚本

### 10.3 CI/CD集成

```yaml
# .github/workflows/api-integration-test.yml
name: API集成测试
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:11-alpine
        env:
          POSTGRES_DB: logiccore_test
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:5-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
```

### 10.4 测试报告

集成测试完成后生成报告：

```bash
# 生成HTML报告
npx vitest run --reporter=html --output=tests/reports/integration

# 生成JSON报告
npx vitest run --reporter=json --output=tests/reports/integration.json
```

## 11. 常见问题

### Q1: 如何处理文件上传测试？

使用supertest的attach方法：

```typescript
await request(app)
  .post('/api/v1/sdc-thrpages/initialize')
  .attach('hierYamlFile', pathToFile)
  .attach('vlogFile', pathToFile);
```

### Q2: 如何测试需要认证的API？

在beforeAll中登录获取token，然后设置Authorization头：

```typescript
const authToken = await login('test@example.com', 'password');
await request(app)
  .get('/api/v1/tasks')
  .set('Authorization', `Bearer ${authToken}`);
```

### Q3: 如何清理测试数据？

使用Prisma的deleteMany：

```typescript
afterAll(async () => {
  await prisma.task.deleteMany({});
  await prisma.user.deleteMany({});
});
```
