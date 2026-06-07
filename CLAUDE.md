# CLAUDE.md

## 项目概述

LogicCore 是一个专为芯片设计工程师打造的在线EDA工具平台，提供SDC约束生成、UPF功耗规范生成等自动化工具。项目采用前后端分离架构，支持ECS Only和ECS+OSS+ACR双部署模式，工具任务支持多页面和单页面方式。

但是目前阶段我们开发测试都是针对ECS Only模式多页面交互应用场景，所有feature，bug fix和功能开发测试都是ECS Only模式多页面交互，暂时忽略考虑ECS+OSS+ACR部署模式和单页面方式，请务必遵循这个开发模式和策略。

### 技术栈
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**: Node.js + Express + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **缓存/队列**: Redis (消息队列、任务状态管理)
- **工具执行**: Python + Docker容器
- **存储**: 阿里云OSS或ECS本地存储

## 常用命令

### 环境准备
```bash
# 安装Python依赖 (Python 3.11+)
python3.11 -m pip install -r requirements.txt

# 安装Node.js依赖 (从根目录)
npm run install:all  # 安装根目录、前端和后端所有依赖
```

### 数据库操作
```bash
# 从项目根目录执行
cd app

# 生成Prisma客户端
npm run db:generate

# 推送数据库Schema
npm run db:push

# 运行数据库迁移
npm run db:migrate

# 查看数据库
npm run db:studio

# 初始化数据 (包括工具定义)
npm run db:seed

# 初始化管理员用户
cd app/backend && npm run db:seed:admin
```

### 开发调试
```bash
# 启动所有开发服务 (前端+后端API)
npm run dev

# 单独启动前端
npm run dev:frontend

# 单独启动后端API
npm run dev:backend

# 启动工具执行Worker (需要单独启动)
npm run dev:worker
```

### 构建与部署
```bash
# 构建前端和后端
npm run build

# 启动生产服务
npm run start

# Docker服务管理
npm run docker:up    # 启动PostgreSQL和Redis
npm run docker:down  # 停止服务
npm run docker:logs  # 查看日志
npm run docker:ps    # 查看状态
```

### 系统管理
```bash
# 健康检查
curl http://localhost:8080/health

# 查看服务指标
curl http://localhost:8080/metrics

# 查看系统服务状态
curl http://localhost:8080/admin/services/status
```

## 核心架构

### 双部署模式支持
系统支持两种部署模式，通过环境变量`DEPLOYMENT_MODE`控制：

**ECS Only模式** (`DEPLOYMENT_MODE="ecs_only"`):
- 文件存储在ECS本地磁盘 (`/opt/logiccore/`)
- 无需阿里云OSS和ACR服务
- 适合单机部署和开发环境
- 下载文件有24小时自动清理机制

**ECS+OSS+ACR模式** (`DEPLOYMENT_MODE="ecs_oss_acr"`):
- 文件存储在阿里云OSS
- Docker镜像使用ACR
- 适合分布式生产环境

目前我们采用ECS Only模式多页面交互应用场景。
### 任务执行架构

**关键流程**:
```
用户提交 -> 权限验证 -> TaskID生成 -> 数据库记录 -> Redis入队 -> Worker处理
```

1. **前端提交**: 用户通过表单提交任务参数和文件
2. **API验证**: JWT认证、权限检查、配额验证
3. **TaskID生成**: 唯一ID保证机制 (数据库+Redis+分布式锁)
4. **入队处理**: 任务进入Redis队列 `task_queue`
5. **Worker执行**: Python Worker从队列获取任务并执行

### Worker系统

**关键文件**:
- `app/backend/src/workers/toolWorker.py` - 主Worker进程 (Python)
- `app/backend/src/workers/container_manager.py` - Docker容器管理
- `app/backend/src/services/workerService.ts` - Worker进程管理 (TypeScript)

**Worker启动**:
```bash
# 方式1: 通过npm脚本
cd app && npm run dev:worker

# 方式2: 直接运行Python脚本
cd app/backend/src/workers
python3 toolWorker.py
```

**Worker职责**:
- 从Redis队列获取任务
- 创建Docker容器执行工具
- 管理容器生命周期 (启动、监控、清理)
- 更新任务状态到数据库
- 通过WebSocket推送进度更新

### Docker工具容器

**工具镜像**:
- SDC生成器: `logiccore/sdcgen:latest`
- UPF生成器: `logiccore/upfgen:latest`

**本地镜像构建**:
```bash
# SDC工具镜像
cd build_images/sdcgen
docker build -t logiccore/sdcgen:latest .

# UPF工具镜像
cd build_images/upfgen
docker build -t logiccore/upfgen:latest .
```

**容器执行机制**:
- 每个任务在独立容器中执行
- 输入文件挂载到容器的 `/data/input` (只读)
- 输出文件写入 `/data/output` (读写)
- 日志写入 `/data/logs`
- 容器执行完成后自动清理

### 数据库模型

**核心表结构**:
- `User` - 用户信息和认证
- `Tool` - 工具定义和配置
- `Task` - 任务记录和状态
- `Sheet`/`Field` - 多页面工具的动态表单结构 (SDC/UPF)
- `Subscription` - 用户订阅信息
- `Order` - 订单记录

**任务状态枚举**:
```typescript
enum TaskStatus {
  PENDING = 'pending',        // 等待处理
  QUEUED = 'queued',          // 已入队
  RUNNING = 'running',        // 执行中
  COMPLETED = 'completed',    // 已完成
  FAILED = 'failed',          // 执行失败
  TIMEOUT = 'timeout',        // 执行超时
  CANCELLED = 'cancelled'     // 已取消
}
```

### 多页面工具系统

SDC和UPF工具采用Excel多页面表单设计：

**动态表单生成**:
- 表单结构定义在 `templates/{toolType}/hier.yaml`
- 运行时解析YAML生成数据库Schema
- 前端根据Schema动态渲染表单
- 支持"添加页面"功能，用户可自定义多页配置

**关键服务**:
- `ExcelThrpagesService` - 多页面Excel处理服务
- `Sheet`/`Field` 模型 - 动态表单结构
- `sdc_thrpages.routes.ts` / `upf_thrpages.routes.ts` - API路由

### 任务状态同步机制

**三层状态管理**:
1. **数据库**: 持久化存储任务状态
2. **Redis**: 活跃任务集合 `active_task_ids`
3. **WebSocket**: 实时推送状态更新

**一致性保证**:
- `TaskStateManagerService` - 负责三层状态同步
- `TaskConsistencyService` - 定期一致性检查 (每5分钟)
- 分布式锁保证状态更新原子性

### Redis队列系统

**队列结构**:
- `task_queue` - 主任务队列 (List)
- `active_task_ids` - 活跃任务ID集合 (Set)
- `taskid_lock:{taskId}` - 任务级分布式锁

**队列管理**:
- 上限48个待处理任务
- 用户并发限制 (订阅级别)
- 自动重试机制 (最多3次)
- 超时自动清理 (3分钟执行超时)

## 环境配置

### 必需环境变量
```env
# 数据库
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"

# Redis
REDIS_URL="redis://localhost:6379"

# 部署模式
DEPLOYMENT_MODE="ecs_only"  # 或 "ecs_oss_acr"

# JWT密钥
JWT_SECRET="your-secret-key"

# 服务端口
PORT=8080
FRONTEND_PORT=3000
```

### ECS Only模式额外配置
```env
# 本地存储路径
TEMP_UPLOAD_DIR="/opt/logiccore/temp"
TASK_LOGS_DIR="/opt/logiccore/logs"
ECS_TEMPLATES_DIR="/opt/logiccore/templates"
ECS_JOBS_DIR="/opt/logiccore/jobs"
ECS_DOCKER_DIR="/opt/logiccore/docker"
```

### ECS+OSS+ACR模式额外配置
```env
# 阿里云OSS
OSS_REGION="oss-cn-hangzhou"
OSS_ACCESS_KEY_ID="your-key"
OSS_ACCESS_KEY_SECRET="your-secret"
OSS_BUCKET="your-bucket"

# 阿里云ACR
ACR_REGISTRY_ID="your-registry-id"
ACR_NAMESPACE="your-namespace"
```

### 支付配置 (可选)
```env
# 支付宝
ALIPAY_APP_ID="your-app-id"
ALIPAY_PRIVATE_KEY="your-private-key"
ALIPAY_PUBLIC_KEY="alipay-public-key"

# 微信支付
WECHAT_APP_ID="your-app-id"
WECHAT_MCH_ID="your-mch-id"
WECHAT_API_KEY="your-api-key"
```

## 重要约定

### 编码规范
参考 `app/rule.md` 中的"编码交互规约"，核心原则：
1. **需求对齐**: 开始编码前必须完全理解需求
2. **最小化影响**: 只修改必要的代码
3. **逻辑一致**: 前后端业务逻辑必须同步
4. **强制验证**: 修改后必须全面验证

### 文件命名约定
- **TypeScript**: 使用kebab-case命名文件 (如 `task-service.ts`)
- **React组件**: 使用PascalCase命名文件 (如 `TaskForm.tsx`)
- **Python脚本**: 使用snake_case命名文件 (如 `tool_worker.py`)

### Git提交约定
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- refactor: 代码重构
- test: 测试相关
- chore: 构建/工具相关

## 故障排查

### 常见问题

**1. Worker未启动**
```bash
# 检查Worker进程状态
ps aux | grep toolWorker.py

# 查看Worker日志
tail -f app/backend/workers.log

# 手动启动Worker
cd app && npm run dev:worker
```

**2. 任务卡在PENDING状态**
```bash
# 检查Redis队列
docker exec -it app_redis_1 redis-cli
> LLEN task_queue
> LRANGE task_queue 0 -1

# 检查Worker连接
> PING
```

**3. Docker容器执行失败**
```bash
# 查看容器日志
docker logs <container_id>

# 检查镜像是否存在
docker images | grep logiccore

# 手动测试容器
docker run --rm -v /path/to/input:/data/input:ro \
  logiccore/sdcgen:latest
```

**4. 数据库连接失败**
```bash
# 检查PostgreSQL状态
docker-compose ps postgres

# 测试数据库连接
docker exec -it app_postgres_1 psql -U postgres -d chipcore_dev
```

### 调试模式

**开启详细日志**:
```env
# app/backend/.env
LOG_LEVEL="debug"
DEBUG="*"
```

**监控任务执行**:
```bash
# 实时监控日志
tail -f /opt/logiccore/logs/app.log

# 监控Redis队列
docker exec -it app_redis_1 redis-cli MONITOR
```

## 开发资源

### 关键文档
- `docs/ecsonly_multipage_dev_opus45_0.md` - 项目概述，技术栈和项目结构目录结构
- `docs/ecsonly_multipage_dev_opus45_1.md` - 数据库设计，API路由，前端页面，核心业务功能
- `docs/ecsonly_multipage_dev_opus45_2.md` - 工具任务执行流程，日志管理，部署指南，优化重构建议
- `docs/sdc_local_test_ecsonly_win.md` - windows环境下的sdc工具任务执行的详细测试步骤，可以作为linux系统里测试参考
- `docs/upf_local_test_ecsonly_win.md` - windows环境下的upf工具任务执行的详细测试步骤，可以作为linux系统里测试参考
- `database_model_info.md` - 数据库设计模型详细文档
- `docs/DEPLOYMENT.md` - 完整部署指南
- `app/README.md` - 项目概述和快速开始
- `docs/tool_step_details.md` - 工具执行流程详解
- `docs/unique_taskid_mechanism.md` - TaskID唯一性机制
- `docs/task_rework_mechanism.md` - 任务重做机制
- `docs/cmsgen_intg_prompt.md` - clkgen(cmsgen)工具集成的需求与要求说明
- `docs/cmsgen_db_intg.md` - clkgen(cmsgen)数据库集成与改造分析（讨论确认稿）
- `docs/cmsgen_full_intg_details.md` - clkgen(cmsgen)完整集成细节与操作过程

### 中间开发脚本
位于`scripts/`目录，用来保存辅助项目开发的中间脚本，不能存放项目本身业务功能代码

### 测试脚本
位于 `tests/` 目录，用来保存业务功能的测试，所有测试相关的代码文档数据和目录结构都放到这个目录下面


## 重要提醒

1. **Worker必须单独启动**: 开发时需要同时运行API服务和Worker
2. **Docker镜像准备**: 首次运行前需构建工具Docker镜像
3. **数据库初始化**: 运行 `npm run db:seed` 初始化工具定义
4. **环境变量检查**: 确保 `.env.local` 配置正确
5. **端口占用**: 确保5432 (PostgreSQL)、6379 (Redis)、8080 (API)、3000 (Frontend) 端口可用
6. **测试运行要求**：要求测试运行项目代码始终都在wsl2环境里，并使用wsl2环境里安装的chrome浏览器来测试，不要通过转发到windows来打开浏览器，直接在wsl2环境里测试运行项目的所有代码

## clkgen (cmsgen) 工具集成约定

将 `~/work/clkgen` 项目（在 LogicCore 内统一命名为 **cmsgen**）集成进 LogicCore，仅面向 **ECS Only 多页面交互**场景。
集成以已落地的 **SDC/UPF 三页面工具**为 golden 参考。详细方案见 `docs/cmsgen_full_intg_details.md` 与 `docs/cmsgen_db_intg.md`。

### 集成目标与原则（强制遵循）

1. **绝不修改 SDC/UPF 既有前后端代码与目录结构**，原有工具业务逻辑原封不动保留。
2. **增量集成**：遇到细节冲突，宁可新增独立文件，也不破坏既有工具逻辑。
3. **业务独立**：cmsgen 与 SDC/UPF 是不同工具，工具本身业务代码完全独立，尽量不复用。
4. **复用公共底座**：taskId 生成、Redis 队列、异步 worker、容器管理、下载/清理、鉴权/订阅/支付/后台等公共能力必须复用。
5. **目录完全遵循 LogicCore**：clkgen 前后端代码与运行时数据目录（`jobs/`/`temp/`/`logs/`）一律落到 LogicCore 对应目录。
6. **统一命名 cmsgen**；**统一使用 LogicCore 的 taskId 生成方式**（不沿用 clkgen 的 `CMS_*`）。
7. 前端 Initialize/Submit 两页**拷贝过来但套 LogicCore 页面风格**；Download 页**必须与 SDC/UPF 完全一致、独立成页、仅工具名不同**（不使用 clkgen 自带下载页）。
8. 引擎镜像制作**完全参考 `build_images/sdcgen`/`upfgen`** 流程，新建独立的 `build_images/cmsgen/`。
9. `~/work/clkgen/templates/cmsgen/` 拷贝到 `templates/cmsgen/`，**不拷贝 `comcells/`**。
10. 数据库**尽量少增表、最大复用**（参考 SDC/UPF 字段）。

### 关键发现（决定集成方式的核心事实）

1. **执行架构本质不同（最大改造点）**：clkgen 后端 `cmsgen.service.ts` 用 `child_process.spawn` 在 API 进程内**同步直接调 Python 引擎**，无 Docker、无队列、无 worker；LogicCore 是**异步 worker + Docker 容器 + Redis 队列**。必须把 clkgen 的 engine 管线（`cfg_adapter → graph_to_engine → cli_entry → 打包`）**整体封进 cmsgen 镜像**，由 worker 启动容器执行，API 仅负责 Initialize/编辑/提交/入队。
2. **可编辑数据形态不同**：cmsgen 是**可视化画布**（`@xyflow/react` 节点 + `design.json`），与 SDC/UPF 的 Excel 网格表单完全不同，**不应套用 `Sheet/Table/TableData`**；画布以 `jobs/{taskId}/input/design.json` 文件为真源 + `Task.parameters` 镜像引用。
3. **两个硬性不兼容点**：userId（clkgen `Int` vs LogicCore `String` cuid，改由 JWT 注入 String）、taskId（clkgen `CMS_*` vs LogicCore UUID v4，改用 TaskIdGenerator）。
4. **前端缺依赖**：LogicCore 无 `@xyflow/react`、`dagre`，需增量引入；clkgen 用 `react-router-dom@6`、LogicCore 用 `@7`，拷贝页面后需核对路由/懒加载 API。既有 `ClkGeneratorPage.tsx` 仅为早期占位 demo，与本次集成无关，不复用不修改。
5. **数据库 v1 零新增表**：cmsgen 复用 `Task`/`Tool`，把 clkgen `cms_projects` 元数据收敛进 `Task.parameters`（与 SDC/UPF 把 `modName`/`isFlat` 进 parameters 一致）；`cms_versions`/`cms_gen_logs`/`cms_lib_versions`/`cms_ai_chats` 均不迁移；删除 clkgen 服务里全部 `prisma.cms*` 落库逻辑与 `DB_ENABLED` 降级开关；仅 `db:seed` 新增一条 `toolType='cmsgen'` 的 Tool 记录。

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes




