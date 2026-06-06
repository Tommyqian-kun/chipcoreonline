# ChipCore

ChipCore 是面向芯片后端实现工程师的在线 EDA 工具服务平台，重点解决实际 SOC 后端流程中的数据生成、数据检查和流程协同问题。项目不是通用演示应用，而是围绕 SDC/UPF 高效生成与检查、CLK 电路数据生成、后续 CTS spec 数据生成等真实工程需求构建。

当前开发和测试主线是 **ECS Only 部署模式 + 多页面交互工具**：用户在网页端上传设计输入，使用可视化表格或画布编辑数据，提交任务后由 Redis 队列、Worker 和 Docker 容器异步执行，最终在下载页获取结果。

## 行业量产应用验证

ChipCore 的定位是 SoC 芯片实现流程里的 EDA 基础设施，不是脱离业务场景的独立脚手架。项目中的 SDC/UPF 数据生成工具已在此前 7nm/5nm mobile SoC 项目中实际使用。

上述芯片包含基带、NPU、CPU、GPU、DDR、MIPI 等复杂 IP 组成；在实现阶段，整个芯片的 all blocks、subsystems 和 top-only 场景都使用了本项目的 SDC 生成能力。最终 7nm 和 5nm 两颗芯片均实现量产。

当前仓库中持续开发的工具，是上述已量产项目所用版本的进阶版本。后续会按开发进度逐步整理和分享更多能力。

## 项目重点

- SDC 约束数据生成与检查：多页面 Excel-like 网页编辑流程。
- UPF 功耗意图数据生成与检查：与 SDC 一致的多页面任务流程。
- CLK/cmsgen 电路数据生成：按独立可视化画布工具接入平台公共执行底座。
- 后续工具扩展：CTS spec 数据生成及更多芯片后端实现数据工具。

这些工具关注的是芯片后端开发中真实存在的数据问题，和传统 EDA 厂商工具形成互补。

## 当前状态

| 模块 | 状态 |
| --- | --- |
| SDC Generator | 已实现 ECS Only 多页面流程 |
| UPF Generator | 已实现 ECS Only 多页面流程 |
| CLK/cmsgen | 已完成平台集成方案文档，按独立工具架构推进 |
| 任务执行 | Redis 队列 + Python Worker + Docker 容器 |
| 当前开发模式 | ECS Only 本地文件存储 |
| 暂非重点 | ECS+OSS+ACR 部署和单页面工具模式 |

## 后续开发规划

- SDC/UPF agent 自动化：在现有多页面流程和校验体系基础上，进一步增加 AI agent 驱动的数据自动生成能力，提升复杂约束和功耗意图数据的生成效率与一致性。
- CMSGEN agent 自动化：CMSGEN（CLK 电路自动化生成）工具已完成开发，后续会与平台公共底座深度结合，逐步引入 agent 驱动自动化生成能力。
- MERGED SDC 项目：针对大规模复杂 SoC 在 signoff 阶段面临的几百个 corner/scenarios/views 组合复杂度，MERGED SDC 方案用于显著压缩 signoff corner/scenarios/views 数量，并更高效、更精准地支持 timing ECO 收敛。

## 架构概览

```text
React Web UI
  -> Express API 鉴权/配额/任务创建
  -> PostgreSQL 持久化任务、工具和用户数据
  -> Redis task_queue 入队
  -> Python Worker 取任务
  -> Docker 工具容器执行
  -> jobs/{taskId}/output 生成结果包
  -> 下载页获取结果
```

平台设计上区分两类逻辑：

- 工具业务逻辑：SDC、UPF、cmsgen 保持独立输入格式、校验规则和执行行为。
- 平台公共能力：认证、订阅、TaskId、队列、Worker、容器执行、下载、日志、清理和后台管理复用同一套底座。

## 技术栈

- 前端：React 18、TypeScript、Vite、Tailwind CSS、shadcn/ui
- 后端：Node.js、Express、TypeScript
- 数据库：PostgreSQL、Prisma
- 队列/缓存：Redis
- 工具执行：Python、Docker
- 当前存储模式：ECS 本地文件系统

## 目录结构

```text
ChipCore/
├── app/
│   ├── frontend/          # React 前端
│   └── backend/           # Express API、Prisma、Worker 入口
├── build_images/          # 工具 Docker 镜像构建文件
├── templates/             # 工具输入模板
├── docs/                  # 架构、执行流程和集成说明
├── tests/                 # 单元、集成和 e2e 测试
├── jobs/                  # ECS Only 任务运行目录
├── temp/                  # 临时上传目录
└── logs/                  # 运行日志目录
```

## 快速开始

环境要求：

- Node.js >= 22.19
- npm >= 10.9
- Python 3.11+
- Docker
- PostgreSQL 和 Redis，或使用仓库提供的 Docker Compose 服务

安装依赖：

```bash
npm run install:all
python3.11 -m pip install -r requirements.txt
```

启动 PostgreSQL 和 Redis：

```bash
npm run docker:up
```

配置后端环境变量，至少包括：

```env
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/chipcore_dev"
REDIS_URL="redis://localhost:6379"
DEPLOYMENT_MODE="ecs_only"
JWT_SECRET="your-secret-key"
PORT=8080
FRONTEND_PORT=3000
```

初始化数据库：

```bash
cd app
npm run db:generate
npm run db:push
npm run db:seed
```

启动前端和后端 API：

```bash
npm run dev
```

另开终端启动 Worker：

```bash
npm run dev:worker
```

访问地址：

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:8080/health

## 工具镜像

SDC 和 UPF 的真实任务执行依赖本地 Docker 镜像。当前数据库种子和 Worker 使用的镜像名是：

- `ChipCore/sdc-generator:latest`
- `ChipCore/upf-generator:latest`

推荐使用已有构建脚本生成本地镜像和 tar 包：

```bash
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.0.0 multi
bash build_images/upfgen/build_upf_image_ecsonly_win.sh v1.0.0 multi
```

如需手动构建，必须从项目根目录作为 Docker build context：

```bash
docker build -f build_images/sdcgen/docker_sdc_generator_ecsonly_win_Dockerfile -t ChipCore/sdc-generator:latest .
docker build -f build_images/upfgen/docker_upf_generator_ecsonly_win_Dockerfile -t ChipCore/upf-generator:latest .
```

## 常用命令

```bash
npm run dev              # 前端 + 后端 API
npm run dev:frontend     # 仅启动前端
npm run dev:backend      # 仅启动后端
npm run dev:worker       # 启动任务 Worker
npm run build            # 构建前后端
npm run docker:up        # 启动 PostgreSQL + Redis
npm run docker:down      # 停止 PostgreSQL + Redis
npm run test             # 单元测试
npm run test:e2e         # Playwright e2e 测试
```

## 关键文档

- [ECS Only 多页面架构](docs/ecsonly_multipage_dev_opus45_0.md)
- [工具执行流程](docs/tool_step_details.md)
- [TaskId 唯一性机制](docs/unique_taskid_mechanism.md)
- [任务重做机制](docs/task_rework_mechanism.md)
- [cmsgen 集成细节](docs/cmsgen_full_intg_details.md)
- [cmsgen 数据库集成说明](docs/cmsgen_db_intg.md)
- [SDC 本地测试参考](docs/sdc_local_test_ecsonly_win.md)
- [UPF 本地测试参考](docs/upf_local_test_ecsonly_win.md)

## 开发约定

- 当前功能开发和测试优先面向 ECS Only 多页面流程。
- SDC、UPF、cmsgen 是不同工具，业务逻辑保持独立。
- TaskId、Redis 队列、Worker、Docker 执行、下载、鉴权、订阅和后台管理应复用平台公共能力。
- 不为了解决技术接入问题而随意简化真实工具业务逻辑。
- 测试真实任务执行时需要同时运行 API、前端和 Worker。

## License

MIT
