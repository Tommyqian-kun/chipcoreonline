# LogicCore 自动化测试指南

## 测试目录结构

```
tests/
├── e2e/                          # 端到端测试
│   ├── fixtures/                 # 测试数据文件
│   │   ├── sdc/                  # SDC工具测试数据
│   │   └── upf/                  # UPF工具测试数据
│   ├── helpers/                  # 测试辅助函数
│   │   ├── api.ts                # API请求辅助
│   │   ├── browser.ts            # 浏览器操作辅助
│   │   └── data.ts               # 数据处理辅助
│   ├── auth.spec.ts              # 认证测试
│   ├── sdc-tool.spec.ts          # SDC工具E2E测试
│   └── upf-tool.spec.ts          # UPF工具E2E测试
│
├── integration/                  # API集成测试
│   ├── auth/                     # 认证API测试
│   ├── tasks/                    # 任务管理API测试
│   ├── sdc-thrpages/             # SDC多页面API测试
│   └── upf-thrpages/             # UPF多页面API测试
│
├── unit/                         # 单元测试
│   ├── frontend/                 # 前端组件单元测试
│   └── backend/                  # 后端服务单元测试
│
├── performance/                  # 性能测试
│   └── concurrent-tasks/         # 并发测试脚本
│
├── setup/                        # 测试环境设置
│   └── test-env.ts               # 测试环境初始化
│
└── ecsonly_auto_test_stategy_method.md  # 测试策略文档
```

配置文件Git状态

  | 文件                          | 是否提交 | 原因                   |
  |-------------------------------|----------|------------------------|
  | vitest.config.ts              | ✅ 是    | 测试配置，需要提交     |
  | playwright.config.ts          | ✅ 是    | 测试配置，需要提交     |
  | app/docker-compose.test.yml   | ✅ 是    | 测试环境配置，需要提交 |
  | app/backend/.env.test.example | ✅ 是    | 模板文件，需要提交     |
  | app/backend/.env.test         | ❌ 否    | 包含敏感信息           |
  | tests/**/*.test.ts            | ✅ 是    | 测试代码，需要提交     |
  | tests/**/*.spec.ts            | ✅ 是    | 测试代码，需要提交     |
  | tests/e2e/screenshots/        | ❌ 否    | 临时文件               |
  | tests/e2e/test-results/       | ❌ 否    | 临时文件               |

  创建的新文件

  /home/tommy2025/work/LogicCore/
  ├── vitest.config.ts                      # Vitest配置
  ├── playwright.config.ts                  # Playwright配置（已添加Edge等）
  ├── app/
  │   ├── docker-compose.test.yml          # 测试Docker环境（已修正镜像版本）
  │   └── backend/
  │       ├── .env.test                    # 测试环境变量（已完善）
  │       └── .env.test.example           # 测试环境变量模板
  └── tests/
      ├── CONFIG_SUMMARY.md                # 配置修正总结文档
      └── README.md                        # 测试使用指南

  快速验证

  验证配置文件是否正确
  cat /home/tommy2025/work/LogicCore/playwright.config.ts

  验证环境变量是否完整
  cat /home/tommy2025/work/LogicCore/app/backend/.env.test


## 快速开始

### 1. 安装测试依赖

```bash
npm install
```

测试依赖包括：
- `vitest` - 单元测试框架
- `@playwright/test` - E2E测试框架
- `@testing-library/react` - React组件测试
- `supertest` - API测试工具

### 2. 安装浏览器（E2E测试需要）

```bash
npm run playwright:install
```

### 3. 启动测试环境

```bash
# 启动测试数据库和Redis
npm run test:env:up

# 初始化测试数据
npm run test:setup
```

### 4. 运行测试

```bash
# 运行单元测试
npm run test:unit

# 运行集成测试（API测试）
npm run test:integration

# 运行E2E测试（需要先启动应用）
npm run test:e2e

# 运行所有测试
npm run test:all

# 生成测试覆盖率报告
npm run test:coverage
```

## 测试命令详解

### 单元测试

```bash
# 运行单元测试（一次性）
npm run test:unit

# 监听模式运行单元测试
npm run test:unit:watch
```

### E2E测试

```bash
# 无头模式运行E2E测试
npm run test:e2e

# UI模式运行（可查看测试执行过程）
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug

# 有头模式（可以看到浏览器）
npm run test:e2e:headed
```

### 测试环境管理

```bash
# 启动测试环境（PostgreSQL + Redis）
npm run test:env:up

# 停止测试环境
npm run test:env:down

# 查看测试环境日志
npm run test:env:logs
```

## E2E测试运行要求

**重要**：E2E测试需要应用服务运行在测试模式。

### 启动完整测试环境

```bash
# 终端1：启动测试数据库
npm run test:env:up

# 终端2：启动应用（测试模式）
cd app
DEPLOYMENT_MODE=ecs_only PORT=8081 npm run dev:backend
DEPLOYMENT_MODE=ecs_only PORT=3001 npm run dev:frontend

# 终端3：运行E2E测试
npm run test:e2e
```

### 环境变量配置

测试环境使用以下配置：
- 数据库：`postgresql://test:test@localhost:5433/logiccore_test`
- Redis：`redis://localhost:6380`
- 后端API：`http://localhost:8081`
- 前端：`http://localhost:3001`

## 测试数据说明

### SDC工具测试数据

- **源数据**：`test_data/upload_data/sdcgen/`
  - `hier.yaml` - 层次结构文件
  - `vlog.v` - Verilog网表文件
  - `dcont.xlsx` - Excel模板（可作为minimal数据）

### UPF工具测试数据

- **源数据**：`test_data/upload_data/upfgen/`
  - `hier.yaml` - 层次结构文件
  - `pvlog.v` - 功耗Verilog文件
  - `pobj.tcl` - TCL对象文件
  - `pcell.yaml` - 功耗单元文件
  - `pcont.xlsx` - Excel模板（可作为minimal数据）

## 测试编写指南

### 编写E2E测试

1. 在 `tests/e2e/` 目录下创建 `*.spec.ts` 文件
2. 使用Playwright API编写测试
3. 使用 `tests/e2e/helpers/` 中的辅助函数

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/browser';

test.describe('我的测试', () => {
  test('测试示例', async ({ page }) => {
    await login(page);
    // ... 测试逻辑
  });
});
```

### 编写API集成测试

1. 在 `tests/integration/` 目录下创建测试文件
2. 使用Vitest和Supertest编写测试

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('API测试', () => {
  it('应该返回成功', async () => {
    const response = await request('http://localhost:8081')
      .get('/api/v1/endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
```

### 编写单元测试

1. 在 `tests/unit/` 目录下创建测试文件
2. 使用Vitest编写测试

```typescript
import { describe, it, expect } from 'vitest';

describe('函数测试', () => {
  it('应该正确计算', () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

## 故障排查

### 问题1：E2E测试超时

**原因**：应用服务未启动或端口配置错误

**解决**：
```bash
# 检查服务是否运行
curl http://localhost:8081/health

# 检查端口占用
lsof -i :8081
lsof -i :3001
```

### 问题2：测试数据库连接失败

**原因**：测试数据库未启动

**解决**：
```bash
# 启动测试数据库
npm run test:env:up

# 检查数据库状态
docker ps | grep test
```

### 问题3：Playwright浏览器未安装

**原因**：浏览器未下载

**解决**：
```bash
npm run playwright:install
```

### 问题4：测试用户不存在

**原因**：测试环境未初始化

**解决**：
```bash
npm run test:setup
```

## 测试覆盖率

生成测试覆盖率报告：

```bash
npm run test:coverage
```

报告生成在 `coverage/` 目录，打开 `coverage/index.html` 查看详细报告。

## CI/CD集成

测试可以在CI/CD流程中自动运行：

```yaml
# .github/workflows/test.yml 示例
- name: Run tests
  run: |
    npm run test:env:up
    npm run test:setup
    npm run test:all
    npm run test:env:down
```

## 注意事项

1. **测试隔离**：每个测试应该独立运行，不依赖其他测试
2. **清理数据**：测试完成后应该清理创建的数据
3. **测试超时**：SDC/UPF工具执行需要较长时间，设置合适的超时时间
4. **并发控制**：E2E测试设置为串行运行（workers: 1）
5. **测试环境**：使用独立的测试数据库，避免污染开发数据

## 更多信息

- 测试策略文档：`tests/ecsonly_auto_test_stategy_method.md`
- Playwright文档：https://playwright.dev/
- Vitest文档：https://vitest.dev/
