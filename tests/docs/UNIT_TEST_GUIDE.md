# 单元测试指南

## 1. 概述

单元测试是对软件中最小可测试单元（函数、方法、类）进行验证的测试。在LogicCore项目中，单元测试主要用于测试后端服务和前端组件的核心逻辑。

## 2. 环境设置

### 2.1 前置要求

```bash
# 确保安装了必要的依赖
npm install --save-dev vitest @vitest/ui
npm install --save-dev @testing-library/react @testing-library/jest-dom
npm install --save-dev @testing-library/user-event
npm install --save-dev jsdom
npm install --save-dev @types/node
```

### 2.2 配置文件

项目根目录已配置 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/test-env.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'dist/',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
```

### 2.3 测试环境初始化

`tests/setup/test-env.ts` 提供测试环境初始化：

```typescript
import { beforeAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// 每个测试后清理
afterEach(() => {
  cleanup();
});
```

### 2.4 运行单元测试

```bash
# 运行所有单元测试
npm run test:unit

# 监听模式运行（开发时使用）
npm run test:unit:watch

# 生成覆盖率报告
npm run test:coverage

# 运行特定测试文件
npx vitest tests/unit/backend/services/excel-thrpages.service.test.ts
```

## 3. 后端服务单元测试

### 3.1 ExcelThrpagesService 测试

**文件位置**: `tests/unit/backend/services/excel-thrpages.service.test.ts`

#### 测试项列表

1. **Excel文件解析测试**
   - 测试能正确读取Excel文件
   - 测试能识别所有Sheet
   - 测试能提取表头信息
   - 测试能提取数据行

2. **数据库同步测试**
   - 测试能创建Sheet记录
   - 测试能创建Field记录
   - 测试能更新已存在的记录
   - 测试能处理不存在的Sheet

3. **YAML配置解析测试**
   - 测试能解析hier.yaml文件
   - 测试能识别模块层次结构
   - 测试能提取信号/变量信息

4. **错误处理测试**
   - 测试文件不存在的情况
   - 测试文件格式错误的情况
   - 测试数据库操作失败的情况

#### 测试数据准备

```bash
# 测试Excel文件
tests/unit/fixtures/test_data.xlsx
tests/unit/fixtures/test_hier.yaml
tests/unit/fixtures/test_vlog.v
```

#### 测试流程示例

```typescript
describe('ExcelThrpagesService - Excel解析', () => {
  it('应该正确解析Excel文件并提取所有Sheet', async () => {
    // 1. 准备测试数据
    const excelPath = path.join(__dirname, 'fixtures', 'test_data.xlsx');

    // 2. 执行被测试函数
    const result = await excelThrpagesService.parseExcel(excelPath);

    // 3. 验证结果
    expect(result.sheets).toBeDefined();
    expect(result.sheets.length).toBeGreaterThan(0);
    expect(result.sheets[0].sheetName).toBeTruthy();
  });

  it('应该处理文件不存在的情况', async () => {
    const invalidPath = '/nonexistent/file.xlsx';

    await expect(
      excelThrpagesService.parseExcel(invalidPath)
    ).rejects.toThrow('文件不存在');
  });
});
```

#### 结果判断标准

- ✅ 所有断言通过
- ✅ 无未捕获的异常
- ✅ 测试覆盖率达标（每个函数至少80%）
- ✅ Mock的函数调用次数正确

### 3.2 TaskService 测试

**文件位置**: `tests/unit/backend/services/task.service.test.ts`

#### 测试项列表

1. **任务创建测试**
   - 测试能创建任务记录
   - 测试能生成唯一TaskID
   - 测试能设置初始状态为DRAFT
   - 测试能关联用户和工具

2. **任务状态更新测试**
   - 测试DRAFT → PENDING转换
   - 测试PENDING → QUEUED转换
   - 测试QUEUED → RUNNING转换
   - 测试RUNNING → COMPLETED转换
   - 测试RUNNING → FAILED转换
   - 测试无效状态转换被拒绝

3. **任务查询测试**
   - 测试能根据ID查询任务
   - 测试能查询用户的所有任务
   - 测试能按状态筛选任务
   - 测试能按时间范围筛选

4. **任务删除测试**
   - 测试能删除DRAFT状态任务
   - 测试不能删除RUNNING状态任务
   - 测试删除后关联文件也被清理

#### 测试数据准备

需要Mock数据库操作：

```typescript
const mockPrisma = {
  task: {
    create: vi.fn().mockResolvedValue({ id: 'task-1', status: 'DRAFT' }),
    update: vi.fn().mockResolvedValue({ id: 'task-1', status: 'PENDING' }),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
};
```

#### 测试流程示例

```typescript
describe('TaskService - 状态转换', () => {
  it('应该允许 DRAFT -> PENDING 的状态转换', async () => {
    const task = { id: 'task-1', status: 'DRAFT' };
    mockPrisma.task.findUnique.mockResolvedValue(task);
    mockPrisma.task.update.mockResolvedValue({ ...task, status: 'PENDING' });

    const result = await taskService.updateStatus('task-1', 'PENDING');

    expect(result.status).toBe('PENDING');
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'PENDING' },
    });
  });

  it('应该拒绝 DRAFT -> RUNNING 的状态转换', async () => {
    await expect(
      taskService.updateStatus('task-1', 'RUNNING')
    ).rejects.toThrow('无效的状态转换');
  });
});
```

#### 结果判断标准

- ✅ 状态转换符合业务规则
- ✅ 数据库操作调用正确
- ✅ 错误情况处理得当
- ✅ 事务完整性得到保证

### 3.3 AuthService 测试

**文件位置**: `tests/unit/backend/services/auth.service.test.ts`

#### 测试项列表

1. **用户注册测试**
   - 测试能创建新用户
   - 测试密码被正确hash
   - 测试邮箱不能重复
   - 测试邮箱格式验证

2. **用户登录测试**
   - 测试正确邮箱和密码能登录
   - 测试错误密码登录失败
   - 测试不存在的邮箱登录失败
   - 测试能生成JWT token

3. **Token验证测试**
   - 测试有效token能通过验证
   - 测试过期token被拒绝
   - 测试伪造token被拒绝
   - 测试能从token提取用户信息

4. **权限检查测试**
   - 测试能验证用户权限
   - 测试无权限访问被拒绝
   - 测试管理员权限正确

#### 测试流程示例

```typescript
describe('AuthService - 用户认证', () => {
  it('应该正确验证用户凭据并生成token', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: '$2b$10$hash',
    };

    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const result = await authService.login('test@example.com', 'password123');

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('test@example.com');
  });
});
```

#### 结果判断标准

- ✅ 密码使用bcrypt hash
- ✅ JWT token签名正确
- ✅ Token过期时间合理
- ✅ 权限检查严格

### 3.4 TaskCleanupService 测试

**文件位置**: `tests/unit/backend/services/task-cleanup.service.test.ts`

#### 测试项列表

1. **文件清理测试**
   - 测试能删除临时文件
   - 测试能删除任务输出文件
   - 测试能删除上传的原始文件
   - 测试不存在的文件不报错

2. **任务记录清理测试**
   - 测试能删除旧任务记录
   - 测试能保留最近N天的任务
   - 测试能按状态清理（只清理COMPLETED）

3. **定时任务测试**
   - 测试定时器正确启动
   - 测试清理间隔正确
   - 测试清理逻辑不阻塞

#### 测试流程示例

```typescript
describe('TaskCleanupService - 文件清理', () => {
  it('应该删除任务关联的所有文件', async () => {
    const task = {
      id: 'task-1',
      uploadFilePath: '/path/to/upload.xlsx',
      outputFilePath: '/path/to/output.zip',
    };

    const fsUnlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    await cleanupService.cleanupTaskFiles(task);

    expect(fsUnlinkSpy).toHaveBeenCalledTimes(2);
    expect(fsUnlinkSpy).toHaveBeenCalledWith(task.uploadFilePath);
    expect(fsUnlinkSpy).toHaveBeenCalledWith(task.outputFilePath);
  });
});
```

### 3.5 Redis队列服务测试

**文件位置**: `tests/unit/backend/services/redis-queue.service.test.ts`

#### 测试项列表

1. **任务入队测试**
   - 测试能将任务加入队列
   - 测试队列上限48个
   - 测试超出上限时拒绝入队
   - 测试入队时设置优先级

2. **任务出队测试**
   - 测试能从队列取出任务
   - 测试空队列返回null
   - 测试出队是FIFO顺序

3. **活跃任务管理测试**
   - 测试能添加活跃任务
   - 测试能移除活跃任务
   - 测试能查询活跃任务数量

4. **分布式锁测试**
   - 测试能获取任务锁
   - 测试能释放任务锁
   - 测试锁过期自动释放

#### Mock Redis客户端

```typescript
const mockRedis = {
  lpush: vi.fn(),
  rpop: vi.fn(),
  llen: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  scard: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
};
```

#### 测试流程示例

```typescript
describe('RedisQueueService - 队列管理', () => {
  it('应该成功将任务加入队列', async () => {
    mockRedis.llen.mockResolvedValue(10); // 当前队列长度
    mockRedis.lpush.mockResolvedValue(11);

    const result = await queueService.enqueue('task-1');

    expect(result.success).toBe(true);
    expect(mockRedis.lpush).toHaveBeenCalledWith('task_queue', 'task-1');
  });

  it('队列满时应该拒绝入队', async () => {
    mockRedis.llen.mockResolvedValue(48); // 已达上限

    const result = await queueService.enqueue('task-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('队列已满');
  });
});
```

#### 结果判断标准

- ✅ 队列操作符合Redis数据结构语义
- ✅ 并发安全（使用分布式锁）
- ✅ 错误处理完善
- ✅ 性能满足要求

## 4. 前端组件单元测试

### 4.1 React组件测试基础

#### 测试项列表

1. **组件渲染测试**
   - 测试组件能正常渲染
   - 测试 props 正确传递
   - 测试条件渲染正确
   - 测试列表渲染正确

2. **用户交互测试**
   - 测试按钮点击响应
   - 测试表单输入处理
   - 测试表单验证逻辑
   - 测试导航跳转

3. **状态管理测试**
   - 测试useState更新
   - 测试useEffect副作用
   - 测试自定义Hook
   - 测试Context传递

4. **表单组件测试**
   - 测试React Hook Form集成
   - 测试表单验证规则
   - 测试表单提交
   - 测试错误提示显示

### 4.2 测试示例：SDC初始化表单

**文件位置**: `tests/unit/frontend/components/SdcGeneratorInitialize.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SdcGeneratorInitialize } from '@/pages/tools/SdcGenerator/SdcGeneratorInitialize_thrpages';

describe('SdcGeneratorInitialize - 初始化表单', () => {
  it('应该渲染表单字段', () => {
    render(<SdcGeneratorInitialize />);

    expect(screen.getByLabelText(/模块名称/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/层次结构文件/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verilog文件/i)).toBeInTheDocument();
  });

  it('应该验证必填字段', async () => {
    const user = userEvent.setup();
    render(<SdcGeneratorInitialize />);

    // 不填写任何字段，直接提交
    const submitButton = screen.getByRole('button', { name: /创建任务/i });
    await user.click(submitButton);

    // 应该显示验证错误
    await waitFor(() => {
      expect(screen.getByText(/模块名称是必填项/i)).toBeInTheDocument();
    });
  });

  it('应该正确处理文件上传', async () => {
    const user = userEvent.setup();
    const mockFile = new File(['mock'], 'hier.yaml', { type: 'text/yaml' });

    render(<SdcGeneratorInitialize />);

    const fileInput = screen.getByLabelText(/层次结构文件/i);
    await user.upload(fileInput, mockFile);

    expect(fileInput.files[0]).toBe(mockFile);
    expect(screen.getByText(/hier.yaml/i)).toBeInTheDocument();
  });

  it('提交成功后应该调用回调', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<SdcGeneratorInitialize onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/模块名称/i), 'test_module');
    // 上传文件...

    await user.click(screen.getByRole('button', { name: /创建任务/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});
```

#### 结果判断标准

- ✅ 组件渲染符合设计
- ✅ 用户交互响应正确
- ✅ 表单验证规则生效
- ✅ 错误提示显示准确

### 4.3 自定义Hook测试

**文件位置**: `tests/unit/frontend/hooks/useTaskStatus.test.ts`

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTaskStatus } from '@/hooks/useTaskStatus';

describe('useTaskStatus - 任务状态Hook', () => {
  it('初始状态应该是IDLE', () => {
    const { result } = renderHook(() => useTaskStatus('task-1'));

    expect(result.current.status).toBe('IDLE');
  });

  it('应该轮询更新任务状态', async () => {
    const { result } = renderHook(() => useTaskStatus('task-1'));

    await waitFor(() => {
      expect(result.current.status).toBe('RUNNING');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('COMPLETED');
    }, { timeout: 5000 });
  });
});
```

## 5. 通用测试模式

### 5.1 Mock依赖

```typescript
// Mock数据库
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => mockPrisma),
}));

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedis),
}));

// Mock文件系统
vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  unlink: vi.fn(),
  readFile: vi.fn(),
}));

// Mock HTTP请求
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));
```

### 5.2 测试夹具（Fixtures）

```typescript
// tests/unit/fixtures/tasks.ts
export const createMockTask = (overrides = {}) => ({
  id: 'task-1',
  status: 'DRAFT',
  toolId: 'sdc-gen',
  userId: 'user-1',
  createdAt: new Date(),
  ...overrides,
});

// tests/unit/fixtures/users.ts
export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  ...overrides,
});
```

### 5.3 异步测试模式

```typescript
it('应该正确处理异步操作', async () => {
  // 使用 waitFor 等待异步状态更新
  await waitFor(() => {
    expect(element).toBeVisible();
  });

  // 或使用 async/await
  const result = await service.asyncMethod();
  expect(result).toBeDefined();
});
```

## 6. 测试覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|-----|-----------|------|
| ExcelThrpagesService | 80% | 核心业务逻辑，需要高覆盖 |
| TaskService | 75% | 状态转换逻辑需要完整测试 |
| AuthService | 80% | 安全相关，需要高覆盖 |
| TaskCleanupService | 70% | 边缘情况较多 |
| RedisQueueService | 75% | 队列操作需要完整测试 |
| 前端组件 | 70% | 主要是UI交互测试 |

## 7. 额外要求

### 7.1 性能要求

- 每个单元测试执行时间 < 100ms
- 全部单元测试执行时间 < 30秒
- 不应该访问外部资源（数据库、Redis、API）

### 7.2 隔离性要求

- 测试之间完全独立
- 不依赖测试执行顺序
- 每个测试后清理状态
- 使用独立的测试数据库

### 7.3 可维护性要求

- 测试代码清晰易懂
- 测试命名规范（描述性）
- 复杂逻辑添加注释
- 共享测试工具函数

### 7.4 CI/CD集成

```yaml
# .github/workflows/test.yml
name: 单元测试
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

## 8. 常见问题

### Q1: 如何测试数据库操作？

使用Mock避免真实数据库访问：

```typescript
const mockPrisma = {
  task: {
    create: vi.fn(),
    update: vi.fn(),
  },
};
```

### Q2: 如何测试异步代码？

使用 async/await 和 waitFor：

```typescript
it('异步测试', async () => {
  await waitFor(() => {
    expect(result).toBe(expected);
  });
});
```

### Q3: 如何测试文件上传？

使用 File 对象模拟：

```typescript
const file = new File(['content'], 'test.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
```
