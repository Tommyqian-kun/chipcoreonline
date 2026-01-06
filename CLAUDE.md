# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 编码交互规约 (Coding Convention) 和 核心编程指令 (Core Programming Directives)

**核心思想是精准、系统、高效。**

### 1. 任务启动与理解 (Initiation & Comprehension)

- 前置分析 (Prerequisite Analysis): 在开始编码前，必须完成以下步骤：
	
	1. 需求对齐: 彻底审查需求文档（PRD）和设计规范，完全理解业务目标、真实应用场景和约束条件。
	
	2. 代码审查: 系统性地分析项目最新版本的相关代码，深入理解现有架构和业务功能逻辑。

- 沟通协议 (Communication Protocol):
	
	1. 语言: 所有沟通均使用中文。
	
	2. 歧义处理: 如果对需求、现有逻辑或任务影响范围存在任何不确定性，必须立即停止并向您请求澄清。严禁基于不完整的理解进行假设或继续开发。

### 2. 设计与执行 (Design & Execution)

- 解决方案设计 (Solution Design):

	1. 精准性: 解决方案必须精准地解决指定问题。对于复杂问题，需采用第一性原理进行根本原因分析。
	
	2. 代码质量: 方案设计必须兼顾代码的可扩展性、可维护性和性能。

- 编码准则 (Coding Principles):

	1. 遵循真实生产应用场景原则：必须始终理解并满足真实生产应用场景的业务功能逻辑要求，绝对不能随意盲目简化或精简业务逻辑
    代码，也不要为了解决技术问题，而引入跟业务逻辑无关的或者无效的代码，比如大量临时测试、模拟验证和冗余等方面代码；
	
	2. 最小化影响: 只修改完成任务所必需的代码。严禁修改不相关的代码、破坏现有功能或引入冗余逻辑或引入测试模拟方式的临时代码，这是绝对不允许的；
	
	3. 逻辑一致性: 任何修改都必须确保前端与后端业务逻辑的同步和一致；

	4. 审查分析代码: 要求系统性的深入分析问题相关的所有代码，绝对不要仅仅看到部分代码发现有问题，就盲目的以偏概全的方式来下结论，导致错误的不精准的解决方案，必须在全面系统性的深入的审查分析相关代码后，再给出精准的结论和解决方案；
	
	5. 遵循标准: 集成第三方服务（SDK/API）时，必须查阅其最新官方文档，并结合项目技术栈进行正确集成；

	6. 代码修改完或重构完后，不要自动git提交，必须要经过测试和确认。

### 3. 验证与报告 (Verification & Reporting)

- 强制验证 (Mandatory Verification):
	
	1. 全面自检: 代码修改完成后，必须进行全面、系统的功能和逻辑验证。
	
	2. 正确性保证: 确保修改不仅彻底解决了原有问题，并且未引入任何新的功能、逻辑或性能上的缺陷。

- 状态报告 (Status Reporting):
	
	1. 客观透明: 必须客观、真实地报告任务的完成状态。明确指出已完成的工作、遇到的问题或任何潜在风险。杜绝想当然地认为任务已正确完成。


## 项目概述

LogicCore 是一个专为芯片设计工程师打造的在线EDA工具平台，提供SDC约束生成、UPF功耗规范生成等自动化工具。项目采用前后端分离架构，支持ECS Only和ECS+OSS+ACR双部署模式。

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

### 中间开发脚本
位于`scripts/`目录，用来保存辅助项目开发的中间脚本，不能存放项目本身业务功能代码

### 测试脚本
位于 `tests/` 目录，用来保存业务功能的测试工，所有测试相关的代码文档数据和目录结构都放到这个目录下面，
- `tests/task_submission.py` - 任务提交测试
- `tests/monitor_task_execution.py` - 任务执行监控
- `tests/debug_container_execution.py` - 容器执行调试

## 重要提醒

1. **Worker必须单独启动**: 开发时需要同时运行API服务和Worker
2. **Docker镜像准备**: 首次运行前需构建工具Docker镜像
3. **数据库初始化**: 运行 `npm run db:seed` 初始化工具定义
4. **环境变量检查**: 确保 `.env.local` 配置正确
5. **端口占用**: 确保5432 (PostgreSQL)、6379 (Redis)、8080 (API)、3000 (Frontend) 端口可用
6. **测试运行要求**：要求测试运行项目代码始终都在wsl2环境里，并使用wsl2环境里安装的chrome浏览器来测试，不要通过转发到windows来打开浏览器，直接在wsl2环境里测试运行项目的所有代码
