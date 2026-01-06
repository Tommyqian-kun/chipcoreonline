# LogicCore 测试文档索引

本目录包含LogicCore项目的完整测试文档，涵盖单元测试、API集成测试、E2E测试、性能测试等各个方面。

## 文档目录

### 1. 测试策略总览
- **文件**: `../ecsonly_auto_test_stategy_method.md`
- **说明**: 项目整体测试策略，包括测试层级、测试方法、测试数据策略等

### 2. 单元测试指南
- **文件**: `UNIT_TEST_GUIDE.md`
- **内容**:
  - 后端服务单元测试（ExcelThrpagesService、TaskService、AuthService、RedisQueueService等）
  - 前端组件单元测试（React组件、自定义Hook等）
  - Mock和测试工具使用
  - 测试覆盖率目标

### 3. API集成测试指南
- **文件**: `API_INTEGRATION_TEST_GUIDE.md`
- **内容**:
  - 认证API测试（注册、登录、token刷新）
  - 任务管理API测试（创建、查询、删除）
  - SDC工具API测试（初始化、保存、检查、提交）
  - UPF工具API测试
  - 错误场景测试
  - 性能测试

### 4. Worker和Redis队列测试指南
- **文件**: `WORKER_REDIS_TEST_GUIDE.md`
- **内容**:
  - Redis队列操作测试（入队、出队、活跃任务管理）
  - 分布式锁测试
  - Worker任务处理测试
  - 任务状态同步测试
  - 并发测试

### 5. 容器执行和高并发测试指南
- **文件**: `CONTAINER_CONCURRENCY_TEST_GUIDE.md`
- **内容**:
  - Docker容器执行测试
  - 并发任务提交测试
  - 并发任务执行测试
  - 压力测试
  - 资源监控测试

### 6. E2E测试指南
- **文件**: `../e2e/README.md`（待创建）
- **内容**:
  - 端到端用户流程测试
  - 浏览器自动化测试
  - UI交互测试

## 测试类型说明

### 单元测试
- **位置**: `tests/unit/`
- **目的**: 测试代码中最小的可测试单元（函数、方法、类）
- **工具**: Vitest
- **特点**: 快速执行、Mock外部依赖、测试隔离

### API集成测试
- **位置**: `tests/integration/`
- **目的**: 测试API端点的完整功能
- **工具**: Supertest + Vitest
- **特点**: 需要测试数据库、测试HTTP服务器

### E2E测试
- **位置**: `tests/e2e/`
- **目的**: 测试完整的用户流程
- **工具**: Playwright
- **特点**: 真实浏览器、完整用户交互

### 性能测试
- **位置**: `tests/performance/`
- **目的**: 测试系统性能和并发能力
- **工具**: Autocannon、Locust
- **特点**: 压力测试、负载测试、性能监控

## 快速开始

### 运行所有测试
```bash
# 单元测试
npm run test:unit

# API集成测试
npm run test:integration

# E2E测试
npm run test:e2e

# 所有测试
npm run test:all
```

### 运行特定测试
```bash
# 单个测试文件
npx vitest tests/unit/backend/services/auth.service.test.ts

# 特定测试套件
npm run test:integration -- tests/integration/auth/

# 带覆盖率的测试
npm run test:coverage
```

## 测试环境准备

### 启动测试数据库
```bash
npm run test:env:up
```

### 初始化测试数据
```bash
cd app
npm run db:push  # 使用测试数据库
npm run db:seed
```

### 停止测试环境
```bash
npm run test:env:down
```

## 测试覆盖率目标

| 模块 | 目标覆盖率 | 当前状态 |
|-----|-----------|---------|
| 后端服务 | 80% | 进行中 |
| API端点 | 85% | 进行中 |
| 前端组件 | 70% | 待开始 |
| Worker | 75% | 待开始 |
| Redis队列 | 85% | 进行中 |

## 测试文件结构

```
tests/
├── docs/                          # 测试文档（本目录）
│   ├── README.md                  # 本文件
│   ├── UNIT_TEST_GUIDE.md         # 单元测试指南
│   ├── API_INTEGRATION_TEST_GUIDE.md
│   ├── WORKER_REDIS_TEST_GUIDE.md
│   └── CONTAINER_CONCURRENCY_TEST_GUIDE.md
├── unit/                          # 单元测试
│   ├── backend/
│   │   ├── services/              # 后端服务测试
│   │   │   ├── excel-thrpages.service.test.ts
│   │   │   ├── auth.service.test.ts
│   │   │   └── task.service.test.ts
│   │   └── redis/                 # Redis相关测试
│   │       └── redis-queue.service.test.ts
│   └── frontend/                  # 前端测试（待添加）
├── integration/                   # API集成测试
│   ├── auth/
│   ├── tasks/
│   ├── sdc-thrpages/
│   └── upf-thrpages/
├── e2e/                          # 端到端测试
│   ├── fixtures/
│   ├── helpers/
│   ├── auth.spec.ts
│   ├── sdc-tool.spec.ts
│   └── upf-tool.spec.ts
├── performance/                  # 性能测试
│   └── concurrent-tasks/
└── setup/                        # 测试配置和工具
    └── test-env.ts
```

## 参考资源

### 测试框架文档
- [Vitest文档](https://vitest.dev/)
- [Playwright文档](https://playwright.dev/)
- [Testing Library文档](https://testing-library.com/)

### 项目文档
- `CLAUDE.md` - 项目编码规范
- `app/README.md` - 项目概述
- `docs/ecsonly_multipage_dev_opus45_*.md` - 开发文档

## 常见问题

### Q: 如何调试测试？
A: 使用调试模式运行测试：
```bash
# Vitest调试
npx vitest --inspect-brk

# Playwright调试（带UI）
npm run test:e2e:ui
```

### Q: 如何Mock依赖？
A: 使用vitest的vi.mock():
```typescript
vi.mock('@/services/redis-pool.service', () => ({
  redisPool: {
    getClient: vi.fn(),
  },
}));
```

### Q: 如何处理异步测试？
A: 使用async/await和waitFor:
```typescript
it('异步测试', async () => {
  await waitFor(() => {
    expect(result).toBe(expected);
  });
});
```

## 贡献指南

添加新测试时，请遵循以下规范：

1. 测试文件命名：`*.test.ts`或`*.spec.ts`
2. 测试描述使用中文
3. 每个测试只验证一个功能点
4. 使用beforeEach/afterEach进行测试隔离
5. 确保测试可独立运行
6. 添加必要的注释说明测试意图
