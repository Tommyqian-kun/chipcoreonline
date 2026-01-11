# LogicCore ECS Only多页面交互模式开发文档 (Part 0)

> 本文档基于LogicCore项目实际代码实现，详细阐述ECS Only部署模式下的多页面交互在线工具系统开发。

---

## 第1章：项目概述

### 1.1 项目简介

LogicCore是一个芯片领域在线EDA工具实时服务平台，提供SDC约束文件生成器（SDC Generator）和UPF功耗管理文件生成器（UPF Generator）等专业工具。用户可以注册登录，上传设计文件，通过多页面交互式界面配置参数，执行工具生成结果文件。

### 1.2 ECS Only部署模式

ECS Only模式是针对单机部署场景优化的架构，特点包括：

| 特性 | 描述 |
|------|------|
| 文件存储 | ECS本地磁盘存储，无需阿里云OSS |
| 镜像管理 | 本地Docker镜像，无需阿里云ACR私有仓库 |
| 任务执行 | 本地Docker容器执行，资源隔离 |
| 下载机制 | 2分钟限时下载，自动清理过期文件 |
| 适用场景 | 开发测试、小规模生产部署 |

### 1.3 多页面交互模式

当前实现的多页面交互模式（`_thrpages`系列）将工具使用流程分为三个阶段：

```mermaid
graph LR
    A[Initialize初始化] --> B[Submit提交/编辑]
    B --> C[Download下载]
    
    subgraph Initialize
        A1[上传设计文件]
        A2[解析生成配置表]
        A3[创建DRAFT任务]
    end
    
    subgraph Submit
        B1[多页面表格编辑]
        B2[数据校验DataChk]
        B3[提交执行]
    end
    
    subgraph Download
        C1[等待执行完成]
        C2[下载结果文件]
        C3[2分钟清理]
    end
```

### 1.4 已实现工具清单

| 工具 | 类型标识 | 页面组件 | 输入文件 |
|------|---------|---------|---------|
| SDC Generator | sdcgen | `SdcGenerator*_thrpages.tsx` | hier.yaml, vlog.v, dcont.xlsx |
| UPF Generator | upfgen | `UpfGenerator*_thrpages.tsx` | hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx |

### 1.5 核心业务功能模块

```mermaid
graph TD
    subgraph 用户角色
        V[游客]
        U[注册用户]
        P[Pro会员]
        A[管理员]
    end
    
    subgraph 核心功能
        Auth[认证授权系统]
        Tool[EDA工具引擎]
        Sub[订阅支付系统]
        Admin[后台管理系统]
    end
    
    V --> Auth
    Auth --> U
    U --> Tool
    U --> Sub
    Sub --> P
    P --> Tool
    A --> Admin
```

---

## 第2章：技术栈

### 2.1 前端技术栈

| 类别 | 技术 | 版本/说明 |
|------|------|----------|
| 核心框架 | React 18 | 并发特性、自动批处理 |
| 构建工具 | Vite | 快速冷启动和HMR |
| UI框架 | Tailwind CSS + shadcn/ui | 原子化CSS + 非侵入式组件 |
| 状态管理 | TanStack Query + React Context | 服务端状态 + 全局UI状态 |
| 表单处理 | React Hook Form + Zod | 高性能表单 + 类型安全校验 |
| HTTP客户端 | Axios | 拦截器、统一配置 |
| 路由 | React Router v6 | 声明式路由 |
| 图标 | Lucide Icons | 轻量级图标库 |

### 2.2 后端技术栈

| 类别 | 技术 | 版本/说明 |
|------|------|----------|
| 运行时 | Node.js 18+ | 事件驱动、非阻塞I/O |
| Web框架 | Express.js | RESTful API |
| 开发工具 | tsx | TypeScript实时编译执行 |
| ORM | Prisma | 类型安全数据库访问 |
| 数据库 | PostgreSQL 14 | 关系型数据库 |
| 缓存/队列 | Redis 7 | 任务队列、会话缓存 |
| 认证 | JWT + bcrypt | 无状态认证 + 密码哈希 |
| Worker | Python 3.9+ | 任务执行进程（toolWorker.py） |
| 容器 | Docker | 工具隔离执行环境 |

### 2.3 实际代码统计

根据代码审查结果：

```
后端代码结构:
├── src/
│   ├── config/          # 15个配置文件
│   ├── controllers/     # 17个控制器
│   ├── middleware/      # 7个中间件
│   ├── routes/          # 18个路由文件
│   ├── services/        # 41个服务文件
│   │   ├── excel_thrpages.service.ts    # 145KB - 多页面核心服务
│   │   ├── task.service.ts              # 25KB - 任务服务
│   │   └── cleanup.service.ts           # 22KB - 清理服务
│   ├── workers/         # 15个Worker相关文件
│   │   ├── toolWorker.py                # 138KB/3015行 - 主Worker
│   │   └── worker_manager.py            # 33KB - Worker管理器
│   └── utils/           # 11个工具函数

前端代码结构:
├── src/
│   ├── components/      # 65个组件（含shadcn/ui）
│   ├── pages/           # 44个页面
│   │   ├── tools/       # 15个工具页面
│   │   ├── admin/       # 11个管理页面
│   │   └── auth/        # 6个认证页面
│   ├── services/        # 9个API服务
│   └── hooks/           # 7个自定义Hook
```

---

## 第3章：项目架构与目录结构

### 3.1 系统架构图

```mermaid
graph TD
    subgraph 用户端
        Browser[浏览器 React App]
    end
    
    subgraph 应用层
        API[Express API Server :5000]
        Worker[Python Worker Manager]
    end
    
    subgraph 数据层
        PG[(PostgreSQL)]
        Redis[(Redis)]
        LocalFS[本地文件系统]
    end
    
    subgraph 执行层
        Docker[Docker容器池]
    end
    
    Browser -->|HTTP/WS| API
    API -->|Prisma| PG
    API -->|任务队列| Redis
    API -->|文件操作| LocalFS
    Worker -->|BLPOP| Redis
    Worker -->|状态更新| PG
    Worker -->|容器管理| Docker
    Docker -->|挂载| LocalFS
```

### 3.2 app目录ECS Only多页面交互代码结构

> 以下仅列出与ECS Only多页面交互相关的核心业务代码，不包括测试脚本

#### 3.2.1 后端核心代码结构

```
app/backend/
├── prisma/                                    # 数据库ORM
│   ├── schema.prisma                          # 数据库模型定义（283行，12个模型）
│   │                                          # 包含: User, Task, Tool, Sheet, Table, TableData
│   │                                          # Plan, Order, Subscription, Feedback, AuditLog
│   └── migrations/                            # 数据库迁移历史
│
├── src/
│   ├── index.ts                               # 应用入口（20KB）
│   │                                          # - Express服务器配置
│   │                                          # - 路由挂载
│   │                                          # - ECS Only模式初始化
│   │                                          # - WebSocket服务配置
│   │
│   ├── config/                                # 配置模块（16个文件，92KB）
│   │   ├── env-validation.ts                  # 环境变量Zod验证（9.1K）
│   │   ├── paths.ts                           # ECS本地路径配置（9.1K）
│   │   ├── redis.ts                           # Redis连接配置（620B）
│   │   ├── database.ts                        # PostgreSQL配置（678B）
│   │   ├── logger.ts                          # Pino日志配置（1.7K）
│   │   ├── app.config.ts                      # 应用全局配置（4.5K）
│   │   ├── tool-types.config.ts               # 工具类型配置（sdcgen/upfgen）（6.7K）
│   │   ├── unified-tool.config.ts             # 统一工具配置（4.4K）
│   │   ├── alipay.ts                          # 支付宝SDK配置（2.5K）
│   │   ├── alipay_sandbox_private_traditional.pem  # 支付宝私钥（1.7K）
│   │   ├── alipay_sandbox_public_traditional.pem   # 支付宝公钥（445B）
│   │   ├── wechatpay.ts                       # 微信支付SDK配置（2.7K）
│   │   ├── wechat_dev_private.pem             # 微信开发私钥（1.7K）
│   │   ├── wechat_dev_public.pem              # 微信开发公钥（460B）
│   │   └── index.ts                           # 配置导出（360B）
│   │
│   ├── controllers/                           # 控制器层（18个文件，224KB）
│   │   ├── sdc_thrpages.controller.ts         # SDC多页面控制器（48K，1425行）
│   │   │   ├── initializeTask()               # 初始化任务，解析上传文件
│   │   │   ├── getTaskSheets()                # 获取Sheet列表
│   │   │   ├── getSheetData()                 # 获取表格数据
│   │   │   ├── saveSheetData()                # 保存表格数据（批量）
│   │   │   ├── checkTaskData()                # DataChk数据校验
│   │   │   ├── submitTask()                   # 提交任务执行
│   │   │   ├── getTaskStatus()                # 获取任务状态
│   │   │   ├── downloadTaskResult()           # 下载结果文件
│   │   │   ├── downloadCheckReport()          # 下载检查报告
│   │   │   ├── cleanupTaskData()              # 清理任务数据
│   │   │   └── [7个辅助函数]
│   │   │
│   │   ├── upf_thrpages.controller.ts         # UPF多页面控制器（46K，1355行）
│   │   │   └── [与SDC类似的函数结构]
│   │   │
│   │   ├── task.controller.ts                 # 任务基础控制器（21K）
│   │   ├── auth.controller.ts                 # 认证控制器（7.6K）
│   │   ├── admin.controller.ts                # 管理后台控制器（18K）
│   │   ├── admin-task.controller.ts           # 管理员任务控制器（6.7K）
│   │   ├── order.controller.ts                # 订单控制器（3.2K）
│   │   ├── payment.controller.ts              # 支付控制器（3.2K）
│   │   ├── subscription.controller.ts         # 订阅控制器（3.3K）
│   │   ├── plan.controller.ts                 # 计划控制器（1.6K）
│   │   ├── download.controller.ts             # 下载控制器（5.4K）
│   │   ├── ecs-file.controller.ts             # ECS文件控制器（11K）
│   │   ├── template.controller.ts             # 模板控制器（2.6K）
│   │   ├── config.controller.ts               # 配置控制器（1.3K）
│   │   ├── system.controller.ts               # 系统控制器（6.9K）
│   │   ├── user.controller.ts                 # 用户控制器（1.4K）
│   │   └── feedback.controller.ts             # 反馈控制器（4.3K）
│   │
│   ├── services/                              # 服务层（42个文件，668KB）
│   │   ├── excel_thrpages.service.ts          # ⭐多页面Excel核心服务（142K，3994行，60个函数）
│   │   │   ├── analyzeTemplateFile()          # 解析Excel模板
│   │   │   ├── initializeSdcDatabaseSchemaHardcoded()  # 初始化SDC数据库
│   │   │   ├── initializeUpfDatabaseSchemaHardcoded()  # 初始化UPF数据库
│   │   │   ├── updateUpfDynamicTableColumns() # 更新UPF动态列
│   │   │   ├── parseExcelFile()               # 解析Excel文件
│   │   │   ├── saveTableDataToDatabase()      # 保存表格数据
│   │   │   ├── syncDatabaseToExcel()          # 同步数据到Excel
│   │   │   └── [50+个辅助函数]
│   │   │
│   │   ├── task.service.ts                    # 任务服务（28K）
│   │   ├── cleanup.service.ts                 # 清理服务（37K）
│   │   ├── admin.service.ts                   # 管理服务（32K）
│   │   ├── plan-features.service.ts           # 计划功能服务（7.2K）
│   │   ├── backup.service.ts                  # 备份服务（15K）
│   │   ├── redis-pool.service.ts              # Redis连接池服务（15K）
│   │   ├── order.service.ts                   # 订单服务（15K）
│   │   ├── ecs-local-storage.service.ts       # ⭐ECS本地存储服务（15K）
│   │   ├── monitoring.service.ts              # 监控服务（11K）
│   │   ├── websocket.service.ts               # WebSocket服务（15K）
│   │   ├── task-timeout.service.ts            # 任务超时服务（17K）
│   │   ├── redis-queue-cleanup.service.ts     # Redis队列清理服务（12K）
│   │   ├── task-log-cleanup.service.ts        # 任务日志清理服务（13K）
│   │   ├── task-state-manager.service.ts      # 任务状态管理（12K）
│   │   ├── task-state-sync.service.ts         # 任务状态同步服务（11K）
│   │   ├── tool-execution.service.ts          # 工具执行服务（14K）
│   │   ├── tool-mapping.service.ts            # 工具映射服务（11K）
│   │   ├── resource-manager.service.ts        # 资源管理服务（9.0K）
│   │   ├── distributed-lock.service.ts        # 分布式锁服务（9.8K）
│   │   ├── sts-credential-manager.service.ts  # STS凭证管理服务（9.8K）
│   │   ├── email.service.ts                   # 邮件服务（7.9K）
│   │   ├── enhanced-task-logger.service.ts    # 增强任务日志服务（7.7K）
│   │   ├── deployment-mode.service.ts         # 部署模式服务（6.9K）
│   │   ├── task-queue.service.ts              # 任务队列服务（8.3K）
│   │   ├── task-retry.service.ts              # 任务重试服务（8.8K）
│   │   ├── user-concurrent-check.service.ts   # 用户并发检查服务（12K）
│   │   ├── auth.service.ts                    # 认证服务（8.1K）
│   │   ├── download.service.ts                # 下载服务（8.9K）
│   │   ├── file-system-lock.service.ts        # 文件系统锁服务（8.1K）
│   │   ├── jwt-blacklist.service.ts           # JWT黑名单服务（5.6K）
│   │   ├── task-logger.service.ts             # 任务日志服务（6.7K）
│   │   ├── task-id-generator.service.ts       # 任务ID生成服务（8.4K）
│   │   ├── task-cleanup.service.ts            # 任务清理服务（3.0K）
│   │   ├── task-consistency.service.ts        # 任务一致性服务（7.5K）
│   │   ├── data-integrity.service.ts          # 数据完整性服务（5.2K）
│   │   ├── user-concurrent-refresh.service.ts # 用户并发刷新服务（5.3K）
│   │   ├── payment.service.ts                 # 支付服务（3.4K）
│   │   ├── feedback.service.ts                # 反馈服务（2.2K）
│   │   ├── subscription.service.ts            # 订阅服务（1.1K）
│   │   ├── plan.service.ts                    # 计划服务（243B）
│   │   ├── user.service.ts                    # 用户服务（980B）
│   │   └── workerService.ts                   # Worker进程管理服务（11K）
│   │
│   ├── routes/                                # 路由定义（19个文件，92KB）
│   │   ├── sdc_thrpages.routes.ts             # SDC多页面路由（7.0K）
│   │   │   ├── POST /api/v1/sdc-thrpages/initialize           # 初始化
│   │   │   ├── GET  /api/v1/sdc-thrpages/sheets/:taskId       # 获取Sheets
│   │   │   ├── GET  /api/v1/sdc-thrpages/tables/:sheetId      # 获取Tables
│   │   │   ├── GET  /api/v1/sdc-thrpages/data/:taskId/:sheetId # 获取数据
│   │   │   ├── POST /api/v1/sdc-thrpages/data/:taskId/:sheetId # 保存数据
│   │   │   ├── POST /api/v1/sdc-thrpages/datachk/:taskId      # 数据校验
│   │   │   ├── POST /api/v1/sdc-thrpages/submit/:taskId       # 提交执行
│   │   │   ├── GET  /api/v1/sdc-thrpages/status/:taskId       # 获取状态
│   │   │   ├── GET  /api/v1/sdc-thrpages/download/:taskId     # 下载结果
│   │   │   └── GET  /api/v1/sdc-thrpages/download-report/:taskId # 下载报告
│   │   │
│   │   ├── upf_thrpages.routes.ts             # UPF多页面路由（6.5K）
│   │   ├── task.routes.ts                     # 任务路由（3.1K）
│   │   ├── auth.routes.ts                     # 认证路由（829B）
│   │   ├── admin.routes.ts                    # 管理路由（2.5K）
│   │   ├── admin-task.routes.ts               # 管理员任务路由（1.1K）
│   │   ├── order.routes.ts                    # 订单路由（484B）
│   │   ├── payment.routes.ts                  # 支付路由（895B）
│   │   ├── subscription.routes.ts             # 订阅路由（451B）
│   │   ├── plan.routes.ts                     # 计划路由（476B）
│   │   ├── download.routes.ts                 # 下载路由（1.3K）
│   │   ├── ecs-file.routes.ts                 # ECS文件路由（888B）
│   │   ├── template.routes.ts                 # 模板路由（449B）
│   │   ├── config.routes.ts                   # 配置路由（398B）
│   │   ├── system.routes.ts                   # 系统路由（1.5K）
│   │   ├── user.routes.ts                     # 用户路由（390B）
│   │   ├── feedback.routes.ts                 # 反馈路由（283B）
│   │   └── admin/                             # 管理员子路由
│   │       └── log-management.ts              # 日志管理路由（4.5K）
│   │
│   ├── workers/                               # ⭐Worker进程（4个核心Python文件，752KB）
│   │   ├── toolWorker.py                      # 主Worker（139K，3015行，90+函数）
│   │   │   ├── TaskLogger类                   # 任务日志记录
│   │   │   ├── EcsLocalFileManager类          # ECS本地文件管理
│   │   │   ├── process_task()                 # 任务处理入口
│   │   │   ├── process_task_ecs_only()        # ECS Only模式处理
│   │   │   ├── process_temp_files()           # 临时文件处理
│   │   │   ├── cleanup_temp_files()           # 临时文件清理
│   │   │   ├── load_image_from_tar()          # 加载Docker镜像
│   │   │   └── [80+个辅助函数]
│   │   │
│   │   ├── worker_manager.py                  # Worker管理器（46K）
│   │   ├── container_manager.py               # 容器管理（8.2K）
│   │   ├── cleanup_container.py               # 容器清理（966B）
│   │   ├── worker_process.py                  # Worker进程工具（1.8K）
│   │   └── __pycache__/                       # Python缓存目录（4.0K）
│   │
│   ├── tools/                                 # Python工具脚本（4个文件，432KB）
│   │   ├── sdc_dg_gen.py                      # SDC数据组生成工具（90K）
│   │   ├── sdc_dg_chk.py                      # SDC数据组检查工具（128K）
│   │   ├── upf_dg_gen.py                      # UPF数据组生成工具（105K）
│   │   └── upf_dg_chk.py                      # UPF数据组检查工具（103K）
│   │
│   ├── middleware/                            # 中间件（10个文件，68KB）
│   │   ├── api-version.ts                     # API版本控制中间件（8.5K）
│   │   ├── file-upload-validation.ts          # 文件上传验证中间件（7.2K）
│   │   ├── wechatpay-notification.ts          # 微信支付通知中间件（7.2K）
│   │   ├── subscription.ts                    # 订阅权限检查（6.7K）
│   │   ├── api-timeout.ts                     # API超时中间件（4.6K）
│   │   ├── auth.ts                            # JWT认证中间件（2.4K）
│   │   ├── rateLimit.ts                       # 速率限制中间件（1.4K）
│   │   ├── errorHandler.ts                    # 错误处理中间件（2.1K）
│   │   ├── validate.ts                        # 数据验证中间件（1.2K）
│   │   └── admin.ts                           # 管理员权限中间件（766B）
│   │
│   ├── utils/                                 # 工具函数（12个文件，92KB）
│   │   ├── operation-logger.ts                # 操作日志工具（9.4K）
│   │   ├── task-logger.ts                     # 任务日志工具（12K）
│   │   ├── seedData.ts                        # 种子数据工具（7.8K）
│   │   ├── cross-platform-paths.ts            # 跨平台路径（5.9K）
│   │   ├── payment-simulator.ts               # 支付模拟器（6.7K）
│   │   ├── database.ts                        # 数据库工具（5.0K）
│   │   ├── taskLogger.ts                      # 任务日志工具旧版（8.1K）
│   │   ├── decimal.ts                         # 十进制处理工具（3.2K）
│   │   ├── oss.ts                             # OSS工具（2.9K）
│   │   ├── response.ts                        # 响应工具（2.4K）
│   │   ├── seedAdmin.ts                       # 管理员种子数据（2.1K）
│   │   └── pythonHelper.ts                    # Python辅助工具（946B）
│   │
│   ├── types/                                 # TypeScript类型（3个文件，16KB）
│   │   ├── auth.ts                            # 认证类型定义（698B）
│   │   ├── express.d.ts                       # Express类型扩展（252B）
│   │   └── wxpay-v3.d.ts                      # 微信支付V3类型（27B）
│   │
│   ├── schemas/                               # 验证Schema（1个文件，4KB）
│   │   └── task.schema.ts                     # 任务验证Schema（1.3K）
│   │
│   └── envLoader.ts                           # 环境变量加载器（3.4K）
│
├── .env.example                               # 环境变量示例（70行）
├── .env.local                                 # 本地环境配置（4KB）
├── start_workers.py                           # Worker启动脚本（5KB）
└── package.json                               # 后端依赖配置
```

#### 3.2.2 前端核心代码结构

```
app/frontend/
├── src/
│   ├── App.tsx                                # 根组件（13KB，327行）
│   │   └── React Router v6路由配置
│   │
│   ├── pages/                                 # 页面组件（44个文件，约550KB）
│   │   ├── tools/                             # ⭐工具页面（15个文件）
│   │   │   ├── SdcGeneratorPage.tsx           # SDC工具入口页面（34KB）
│   │   │   ├── SdcGeneratorInitialize_thrpages.tsx  # SDC初始化页面（26KB）
│   │   │   │   ├── 文件上传组件（hier.yaml, vlog.v, dcont.xlsx）
│   │   │   │   ├── ModName输入
│   │   │   │   ├── isFlat选项
│   │   │   │   └── 初始化提交逻辑
│   │   │   │
│   │   │   ├── SdcGeneratorSubmit_thrpages.tsx  # ⭐SDC提交编辑页面（144KB，核心）
│   │   │   │   ├── Sheet切换组件（VarDef, ClkDef, IODly, IOExp等）
│   │   │   │   ├── 多表格编辑组件
│   │   │   │   ├── DataSav保存逻辑
│   │   │   │   ├── DataChk校验逻辑
│   │   │   │   └── Submit提交逻辑
│   │   │   │
│   │   │   ├── SdcGeneratorDownload_thrpages.tsx  # SDC下载页面（5KB）
│   │   │   │   ├── 任务状态轮询
│   │   │   │   ├── 2分钟倒计时
│   │   │   │   └── 结果文件下载
│   │   │   │
│   │   │   ├── UpfGeneratorPage.tsx           # UPF工具入口页面（31KB）
│   │   │   ├── UpfGeneratorInitialize_thrpages.tsx  # UPF初始化页面（31KB）
│   │   │   │   ├── 4文件上传（hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx）
│   │   │   │   ├── ModName输入
│   │   │   │   ├── Version选择（2.0/2.1/3.0）
│   │   │   │   └── isFlat选项
│   │   │   │
│   │   │   ├── UpfGeneratorSubmit_thrpages.tsx  # ⭐UPF提交编辑页面（145KB，核心）
│   │   │   │   └── [与SDC类似的多表格编辑结构]
│   │   │   │
│   │   │   ├── UpfGeneratorDownload_thrpages.tsx  # UPF下载页面（5KB）
│   │   │   ├── index.tsx                      # 工具首页（3KB）
│   │   │   ├── ToolOnboarding.tsx             # 工具引导页面（4.7KB）
│   │   │   └── [5个其他工具页面]
│   │   │
│   │   ├── admin/                             # 管理后台（11个文件）
│   │   │   ├── dashboard.tsx                  # 仪表盘（13KB）
│   │   │   ├── users.tsx                      # 用户管理（18KB）
│   │   │   ├── tasks.tsx                      # 任务管理（17KB）
│   │   │   ├── tools.tsx                      # 工具管理（56KB）
│   │   │   ├── orders.tsx                     # 订单管理（13KB）
│   │   │   ├── subscriptions.tsx              # 订阅管理（16KB）
│   │   │   ├── plans.tsx                      # 计划管理（12KB）
│   │   │   ├── logs.tsx                       # 日志查看（13KB）
│   │   │   ├── monitoring.tsx                 # 系统监控（11KB）
│   │   │   ├── feedback.tsx                   # 反馈管理（10KB）
│   │   │   └── login.tsx                      # 管理员登录（5KB）
│   │   │
│   │   ├── auth/                              # 认证页面（6个文件）
│   │   │   ├── login.tsx                      # 用户登录（6KB）
│   │   │   ├── register.tsx                   # 用户注册（5KB）
│   │   │   ├── forgot-password.tsx            # 忘记密码（3KB）
│   │   │   ├── reset-password.tsx             # 重置密码（4KB）
│   │   │   ├── verify-code.tsx                # 验证码（7KB）
│   │   │   └── email-verification-result.tsx  # 邮箱验证结果（3KB）
│   │   │
│   │   ├── order/                             # 订单页面（4个文件）
│   │   │   ├── checkout.tsx                   # 结账页面
│   │   │   ├── order-confirmation.tsx         # 订单确认页面
│   │   │   ├── order-details.tsx              # 订单详情页面
│   │   │   └── order-history.tsx              # 订单历史页面
│   │   │
│   │   ├── payment/                           # 支付页面
│   │   │   └── payment-result.tsx             # 支付结果页面
│   │   │
│   │   ├── task-history/                      # 任务历史
│   │   │   └── index.tsx                      # 任务历史页面
│   │   │
│   │   ├── home.tsx                           # 首页
│   │   ├── profile.tsx                        # 个人资料（41KB）
│   │   ├── membership.tsx                     # 会员页面
│   │   ├── contact.tsx                        # 联系我们（8KB）
│   │   ├── debug.tsx                          # 调试页面
│   │   └── not-found.tsx                      # 404页面
│   │
│   ├── components/                            # 组件库（65个组件，约260KB）
│   │   ├── ui/                                # shadcn/ui组件（49个）
│   │   │   ├── button.tsx                     # 按钮组件
│   │   │   ├── input.tsx                      # 输入框
│   │   │   ├── table.tsx                      # 表格
│   │   │   ├── tabs.tsx                       # 标签页
│   │   │   ├── dialog.tsx                     # 对话框
│   │   │   ├── toast.tsx                      # 提示框
│   │   │   ├── select.tsx                     # 选择器
│   │   │   ├── checkbox.tsx                   # 复选框
│   │   │   ├── accordion.tsx                  # 折叠面板
│   │   │   ├── alert.tsx                      # 警告提示
│   │   │   ├── badge.tsx                      # 徽章
│   │   │   ├── card.tsx                       # 卡片
│   │   │   ├── dropdown-menu.tsx              # 下拉菜单
│   │   │   ├── form.tsx                       # 表单
│   │   │   ├── label.tsx                      # 标签
│   │   │   ├── popover.tsx                    # 弹出框
│   │   │   ├── progress.tsx                   # 进度条
│   │   │   ├── scroll-area.tsx                # 滚动区域
│   │   │   ├── separator.tsx                  # 分隔线
│   │   │   ├── sheet.tsx                      # 侧边抽屉
│   │   │   ├── skeleton.tsx                   # 骨架屏
│   │   │   ├── switch.tsx                     # 开关
│   │   │   ├── textarea.tsx                   # 文本域
│   │   │   ├── tooltip.tsx                    # 工具提示
│   │   │   └── [25个其他UI组件]
│   │   │
│   │   ├── admin/                             # 管理组件（3个）
│   │   │   ├── admin-layout.tsx               # 管理布局
│   │   │   ├── admin-route.tsx                # 管理路由守卫
│   │   │   └── sidebar.tsx                    # 侧边栏
│   │   │
│   │   ├── shared/                            # 共享组件（3个）
│   │   │   ├── TaskHistoryTable.tsx           # 任务历史表格（20KB）
│   │   │   ├── TaskProgress.tsx               # 任务进度条
│   │   │   └── TaskActionButton.tsx           # 任务操作按钮
│   │   │
│   │   ├── common/                            # 通用组件（2个）
│   │   │   ├── EnhancedFileUpload.tsx         # 增强文件上传（18KB）
│   │   │   └── ToolCard.tsx                   # 工具卡片
│   │   │
│   │   ├── EcsOnlyStatusIndicator.tsx         # ECS Only状态指示器（6KB）
│   │   ├── navigation.tsx                     # 全局导航（9KB）
│   │   ├── footer.tsx                         # 页脚（4KB）
│   │   ├── hero-section.tsx                   # 英雄区（1KB）
│   │   ├── membership-plans.tsx               # 会员计划展示（12KB）
│   │   ├── tools-showcase.tsx                 # 工具展示（5KB）
│   │   ├── latest-news.tsx                    # 最新消息（3KB）
│   │   ├── protected-route.tsx                # 路由守卫
│   │   └── [5个其他组件]
│   │
│   ├── services/                              # API服务层（9个文件）
│   │   ├── api.ts                             # ⭐Axios实例配置（4KB）
│   │   ├── auth.service.ts                    # 认证API服务
│   │   ├── task.service.ts                    # 任务API服务（2KB）
│   │   ├── admin.service.ts                   # 管理API服务（4KB）
│   │   ├── order.service.ts                   # 订单API服务（1KB）
│   │   ├── subscription.service.ts            # 订阅API服务
│   │   ├── plan.service.ts                    # 计划API服务（1KB）
│   │   ├── user.service.ts                    # 用户API服务
│   │   └── download.service.ts                # 下载API服务（6KB）
│   │
│   ├── hooks/                                 # 自定义Hooks（7个文件）
│   │   ├── useToolExecution.ts                # ⭐工具执行Hook（33KB，核心）
│   │   ├── useToolPageNavigation.ts           # 工具页面导航（3KB）
│   │   ├── useWebSocket.ts                    # WebSocket Hook（5KB）
│   │   ├── usePreventBackNavigation.ts        # 防止返回（1KB）
│   │   ├── use-toast.ts                       # Toast Hook（3KB）
│   │   ├── use-mobile.tsx                     # 移动端检测
│   │   └── use-on-click-outside.ts            # 外部点击检测
│   │
│   ├── contexts/                              # React Context（2个文件）
│   │   ├── auth.context.tsx                   # 认证Context
│   │   └── task-status.context.tsx            # 任务状态Context
│   │
│   ├── lib/                                   # 工具库（3个文件）
│   │   ├── utils.ts                           # shadcn/ui工具
│   │   ├── queryClient.ts                     # React Query配置
│   │   └── error-handler.ts                   # 错误处理
│   │
│   ├── config/                                # 配置（2个文件）
│   │   ├── env.ts                             # 环境配置
│   │   └── tools.config.ts                    # 工具配置
│   │
│   ├── types/                                 # TypeScript类型
│   │   ├── index.ts                           # 通用类型定义
│   │   └── sdc-thrpages.types.ts              # SDC多页面类型
│   │
│   ├── utils/                                 # 工具函数（4个文件）
│   │   ├── file-validation.ts                 # 文件验证工具
│   │   ├── icon-utils.ts                      # 图标工具
│   │   ├── task-progress.ts                   # 任务进度工具
│   │   └── tool-page-methods.ts               # 工具页面方法
│   │
│   ├── main.tsx                               # React入口文件
│   └── index.css                              # 全局样式（4KB）
│
├── index.html                                 # HTML模板
├── vite.config.ts                             # Vite配置
├── tailwind.config.ts                         # Tailwind配置（2KB）
├── components.json                            # shadcn/ui配置
└── package.json                               # 前端依赖配置
```

### 3.3 ECS Only模式运行时目录结构

> 本节详细列出ECS Only模式运行时的所有目录和文件，包括docker镜像、日志、任务执行、模板、临时文件、测试数据和镜像构建

#### 3.3.1 运行时目录概览

```
{ECS_LOCAL_STORAGE_ROOT}/       # 如 /data/chipcore 或 E:/LogicCore
├── jobs/                       # 任务执行目录（运行时动态生成）
├── docker/                     # Docker相关目录
├── templates/                  # 工具模板文件
├── temp/                       # 临时上传目录（运行时动态生成）
├── logs/                       # 任务日志目录（运行时动态生成）
├── test_data/                  # 测试数据目录
└── build_images/               # 镜像构建脚本
```

#### 3.3.2 docker目录 - Docker镜像存储

```
docker/
├── images/                                    # 本地镜像存储目录
│   ├── sdc/                                   # SDC工具镜像目录
│   │   ├── logiccore_sdc-generator_latest.tar # SDC最新镜像（~694MB）
│   │   └── logiccore_sdc-generator-multi_v1.0.0.tar  # SDC多页面版本镜像
│   │
│   └── upf/                                   # UPF工具镜像目录
│       ├── logiccore_upf-generator_latest.tar # UPF最新镜像（~693MB）
│       └── logiccore_upf-generator-multi_v1.0.0.tar  # UPF多页面版本镜像
│
├── volumes/                                   # Docker数据卷目录（空）
└── images.txt                                 # 镜像列表说明文件

功能说明：
- 存储预构建的Docker镜像tar文件
- Worker启动时自动加载镜像到Docker
- 避免每次从远程仓库拉取镜像
- 支持离线部署和快速启动
```

#### 3.3.3 logs目录 - 任务执行日志

```
logs/
└── {taskId}/                                  # 按任务ID组织的日志目录
    ├── initial.log                            # 初始化日志（~30KB）
    │   └── 记录任务创建、文件上传、数据库初始化
    │   └── 生成位置：utils/task-logger.ts:33
    │
    ├── worker_{timestamp}.log                 # Worker执行日志（~50-60KB）
    │   └── 记录Worker完整执行流程、容器操作
    │   └── 生成位置：workers/toolWorker.py:179
    │
    ├── container.log                          # 容器标准输出日志（~4KB）
    │   └── 记录Docker容器执行输出
    │   └── 生成位置：workers/toolWorker.py:1744
    │
    ├── container_execution.log                # 容器执行详细日志（~11KB）
    │   └── 记录容器启动、执行的详细信息
    │   └── 生成位置：workers/toolWorker.py:1487
    │
    ├── execution.log                          # 工具执行日志（~2KB）
    │   └── 汇总任务执行关键节点
    │   └── 生成位置：workers/toolWorker.py:1767
    │
    ├── sdc_gen.log / upf_gen.log              # 工具生成日志（~1KB）
    │   └── 记录SDC/UPF文件生成过程
    │   └── 生成位置：tools/sdc_dg_chk.py:2662 或 tools/upf_dg_chk.py:2271
    │
    ├── sdc_dg.log / upf_dg.log                # 工具数据组日志
    │   └── 记录工具内部数据处理信息
    │   └── 生成位置：tools/sdc_dg_gen.py:1820 或 tools/upf_dg_gen.py:2202
    │
    ├── chk_sht.rpt                            # Sheet检查报告
    │   └── 记录单个Sheet的检查结果
    │   └── 生成位置：tools/sdc_dg_gen.py, tools/sdc_dg_chk.py, tools/upf_dg_gen.py, tools/upf_dg_chk.py
    │
    ├── full_chk.rpt                           # 完整检查报告
    │   └── 汇总所有Sheet的检查结果
    │   └── 生成位置：同chk_sht.rpt，同时写入full_chk.rpt
    │
    └── full_msg.log                           # 完整消息日志
        └── 记录所有级别（info/warn/error/fatal）的消息
        └── 生成位置：tools/sdc_dg_gen.py, tools/sdc_dg_chk.py, tools/upf_dg_gen.py, tools/upf_dg_chk.py

日志文件说明：
1. initial.log：任务初始化时由TaskLogger类创建（task-logger.ts）
2. worker_{timestamp}.log：Worker进程执行时的主日志，包含时间戳
3. container.log：Docker容器的stdout/stderr输出
4. container_execution.log：记录容器生命周期操作的详细日志
5. execution.log：从容器内复制的工具执行日志
6. sdc_gen.log / upf_gen.log：数据组检查工具（dg_chk）生成的日志
7. sdc_dg.log / upf_dg.log：数据组生成工具（dg_gen）生成的日志
8. chk_sht.rpt：单Sheet检查报告文件
9. full_chk.rpt：完整检查报告，用于DataChk结果展示
10. full_msg.log：包含所有消息的完整日志

日志生命周期：
- 创建时间：
  - initial.log: 任务初始化时（initializeTask）
  - worker_{timestamp}.log: Worker获取任务后创建
  - container*.log: 容器执行阶段生成
  - execution.log: 容器执行完成后从work目录复制
  - *_gen.log / *_dg.log: Python工具脚本执行时生成
  - *.rpt / full_msg.log: 数据校验（DataChk）时生成
- 保留时间：任务完成后2分钟（与下载期一致）
- 清理机制：cleanup.service定期清理过期日志

注意：文档中之前提到的datachk.log和submission.log在实际代码中并未找到对应生成逻辑，
相关日志内容已整合到worker_{timestamp}.log和initial.log中。
```

#### 3.3.4 jobs目录 - 任务执行工作目录

```
jobs/
└── {taskId}/                                  # 每个任务独立目录
    ├── input/                                 # 用户上传文件目录
    │   ├── SDC工具输入文件：
    │   │   ├── hier.yaml                      # 层次结构文件（~2KB）
    │   │   ├── vlog.v                         # Verilog源文件（~2KB）
    │   │   └── dcont.xlsx                     # 配置Excel文件（~20KB）
    │   │
    │   └── UPF工具输入文件：
    │       ├── hier.yaml                      # 层次结构文件（~2KB）
    │       ├── pvlog.v                        # 功耗Verilog文件（~1KB）
    │       ├── pobj.tcl                       # 功耗对象TCL脚本（~11KB）
    │       └── pcont.xlsx                     # 功耗配置Excel（~19-21KB）
    │
    ├── output/                                # 任务执行结果目录
    │   └── {taskId}_{toolType}_result.zip     # 结果压缩包
    │       └── 包含：outputs/, logs/, rpts/ 三个目录
    │
    ├── logs/                                  # 任务级日志目录（同3.3.3）
    │
    ├── work/                                  # 工作目录（执行后立即清理）
    │   └── {modName}/                         # 按模块名组织
    │       └── {toolType}/                    # 按工具类型组织（sdc/upf）
    │           ├── inputs/                    # 工具执行输入
    │           │   └── [复制自../../../input/]
    │           │
    │           ├── outputs/                   # 工具执行输出
    │           │   ├── SDC工具输出：
    │           │   │   ├── *.sdc              # 生成的SDC约束文件
    │           │   │   └── *.tcl              # 辅助TCL脚本
    │           │   │
    │           │   └── UPF工具输出：
    │           │       ├── *.upf              # 生成的UPF功耗文件
    │           │       └── *.tcl              # 辅助TCL脚本
    │           │── json/                      # 从excel表格需求转换来文件以及从容器来的文件
    │           │── intg/                      # 集成相关的sdc文件
    │           ├── logs/                      # 工具执行日志
    │           │   ├── setup.log              # 设置日志
    │           │   ├── check.log              # 检查日志
    │           │   ├── generation.log         # 生成日志
    │           │   └── validation.log         # 验证日志（UPF）
    │           │
    │           └── rpts/                      # 工具报告文件
    │               ├── summary.rpt            # 摘要报告
    │               ├── detail.rpt             # 详细报告
    │               └── error.rpt              # 错误报告（如有）
    │
    └── metadata.json                          # 任务元数据文件
        └── 包含：taskId, toolType, modName, status, timestamps等

目录生命周期：
- 创建时间：
  - input/: 任务初始化时创建并上传文件
  - work/: Worker获取任务后创建
  - output/: 工具执行完成后打包生成
- 清理时间：
  - work/: 结果打包完成后立即删除
  - input/ + output/: 任务完成2分钟后删除
```

#### 3.3.5 templates目录 - 工具模板文件

```
templates/
├── README.md                                  # 模板说明文档
│
├── sdcgen/                                    # SDC工具模板
│   ├── hier.yaml                              # SDC层次结构模板（~2KB）
│   ├── vlog.v                                 # SDC Verilog模板（~2KB）
│   ├── dcont.xlsx                             # SDC配置表模板（~20KB）
│   ├── dcont_org.xlsx                         # SDC原始配置表（~16KB）
│   └── sdcgen.zip                             # SDC模板打包（~19KB）
│
└── upfgen/                                    # UPF工具模板
    ├── hier.yaml                              # UPF层次结构模板（~2KB）
    ├── pvlog.v                                # UPF功耗Verilog模板（~1KB）
    ├── pobj.tcl                               # UPF功耗对象TCL模板（~11KB）
    ├── pcont.xlsx                             # UPF功耗配置表模板（~21KB）
    ├── pcont_org.xlsx                         # UPF原始配置表（~17KB）
    ├── pcont_org_bakup.xlsx                   # UPF配置表备份（~16KB）
    ├── pcell.tcl                              # UPF单元TCL模板（~2KB）
    ├── pcell.yaml                             # UPF单元YAML模板（~2KB）
    └── upfgen.zip                             # UPF模板打包（~18KB）

功能说明：
- 为用户提供标准模板下载
- 用于多页面初始化时的数据库结构初始化
- Excel模板定义了Sheet和Table的完整结构
- 模板文件可作为用户快速上手的示例
```

#### 3.3.6 temp目录 - 临时上传文件

```
temp/
└── {taskId}/                                  # 按任务ID组织的临时目录
    ├── SDC工具3文件上传：
    │   ├── hier.yaml                          # 用户上传的层次文件
    │   ├── vlog.v                             # 用户上传的Verilog文件
    │   └── dcont.xlsx                         # 用户上传的配置表
    │
    ├── UPF工具4文件上传：
    │   ├── hier.yaml                          # 用户上传的层次文件
    │   ├── pvlog.v                            # 用户上传的功耗Verilog
    │   ├── pobj.tcl                           # 用户上传的功耗对象TCL
    │   └── pcont.xlsx                         # 用户上传的功耗配置表
    │
    └── 中间处理文件（多页面模式）：
        ├── vardef.json                        # VarDef表数据（SDC/UPF共用）
        ├── clkdef.json                        # ClkDef表数据（SDC）
        ├── iodly.json                         # IODly表数据（SDC）
        ├── exp.json                           # Exp表数据（SDC）
        ├── pdomain.json                       # PDomain表数据（UPF，~39KB）
        ├── pmode.json                         # PMode表数据（UPF，~14KB）
        ├── pstrategy.json                     # PStrategy表数据（UPF，~49KB）
        └── objtmp.tcl                         # 临时对象TCL（UPF，~11KB）

目录生命周期：
- 创建时间：Initialize阶段用户提交时
- 使用时机：
  - Initialize: 解析Excel生成JSON
  - DataChk: 同步数据库到Excel并校验
  - Submit: Worker从temp复制到jobs/input
- 清理时间：
  - 正常流程：任务完成2分钟后
  - 异常流程：队列超时35分钟后或最大重试后
```

#### 3.3.7 test_data目录 - 测试数据集

```
test_data/
├── tools_collection/                          # 工具集合目录（25个文件）
│   └── [历史工具相关文件]
│
├── tools_images/                              # 工具图片目录（空）
│
└── upload_data/                               # 上传测试数据（10个子目录）
    ├── sdcgen/                                # SDC工具测试数据
    │   ├── hier.yaml                          # 测试层次文件（~2KB）
    │   ├── vlog.v                             # 测试Verilog文件（~2KB）
    │   ├── dcont.xlsx                         # 测试配置表（~20KB）
    │   └── dcont_bak.xlsx                     # 配置表备份（~18KB）
    │
    └── upfgen/                                # UPF工具测试数据
        ├── hier.yaml                          # 测试层次文件（~2KB）
        ├── pvlog.v                            # 测试功耗Verilog（~1KB）
        ├── pobj.tcl                           # 测试功耗对象TCL（~11KB）
        ├── pcont.xlsx                         # 测试功耗配置表（~19KB）
        ├── pcell.tcl                          # 测试单元TCL（~2KB）
        └── pcell.yaml                         # 测试单元YAML（~2KB）

功能说明：
- 提供完整的端到端测试数据
- 用于Windows和Linux环境测试
- 覆盖SDC和UPF两个工具的正常场景
- 文件大小和格式符合实际生产使用
```

#### 3.3.8 build_images目录 - Docker镜像构建

```
build_images/
├── sdcgen/                                    # SDC镜像构建目录
│   ├── docker_sdc_generator_ecsonly_win_Dockerfile  # Dockerfile（~2.7KB）
│   │   ├── Base: python:3.9-slim
│   │   ├── User: sdcuser (非root)
│   │   ├── Workdir: /app
│   │   ├── Dependencies: PyYAML, openpyxl等
│   │   └── Entrypoint: docker_sdc_entrypoint_ecsonly_win.sh
│   │
│   ├── docker_sdc_entrypoint_ecsonly_win.sh   # 容器入口脚本（~11KB）
│   │   ├── 环境变量验证
│   │   ├── 文件路径检查
│   │   ├── SDC工具执行
│   │   ├── 结果收集
│   │   └── 错误处理
│   │
│   ├── build_sdc_image_ecsonly_win.sh         # 镜像构建脚本（~27KB）
│   │   ├── Docker环境检查
│   │   ├── 镜像构建（docker build）
│   │   ├── 镜像打包（docker save）
│   │   ├── 保存到docker/images/sdc/
│   │   └── 构建验证
│   │
│   └── build_sdc_image_ecsonly_win - 副本.sh # 构建脚本备份（~16KB）
│
└── upfgen/                                    # UPF镜像构建目录
    ├── docker_upf_generator_ecsonly_win_Dockerfile  # Dockerfile（~2.7KB）
    │   ├── Base: python:3.9-slim
    │   ├── User: upfuser (非root)
    │   ├── Workdir: /app
    │   ├── Dependencies: PyYAML, openpyxl, TCL等
    │   └── Entrypoint: docker_upf_entrypoint_ecsonly_win.sh
    │
    ├── docker_upf_entrypoint_ecsonly_win.sh   # 容器入口脚本（~11KB）
    │   ├── 环境变量验证
    │   ├── 4文件路径检查
    │   ├── UPF工具执行
    │   ├── 功耗域处理
    │   ├── 结果收集
    │   └── 错误处理
    │
    ├── build_upf_image_ecsonly_win.sh         # 镜像构建脚本（~25KB）
    │   ├── Docker环境检查
    │   ├── 镜像构建（docker build）
    │   ├── 镜像打包（docker save）
    │   ├── 保存到docker/images/upf/
    │   └── 构建验证
    │
    ├── build_upf_image_ecsonly_win_backup.sh  # 构建脚本备份（~30KB）
    │
    └── test_*.js                              # 测试脚本（6个文件）
        ├── test_docker_image_linking.js       # 镜像链接测试（~9KB）
        ├── test_final_script_comparison.js    # 脚本对比测试（~4KB）
        ├── test_final_script_consistency.js   # 脚本一致性测试（~8KB）
        ├── test_upf_build_script_consistency.js # UPF构建一致性（~6KB）
        ├── test_upf_build_script_final.js     # UPF最终构建测试（~7KB）
        └── test_upf_image_build_fix.sh        # UPF镜像修复测试（~4KB）

构建流程：
1. 执行build_*_image_ecsonly_win.sh脚本
2. 基于Dockerfile构建镜像
3. 测试镜像基本功能
4. 导出为tar文件保存到docker/images/
5. 验证镜像可正常加载和运行
```

#### 3.3.9 目录空间占用统计
```
| 目录 | 典型大小 | 说明 |
|------|----------|------|
| docker/images/ | ~1.4GB | 2个工具镜像tar文件 |
| jobs/{taskId}/ | ~5-50MB | 单个任务（含输入输出） |
| logs/{taskId}/ | ~200KB-1MB | 单个任务日志 |
| temp/{taskId}/ | ~50-100KB | 单个任务临时文件 |
| templates/ | ~100KB | 所有模板文件 |
| test_data/ | ~200KB | 测试数据集 |
| build_images/ | ~100KB | 构建脚本（不含镜像） |

清理策略：
- jobs/: 任务完成2分钟后自动清理
- logs/: 随jobs/一起清理
- temp/: 任务完成2分钟后或超时后清理
- docker/images/: 手动管理，只在升级时更新
- templates/: 静态文件，不清理
- test_data/: 静态文件，不清理
- build_images/: 静态文件，不清理
```


## 第4章：环境配置和变量解析

> 本章详细阐述LogicCore项目ECS Only部署模式下的环境配置，包括所有环境变量的功能、应用场景、开发与生产环境的差异，以及生产部署的最佳实践和注意事项。

### 4.1 环境变量配置体系

#### 4.1.1 配置文件说明

项目使用环境变量来管理配置，主要涉及以下文件：

| 文件 | 用途 | 优先级 | 说明 |
|------|------|--------|------|
| `.env.example` | 配置模板和文档 | 低 | 提供所有可配置变量的说明 |
| `.env` | 基础配置文件 | 中 | 包含通用配置，提交到版本库 |
| `.env.local` | 本地覆盖配置 | 高 | 本地开发专用，不提交到版本库 |

> **重要提示**：`.env.local` 文件中的配置会覆盖 `.env` 文件中的同名变量，实际生产部署时需要根据环境调整。

#### 4.1.2 环境变量验证机制

系统使用Zod库进行环境变量验证（`src/config/env-validation.ts`），在应用启动时自动检查：

```typescript
// 验证流程
1. 加载 .env 和 .env.local
2. Zod Schema验证（类型、格式、必填项）
3. 类型转换（字符串→数字）
4. 启动失败：验证不通过时显示详细错误信息并退出
```

---

### 4.2 应用基础配置

| 变量名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|------|------|
| `NODE_ENV` | enum | `development` | 否 | 运行环境：`development` \| `production` \| `test` |
| `PORT` | number | `8080` | 否 | API服务监听端口 |
| `HOST` | string | `0.0.0.0` | 否 | 服务监听地址 |
| `FRONTEND_URL` | URL | `http://localhost:3000` | 否 | 前端地址（用于CORS、回调） |

**应用场景**：
- **开发环境**：`NODE_ENV=development`，启用详细日志、Swagger文档、热重载
- **生产环境**：`NODE_ENV=production`，优化性能、关闭调试功能

**生产部署注意事项**：
- 生产环境必须设置 `NODE_ENV=production`
- `FRONTEND_URL` 应设置为实际的生产域名（如 `https://chipcore.example.com`）
- 建议使用反向代理（Nginx）处理SSL，后端监听本地端口

---

### 4.3 数据库和缓存配置

#### 4.3.1 数据库连接配置

| 变量名 | 类型 | 示例值 | 必填 | 说明 |
|--------|------|--------|------|------|
| `DATABASE_URL` | URL | `postgresql://user:pass@host:5432/db` | **是** | PostgreSQL连接字符串 |
| `DB_CONNECTION_LIMIT` | number | `30` | 否 | Prisma连接池最大连接数 |
| `DB_POOL_TIMEOUT` | number | `30` | 否 | 连接池等待超时（秒） |
| `DB_CONNECT_TIMEOUT` | number | `10000` | 否 | 连接建立超时（毫秒） |
| `DB_QUERY_TIMEOUT` | number | `30000` | 否 | 查询执行超时（毫秒） |

**连接池计算依据**（`env-validation.ts:25-28`）：
```
PostgreSQL max_connections = 50
基础连接：10个（定时服务、健康检查）
并发任务：16 × 2 = 32个（每个任务2个连接）
总需求：42个
连接池设置：30（占max_connections的60%）
保留20个给超级用户和其他操作
```

**生产部署注意事项**：

1. **PostgreSQL服务器配置**（`postgresql.conf`）：
   ```ini
   max_connections = 50
   shared_buffers = 256MB
   effective_cache_size = 1GB
   maintenance_work_mem = 64MB
   checkpoint_completion_target = 0.9
   wal_buffers = 16MB
   default_statistics_target = 100
   random_page_cost = 1.1
   effective_io_concurrency = 200
   work_mem = 2621kB  # 根据并发数调整
   min_wal_size = 1GB
   max_wal_size = 4GB
   ```

2. **数据库用户权限**：
   ```sql
   -- 创建应用用户
   CREATE USER chipcore WITH PASSWORD 'strong_password_here';

   -- 授予必要权限
   GRANT CONNECT ON DATABASE chipcore_prod TO chipcore;
   GRANT USAGE ON SCHEMA public TO chipcore;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chipcore;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chipcore;

   -- 允许后续创建表的权限
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chipcore;
   ```

#### 4.3.2 Redis配置

| 变量名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|------|------|
| `REDIS_URL` | URL | `redis://localhost:6379/0` | **是** | Redis连接字符串 |
| `REDIS_CONNECT_TIMEOUT` | number | `10000` | 否 | 连接超时（毫秒） |
| `REDIS_COMMAND_TIMEOUT` | number | `5000` | 否 | 命令超时（毫秒） |
| `REDIS_MAX_RETRIES` | number | `3` | 否 | 最大重试次数 |
| `REDIS_RETRY_DELAY` | number | `100` | 否 | 重试延迟（毫秒） |
| `REDIS_KEEP_ALIVE` | number | `30000` | 否 | 连接保活（毫秒） |

**应用场景**：
- **任务队列**：存储待执行任务（`task_queue` List）
- **活跃任务集合**：跟踪正在执行的任务（`active_task_ids` Set）
- **分布式锁**：防止任务重复处理（`taskid_lock:{taskId}`）
- **会话缓存**：用户会话和临时数据存储
- **WebSocket状态**：实时推送任务状态

**生产部署注意事项**：

1. **Redis持久化配置**（`redis.conf`）：
   ```ini
   # RDB持久化（快照）
   save 900 1
   save 300 10
   save 60 10000

   # AOF持久化（追加日志）
   appendonly yes
   appendfsync everysec

   # 内存管理
   maxmemory 2gb
   maxmemory-policy allkeys-lru

   # 慢查询日志
   slowlog-log-slower-than 10000
   slowlog-max-len 128
   ```

2. **内存规划**：
   - 每个任务在队列中约占用1KB
   - 48个任务队列约占用48KB
   - 活跃任务集合约占用1KB
   - 预留内存用于过期键和碎片
   - **建议**：至少2GB内存，生产环境4GB+

---

### 4.4 安全认证配置

| 变量名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|------|------|
| `JWT_SECRET` | string | 最小32字符 | **是** | JWT签名密钥 |
| `JWT_EXPIRES_IN` | string | `1d` | 否 | Access Token有效期 |
| `JWT_REFRESH_EXPIRES_IN` | string | `30d` | 否 | Refresh Token有效期 |
| `JWT_ISSUER` | string | `chipcore-api` | 否 | JWT签发者标识 |
| `COOKIE_SECRET` | string | 最小32字符 | **是** | Cookie签名密钥 |

**应用场景**：
- **用户认证**：登录后颁发JWT Token
- **API保护**：验证请求头中的Token
- **权限控制**：基于Token中的用户角色

**生产部署注意事项**：

1. **密钥生成**：
   ```bash
   # 使用OpenSSL生成安全的随机密钥
   JWT_SECRET=$(openssl rand -base64 64)
   COOKIE_SECRET=$(openssl rand -base64 64)
   ```

2. **密钥管理**：
   - **不要**将密钥硬编码在代码中
   - **不要**将密钥提交到版本控制
   - 使用密钥管理服务（HashiCorp Vault、AWS Secrets Manager）
   - 定期轮换密钥（建议每90天）

3. **Token有效期建议**：
   - 开发环境：`JWT_EXPIRES_IN=1d`（方便调试）
   - 生产环境：`JWT_EXPIRES_IN=1h`（安全性优先）
   - Refresh Token：`30d`（长期有效）

---

### 4.5 ECS Only部署模式配置

#### 4.5.1 部署模式配置

| 变量名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|------|------|
| `DEPLOYMENT_MODE` | enum | `ecs_only` | 否 | 部署模式：`ecs_only` \| `ecs_oss_acr` |

**模式对比**：

| 特性 | ECS Only | ECS+OSS+ACR |
|------|----------|--------------|
| 文件存储 | ECS本地磁盘 | 阿里云OSS |
| 镜像管理 | 本地Docker镜像 | 阿里云ACR |
| 适用场景 | 开发、单机部署 | 生产、分布式部署 |
| 成本 | 低 | 中等 |
| 可扩展性 | 单机受限 | 易于横向扩展 |

#### 4.5.2 本地存储路径配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ECS_LOCAL_STORAGE_ROOT` | `/data/chipcore` | 本地存储根目录 |
| `ECS_JOBS_DIR` | `/data/chipcore/jobs` | 任务执行目录 |
| `ECS_TEMPLATES_DIR` | `/data/chipcore/templates` | 工具模板目录 |
| `ECS_DOCKER_DIR` | `/data/chipcore/docker` | Docker镜像目录 |
| `TEMP_UPLOAD_DIR` | 动态计算 | 临时上传目录 |
| `TASK_LOGS_DIR` | 动态计算 | 任务日志目录 |

**路径计算逻辑**（`src/config/paths.ts`）：
- `TEMP_UPLOAD_DIR` 未设置时：使用 `{PROJECT_ROOT}/../temp`
- `TASK_LOGS_DIR` 未设置时：使用 `{PROJECT_ROOT}/logs`

---

### 4.6 任务执行配置

#### 4.6.1 队列和超时配置

| 变量名 | 默认值 | 说明 | 应用场景 |
|--------|--------|------|----------|
| `TASK_QUEUE_NAME` | `task_queue` | Redis队列名称 | 多环境隔离 |
| `TASK_MAX_RETRIES` | `3` | 最大重试次数 | 任务失败重试 |
| `TASK_TIMEOUT` | `1800000` | 执行超时（30分钟） | 防止任务hang住 |
| `TASK_POLLING_INTERVAL` | `3000` | 轮询间隔（3秒） | Worker从队列获取任务 |
| `MAX_QUEUE_LENGTH` | `48` | 队列最大长度 | 限制待处理任务数 |
| `QUEUE_WAIT_TIMEOUT_MINUTES` | `35` | 队列等待超时 | 任务在队列中最长等待时间 |

**超时时间计算**：
```
队列等待超时：35分钟
容器执行超时：3分钟（`CONTAINER_EXECUTION_TIMEOUT_MINUTES`）
总任务生命周期：约40分钟
```

#### 4.6.2 资源配置

| 变量名 | 默认值 | 说明 | 调优建议 |
|--------|--------|------|----------|
| `ECS_TOTAL_CPU` | `16` | 服务器总CPU核心数 | 根据`lscpu`设置 |
| `ECS_TOTAL_MEMORY_GB` | `64` | 服务器总内存（GB） | 根据`free -h`设置 |
| `JOB_CPU_REQUEST` | `1` | 单任务CPU需求 | 与工具复杂度相关 |
| `JOB_MEMORY_REQUEST_GB` | `2` | 单任务内存需求（GB） | 与设计规模相关 |
| `MAX_CONCURRENT_TASKS` | `16` | 最大并发任务数 | CPU/内存约束 |
| `WORKER_COUNT` | `4` | Worker进程数量 | 根据CPU核心数调整 |

**并发计算公式**：
```
最大并发任务数 = min(
  (ECS_TOTAL_CPU / JOB_CPU_REQUEST),
  (ECS_TOTAL_MEMORY_GB / JOB_MEMORY_REQUEST_GB),
  MAX_CONCURRENT_TASKS
)
```

**生产环境调优建议**：

| 服务器配置 | ECS_TOTAL_CPU | ECS_TOTAL_MEMORY_GB | JOB_CPU_REQUEST | JOB_MEMORY_REQUEST_GB | MAX_CONCURRENT_TASKS |
|------------|---------------|---------------------|-----------------|----------------------|----------------------|
| 小型 | 8 | 32 | 1 | 4 | 8 |
| 中型 | 16 | 64 | 2 | 8 | 8 |
| 大型 | 32 | 128 | 2 | 8 | 16 |

#### 4.6.3 清理配置

| 变量名 | 默认值 | 说明 | 注意事项 |
|--------|--------|------|----------|
| `ECS_TEMP_CLEANUP_INTERVAL` | `120` | 临时文件清理间隔（秒） | 2分钟自动清理 |
| `ECS_DOWNLOAD_TIMEOUT` | `120` | 下载超时（秒） | 用户2分钟内必须下载 |
| `ECS_FAILED_TASK_CLEANUP_DELAY` | `300` | 失败任务清理延迟（秒） | 5分钟后清理失败任务 |
| `ECS_LOG_RETENTION_HOURS` | `24` | 日志保留时间（小时） | 24小时后自动清理 |
| `ECS_MAX_STORAGE_SIZE` | `50GB` | 最大存储限制 | 超过限制触发清理 |

---

### 4.7 文件上传和存储配置

#### 4.7.1 文件上传配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MAX_FILE_SIZE` | `104857600` | 单文件最大100MB |
| `MAX_FILES` | `10` | 单次最多上传10个文件 |

**支持的文件类型**（`src/config/app.config.ts:81`）：
```
 ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls']
```

**工具文件要求**：

| 工具 | 必需文件 | 可选文件 | 最大总大小 |
|------|----------|----------|-----------|
| SDC Generator | `hier.yaml`, `vlog.v`, `dcont.xlsx` | `custom.tcl` | ~5MB |
| UPF Generator | `hier.yaml`, `pvlog.v`, `pobj.tcl`, `pcont.xlsx` | `power.tcl` | ~5MB |

#### 4.7.2 路径配置详解

**临时上传目录**（`TEMP_UPLOAD_DIR`）：
- **作用**：存储用户上传的原始文件（Initialize阶段）
- **生命周期**：任务初始化 → 执行 → 完成 → 2分钟后清理
- **安全要求**：不能使用系统`/tmp`目录（可能被系统清理）
- **开发环境**：`/home/user/work/LogicCore/temp`
- **生产环境**：`/data/chipcore/temp`

**任务日志目录**（`TASK_LOGS_DIR`）：
- **作用**：存储任务执行日志
- **开发环境**：`/home/user/work/LogicCore/logs`
- **生产环境**：`/data/chipcore/logs`

**模板文件目录**（`TEMPLATE_ROOT_PATH`）：
- **作用**：存储工具模板文件，用户下载参考
- **开发环境**：`/home/user/work/LogicCore/templates`
- **生产环境**：`/data/chipcore/templates`

---

### 4.8 支付和邮件配置

#### 4.8.1 支付宝配置

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ALIPAY_APP_ID` | **是** | 支付宝应用ID |
| `ALIPAY_APP_PRIVATE_KEY_PATH` | **是** | 应用私钥文件路径 |
| `ALIPAY_PUBLIC_KEY_PATH` | **是** | 支付宝公钥文件路径 |
| `ALIPAY_NOTIFY_URL` | **是** | 异步通知回调URL |

**生产部署注意事项**：
1. 区分沙箱环境和生产环境
2. 私钥文件权限设置为`600`
3. 回调URL必须公网可访问
4. 启用RSA2签名方式（推荐）

#### 4.8.2 微信支付配置

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `WECHAT_APP_ID` | **是** | 微信AppID |
| `WECHAT_MCH_ID` | **是** | 商户号 |
| `WECHAT_CERTIFICATE_SERIAL_NO` | **是** | 证书序列号 |
| `WECHAT_API_V3_KEY` | **是** | APIv3密钥（32字符） |
| `WECHAT_NOTIFY_URL` | **是** | 异步通知回调URL |

#### 4.8.3 邮件配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EMAIL_HOST` | - | SMTP服务器地址 |
| `EMAIL_PORT` | `587` | SMTP端口 |
| `EMAIL_SECURE` | `false` | 使用TLS（587端口）或SSL（465端口） |
| `EMAIL_USER` | - | 发件邮箱账号 |
| `EMAIL_PASS` | - | 邮箱授权码（非登录密码） |
| `EMAIL_FROM` | `noreply@chipcore.com` | 发件人显示 |

**常用邮箱配置**：
- **126邮箱**：`smtp.126.com:465`（SSL）
- **QQ邮箱**：`smtp.qq.com:587`（STARTTLS）
- **Gmail**：`smtp.gmail.com:587`（STARTTLS，需应用专用密码）

---

### 4.9 Docker和镜像配置

#### 4.9.1 镜像缓存配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `LOCAL_DOCKER_REGISTRY_ENABLED` | `true` | 启用本地镜像缓存 |
| `LOCAL_IMAGES_CACHE_SIZE` | `20GB` | 镜像缓存大小限制 |

**镜像目录结构**：
```
{ECS_DOCKER_DIR}/
├── images/
│   ├── sdc/
│   │   └── logiccore_sdc-generator_latest.tar  # ~694MB
│   └── upf/
│       └── logiccore_upf-generator_latest.tar  # ~693MB
└── volumes/  # Docker数据卷（空）
```

#### 4.9.2 容器执行配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CONTAINER_EXECUTION_TIMEOUT_MINUTES` | `3` | 容器执行超时（分钟） |
| `DOCKER_REGISTRY` | `registry.cn-hangzhou.aliyuncs.com` | Docker仓库地址 |
| `DOCKER_NAMESPACE` | `chipcore` | 镜像命名空间 |
| `DOCKER_PULL_TIMEOUT` | `300000` | 镜像拉取超时（毫秒） |

---

### 4.10 环境配置示例

#### 4.10.1 开发环境配置（Windows WSL2）

```bash
# app/backend/.env.local

# ========== 基础配置 ==========
PORT=8080
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# ========== 安全配置 ==========
COOKIE_SECRET=YOUR_VERY_SECRET_COOKIE_KEY_12345678901234567890
JWT_SECRET=YOUR_SUPER_SECRET_JWT_KEY_12345678901234567890
JWT_EXPIRES_IN=1d

# ========== 数据库和Redis（WSL2本地Docker）==========
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/chipcore_dev
REDIS_URL=redis://localhost:6379/0

# ========== 数据库连接池配置 ==========
DB_CONNECTION_LIMIT=30
DB_POOL_TIMEOUT=30
DB_CONNECT_TIMEOUT=10000
DB_QUERY_TIMEOUT=30000

# ========== Redis连接配置 ==========
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100
REDIS_KEEP_ALIVE=30000

# ========== 临时目录配置（WSL2路径）==========
TEMP_UPLOAD_DIR="/home/tommy2025/work/LogicCore/temp"
TASK_LOGS_DIR="/home/tommy2025/work/LogicCore/logs"

# ========== ECS Only模式配置 ==========
DEPLOYMENT_MODE="ecs_only"
ECS_LOCAL_STORAGE_ROOT="/home/tommy2025/work/LogicCore"
ECS_JOBS_DIR="/home/tommy2025/work/LogicCore/jobs"
ECS_TEMPLATES_DIR="/home/tommy2025/work/LogicCore/templates"
ECS_DOCKER_DIR="/home/tommy2025/work/LogicCore/docker"

# ========== 资源配置（降低用于开发测试）==========
ECS_TOTAL_CPU=16
ECS_TOTAL_MEMORY_GB=64
JOB_CPU_REQUEST=1
JOB_MEMORY_REQUEST_GB=2
WORKER_ID=worker-main-01
ECS_INSTANCE_ID=ecs-single-node-dev

# ========== 队列和并发配置 ==========
TASK_QUEUE_NAME=task_queue
MAX_QUEUE_LENGTH=48
QUEUE_WAIT_TIMEOUT_MINUTES=35
MAX_CONCURRENT_TASKS=16
WORKER_COUNT=4
MAX_CONCURRENT_PER_WORKER=4

# ========== 清理配置 ==========
ECS_TEMP_CLEANUP_INTERVAL=120
ECS_DOWNLOAD_TIMEOUT=120
ECS_FAILED_TASK_CLEANUP_DELAY=300
ECS_LOG_RETENTION_HOURS=24
CLEANUP_INTERVAL_MINUTES=60
HEALTH_CHECK_INTERVAL_MINUTES=5
```

**Windows WSL2路径说明**：
- 使用`/home/tommy2025/work/LogicCore`而非`/mnt/e/...`
- 确保Docker Desktop可访问WSL2文件系统
- 避免跨文件系统挂载（性能问题）

#### 4.10.2 前端开发配置

```bash
# app/frontend/.env

VITE_API_BASE_URL=http://localhost:8080
```

#### 4.10.3 生产环境配置清单

```bash
# ========== 生产环境基础配置 ==========
PORT=8080
FRONTEND_URL=https://chipcore.example.com
NODE_ENV=production
HOST=0.0.0.0

# ========== 安全配置（使用强随机密钥）==========
COOKIE_SECRET=$(openssl rand -base64 64)
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d

# ========== 数据库配置（生产数据库）==========
DATABASE_URL=postgresql://chipcore_user:STRONG_PASSWORD_HERE@prod-db.internal:5432/chipcore_prod
DB_CONNECTION_LIMIT=30
DB_POOL_TIMEOUT=30
DB_CONNECT_TIMEOUT=10000
DB_QUERY_TIMEOUT=30000
DB_STATEMENT_TIMEOUT=30000

# ========== Redis配置（生产Redis）==========
REDIS_URL=redis://:REDIS_PASSWORD_HERE@prod-redis.internal:6379/0
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100
REDIS_KEEP_ALIVE=30000

# ========== 部署模式配置 ==========
DEPLOYMENT_MODE="ecs_only"

# ========== ECS本地存储路径配置 ==========
ECS_LOCAL_STORAGE_ROOT="/data/chipcore"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates"
ECS_DOCKER_DIR="/data/chipcore/docker"
TEMP_UPLOAD_DIR="/data/chipcore/temp"
TASK_LOGS_DIR="/data/chipcore/logs"

# ========== 资源配置（根据实际服务器配置）==========
ECS_TOTAL_CPU=16
ECS_TOTAL_MEMORY_GB=64
JOB_CPU_REQUEST=2
JOB_MEMORY_REQUEST_GB=8
WORKER_ID=worker-prod-01
ECS_INSTANCE_ID=ecs-prod-node-01

# ========== 队列和并发配置 ==========
TASK_QUEUE_NAME=task_queue
MAX_QUEUE_LENGTH=48
QUEUE_WAIT_TIMEOUT_MINUTES=35
MAX_CONCURRENT_TASKS=8

# ========== 清理配置 ==========
ECS_TEMP_CLEANUP_INTERVAL=120
ECS_DOWNLOAD_TIMEOUT=120
ECS_FAILED_TASK_CLEANUP_DELAY=300
ECS_LOG_RETENTION_HOURS=24

# ========== Docker配置 ==========
LOCAL_DOCKER_REGISTRY_ENABLED="true"
LOCAL_IMAGES_CACHE_SIZE="20GB"
DOCKER_REGISTRY=registry.cn-hangzhou.aliyuncs.com
DOCKER_NAMESPACE=chipcore

# ========== 邮件配置（生产邮件服务）==========
EMAIL_HOST=smtp.provider.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=noreply@chipcore.com
EMAIL_PASS=EMAIL_APP_SPECIFIC_PASSWORD
EMAIL_FROM=noreply@chipcore.com
```

#### 4.10.4 生产部署检查清单

**服务器准备**：

- [ ] 操作系统：CentOS 7+ / Ubuntu 20.04+
- [ ] CPU：最少8核，推荐16核+
- [ ] 内存：最少32GB，推荐64GB+
- [ ] 磁盘：最少200GB SSD
- [ ] Docker：20.10+版本
- [ ] Python：3.9+版本
- [ ] Node.js：18+版本

**目录创建和权限**：

```bash
# 创建目录结构
sudo mkdir -p /data/chipcore/{jobs,templates,docker,temp,logs}

# 设置目录权限
sudo chown -R $USER:$USER /data/chipcore
chmod -R 755 /data/chipcore

# 创建docker镜像目录
mkdir -p /data/chipcore/docker/images/{sdc,upf}
```

**数据库准备**：

```bash
# 1. 安装PostgreSQL 14
sudo apt install postgresql-14

# 2. 创建数据库和用户
sudo -u postgres psql
CREATE DATABASE chipcore_prod;
CREATE USER chipcore_user WITH ENCRYPTED PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE chipcore_prod TO chipcore_user;

# 3. 配置PostgreSQL（/etc/postgresql/14/main/postgresql.conf）
sudo vi /etc/postgresql/14/main/postgresql.conf
# 修改：max_connections = 50

# 4. 重启PostgreSQL
sudo systemctl restart postgresql
```

**Redis准备**：

```bash
# 1. 安装Redis
sudo apt install redis-server

# 2. 配置Redis（/etc/redis/redis.conf）
sudo vi /etc/redis/redis.conf
# 修改：bind 0.0.0.0
# 修改：requirepass your_redis_password
# 修改：maxmemory 2gb
# 修改：maxmemory-policy allkeys-lru

# 3. 重启Redis
sudo systemctl restart redis-server
```

**镜像准备**：

```bash
# 1. 将预构建的镜像tar文件上传到服务器
scp logiccore_sdc-generator_latest.tar user@server:/data/chipcore/docker/images/sdc/
scp logiccore_upf-generator_latest.tar user@server:/data/chipcore/docker/images/upf/

# 2. 加载镜像到Docker
docker load -i /data/chipcore/docker/images/sdc/logiccore_sdc-generator_latest.tar
docker load -i /data/chipcore/docker/images/upf/logiccore_upf-generator_latest.tar

# 3. 验证镜像
docker images | grep logiccore
```

**服务启动**：

```bash
# 1. 安装依赖
cd app
npm run install:all

# 2. 初始化数据库
npm run db:push
npm run db:seed

# 3. 启动服务
npm run build
npm run start

# 4. 启动Worker（单独终端）
cd app/backend
npm run dev:worker
```

#### 4.10.5 生产环境安全加固

**网络安全**：

```bash
# 1. 配置防火墙
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# 2. 限制数据库访问（仅本地）
# PostgreSQL配置：listen_addresses = 'localhost'
# Redis配置：bind 127.0.0.1

# 3. 使用反向代理（Nginx）
sudo apt install nginx
```

**Nginx配置示例**（`/etc/nginx/sites-available/chipcore`）：

```nginx
upstream backend {
    server localhost:8080;
}

server {
    listen 80;
    server_name chipcore.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chipcore.example.com;

    ssl_certificate /etc/letsencrypt/live/chipcore.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chipcore.example.com/privkey.pem;

    # 前端静态文件
    location / {
        root /var/www/chipcore/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket代理
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**日志监控**：

```bash
# 1. 配置日志轮转（/etc/logrotate.d/chipcore）
/data/chipcore/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
}

# 2. 监控磁盘空间
df -h /data/chipcore

# 3. 监控任务队列
docker exec -it redis redis-cli LLEN task_queue
```

---

### 4.11 路径兼容性说明

#### 4.11.1 跨平台路径处理

`toolWorker.py`实现了跨平台路径规范化函数`normalize_docker_path()`：

```python
def normalize_docker_path(host_path: str) -> str:
    """
    规范化Docker挂载路径，确保Windows和Linux兼容性
    """
    normalized = os.path.normpath(host_path)

    if platform.system() == 'Windows':
        # 转换反斜杠为正斜杠
        normalized = normalized.replace('\\', '/')

        # 处理Windows驱动器路径 (C: -> /c)
        if len(normalized) >= 2 and normalized[1] == ':':
            drive = normalized[0].lower()
            path_part = normalized[2:] if len(normalized) > 2 else ''
            normalized = f'/{drive}{path_part}'

    return normalized
```

#### 4.11.2 路径格式对照表

| 平台 | 配置格式 | 示例 | 说明 |
|------|---------|------|------|
| **Windows (WSL2)** | WSL路径格式 | `/home/user/work/LogicCore` | 推荐，性能最佳 |
| **Windows (原生)** | 转换格式 | `/c/project/LogicCore` | 自动转换C:为/c |
| **Linux** | 绝对路径 | `/data/chipcore` | 标准Linux路径 |

**路径转换示例**：

| 原始Windows路径 | 规范化后路径 | 说明 |
|----------------|-------------|------|
| `E:\work\LogicCore` | `/e/work/LogicCore` | WSL2自动转换 |
| `C:\Users\user\project` | `/c/Users/user/project` | WSL2自动转换 |
| `/mnt/c/work/LogicCore` | `/c/work/LogicCore` | 工具自动优化 |

**最佳实践**：
1. **开发环境**：使用WSL2路径格式（`/home/user/...`）
2. **生产环境**：使用Linux绝对路径（`/data/chipcore`）
3. **避免混合**：不要混用不同路径格式
4. **权限检查**：确保运行用户有目录读写权限

#### 4.11.3 目录权限设置

```bash
# ECS本地存储目录权限
sudo chown -R appuser:appuser /data/chipcore
chmod -R 755 /data/chipcore

# 临时目录权限（需要容器内用户可写）
chmod 777 /data/chipcore/temp
chmod 777 /data/chipcore/logs

# Docker目录权限
chmod 755 /data/chipcore/docker
```

---

下一部分：[Part 1 - 数据库设计、API路由、前端页面、核心业务功能](ecsonly_multipage_dev_opus45_1.md)

