# 测试配置修正总结

## 修正的问题

### 1. 浏览器配置问题
**问题**：为什么要安装Chromium？
**修正**：
- Playwright默认安装自己的Chromium是为了确保测试的**稳定性和一致性**
- 已添加对多种浏览器的支持：Chromium、Chrome、Edge、Firefox
- Edge浏览器已在Windows上安装，Playwright会自动通过WSL2访问它

**配置文件**：`playwright.config.ts`
```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  { name: 'edge', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], channel: 'firefox' } },
]
```

**运行特定浏览器测试**：
```bash
# 使用Chromium（默认）
npm run test:e2e

# 使用Chrome
npm run test:e2e -- --project=chrome

# 使用Edge
npm run test:e2e -- --project=edge

# 使用Firefox
npm run test:e2e -- --project=firefox
```

### 2. .env.test 配置不完整
**问题**：.env.test缺少很多重要环境变量
**修正**：
- 已根据`.env.local`更新`.env.test`，包含所有必需的配置
- 包括：数据库连接池配置、Redis连接池配置、Worker配置、任务队列配置等

**关键配置**：
- **端口**：使用与开发环境相同的端口（8080/3000）
- **数据库**：使用独立的测试数据库（端口5433）
- **Redis**：使用独立的测试Redis（端口6380）
- **目录**：使用独立的测试目录（`/temp/test`, `/logs/test`, `/jobs/test`）

### 3. docker-compose.test.yml 配置不一致
**问题**：镜像版本与生产环境不一致
**修正**：
- PostgreSQL: `postgres:14-alpine` → `postgres:11-alpine`（与生产一致）
- Redis: `redis:7-alpine` → `redis:5-alpine`（与生产一致）
- 添加了完整的资源配置、健康检查、网络配置

### 4. .gitignore 配置问题
**问题**：
- tests目录被完全忽略，测试代码无法提交
- .env.test需要被忽略（包含敏感信息）

**修正**：
- 保留tests目录结构，只忽略测试结果文件
- 明确忽略`.env.test`
- 保留`.env.test.example`模板文件

**新的忽略规则**：
```
# 测试代码会被提交
tests/

# 但忽略测试结果
tests/e2e/screenshots/
tests/e2e/test-results/
tests/e2e/playwright-report/
tests/e2e/.cache/
tests/performance/logs/

# 忽略敏感配置
.env.test
app/backend/.env.test

# 保留模板文件
!.env.test.example
!app/backend/.env.test.example
```

## 配置文件说明

### 需要提交到Git的文件
| 文件 | 说明 |
|------|------|
| `vitest.config.ts` | 单元测试框架配置 |
| `playwright.config.ts` | E2E测试框架配置 |
| `app/docker-compose.test.yml` | 测试Docker环境配置 |
| `app/backend/.env.test.example` | 测试环境变量模板 |

### 不会提交到Git的文件
| 文件 | 说明 | 原因 |
|------|------|------|
| `app/backend/.env.test` | 实际测试环境配置 | 包含敏感信息 |
| `tests/e2e/screenshots/` | 测试截图 | 临时文件 |
| `tests/e2e/test-results/` | 测试结果 | 临时文件 |
| `tests/e2e/playwright-report/` | 测试报告 | 临时文件 |

## 配置验证

### 1. 端口配置一致性
| 服务 | 开发环境 | 测试环境 | 说明 |
|------|---------|---------|------|
| 前端 | 3000 | 3000 | 相同端口 |
| 后端API | 8080 | 8080 | 相同端口 |
| PostgreSQL | 5432 | 5433 | 独立实例 |
| Redis | 6379 | 6380 | 独立实例 |

### 2. 数据库镜像版本
| 环境 | 镜像版本 |
|------|---------|
| 生产 | `postgres:11-alpine` |
| 测试 | `postgres:11-alpine` ✅ |

### 3. Redis镜像版本
| 环境 | 镜像版本 |
|------|---------|
| 生产 | `redis:5-alpine` |
| 测试 | `redis:5-alpine` ✅ |

## 使用说明

### 首次设置
```bash
# 1. 复制环境变量模板
cp app/backend/.env.test.example app/backend/.env.test

# 2. 编辑.env.test，填入实际值
vim app/backend/.env.test

# 3. 启动测试环境
npm run test:env:up

# 4. 初始化测试数据
npm run test:setup
```

### 运行测试
```bash
# 单元测试
npm run test:unit

# API集成测试
npm run test:integration

# E2E测试（使用默认浏览器Chromium）
npm run test:e2e

# 使用特定浏览器运行E2E测试
npm run test:e2e -- --project=chrome
npm run test:e2e -- --project=edge
npm run test:e2e -- --project=firefox

# 运行所有测试
npm run test:all
```

## 测试环境目录结构

```
测试数据目录：
/home/tommy2025/work/LogicCore/temp/test/
/home/tommy2025/work/LogicCore/logs/test/
/home/tommy2025/work/LogicCore/jobs/test/
/home/tommy2025/work/LogicCore/tmp/backups/test/

数据库数据：
Docker volume: test_postgres_data
Docker volume: test_redis_data
```

## 注意事项

1. **测试数据隔离**：测试环境使用独立的数据库实例和目录，避免污染开发数据
2. **浏览器选择**：默认使用Chromium，但可以配置使用Chrome、Edge或Firefox
3. **配置同步**：.env.test与.env.local保持相同的配置结构，确保测试环境一致性
4. **敏感信息保护**：.env.test已被加入.gitignore，不会提交到Git
