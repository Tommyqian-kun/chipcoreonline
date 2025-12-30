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
│   ├── index.ts                               # 应用入口（523行）
│   │                                          # - Express服务器配置
│   │                                          # - 路由挂载
│   │                                          # - ECS Only模式初始化
│   │                                          # - WebSocket服务配置
│   │
│   ├── config/                                # 配置模块（15个文件）
│   │   ├── env-validation.ts                  # 环境变量Zod验证
│   │   ├── paths.ts                           # ECS本地路径配置
│   │   ├── redis.ts                           # Redis连接配置
│   │   ├── database.ts                        # PostgreSQL配置
│   │   ├── logger.ts                          # Pino日志配置
│   │   ├── app.config.ts                      # 应用全局配置
│   │   ├── tool-types.config.ts               # 工具类型配置（sdcgen/upfgen）
│   │   ├── unified-tool.config.ts             # 统一工具配置
│   │   ├── alipay.ts                          # 支付宝SDK配置
│   │   └── wechatpay.ts                       # 微信支付SDK配置
│   │
│   ├── controllers/                           # 控制器层（17个文件）
│   │   ├── sdc_thrpages.controller.ts         # SDC多页面控制器（1351行，17个函数）
│   │   │   ├── initializeTask()               # 初始化任务，解析上传文件
│   │   │   ├── getTaskSheets()                # 获取Sheet列表
│   │   │   ├── getSheetData()                 # 获取表格数据
│   │   │   ├── saveSheetData()                # 保存表格数据
│   │   │   ├── checkTaskData()                # DataChk数据校验
│   │   │   ├── submitTask()                   # 提交任务执行
│   │   │   ├── getTaskStatus()                # 获取任务状态
│   │   │   ├── downloadTaskResult()           # 下载结果文件
│   │   │   └── cleanupTaskData()              # 清理任务数据
│   │   │
│   │   ├── upf_thrpages.controller.ts         # UPF多页面控制器（1224行，15个函数）
│   │   │   └── [与SDC类似的函数结构]
│   │   │
│   │   ├── task.controller.ts                 # 任务基础控制器（19KB）
│   │   ├── auth.controller.ts                 # 认证控制器（7KB）
│   │   ├── admin.controller.ts                # 管理后台控制器（17KB）
│   │   ├── order.controller.ts                # 订单控制器
│   │   ├── payment.controller.ts              # 支付控制器
│   │   ├── subscription.controller.ts         # 订阅控制器
│   │   ├── download.controller.ts             # 下载控制器（5KB）
│   │   └── ecs-file.controller.ts             # ECS文件控制器（11KB）
│   │
│   ├── services/                              # 服务层（41个文件）
│   │   ├── excel_thrpages.service.ts          # ⭐多页面Excel核心服务（145KB，3994行，60个函数）
│   │   │   ├── analyzeTemplateFile()          # 解析Excel模板
│   │   │   ├── initializeSdcDatabaseSchemaHardcoded()  # 初始化SDC数据库
│   │   │   ├── initializeUpfDatabaseSchemaHardcoded()  # 初始化UPF数据库
│   │   │   ├── updateUpfDynamicTableColumns() # 更新UPF动态列
│   │   │   ├── parseExcelFile()               # 解析Excel文件
│   │   │   ├── saveTableDataToDatabase()      # 保存表格数据
│   │   │   ├── syncDatabaseToExcel()          # 同步数据到Excel
│   │   │   └── [50+个辅助函数]
│   │   │
│   │   ├── task.service.ts                    # 任务服务（25KB）
│   │   ├── ecs-local-storage.service.ts       # ⭐ECS本地存储服务（13KB）
│   │   ├── cleanup.service.ts                 # 清理服务（22KB）
│   │   ├── task-queue.service.ts              # 任务队列服务（8KB）
│   │   ├── task-timeout.service.ts            # 任务超时服务（16KB）
│   │   ├── task-logger.service.ts             # 任务日志服务（6KB）
│   │   ├── task-state-manager.service.ts      # 任务状态管理（11KB）
│   │   ├── task-retry.service.ts              # 任务重试服务（8KB）
│   │   ├── auth.service.ts                    # 认证服务（8KB）
│   │   ├── admin.service.ts                   # 管理服务（32KB）
│   │   ├── order.service.ts                   # 订单服务（14KB）
│   │   ├── payment.service.ts                 # 支付服务（3KB）
│   │   ├── subscription.service.ts            # 订阅服务（1KB）
│   │   ├── plan.service.ts                    # 计划服务
│   │   ├── download.service.ts                # 下载服务（9KB）
│   │   ├── monitoring.service.ts              # 监控服务（11KB）
│   │   ├── websocket.service.ts               # WebSocket服务（9KB）
│   │   ├── tool-execution.service.ts          # 工具执行服务（14KB）
│   │   ├── tool-mapping.service.ts            # 工具映射服务（10KB）
│   │   ├── deployment-mode.service.ts         # 部署模式服务（4KB）
│   │   └── [20+个辅助服务]
│   │
│   ├── routes/                                # 路由定义（18个文件）
│   │   ├── sdc_thrpages.routes.ts             # SDC多页面路由（6743字节）
│   │   │   ├── POST /sdc/initialize           # 初始化
│   │   │   ├── GET  /sdc/sheets/:taskId       # 获取Sheets
│   │   │   ├── GET  /sdc/tables/:sheetId      # 获取Tables
│   │   │   ├── GET  /sdc/data/:taskId/:sheetId # 获取数据
│   │   │   ├── POST /sdc/data/:taskId/:sheetId # 保存数据
│   │   │   ├── POST /sdc/datachk/:taskId      # 数据校验
│   │   │   ├── POST /sdc/submit/:taskId       # 提交执行
│   │   │   ├── GET  /sdc/status/:taskId       # 获取状态
│   │   │   └── GET  /sdc/download/:taskId     # 下载结果
│   │   │
│   │   ├── upf_thrpages.routes.ts             # UPF多页面路由（6312字节）
│   │   ├── task.routes.ts                     # 任务路由（2636字节）
│   │   ├── auth.routes.ts                     # 认证路由
│   │   ├── admin.routes.ts                    # 管理路由（2490字节）
│   │   ├── order.routes.ts                    # 订单路由
│   │   ├── payment.routes.ts                  # 支付路由
│   │   ├── subscription.routes.ts             # 订阅路由
│   │   ├── download.routes.ts                 # 下载路由（1237字节）
│   │   └── [9个其他路由]
│   │
│   ├── workers/                               # ⭐Worker进程（5个核心文件）
│   │   ├── toolWorker.py                      # 主Worker（138KB，3015行，90+函数）
│   │   │   ├── TaskLogger类                   # 任务日志记录
│   │   │   ├── EcsLocalFileManager类          # ECS本地文件管理
│   │   │   ├── process_task()                 # 任务处理入口
│   │   │   ├── process_task_ecs_only()        # ECS Only模式处理
│   │   │   ├── process_temp_files()           # 临时文件处理
│   │   │   ├── cleanup_temp_files()           # 临时文件清理
│   │   │   ├── load_image_from_tar()          # 加载Docker镜像
│   │   │   └── [80+个辅助函数]
│   │   │
│   │   ├── worker_manager.py                  # Worker管理器（33KB）
│   │   ├── container_manager.py               # 容器管理（8KB）
│   │   ├── cleanup_container.py               # 容器清理
│   │   └── worker_process.py                  # Worker进程
│   │
│   ├── middleware/                            # 中间件（7个文件）
│   │   ├── auth.ts                            # JWT认证中间件（2KB）
│   │   ├── subscription.ts                    # 订阅权限检查（5KB）
│   │   ├── admin.ts                           # 管理员权限
│   │   ├── errorHandler.ts                    # 错误处理
│   │   ├── rateLimit.ts                       # 速率限制
│   │   ├── validate.ts                        # 数据验证
│   │   └── api-version.ts                     # API版本控制（8KB）
│   │
│   ├── utils/                                 # 工具函数（11个文件）
│   │   ├── task-logger.ts                     # 任务日志工具（3KB）
│   │   ├── operation-logger.ts                # 操作日志工具（6KB）
│   │   ├── cross-platform-paths.ts            # 跨平台路径（5KB）
│   │   ├── database.ts                        # 数据库工具（4KB）
│   │   ├── response.ts                        # 响应工具
│   │   └── [6个其他工具]
│   │
│   └── types/                                 # TypeScript类型（3个文件）
│       ├── express.d.ts                       # Express类型扩展
│       ├── auth.ts                            # 认证类型
│       └── wxpay-v3.d.ts                      # 微信支付类型
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
│   ├── pages/                                 # 页面组件（44个文件）
│   │   ├── tools/                             # ⭐工具页面（15个文件）
│   │   │   ├── SdcGeneratorPage_thrpages.tsx  # SDC工具入口页面（18KB）
│   │   │   ├── SdcGeneratorInitialize_thrpages.tsx  # SDC初始化页面（26KB）
│   │   │   │   ├── 文件上传组件（hier.yaml, vlog.v, dcont.xlsx）
│   │   │   │   ├── ModName输入
│   │   │   │   ├── isFlat选项
│   │   │   │   └── 初始化提交逻辑
│   │   │   │
│   │   │   ├── SdcGeneratorSubmit_thrpages.tsx  # ⭐SDC提交编辑页面（147KB，核心）
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
│   │   │   ├── UpfGeneratorPage_thrpages.tsx  # UPF工具入口页面（12KB）
│   │   │   ├── UpfGeneratorInitialize_thrpages.tsx  # UPF初始化页面（31KB）
│   │   │   │   ├── 4文件上传（hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx）
│   │   │   │   ├── ModName输入
│   │   │   │   ├── Version选择（2.0/2.1/3.0）
│   │   │   │   └── isFlat选项
│   │   │   │
│   │   │   ├── UpfGeneratorSubmit_thrpages.tsx  # ⭐UPF提交编辑页面（148KB，核心）
│   │   │   │   └── [与SDC类似的多表格编辑结构]
│   │   │   │
│   │   │   ├── UpfGeneratorDownload_thrpages.tsx  # UPF下载页面（5KB）
│   │   │   ├── index.tsx                      # 工具首页（3KB）
│   │   │   └── [6个其他工具页面]
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
│   │   ├── payment/                           # 支付页面
│   │   ├── task-history/                      # 任务历史
│   │   ├── home.tsx                           # 首页
│   │   ├── profile.tsx                        # 个人资料（41KB）
│   │   ├── membership.tsx                     # 会员页面
│   │   ├── contact.tsx                        # 联系我们（8KB）
│   │   └── not-found.tsx                      # 404页面
│   │
│   ├── components/                            # 组件库（65个组件）
│   │   ├── ui/                                # shadcn/ui组件（49个）
│   │   │   ├── button.tsx                     # 按钮组件
│   │   │   ├── input.tsx                      # 输入框
│   │   │   ├── table.tsx                      # 表格
│   │   │   ├── tabs.tsx                       # 标签页
│   │   │   ├── dialog.tsx                     # 对话框
│   │   │   ├── toast.tsx                      # 提示框
│   │   │   └── [43个其他UI组件]
│   │   │
│   │   ├── admin/                             # 管理组件（3个）
│   │   │   ├── admin-layout.tsx               # 管理布局
│   │   │   ├── admin-route.tsx                # 管理路由守卫
│   │   │   └── sidebar.tsx                    # 侧边栏
│   │   │
│   │   ├── shared/                            # 共享组件（3个）
│   │   ├── common/                            # 通用组件（2个）
│   │   ├── EcsOnlyStatusIndicator.tsx         # ECS Only状态指示器（6KB）
│   │   ├── navigation.tsx                     # 全局导航（9KB）
│   │   ├── footer.tsx                         # 页脚（4KB）
│   │   ├── hero-section.tsx                   # 英雄区（1KB）
│   │   ├── membership-plans.tsx               # 会员计划展示（12KB）
│   │   ├── tools-showcase.tsx                 # 工具展示（5KB）
│   │   ├── latest-news.tsx                    # 最新消息（3KB）
│   │   └── protected-route.tsx                # 路由守卫
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
│   │   ├── useToolExecution.ts                # ⭐工具执行Hook（32KB，核心）
│   │   ├── useToolPageNavigation.ts           # 工具页面导航（3KB）
│   │   ├── useWebSocket.ts                    # WebSocket Hook（5KB）
│   │   ├── usePreventBackNavigation.ts        # 防止返回（1KB）
│   │   ├── use-toast.ts                       # Toast Hook（3KB）
│   │   ├── use-mobile.tsx                     # 移动端检测
│   │   └── use-on-click-outside.ts            # 外部点击检测
│   │
│   ├── contexts/                              # React Context（2个文件）
│   │   └── auth.context.tsx                   # 认证Context
│   │
│   ├── lib/                                   # 工具库（3个文件）
│   │   ├── utils.ts                           # shadcn/ui工具
│   │   ├── queryClient.ts                     # React Query配置
│   │   └── error-handler.ts                   # 错误处理
│   │
│   ├── config/                                # 配置（2个文件）
│   │   └── env.ts                             # 环境配置
│   │
│   ├── types/                                 # TypeScript类型
│   │   └── index.ts
│   │
│   ├── utils/                                 # 工具函数（4个文件）
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
    │
    ├── datachk.log                            # 数据校验日志（~70KB）
    │   └── 记录DataChk校验过程、错误信息
    │
    ├── submission.log                         # 提交日志（~1.6KB）
    │   └── 记录任务提交、队列入队过程
    │
    ├── worker_{timestamp}.log                 # Worker执行日志（~50-60KB）
    │   └── 记录Worker完整执行流程、容器操作
    │
    ├── container.log                          # 容器标准输出日志（~4KB）
    │   └── 记录Docker容器执行输出
    │
    ├── container_execution.log                # 容器执行详细日志（~11KB）
    │   └── 记录容器内部工具执行详情
    │
    ├── execution.log                          # 总体执行日志（~2KB）
    │   └── 汇总任务执行关键节点
    │
    ├── sdc_gen.log / upf_gen.log              # 工具生成日志（~1KB）
    │   └── 记录SDC/UPF文件生成过程
    │
    ├── sdc_dg.log / upf_dg.log                # 工具诊断日志
    │   └── 记录工具内部诊断信息
    │
    ├── chk_sht.rpt                            # Sheet检查报告
    ├── full_chk.rpt                           # 完整检查报告
    └── full_msg.log                           # 完整消息日志

日志生命周期：
- 创建时间：任务初始化、DataChk、Worker执行各阶段
- 保留时间：任务完成后2分钟（与下载期一致）
- 清理机制：cleanup.service定期清理过期日志
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

---

## 第4章：环境配置

### 4.1 环境变量配置

#### 核心配置 (`backend/.env.example`)

```bash
# ========== 数据库配置 ==========
DATABASE_URL="postgresql://username:password@localhost:5432/chip_tools_db"

# ========== Redis配置 ==========
REDIS_URL="redis://localhost:6379"

# ========== JWT配置 ==========
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# ========== 服务端口 ==========
NODE_ENV="development"
PORT="5000"

# ========== 工具页面模式 ==========
# single: 单页面模式 | multi: 多页面模式（默认）
TOOL_PAGE_METHOD="multi"

# ========== ECS Only部署模式 ==========
DEPLOYMENT_MODE="ecs_only"

# ECS本地存储路径配置
ECS_LOCAL_STORAGE_ROOT="/data/chipcore"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates"
ECS_DOCKER_DIR="/data/chipcore/docker"

# 临时上传目录（重要：不能放在系统/tmp下）
TEMP_UPLOAD_DIR="/data/chipcore/temp"

# 模板文件路径
TEMPLATE_ROOT_PATH="/data/chipcore/templates"

# ========== 清理和超时配置 ==========
ECS_TEMP_CLEANUP_INTERVAL="120"    # 2分钟清理间隔(秒)
ECS_DOWNLOAD_TIMEOUT="120"         # 下载超时时间(秒)
ECS_FILE_DOWNLOAD_PORT="8081"      # 文件下载服务端口
ECS_MAX_STORAGE_SIZE="50GB"        # 最大本地存储限制

# ========== 工具执行配置 ==========
TASK_QUEUE_NAME="task_queue"
TASK_MAX_RETRIES="3"
TASK_TIMEOUT="1800000"             # 30分钟（毫秒）
TASK_POLLING_INTERVAL="3000"

# ========== 镜像缓存配置 ==========
LOCAL_DOCKER_REGISTRY_ENABLED="true"
LOCAL_IMAGES_CACHE_SIZE="20GB"
```

### 4.2 Windows开发环境配置示例

```bash
# Windows开发环境（使用WSL路径格式）
DEPLOYMENT_MODE="ecs_only"
ECS_LOCAL_STORAGE_ROOT="/mnt/e/stone/work/webapp/augment/LogicCore"
ECS_JOBS_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/jobs"
ECS_TEMPLATES_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/templates"
ECS_DOCKER_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/docker"
TEMP_UPLOAD_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/temp"

# 资源配置
ECS_TOTAL_CPU=8
ECS_TOTAL_MEMORY_GB=32
JOB_CPU_REQUEST=2
JOB_MEMORY_REQUEST_GB=8
```

### 4.3 Linux生产环境配置示例

```bash
# Linux生产环境
DEPLOYMENT_MODE="ecs_only"
ECS_LOCAL_STORAGE_ROOT="/data/chipcore"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates"
ECS_DOCKER_DIR="/data/chipcore/docker"
TEMP_UPLOAD_DIR="/data/chipcore/temp"

# 生产数据库配置
DATABASE_URL="postgresql://chipcore:Strong_Password_123@localhost:5432/chipcore_prod"
REDIS_URL="redis://localhost:6379"

# JWT安全配置
JWT_SECRET="$(openssl rand -base64 64)"
JWT_EXPIRES_IN="24h"

# 生产环境标识
NODE_ENV="production"
PORT="5000"
```

### 4.4 前端环境配置

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:5000
```

### 4.5 路径兼容性说明

| 平台 | 配置格式 | 示例 |
|------|---------|------|
| Windows (WSL) | `/mnt/盘符/路径` | `/mnt/e/project/LogicCore` |
| Windows (原生) | `盘符:/路径` | `E:/project/LogicCore` |
| Linux | `/绝对路径` | `/data/chipcore` |

> **重要提示**：`toolWorker.py`已实现跨平台路径规范化函数`normalize_docker_path()`，自动处理Windows和Linux的路径差异。

---

下一部分：[Part 1 - 数据库设计、API路由、前端页面、核心业务功能](ecsonly_multipage_dev_opus45_1.md)
