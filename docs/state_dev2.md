# 项目全面系统说明文档 (State Development 2.0)

本文档旨在对 LogicCore (Online ICTech) 项目进行全面、系统、深入的剖析，提供关于项目功能、架构、代码实现、部署策略以及未来迭代方向的详细说明。

---

## 1. 项目功能业务逻辑详解

本章节将系统性地梳理项目的所有核心业务功能与逻辑模块。内容基于当前已开发的代码和真实的业务场景需求，通过详细的文字描述和Mermaid流程图，清晰地展示用户与系统交互的全貌，并明确指出已实现和待开发的功能模块。

### 1.1. 核心业务逻辑全景图

下图展示了平台从游客访问到注册用户，再到付费用户及管理员的完整业务功能模块和核心交互流。

```mermaid
graph TD
    subgraph "用户角色"
        Visitor[/"👤 游客"/]
        AuthUser[/"🧑‍💻 注册用户"/]
        ProUser[/"💎 Pro会员"/]
        Admin[/"👑 管理员"/]
    end

    subgraph "核心功能模块"
        subgraph "A. 认证与授权 (Auth)"
            A1[注册]
            A2[登录/登出]
            A3[邮箱验证]
            A4[密码重置]
        end
        subgraph "B. EDA工具引擎 (Tool Engine)"
            B1[工具浏览与选择]
            B2[任务参数输入]
            B3[任务提交与队列]
            B4[任务状态查询]
            B5[结果下载]
        end
        subgraph "C. 订阅与支付 (Subscription & Payment)"
            C1[浏览计划]
            C2[创建订单]
            C3["支付网关(微信/支付宝)"]
            C4[支付回调处理]
            C5[订阅状态管理]
        end
        subgraph "D. 用户中心 (User Center)"
            D1[查看个人信息]
            D2[修改个人信息]
            D3[查看订单历史]
            D4[管理订阅]
        end
        subgraph "E. 后台管理 (Admin Panel)"
            E1[用户管理]
            E2[计划管理]
            E3[工具管理]
            E4[系统监控]
        end
    end
    
    %% Invisible node for convergence
    AuthPoint( )
    style AuthPoint fill:none,stroke:none
    
    %% User Flows & Status
    Visitor -- "浏览" --> C1
    Visitor -- "需要使用" --> A1
    Visitor -- "已有账号" --> A2
    
    A1 -- "发送验证邮件" --> A3
    A2 -- "忘记密码" --> A4
    
    A1 --> AuthPoint
    A2 --> AuthPoint
    A3 --> AuthPoint
    A4 --> AuthPoint
    AuthPoint -- "认证成功" --> AuthUser

    AuthUser -- "登出" --> Visitor
    AuthUser -- "浏览/选择" --> B1
    AuthUser -- "输入参数" --> B2
    AuthUser -- "提交任务" --> B3
    AuthUser -- "查询状态" --> B4
    B4 -- "任务完成" --> B5
    
    AuthUser -- "查看" --> D1
    
    AuthUser -- "需要高级功能" --> C1
    C1 -- "选择计划" --> C2
    C2 -- "发起支付" --> C3
    C3 -- "支付成功通知" --> C4
    C4 -- "处理业务" --> C5
    C5 -- "升级权限" --> ProUser

    ProUser -- "享有全部功能" --> B1
    ProUser -- "管理" --> D2
    ProUser -- "管理" --> D3
    ProUser -- "管理" --> D4
    
    Admin -- "登录" --> E4
    
    %% Styling to highlight key points
    style B3 fill:#f9f,stroke:#333,stroke-width:2px
    style C4 fill:#f9f,stroke:#333,stroke-width:2px
```

### 1.2. 已实现的业务功能与逻辑模块详解

以下是根据当前代码库已完成的核心功能模块。

#### 1.2.1. 认证与授权模块 (Auth) - ✅ 已完成
该模块是用户进入系统的第一道门，提供了完整的身份验证和基础安全保障。
*   **用户注册**: 
    *   **前端实现**: `RegisterPage`提供完整的注册表单，包含邮箱、密码和确认密码字段，使用`react-hook-form`和`zod`进行表单验证。
    *   **后端逻辑**: `POST /api/v1/auth/register`接口接收请求，`auth.service`使用`bcrypt`哈希密码后，在数据库中创建一个`isVerified: false`的用户记录。同时，生成验证令牌并通过`nodemailer`发送验证邮件。
*   **用户登录与登出**:
    *   **前端实现**: `LoginPage`提供登录表单，支持邮箱和密码登录。导航栏包含用户下拉菜单，支持登出操作。
    *   **后端逻辑**: `POST /api/v1/auth/login`接口验证用户信息和密码，成功后签发JWT，并将其置于`httpOnly`、`secure`的Cookie中返回。`POST /api/v1/auth/logout`清除Cookie实现登出。
*   **邮箱验证**:
    *   **前端实现**: `EmailVerificationResultPage`展示验证结果。
    *   **后端逻辑**: `GET /api/v1/auth/verify-email`接口验证URL中的令牌，成功后将用户的`isVerified`字段更新为`true`。
*   **密码重置**:
    *   **前端实现**: `ForgotPasswordPage`和`ResetPasswordPage`提供完整的密码重置流程。
    *   **后端逻辑**: `POST /api/v1/auth/request-password-reset`和`POST /api/v1/auth/reset-password`接口处理密码重置流程。

#### 1.2.2. EDA工具引擎模块 (Tool Engine) - ✅ 已完成
这是平台的核心价值所在，实现了从任务提交到结果获取的完整闭环。
*   **工具页面与任务提交**:
    *   **前端实现**: 已实现三个专业工具页面：
        - `SdcGeneratorPage`: SDC约束文件生成器，包含多步骤表单（基本配置、时钟定义、IO约束）
        - `ClkGeneratorPage`: 时钟生成器
        - `MemoryDataGeneratorPage`: 内存数据生成器
    *   **后端逻辑**: `POST /api/v1/tasks`接口处理任务提交，支持文件上传，使用`multer`处理文件，创建`Task`记录并推入Redis队列。
*   **后台任务处理 (Worker)**:
    *   **完整实现**: `toolWorker.py`是一个功能完备的Python工作进程，支持：
        - 从Redis队列获取任务
        - 安全的Docker容器执行
        - 阿里云ACR私有镜像拉取
        - STS临时凭证管理
        - OSS文件上传下载
        - 数据库状态更新
*   **任务状态查询与结果下载**:
    *   **前端实现**: 工具页面使用`useToolExecution` Hook管理任务状态，支持实时状态查询和结果下载。
    *   **后端逻辑**: `GET /api/v1/tasks/:taskId/status`和`GET /api/v1/tasks/:taskId/download`接口提供状态查询和下载功能。

#### 1.2.3. 订阅与支付模块 (Subscription & Payment) - ✅ 已完成
*   **会员计划浏览**:
    *   **前端实现**: `MembershipPage`展示不同会员计划及其功能差异。
    *   **后端逻辑**: `GET /api/v1/plans`接口从数据库查询所有`Plan`记录。
*   **订单创建与支付**:
    *   **前端实现**: `OrderConfirmPage`和`CheckoutPage`提供完整的订单确认和支付流程，支持微信支付和支付宝支付，包含二维码展示。
    *   **后端逻辑**: `POST /api/v1/orders`接口创建订单，`payment.service`处理支付凭证生成，`payment.controller`处理支付回调。
*   **订阅管理**:
    *   **前端实现**: 订单历史页面`OrderHistoryPage`和订单详情页面`OrderDetailsPage`。
    *   **后端逻辑**: 完整的订阅生命周期管理，包括创建、续订、取消等功能。

#### 1.2.4. 用户中心模块 (User Center) - ✅ 已完成
*   **个人信息管理**:
    *   **前端实现**: `ProfilePage`提供完整的个人信息查看和修改功能。
    *   **后端逻辑**: `GET /api/v1/users/me`和`PATCH /api/v1/users/me`接口。
*   **订单历史**:
    *   **前端实现**: `OrderHistoryPage`展示用户所有订单历史，`OrderDetailsPage`展示订单详情。
    *   **后端逻辑**: `GET /api/v1/orders`接口提供分页查询功能。

#### 1.2.5. 后台管理系统 (Admin Panel) - ✅ 已完成
*   **管理员认证**:
    *   **前端实现**: `AdminLoginPage`提供专门的管理员登录页面。
    *   **后端逻辑**: 使用`requireRole(Role.ADMIN)`中间件保护所有管理路由。
*   **系统监控**:
    *   **前端实现**: `AdminDashboardPage`展示系统核心指标，包括用户统计、任务统计、订单收入、订阅状态等。
    *   **后端逻辑**: `GET /api/v1/admin/dashboard/stats`接口提供仪表盘数据。
*   **用户管理**:
    *   **前端实现**: `UsersPage`提供完整的用户管理功能，包括用户列表、搜索、创建、编辑、删除。
    *   **后端逻辑**: 完整的用户CRUD操作API。
*   **任务管理**:
    *   **前端实现**: `TasksPage`提供任务监控和管理功能。
    *   **后端逻辑**: `GET /api/v1/admin/tasks`接口提供任务查询功能。
*   **订单管理**:
    *   **前端实现**: `OrdersPage`提供订单管理功能。
    *   **后端逻辑**: `GET /api/v1/admin/orders`接口提供订单查询功能。
*   **计划管理**:
    *   **前端实现**: `PlansPage`提供会员计划管理功能。
    *   **后端逻辑**: 完整的计划CRUD操作API。
*   **工具管理**:
    *   **前端实现**: `ToolsPage`提供工具管理功能。
    *   **后端逻辑**: 完整的工具CRUD操作API。

### 1.3. 待优化的功能模块

基于当前代码审查，以下功能已基本实现但可进一步优化：

*   **实时通信优化**:
    *   当前任务状态查询使用轮询方式，可优化为WebSocket实时推送。
*   **权限控制细化**:
    *   订阅权限检查中间件`checkTaskExecutionPermission`已实现，但可进一步细化权限控制逻辑。
*   **支付状态监控**:
    *   支付页面可增加支付状态实时监控，提升用户体验。
*   **系统监控增强**:
    *   可增加更详细的系统性能监控和告警功能。

---

## 2. 文件目录结构详解

项目采用单体仓库（Monorepo）结构，前后端分离。以下是项目包含的所有重要目录和文件的详细清单（已排除 `node_modules` 等依赖目录）。

### 2.1. 根目录 (`/`)

```
/
├── backend/                    # 后端应用 (Node.js, Express, TypeScript)
├── frontend/                   # 前端应用 (React, Vite, TypeScript)
├── .gitignore                  # Git忽略文件配置
├── docker-compose.yml          # Docker Compose编排文件，用于启动本地开发环境
├── package.json                # 根目录的package.json，用于管理整个项目的脚本
├── package-lock.json           # 根目录的锁定文件
├── README.md                   # 项目总体说明文件
├── admin_dev.md                # 管理后台开发文档
├── api_router_issue.md         # API路由问题记录文档
├── auth_dev.md                 # 认证开发文档
├── backend_arc.md              # 后端架构文档
├── fixing_from_improve3.md     # 修复记录文档3
├── fixing_from_improve4.md     # 修复记录文档4
├── fixing_summary.md           # 修复总结文档
├── improve.md                  # 改进建议文档
├── improve2.md                 # 改进建议文档2
├── improve3.md                 # 改进建议文档3
├── improve4.md                 # 改进建议文档4
├── mempay_dev.md               # 会员支付开发文档
├── online_dev.md               # 在线开发文档
├── online_req.md               # 在线需求文档
├── page_check1.md              # 页面检查文档1
├── page_check2.md              # 页面检查文档2
├── post_task.md                # 任务提交文档
├── state_dev1.md               # 项目状态文档1
├── state_dev2.md               # 项目状态文档2
├── tool_already_func_opt_dev1.md # 工具功能优化开发文档1
├── tool_execution_deployment_and_testing_plan.md # 工具执行部署测试计划
├── tool_test_real_deply.md     # 工具测试真实部署文档
├── tough_issue.md              # 难题解决文档
├── wechatpay-xios-plugin_readme.md # 微信支付插件文档
├── 基于未来业务场景的技术架构评估.md # 技术架构评估文档
├── 工具执行业务的系统开发方案.md # 工具执行系统开发方案
├── 工具执行业务的详细开发文档.md # 工具执行详细开发文档
├── 生产部署架构图.md          # 生产部署架构图
└── stuff/                      # 杂项文件目录
```

### 2.2. 后端 (`/backend`)

```
/backend
├── prisma/                     # Prisma ORM 配置与定义
│   ├── migrations/             # 数据库迁移历史文件夹
│   │   ├── 20250704085630_init/
│   │   ├── 20250705000406_fix_currency_decimal_and_add_indexes/
│   │   ├── 20250705090616_add_performance_indexes/
│   │   └── migration_lock.toml # Prisma迁移锁文件
│   └── schema.prisma           # [核心] 数据库模型、关系和枚举的唯一事实来源
├── src/                        # 后端所有源代码
│   ├── config/                 # 应用配置目录
│   │   ├── alipay.ts           # 支付宝SDK配置
│   │   ├── alipay_dev_private.pem # 支付宝开发环境私钥
│   │   ├── alipay_dev_public.pem  # 支付宝开发环境公钥
│   │   ├── database.ts         # 数据库连接配置 (通过Prisma)
│   │   ├── env-validation.ts   # 环境变量验证配置
│   │   ├── index.ts            # 导出所有配置的入口文件
│   │   ├── logger.ts           # 日志配置 (Pino)
│   │   ├── redis.ts            # Redis客户端初始化与连接配置
│   │   ├── wechatpay.ts        # 微信支付SDK配置
│   │   ├── wechat_dev_private.pem # 微信支付开发环境私钥
│   │   └── wechat_dev_public.pem  # 微信支付开发环境公钥
│   ├── controllers/            # 控制器层 (处理HTTP请求和响应)
│   │   ├── admin.controller.ts # [新增] 管理后台控制器
│   │   ├── auth.controller.ts  # 处理用户认证(注册、登录、验证、密码重置)
│   │   ├── order.controller.ts # 处理订单创建与查询
│   │   ├── payment.controller.ts# 处理支付回调(Webhook)
│   │   ├── plan.controller.ts  # 处理会员计划查询
│   │   ├── subscription.controller.ts # 处理订阅查询与取消
│   │   ├── task.controller.ts  # 处理工具任务提交与状态查询
│   │   └── user.controller.ts  # 处理用户个人信息
│   ├── middleware/             # Express 中间件
│   │   ├── auth.ts             # [核心] JWT认证与授权中间件
│   │   ├── errorHandler.ts     # 全局错误处理中间件
│   │   ├── rateLimit.ts        # API请求速率限制中间件
│   │   ├── subscription.ts     # [核心] 任务执行权限检查中间件
│   │   └── validate.ts         # 使用Zod进行动态请求验证的中间件
│   ├── routes/                 # API 路由定义
│   │   ├── admin.routes.ts     # [新增] 管理后台API路由
│   │   ├── auth.routes.ts      # 认证相关API路由
│   │   ├── order.routes.ts     # 订单相关API路由
│   │   ├── payment.routes.ts   # 支付回调API路由
│   │   ├── plan.routes.ts      # 会员计划API路由
│   │   ├── subscription.routes.ts # 订阅信息API路由
│   │   ├── task.routes.ts      # 任务相关API路由
│   │   └── user.routes.ts      # 用户信息API路由
│   ├── schemas/                # Zod 数据校验模型
│   │   └── task.schema.ts      # 任务接口的输入数据结构校验
│   ├── services/               # 核心业务逻辑服务层
│   │   ├── admin.service.ts    # [新增] 管理后台业务逻辑
│   │   ├── auth.service.ts     # 实现用户认证的具体逻辑
│   │   ├── email.service.ts    # 封装邮件发送逻辑 (Nodemailer)
│   │   ├── jwt-blacklist.service.ts # [新增] JWT黑名单服务
│   │   ├── order.service.ts    # 实现订单创建、状态更新和订阅处理
│   │   ├── payment.service.ts  # [核心] 封装与微信、支付宝SDK交互的逻辑
│   │   ├── plan.service.ts     # 实现会员计划查询逻辑
│   │   ├── subscription.service.ts # 实现订阅查询与取消逻辑
│   │   ├── task.service.ts     # [核心] 任务创建、查询和文件处理逻辑
│   │   └── user.service.ts     # 实现用户数据查询与更新
│   ├── types/                  # TypeScript 类型定义
│   │   ├── auth.ts             # 认证相关的类型定义
│   │   ├── express.d.ts        # Express Request对象的扩展类型定义
│   │   └── wxpay-v3.d.ts       # 微信支付SDK的类型声明
│   ├── utils/                  # 工具函数
│   │   ├── database.ts         # Prisma客户端实例
│   │   ├── decimal.ts          # [新增] 数字精度处理工具
│   │   ├── oss.ts              # 封装阿里云OSS操作
│   │   ├── seedAdmin.ts        # [新增] 管理员账户初始化脚本
│   │   └── seedData.ts         # 用于填充测试数据的脚本
│   ├── workers/                # 后台任务工作进程
│   │   └── toolWorker.py       # [核心] Python工作进程，负责执行工具
│   ├── envLoader.ts            # 加载环境变量的辅助脚本
│   └── index.ts                # [核心入口] Express应用主入口文件
├── .env.example                # .env的示例文件
├── package.json                # 后端项目依赖与脚本定义
├── README.env.md               # 环境变量的详细说明文档
├── requirements.txt            # Python依赖文件 (供toolWorker.py使用)
└── tsconfig.json               # TypeScript 编译器配置
```

### 2.3. 前端 (`/frontend`)

```
/frontend
├── public/                     # 静态资源目录
│   └── grid.svg                # 网格背景图
├── src/                        # 前端所有源代码
│   ├── components/             # 可复用UI组件
│   │   ├── admin/              # [新增] 管理后台专用组件
│   │   │   ├── admin-layout.tsx
│   │   │   ├── admin-route.tsx
│   │   │   └── sidebar.tsx
│   │   ├── ui/                 # [核心UI] shadcn/ui自动生成的原子组件
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── aspect-ratio.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── breadcrumb.tsx
│   │   │   ├── button.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── card.tsx
│   │   │   ├── carousel.tsx
│   │   │   ├── chart.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── command.tsx
│   │   │   ├── context-menu.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── drawer.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── hover-card.tsx
│   │   │   ├── input-otp.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── menubar.tsx
│   │   │   ├── navigation-menu.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── payment-icons.tsx # [新增] 支付图标组件
│   │   │   ├── popover.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── resizable.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   ├── toggle-group.tsx
│   │   │   ├── toggle.tsx
│   │   │   └── tooltip.tsx
│   │   ├── footer.tsx          # 全局页脚
│   │   ├── hero-section.tsx    # 首页主要内容区
│   │   ├── latest-news.tsx     # 最新消息组件
│   │   ├── membership-plans.tsx# 会员计划展示组件
│   │   ├── navigation.tsx      # 全局导航栏
│   │   ├── protected-route.tsx # [核心] 路由守卫，保护需登录访问的页面
│   │   └── tools-showcase.tsx  # 工具展示组件
│   ├── config/                 # 前端配置
│   │   └── env.ts              # 封装环境变量，提供给整个应用使用
│   ├── contexts/               # React Context
│   │   └── auth.context.tsx    # [核心] 认证Context，管理用户状态、登录、登出等
│   ├── hooks/                  # 自定义React Hooks
│   │   ├── use-mobile.tsx      # 判断是否为移动设备的Hook
│   │   ├── use-on-click-outside.ts # 点击外部区域触发事件的Hook
│   │   ├── use-toast.ts        # 调用全局通知(Toast)的Hook
│   │   └── useToolExecution.ts # [核心] 处理工具执行逻辑的Hook
│   ├── lib/                    # 辅助库和工具函数
│   │   ├── error-handler.ts    # [新增] 错误处理工具
│   │   ├── queryClient.ts      # React Query客户端实例配置
│   │   └── utils.ts            # shadcn/ui的辅助函数 (如cn)
│   ├── pages/                  # 页面级组件
│   │   ├── admin/              # [新增] 管理后台页面
│   │   │   ├── dashboard.tsx   # 管理仪表盘
│   │   │   ├── login.tsx       # 管理员登录页
│   │   │   ├── orders.tsx      # 订单管理页
│   │   │   ├── plans.tsx       # 计划管理页
│   │   │   ├── subscriptions.tsx # 订阅管理页
│   │   │   ├── tasks.tsx       # 任务管理页
│   │   │   ├── tools.tsx       # 工具管理页
│   │   │   └── users.tsx       # 用户管理页
│   │   ├── auth/               # 认证相关页面
│   │   │   ├── email-verification-result.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   └── reset-password.tsx
│   │   ├── order/              # 订单与支付流程页面
│   │   │   ├── checkout.tsx    # 支付页面
│   │   │   ├── confirm.tsx     # 订单确认页
│   │   │   ├── details.tsx     # 订单详情页
│   │   │   └── history.tsx     # 订单历史页
│   │   ├── payment/            # 支付结果页面
│   │   │   └── result.tsx
│   │   ├── tools/              # EDA工具页面
│   │   │   ├── ClkGeneratorPage.tsx # 时钟生成器
│   │   │   ├── index.tsx       # 工具首页
│   │   │   ├── MemoryDataGeneratorPage.tsx # 内存数据生成器
│   │   │   └── SdcGeneratorPage.tsx # SDC约束文件生成器
│   │   ├── user/               # 用户中心页面目录
│   │   ├── contact.tsx         # 联系我们页面
│   │   ├── home.tsx            # 应用首页
│   │   ├── membership.tsx      # 会员资格页面
│   │   ├── not-found.tsx       # 404页面
│   │   └── profile.tsx         # 用户个人资料页面
│   ├── services/               # API服务层 (封装fetch请求)
│   │   ├── admin.service.ts    # [新增] 管理后台API服务
│   │   ├── api.ts              # [核心] Axios实例，包含拦截器用于注入JWT
│   │   ├── auth.service.ts     # 封装所有认证相关的API请求
│   │   ├── order.service.ts    # 封装订单相关的API请求
│   │   ├── subscription.service.ts # 封装订阅相关的API请求
│   │   └── user.service.ts     # 封装用户数据相关的API请求
│   ├── App.tsx                 # [核心入口] 根组件，定义全局路由和Provider
│   ├── index.css               # 全局CSS样式
│   ├── main.tsx                # 应用渲染入口
│   └── vite-env.d.ts           # Vite环境变量的TypeScript声明
├── .env.example                # .env的示例文件
├── components.json             # shadcn/ui 配置文件
├── index.html                  # 应用主HTML文件
├── package.json                # 前端项目依赖与脚本定义
├── postcss.config.js           # PostCSS 配置文件
├── tailwind.config.ts          # Tailwind CSS 配置文件
├── tsconfig.json               # TypeScript 编译器配置
├── tsconfig.node.json          # Node.js环境的TypeScript配置 (用于Vite)
└── vite.config.ts              # Vite 配置文件
```

---

## 3. 技术架构详解

项目采用经典的**客户端/服务器 (C/S)** 架构，并结合了消息队列、后台工作进程、第三方支付等多种技术，形成了一个功能完备的现代化Web服务架构。

```mermaid
graph TD
    subgraph "用户端"
        User("👤 用户") -- "操作" --> Browser("💻 浏览器 (React App)");
    end

    subgraph "网络层 (阿里云)"
        Internet("🌐 互联网") -- "HTTPS/WSS" --> WAF("🛡️ WAF");
        WAF --> SLB("⚖️ 负载均衡 SLB");
    end

    subgraph "应用服务层 (阿里云 ECS / ACK)"
        subgraph "API 网关 & Web 服务器"
            direction LR
            API_Server("🚀 Node.js API Server (Express)");
        end
        
        subgraph "后台工作进程"
            direction LR
            Tool_Worker("👷 Node.js Tool Worker");
        end
    end

    subgraph "数据与存储层 (阿里云)"
        Postgres("🗄️ PostgreSQL (RDS)");
        Redis("⚡ Redis (ApsaraDB)");
        OSS("📦 对象存储 OSS");
    end

    subgraph "第三方服务"
        WeChatPay("📱 微信支付 API");
        Alipay("💠 支付宝 API");
    end
    
    %% Flows
    User -- "浏览/交互" --> Browser;
    Browser -- "API 请求 (Axios)" --> Internet;
    
    SLB --> API_Server;

    subgraph "核心API交互"
        API_Server -- "Zod验证, JWT认证" --> API_Server;
        API_Server -- "读写数据 (Prisma)" --> Postgres;
        API_Server -- "缓存/令牌 (SET/GET)" --> Redis;
        API_Server -- "生成上传URL (putObject)" --> OSS;
    end

    subgraph "异步任务提交流程"
        API_Server -- "1. 提交任务到队列 (rpush task_queue)" --> Redis;
        Tool_Worker -- "2. 阻塞式等待任务 (brpop task_queue)" --> Redis;
        Tool_Worker -- "3. 获取任务详情" --> Postgres;
        Tool_Worker -- "4. 启动Docker容器执行" --> Docker_Host("🐳 Docker Host");
        Docker_Host -- "5. 将结果/日志上传" --> OSS;
        Tool_Worker -- "6. 更新任务状态" --> Postgres;
    end
    
    subgraph "支付流程"
        API_Server -- "创建预付订单" --> WeChatPay;
        API_Server -- "创建预付订单" --> Alipay;
        WeChatPay -- "支付成功回调 (Webhook)" --> SLB;
        Alipay -- "支付成功回调 (Webhook)" --> SLB;
    end

    Browser -- "通过预签名URL下载结果" --> OSS;
```

---

## 4. 技术栈详解

项目的技术选型旨在实现高性能、高安全性、高可维护性和卓越的开发效率。前后端均采用TypeScript，以保证类型安全和代码一致性。

### 4.1. 前端 (Frontend)

*   **核心框架 (React 18 & Vite)**:
    *   **React 18**: 利用其并发特性和自动批处理功能，提供流畅的用户体验。
    *   **Vite**: 下一代前端构建工具，提供闪电般的冷启动和模块热更新（HMR），极大地提升了开发效率。
*   **UI 与样式 (Tailwind CSS & shadcn/ui)**:
    *   **Tailwind CSS**: 一个原子化的CSS框架，让我们能够直接在HTML中通过功能类快速构建自定义设计，而无需离开编辑器。它易于定制和响应式设计。
    *   **shadcn/ui**: 一个非侵入式的组件库，它不是一个NPM依赖包，而是通过CLI将组件的源代码直接复制到项目中。这给予了我们对组件样式和行为的完全控制权，可以轻松地将其与我们自己的设计系统集成。所有组件都考虑了可访问性。
    *   **Framer Motion**: 用于实现平滑、富有表现力的UI动画，提升应用的现代感和用户体验。
    *   **Lucide Icons**: 一套简洁、轻量、像素完美的图标库。
*   **状态管理 (TanStack Query & React Context)**:
    *   **TanStack Query (React Query)**: 用于管理所有与服务器的异步交互。它自动处理缓存、后台数据刷新、请求重试、加载和错误状态，极大地简化了数据获取逻辑，并提升了应用的性能和响应性。
    *   **React Context**: 用于管理全局性的、与UI相关的状态，例如用户认证信息、主题（明暗模式）等，避免了不必要的props drilling。
*   **表单处理 (React Hook Form & Zod)**:
    *   **React Hook Form**: 一个高性能、灵活且易于使用的表单库。它通过非受控组件的方式减少不必要的重渲染。
    *   **Zod**: 一个TypeScript优先的模式声明和验证库。我们用它在前端定义表单的数据结构和验证规则，并通过`@hookform/resolvers`与React Hook Form无缝集成，确保了在提交前的数据有效性。
*   **HTTP 客户端 (Axios)**:
    *   一个成熟的、基于Promise的HTTP客户端。我们在`lib/api.ts`中创建了一个全局的axios实例，统一配置了`baseURL`、`withCredentials: true`等，简化了API调用。

### 4.2. 后端 (Backend)

*   **核心框架 (Node.js & Express.js)**:
    *   **Node.js**: 基于Chrome V8引擎的JavaScript运行时，其事件驱动、非阻塞I/O模型使其非常适合构建高并发的API服务。
    *   **Express.js**: 一个简洁而灵活的Node.js Web应用框架，提供了强大的路由、中间件等功能，是我们构建RESTful API的基础。
    *   **tsx**: 一个增强版的TypeScript执行器，支持实时编译和运行，实现了类似`nodemon`的开发时热重载功能。
*   **数据库与ORM (PostgreSQL & Prisma)**:
    *   **PostgreSQL**: 一个功能强大、稳定可靠的开源对象-关系型数据库，支持复杂的查询和JSONB等高级数据类型，非常适合存储结构化业务数据。
    *   **Prisma**: 新一代Node.js和TypeScript的ORM。它通过`schema.prisma`文件作为唯一数据源来定义数据模型，提供完全类型安全的数据库客户端、自动化的数据库迁移，极大地简化了数据库操作并减少了运行时错误。
*   **认证与安全 (JWT & Bcrypt)**:
    *   **JSON Web Tokens (JWT)**: 用于实现无状态的用户认证。登录成功后，服务器签发一个JWT并存于`httpOnly` cookie中，后续请求通过此令牌进行验证，易于横向扩展。
    *   **Bcrypt.js**: 一个经过充分验证的密码哈希库，用于对用户密码进行加盐哈希，确保即使数据库泄露，密码也无法被轻易破解。
*   **数据校验 (Zod)**:
    *   与前端共用，我们在后端再次使用Zod对所有进入API的请求体、查询参数进行严格的服务器端验证，这是防止恶意数据和安全漏洞的关键防线。
*   **缓存与消息队列 (Redis)**:
    *   **Redis**: 一个高性能的内存数据结构存储。本项目中它扮演双重角色：
        1.  **缓存**: 存储需要快速访问但可以有一定时效性的数据，如邮箱验证令牌、密码重置令牌。
        2.  **消息队列**: 作为API服务和后台`toolWorker`之间的解耦合中间件。API服务将任务ID推入`task_queue`（一个Redis List），Worker进程则从中拉取，实现了任务的异步处理。
*   **支付与文件上传**:
    *   **wechatpay-axios-plugin**: 用于与微信支付V3 API交互的SDK。
    *   **Multer & multer-oss**: Express的中间件，用于处理`multipart/form-data`类型的文件上传，并通过`multer-oss`直接将文件流式传输到阿里云OSS，而无需在服务器上临时存储。
*   **日志与邮件**:
    *   **Pino**: 一个性能极高、开销极低的JSON日志记录器。
    *   **Nodemailer**: 一个成熟的Node.js模块，用于通过SMTP服务发送邮件。

### 4.3. 基础设施 (Infrastructure)

*   **容器化 (Docker & Docker Compose)**:
    *   **Docker**: 将前后端应用及其环境依赖打包成标准化的容器镜像，确保了从开发到生产的环境一致性。
    *   **Docker Compose**: 用于在开发环境中编排多个容器（前端、后端、数据库、缓存），通过一个命令即可启动整个开发环境。
*   **云服务 (阿里云)**:
    *   **OSS (对象存储)**: 用于存储用户上传的输入文件、工具执行产生的日志和结果文件。通过预签名URL机制实现安全的文件访问。

---

## 5. 配置参数详解

所有敏感配置都通过环境变量进行管理，绝不硬编码在代码中。

### 5.1. 后端 (`backend/.env`)

```ini
# 服务端口
PORT=8000

# 数据库连接字符串 (Prisma 使用)
# 格式: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL="postgresql://test:test@localhost:5432/logiccore?schema=public"

# Redis 连接字符串
# 格式: redis://HOST:PORT
REDIS_URL="redis://localhost:6379"

# 前端应用的URL, 用于配置CORS跨域策略
FRONTEND_URL="http://localhost:3000"

# JWT配置
# 用于签发和验证JWT的密钥, 必须保密且足够复杂
JWT_SECRET="your_super_secret_jwt_string_with_at_least_32_chars"
# JWT令牌的有效期 (例如: 1d, 7d, 1h)
JWT_EXPIRES_IN="7d"

# 阿里云对象存储 (OSS) 配置
OSS_ACCESS_KEY_ID="your_aliyun_oss_access_key_id"
OSS_ACCESS_KEY_SECRET="your_aliyun_oss_access_key_secret"
OSS_REGION="oss-cn-beijing"
OSS_BUCKET="your_logiccore_bucket_name"

# 邮件服务 (Nodemailer) 配置 (用于发送验证邮件、密码重置邮件)
EMAIL_HOST="smtp.example.com"
EMAIL_PORT=587
EMAIL_USER="your_email_user"
EMAIL_PASS="your_email_password"
EMAIL_FROM='"LogicCore" <noreply@logiccore.com>'

# --- 微信支付配置 (wechatpay-axios-plugin) ---
# 应用ID
WECHAT_APPID="your_wechat_appid"
# 商户号
WECHAT_MCHID="your_wechat_mchid"
# APIv3密钥, 用于解密回调
WECHAT_API_V3_KEY="your_wechat_api_v3_key_32_chars"
# 商户证书序列号
WECHAT_SERIAL_NO="your_wechat_certificate_serial_no"
# 商户私钥 (内容的换行符需替换为 \n)
WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# 平台证书 (内容的换行符需替换为 \n)
WECHAT_PLATFORM_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
# 支付成功回调URL (必须是公网可访问的地址)
WECHAT_NOTIFY_URL="https://your_domain.com/api/v1/payment/notify/wechat"

# --- 支付宝支付配置 (alipay-sdk) ---
# 应用ID
ALIPAY_APP_ID="your_alipay_app_id"
# 应用私钥 (内容的换行符需替换为 \n)
ALIPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# 支付宝公钥 (内容的换行符需替换为 \n)
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
# 支付成功回调URL
ALIPAY_NOTIFY_URL="https://your_domain.com/api/v1/payment/notify/alipay"
```

### 5.2. 前端 (`frontend/.env`)

```ini
# 后端API的基础URL
# 在开发环境中指向本地后端服务
# 在生产环境中指向部署的后端域名
VITE_API_BASE_URL=http://localhost:8000
```

---

## 6. 组件和组件交互详解

本章节将详细介绍构成系统的核心前后端组件，并深入剖析关键业务流程中的组件交互。

### 6.1. 项目前后端组件介绍

#### 6.1.1. 前端核心组件

*   **页面组件 (`/pages`)**:
    *   `HomePage.tsx`: 应用首页，负责展示产品价值、工具列表和会员计划。
    *   `RegisterPage.tsx` / `LoginPage.tsx`: 用户注册和登录表单页面。
    *   `TaskPage.tsx`: **核心工具页面**。使用`react-hook-form`动态构建工具的输入表单，管理任务提交，并轮询或通过WebSocket展示任务状态和结果。
    *   `PricingPage.tsx`: 定价页面，引导用户选择并购买会员计划。
    *   `ProfilePage.tsx`: 用户个人中心，用于信息修改。
    *   `RootLayout.tsx`: 根布局组件，包含全局的导航栏、页脚和通知组件(`Sonner`)。
*   **服务与逻辑组件**:
    *   `AuthContext.tsx`: 通过React Context提供全局的用户认证状态（是否登录、用户信息）。
    *   `api.ts` (`/lib`): 全局Axios实例，统一处理API请求，如设置Base URL和携带Cookie。
    *   `authService.ts` (`/services`): 封装所有与认证相关的API调用（登录、注册、登出）。
    *   `taskService.ts` (`/services`): 封装所有与任务相关的API调用（提交任务、查询状态）。
*   **UI组件 (`/components/ui`)**:
    *   `Button.tsx`: 标准化按钮，用于所有可点击操作。
    *   `Form.tsx`: 由`shadcn/ui`提供，与`react-hook-form`和`zod`结合，用于构建所有表单。
    *   `Input.tsx`, `Select.tsx`, `Checkbox.tsx`: 标准化表单输入控件。
    *   `Dialog.tsx` / `Sheet.tsx`: 用于弹出模态框和侧边栏，例如支付二维码展示或反馈表单。
    *   `Accordion.tsx`: 用于在工具页面组织复杂的输入参数。

#### 6.1.2. 后端核心组件

*   **控制器 (`/controllers`)**:
    *   `auth.controller.ts`: 接收HTTP请求，调用`auth.service`处理注册、登录等逻辑，并返回响应。
    *   `task.controller.ts`: 处理任务提交、状态查询等请求，管理文件上传(Multer)和参数验证(Zod)。
    *   `order.controller.ts`: 接收创建订单的请求。
    *   `payment.controller.ts`: **核心支付组件**，提供Webhook端点，接收并处理来自支付宝和微信的异步支付通知。
*   **服务 (`/services`)**:
    *   `auth.service.ts`: 实现用户认证的具体业务逻辑，包括密码哈希、JWT签发等。
    *   `task.service.ts`: 实现创建任务记录、将任务推入Redis队列等核心逻辑。
    *   `payment.service.ts`: **核心支付组件**，封装与微信、支付宝支付SDK的交互，负责创建预支付订单。
    *   `order.service.ts`: 在支付成功后，负责更新订单状态、创建或续订用户的会员资格。
    *   `oss.service.ts`: 封装了所有与阿里云OSS的交互，如生成预签名的上传/下载URL。
*   **中间件 (`/middleware`)**:
    *   `auth.ts`: **核心安全组件**。`authenticateToken`中间件保护私有路由，通过验证Cookie中的JWT来识别用户身份。`requireRole`则用于实现基于角色的访问控制。
    *   `validate.ts`: 动态验证请求数据的中间件，与Zod schemas配合使用。
*   **工作进程 (`/workers`)**:
  toolWorker.py 是一个功能完备且设计稳健的后台工作进程，其核心职责包括：
		
	1. 监听任务队列: 它连接到 Redis 并监听一个名为 task_queue 的列表，等待新任务的到来。
	
	2. 执行安全容器: 它通过运行高度沙箱化、网络隔离、权限最小化的 Docker 容器来执行具体的工具任务。
	
	3. 集成云服务: 它深度集成了阿里云服务（ACR 用于拉取私有镜像，STS 用于生成临时安全凭证，OSS 用于文件存储），构建了一个安全且可扩展的工作流。
	
	4. 更新数据库状态: 它与 PostgreSQL 数据库交互，实时更新 Task 表中的任务状态、结果和日志。
	
	5. 语言无关性: 它的设计是语言无关的，任何能够被打包成 Docker 镜像的工具都可以被这个 Worker 执行，体现了良好的架构设计。

	真实的工具执行流程：
	
	项目中实际在运行的、由 toolWorker.py 驱动的工具执行流程如下：
	
	1. 任务提交 (前端 -> 后端): 用户在前端选择一个工具，提供必要的参数，并可能上传一个输入文件。这个操作会向后端发起一个 API 请求。
	
	2. API 路由 (task.routes.ts): 请求到达后端的 API 网关，例如 /api/tasks/submit，该请求被路由到 task.controller.ts 进行处理。
	
	3. 任务创建 (task.controller.ts): submitTask 控制器函数执行以下关键步骤：
	
		- 接收请求，处理上传的文件。
		
		- 将输入文件上传到阿里云 OSS 的指定存储桶中，路径通常包含 userId 和 taskId 以实现隔离。
		
		- 在 PostgreSQL 数据库的 Task 表中创建一条记录，初始状态为 PENDING，并保存输入文件在 OSS 上的路径。
		
		- 将新创建任务的唯一 taskId 推送到 Redis 的 task_queue 列表中。
	
	4. Worker 获取任务 (toolWorker.py):
	
		- 作为独立进程运行的 Python Worker（通常部署在专门的 ECS 实例上）持续监听 task_queue。
		
		- 它从队列中获取到 taskId。
	
	5. 任务执行 (toolWorker.py):
	
		- Worker 使用 taskId 从数据库中查询完整的任务详情（包括工具信息、输入文件路径等）。
		
		- 安全地从私有 ACR 仓库拉取对应的 Docker 镜像。
		
		- 安全地从 OSS 下载输入文件到本地临时目录。
		
		- 在沙箱环境中运行 Docker 容器，挂载本地目录并注入临时的、权限受限的 STS 凭证。
	
	6. 结果处理 (toolWorker.py):
	
		- 容器执行完毕后，Worker 将输出文件和日志文件上传到各自指定的 OSS 存储桶中。
		
		- 将数据库中对应任务的状态更新为最终状态（COMPLETED 或 FAILED），并记录输出/日志文件的 OSS 路径以及任何错误信息。
	
	7. 状态查询 (后端 -> 前端): 前端可以通过轮询另一个 API 接口（如 /api/tasks/status/:taskId）来获取任务的最新状态。该接口最终调用 getTaskStatus 函数，从数据库读取并返回任务信息，从而让用户能够看到任务进度和最终结果。当结果文件就绪后，前端可以进一步请求一个预签名的下载 URL。



### 6.2. 前后端组件交互详解

#### 6.2.1. 完整工具执行流程

此流程是平台的核心功能，涉及前后端、消息队列、对象存储和容器执行环境的完整协作。

**文字描述:**

1.  **用户提交**: 在前端`TaskPage.tsx`，用户填写由`react-hook-form`管理的表单并点击"运行"。如果需要上传文件，文件选择器也会被使用。
2.  **前端API调用**: `taskService.ts`的`submitTask`函数被调用，它使用`axios`实例将表单数据和文件（作为`FormData`）发送到后端 `POST /api/v1/tasks` 接口。
3.  **用户权限验证**:
    *   `auth.ts`中的`authenticateToken`中间件首先运行，验证用户的JWT，确保用户已登录。
    *   （**待办**）一个`subscriptionCheck`中间件应紧接着运行，根据用户的`Subscription`和`Plan`检查其是否有权限运行此工具，以及每日配额是否足够。
4.  **后端接收与任务创建**: `task.controller.ts`接收请求。`multer-oss`中间件将文件流式上传到OSS。控制器验证参数后调用`task.service.ts`在数据库中创建`Task`记录（状态为`PENDING`）。
5.  **任务队列调度管理**: `task.service.ts`将新创建的任务ID通过`rpush`推送到Redis的`task_queue`。API立即向前端返回`202 Accepted`响应。
6.  **Worker获取任务**: 独立的`toolWorker.ts`进程通过`brpop`阻塞式地从`task_queue`中获取到任务ID，并从数据库拉取任务详情。
7.  **拉取镜像与启动容器**:
    *   Worker进程与ECS所在宿主机的Docker守护进程通信。
    *   它根据任务详情中指定的`dockerImage`，命令Docker守护进程从容器镜像仓库（如阿里云ACR）拉取该工具的镜像（如果本地不存在）。
    *   Worker进程准备环境变量，包含任务参数和输入文件的OSS路径。
    *   **STS临时凭证**：**（核心安全实践）** Worker进程调用阿里云STS服务，为一个具有OSS指定路径读写权限的RAM角色申请一个有时效性的临时凭证（AccessKeyId, AccessKeySecret, SecurityToken）。这个凭证被作为环境变量注入到即将启动的容器中。
    *   Worker命令Docker守护进程使用`docker run`启动一个新的容器实例，注入环境变量，并配置资源限制和安全选项（如`--rm`）。
8.  **容器内执行**:
    *   容器内的启动脚本读取环境变量，使用STS临时凭证安全地从OSS下载输入文件到容器内的临时工作区。
    *   执行核心工具逻辑（如Python脚本）。
9.  **结果上传与销毁**:
    *   工具执行完毕，在容器内生成结果文件。
    *   容器内的脚本再次使用STS临时凭证将这些结果文件上传到任务指定的OSS输出路径下。
    *   容器执行完毕后退出。由于启动时使用了`--rm`标志，Docker守护进程会自动销毁该容器实例。
10. **状态更新与结果获取**:
    *   Worker进程捕获到容器成功退出，它将数据库中`Task`记录的状态更新为`COMPLETED`。
    *   前端`TaskPage.tsx`通过轮询`GET /api/v1/tasks/:taskId/status`得知任务完成。
    *   用户点击下载时，前端请求`GET /api/v1/tasks/:taskId/download`。后端`oss.service.ts`为OSS上的结果文件生成一个有时效性的预签名URL，返回给前端，用户即可安全下载。

**Mermaid 时序图:**

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant FE_TaskPage as 💻 前端工具页
    participant BE_API as 🚀 后端API
    participant BE_Worker as 👷 后台Worker
    participant Docker as 🐳 Docker Host
    participant STS as 🔑 阿里云STS
    participant OSS as 📦 阿里云OSS

    User->>FE_TaskPage: 填写参数, 点击运行
    FE_TaskPage->>BE_API: POST /api/v1/tasks
    
    activate BE_API
    BE_API->>BE_API: 验证JWT & 用户订阅权限
    BE_API->>BE_API: 创建Task记录, 推送任务ID到Redis
    BE_API-->>FE_TaskPage: 202 Accepted, { taskId }
    deactivate BE_API

    activate BE_Worker
    BE_Worker->>BE_Worker: 从Redis获取任务ID, 查询DB
    BE_Worker->>STS: 申请临时凭证
    STS-->>BE_Worker: 返回 STS Token
    BE_Worker->>Docker: docker run (注入STS Token和参数)
    
    activate Docker
    Docker->>Docker: (容器内)启动脚本
    Docker->>OSS: 使用STS Token下载输入文件
    Docker->>Docker: **执行核心工具逻辑**
    Docker->>OSS: 使用STS Token上传结果文件
    Docker-->>BE_Worker: 容器执行完毕退出
    deactivate Docker
    
    activate BE_Worker
    BE_Worker->>BE_Worker: 更新DB中Task状态为COMPLETED
    deactivate BE_Worker

    loop 状态轮询
        FE_TaskPage->>BE_API: GET /tasks/:taskId/status
        BE_API-->>FE_TaskPage: { status: 'COMPLETED' }
    end
    
    User->>FE_TaskPage: 点击下载
    FE_TaskPage->>BE_API: GET /tasks/:taskId/download
    activate BE_API
    BE_API->>OSS: 生成预签名下载URL
    OSS-->>BE_API: signedUrl
    BE_API-->>FE_TaskPage: { downloadUrl: signedUrl }
    deactivate BE_API
```

#### 6.2.2. 用户认证管理系统的前后端组件交互流程

**文字描述:**

1.  **注册**: 用户在`RegisterPage.tsx`填写信息，`authService.ts`发送`POST /api/v1/auth/register`请求。后端`auth.controller.ts`接收后，调用`auth.service.ts`验证数据、哈希密码、创建用户、生成验证令牌存入Redis并发送验证邮件。
2.  **登录**: 用户在`LoginPage.tsx`填写凭证，`authService.ts`发送`POST /api/v1/auth/login`请求。后端`auth.service.ts`验证用户存在、已激活且密码正确。成功后，`jsonwebtoken`库被用于签发一个JWT。`auth.controller.ts`将此JWT放入一个`httpOnly`的Cookie中，并返回给前端。
3.  **状态同步**: 前端`App.tsx`或根布局在加载时，会调用`authService.ts`中的一个函数（如`getProfile`）请求`GET /api/v1/users/me`。
4.  **认证请求**: 由于请求时浏览器自动携带了`httpOnly`的cookie，后端`authenticateToken`中间件可以自动解析JWT，验证其有效性，并将用户信息附加到`req`对象上，从而授权访问受保护的资源。前端则通过`AuthContext`将用户信息提供给所有子组件。

**Mermaid 时序图:**

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant FE_Login as 💻 前端登录页
    participant FE_Context as 🌐 AuthContext
    participant BE_API as 🚀 后端API
    participant BE_JWT as 🔑 JWT服务
    participant BE_DB as 🗄️ 数据库

    User->>FE_Login: 输入邮箱和密码
    FE_Login->>BE_API: POST /api/v1/auth/login
    
    activate BE_API
    BE_API->>BE_DB: 查询用户
    BE_DB-->>BE_API: 返回用户信息
    BE_API->>BE_API: 验证用户状态 & 密码 (Bcrypt)
    
    alt 验证成功
        BE_API->>BE_JWT: 签发JWT (含userId)
        BE_JWT-->>BE_API: 返回 signedToken
        BE_API-->>FE_Login: 200 OK, 返回httpOnly Cookie
        
        FE_Login->>FE_Context: 更新认证状态 (isAuthenticated: true)
        FE_Context->>User: 页面跳转到仪表盘
    else 验证失败
        BE_API-->>FE_Login: 401 Unauthorized
    end
    
    deactivate BE_API
```

#### 6.2.3. 支付宝支付交易系统的组件交互流程

**文字描述:**

1.  **创建订单**: 用户在`PricingPage.tsx`选择一个计划，点击支付。前端调用`orderService`（待创建）发送`POST /api/v1/orders`请求，其中包含`planId`和`paymentMethod` ('alipay')。
2.  **获取支付凭证**: 后端`order.controller.ts`接收请求，调用`order.service.ts`创建一条`PENDING`状态的`Order`记录。然后，它调用`payment.service.ts`中`createAlipayPayment`方法。`payment.service`与支付网关API交互，获取到一个支付二维码URL (`qr_code`)，并将其返回给前端。
3.  **前端展示**: 前端页面（如`Dialog`组件）收到URL后，使用`react-qr-code`等库将其渲染成二维码供用户扫描。同时，前端开始轮询订单状态或监听WebSocket。
4.  **异步回调**: 用户支付成功后，支付宝的服务器会向我们后端在`.env`中配置的回调URL (`/api/v1/payment/notify/alipay`)发送一个`POST`请求。
5.  **回调处理**: `payment.controller.ts`接收到回调。控制器必须严格按照官方文档**验证签名**，确保请求的合法性。
6.  **业务更新**: 验证成功后，控制器调用`order.service.ts`中的方法来处理业务逻辑：在一个数据库事务中，将`Order`状态更新为`PAID`，并为用户创建或续订`Subscription`记录。
7.  **响应网关**: `payment.controller.ts`向支付网关服务器返回一个表示成功处理的响应（`"success"`），以防止对方重复发送通知。
8.  **前端更新**: 前端通过轮询或WebSocket得知订单状态已变为`PAID`，自动关闭二维码弹窗，并显示支付成功的消息，同时刷新UI以反映新的会员状态。

**(注：Mermaid时序图见 7.2 节)**

#### 6.2.4. 微信支付交易系统的组件交互流程

**文字描述:**

该流程与支付宝高度相似，主要区别在安全验证环节。

1.  **创建订单与获取凭证**: 流程与支付宝完全一致，只是`paymentMethod`为 'wechat'，后端调用的是`createWechatPayPayment`方法和微信支付的`native`下单API，返回`code_url`。
2.  **前端展示**: 流程与支付宝一致。
3.  **异步回调**: 微信服务器向后端回调URL (`/api/v1/payment/notify/wechat`)发送`POST`请求。
4.  **回调处理**: `payment.controller.ts`接收到回调。
    *   **安全验证**: **此步为微信支付的特点**。控制器必须先**验证签名**，然后**解密加密的报文**，才能获取到真实的订单信息。
5.  **业务更新、响应网关、前端更新**: 后续步骤与支付宝流程完全一致。

**(注：Mermaid时序图见 7.3 节)**

---

## 7. 认证管理系统业务逻辑详解

系统采用基于**JWT的无状态认证**，安全且易于横向扩展。

#### 业务逻辑流程图

```mermaid
graph TD
    subgraph "注册流程"
        A[用户填写注册表单] --> B{"POST /api/v1/auth/register"}
        B --> C["后端验证数据 (Zod)"]
        C --> D{邮箱是否已存在?}
        D -- 是 --> E[返回409冲突错误]
        D -- 否 --> F["哈希密码 (Bcrypt)"]
        F --> G["创建用户, isVerified=false"]
        G --> H[生成验证Token存入Redis]
        H --> I["发送验证邮件 (Nodemailer)"]
        I --> J[返回201创建成功]
    end
    
    subgraph "邮箱验证流程"
        K[用户点击邮件链接] --> L{"GET /verify-email?token=..."}
        L --> M[从Redis查找Token]
        M --> N{Token有效?}
        N -- 否 --> O[显示验证失败页面]
        N -- 是 --> P["更新用户 isVerified=true"]
        P --> Q[从Redis删除Token]
        Q --> R[显示验证成功页面]
    end

    subgraph "登录流程"
        S[用户填写登录表单] --> T{"POST /api/v1/auth/login"}
        T --> U[后端查找用户]
        U --> V{"用户存在 & 已验证?"}
        V -- 否 --> W[返回401认证失败]
        V -- 是 --> X["比较密码 (Bcrypt)"]
        X --> Y{密码匹配?}
        Y -- 否 --> W
        Y -- 是 --> Z[生成JWT]
        Z --> AA[将JWT放入HttpOnly Cookie]
        AA --> AB[返回用户信息]
    end
```

#### 详细说明

1.  **注册**:
    *   `POST /api/v1/auth/register`
    *   Service层使用`bcrypt`哈希密码，创建`isVerified: false`的用户。
    *   生成一个加密安全的随机令牌，存入Redis（`verification:<token>` -> `userId`），有效期24小时。
    *   通过`nodemailer`发送包含该令牌的验证链接给用户。
2.  **邮箱验证**:
    *   用户点击链接 `GET /api/v1/auth/verify-email?token=...`
    *   从Redis中查找令牌，如果存在，则将对应用户的`isVerified`设为`true`，并删除令牌。
    *   重定向回前端结果页面。
3.  **登录**:
    *   `POST /api/v1/auth/login`
    *   Service层验证邮箱和密码（使用`bcrypt.compare`）。
    *   **关键**: 检查`user.isVerified`是否为`true`。
    *   使用`jsonwebtoken`签发一个包含`userId`和`email`的JWT。
    *   Controller层将JWT置于一个`httpOnly`, `secure`, `sameSite: 'strict'`的cookie (`access_token`)中返回。这是防止XSS攻击窃取令牌的最佳实践。
4.  **认证访问**:
    *   对于受保护的路由，`authenticateToken`中间件会验证请求中cookie里的JWT。
    *   它不仅验证签名，还会查询数据库确保用户仍然存在，防止已删除用户的令牌继续有效。
5.  **密码重置**: 流程与邮箱验证类似，使用Redis存储有时效性的重置令牌。

---

## 8. 会员订阅与支付系统详解

本章节将深入剖析构成平台商业核心的会员、订阅与支付系统。这三个子系统紧密耦合，共同实现了从用户选择计划到完成支付，再到开通服务的完整闭环。

### 8.1. 会员订阅系统详解

会员订阅是决定用户能否使用平台核心功能的关键。其状态和生命周期管理是整个业务逻辑的核心。

#### 业务逻辑流程图

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant PaymentWebhook as 📞 支付回调接口
    participant OrderService as ⚙️ 订单服务
    participant Subscription as 📦 订阅模型 (DB)
    participant Order as 📄 订单模型 (DB)

    Note over PaymentWebhook: 支付网关发送支付成功通知
    PaymentWebhook->>OrderService: processPaymentNotification(data)
    OrderService->>Order: 查找并验证订单
    Order-->>OrderService: 返回订单信息
    alt 订单有效且待处理
        OrderService->>Subscription: 查询用户现有订阅 (by userId)
        Subscription-->>OrderService: 返回现有订阅(或null)
        alt 续订 (已有有效订阅)
            OrderService->>Subscription: 计算新到期日并更新
        else 激活 (无订阅或已过期)
            OrderService->>Subscription: 创建新订阅/更新为ACTIVE
        end
        OrderService->>Order: 更新订单状态为 PAID
        OrderService-->>PaymentWebhook: 返回处理成功
    else 订单无效或已处理
        OrderService-->>PaymentWebhook: 返回错误或忽略
    end
```

#### 详细说明

1.  **核心模型**:
    *   **`Plan`**: 定义了不同的会员等级（如：免费版、专业版）、月度和年度价格，以及最重要的`features`字段。该`Json`字段可以灵活地配置每个等级的具体权限，例如：`{"toolRunsPerDay": 10, "parallelTasks": 1, "accessToAdvancedTools": ["tool-a", "tool-b"]}`。
    *   **`Subscription`**: 用户的有效订阅记录。`userId`是唯一的，确保一个用户只有一个主订阅。其`status`字段 (`ACTIVE`, `CANCELED`, `EXPIRED`, `PENDING_PAYMENT`)是驱动所有权限检查的基础。

2.  **订阅的生命周期管理**:
    *   **创建与激活**: 用户的订阅不是独立创建的，而是作为成功支付一笔`Order`的结果而被创建或更新的。当支付成功的回调被验证后，`order.service.ts`中的数据库事务会执行以下逻辑：
        *   **查询**: 检查用户是否已存在订阅记录。
        *   **续订**: 如果用户已有一个`ACTIVE`的订阅，系统会根据新订单的周期（月度/年度）在原`endDate`基础上延长有效期。
        *   **激活/重新激活**: 如果用户没有订阅或订阅已`EXPIRED`，系统会通过`upsert`操作创建一条新的`ACTIVE`订阅记录，或将旧记录更新为`ACTIVE`，并设置新的`startDate`和`endDate`。
    *   **过期与取消**: 当前代码没有实现自动检查订阅过期的逻辑，这通常由一个定期的后台任务（Cron Job）完成。用户取消订阅的逻辑也尚未实现。

3.  **权限控制 (待实现)**:
    *   一个规划中的关键功能是在需要付费权限的API（如`POST /tasks`）前增加一个`subscriptionAuth`中间件。
    *   该中间件会从数据库查询用户的`Subscription`状态，确保为`ACTIVE`且`endDate`在未来。
    *   接着，它会读取关联`Plan`的`features`字段，并与用户的行为进行比较（例如，检查当日已运行`Task`数量是否超出限制），从而实现精细化的权限控制。

### 8.2. 支付宝支付交易系统详解

支付宝支付在后端**业务逻辑层面已设计实现，但在API集成和配置层面尚未完成**，处于待开发状态。

#### 业务逻辑流程图

```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant Frontend as 💻 前端ReactApp
    participant Backend as 🚀 后端API
    participant AlipayAPI as 💠 支付宝API
    participant Webhook as 📞 支付宝回调接口

    User->>Frontend: 选择计划，点击"支付宝支付"
    Frontend->>Backend: POST /api/v1/orders (planId, paymentMethod: 'alipay')
    Backend->>Backend: 创建`Order`记录 (status: PENDING)
    Backend->>AlipayAPI: 调用`alipay.trade.precreate` (含订单号,金额,回调URL)
    AlipayAPI-->>Backend: 返回`qr_code`
    Backend-->>Frontend: 返回 { qrCodeUrl: "..." }
    Frontend->>User: 显示支付二维码
    
    User->>User: 使用手机App扫码支付
    
    Note right of User: ...异步流程...
    
    AlipayAPI-->>Webhook: POST /api/v1/payment/notify/alipay (含订单详情和签名)
    Webhook->>Webhook: **关键：验证签名**
    alt 签名验证成功
        Webhook->>Backend: 调用`order.service`处理业务
        Backend->>Backend: 更新`Order`状态为`PAID`
        Backend->>Backend: 创建/续订用户`Subscription`
        Webhook-->>AlipayAPI: 返回 "success"
    else 签名验证失败
        Webhook-->>AlipayAPI: 返回 "failure" (或不响应)
    end
```

#### 详细说明

1.  **支付发起流程**:
    *   **触发**: 用户在前端选择"支付宝"作为支付方式并发起`POST /api/v1/orders`请求。
    *   **服务调用**: `order.service`在创建`PENDING`状态的订单后，会调用`payment.service`中的`createAlipayPayment`函数。
    *   **SDK交互**: 该函数会调用一个（待配置的）支付宝SDK的`alipay.trade.precreate`方法。这是一个标准的"当面付"接口，用于生成一个支付二维码。请求中会包含订单号、金额、订单主题以及用于接收支付结果通知的`ALIPAY_NOTIFY_URL`。
    *   **返回**: 成功后，支付宝API会返回一个包含`qr_code`内容的响应，服务层将其处理后返回给前端用于生成二维码。

2.  **支付回调处理**:
    *   **端点**: `POST /api/payment/notify/alipay`。
    *   **安全验证**: `payment.controller`中的`handleAlipayNotification`函数会调用`alipaySdk.checkSign(params)`来验证收到的POST请求是否真实来自支付宝，防止伪造的支付通知。
    *   **业务处理**: 签名验证通过后，会调用`order.service`中的`processAlipayNotification`函数。这个函数逻辑是完整的，它会：
        1.  在一个数据库事务中执行。
        2.  根据通知中的订单号`out_trade_no`和支付状态`trade_status`进行处理。
        3.  进行幂等性检查，确保`PAID`状态的订单不会被重复处理。
        4.  更新`Order`状态为`PAID`，并记录支付宝交易流水号。
        5.  调用上文所述的"订阅生命周期管理"逻辑，为用户开通或续订服务。
    *   **响应**: 向支付宝服务器返回纯文本`success`，表示已成功处理，否则支付宝会按策略重试发送通知。

3.  **当前状态与缺失环节**:
    *   **依赖缺失**: `package.json`中没有`alipay-sdk`依赖包。
    *   **配置缺失**: `backend/src/config/`目录下没有`alipay.ts`文件来初始化SDK，相关的`.env`环境变量也未定义。
    *   **API未挂载**: `payment.routes.ts`虽然定义了回调路由，但并未在主应用入口`index.ts`中被使用。

### 8.3. 微信支付交易系统详解

微信支付的集成度相对较高，**后端逻辑基本完整，主要等待前端对接**。

#### 业务逻辑流程图
```mermaid
sequenceDiagram
    participant User as 👤 用户
    participant Frontend as 💻 前端ReactApp
    participant Backend as 🚀 后端API
    participant WeChatAPI as 📱 微信支付API
    participant Webhook as 📞 微信回调接口

    User->>Frontend: 选择计划，点击"微信支付"
    Frontend->>Backend: POST /api/v1/orders (planId, paymentMethod: 'wechat')
    Backend->>Backend: 创建`Order`记录 (status: PENDING)
    Backend->>WeChatAPI: 调用`native`下单API (含订单号,金额,回调URL)
    WeChatAPI-->>Backend: 返回`code_url`
    Backend-->>Frontend: 返回 { qrCodeUrl: "..." }
    Frontend->>User: 显示支付二维码
    
    User->>User: 使用微信App扫码支付
    
    Note right of User: ...异步流程...
    
    WeChatAPI-->>Webhook: POST /api/v1/payment/notify/wechat (含加密报文和签名)
    Webhook->>Webhook: **关键1：验证签名**
    alt 签名验证成功
        Webhook->>Webhook: **关键2：解密报文**
        Webhook->>Backend: 调用`order.service`处理业务
        Backend->>Backend: 更新`Order`状态为`PAID`
        Backend->>Backend: 创建/续订用户`Subscription`
        Webhook-->>WeChatAPI: 返回 { code: "SUCCESS" }
    else 签名验证失败
        Webhook-->>WeChatAPI: 返回 { code: "FAIL" }
    end
```

#### 详细说明

1.  **支付发起流程**:
    *   **触发**: 与支付宝流程类似，用户选择"微信支付"后调用`POST /api/v1/orders`。
    *   **服务调用**: `order.service`调用`payment.service`中的`createWechatPayPayment`函数。
    *   **SDK交互**: 该函数使用`wechatpay-axios-plugin`SDK调用微信支付的`native`下单API。请求中包含订单描述、商户订单号、金额（**注意：微信支付API的单位是分**）和回调地址`WECHAT_NOTIFY_URL`。
    *   **返回**: 微信支付API返回一个`code_url`，这就是支付二维码的内容链接。服务层将其包装后返回给前端。

2.  **支付回调处理**:
    *   **端点**: `POST /api/payment/notify/wechat`。
    *   **安全验证**: `wechat.controller`中的`handleWechatNotification`函数执行严格的安全检查：
        1.  **中间件**: 首先使用`raw({ type: 'application/json' })`中间件来获取未经处理的原始请求体，因为签名验证必须基于原始报文。
        2.  **验签**: 使用SDK的`verifySign`方法，结合请求头中的`wechatpay-signature`、`wechatpay-timestamp`等参数，对原始请求体进行签名校验。
    *   **解密**: 验签成功后，通知内容是加密的。需要调用SDK的`decodeResource`方法，使用商户证书私钥解密`resource`字段，才能获取到真实的交易详情（如订单号、支付状态等）。
    *   **业务处理**: 确认交易状态为`SUCCESS`后，调用`order.service`中的`processWechatPaymentSuccess`函数，其内部逻辑与支付宝支付成功后的处理完全一致。
    *   **响应**: 向微信服务器返回JSON对象`{ "code": "SUCCESS", "message": "成功" }`，表示处理成功。

3.  **当前状态**: 后端逻辑闭环。主要待办工作是前端完成`POST /orders`接口的调用，获取`code_url`并使用`react-qr-code`等库渲染二维码，完成用户扫码支付的体验。

---

## 9. API详解

所有API都以`/api/v1`为前缀。

| 模块 | 端点 | 方法 | 认证 | 描述 | **状态与待办事项** |
| --- | --- | --- | --- | --- | --- |
| **Auth** | `/auth/register` | `POST` | Public | 用户注册 | ✅ 已完成 |
| | `/auth/login` | `POST` | Public | 用户登录 | ✅ 已完成 |
| | `/auth/logout` | `POST` | **Private** | 用户登出 | ✅ 已完成 |
| | `/auth/verify-email` | `GET` | Public | 邮箱验证 | ✅ 已完成 |
| | `/auth/resend-verification` |`POST` | Public | 重发验证邮件 | ✅ 已完成 |
| | `/auth/request-password-reset` | `POST` | Public | 请求密码重置 | ✅ 已完成 |
| | `/auth/reset-password` | `POST` | Public | 重置密码 | ✅ 已完成 |
| **User** | `/users/me` | `GET` | **Private** | 获取当前用户信息 | ✅ 已完成 |
| | `/users/me` | `PATCH`| **Private** | 更新用户信息 | ✅ 已完成 (后端逻辑) |
| **Plan** | `/plans` | `GET` | Public | 获取所有会员计划 | ✅ 已完成 |
| **Order** | `/orders` | `POST` | **Private** | 创建新订单并发起支付 | ✅ 已完成 (后端逻辑) |
| | `/orders` | `GET` | **Private** | 获取当前用户订单历史 | ✅ 已完成 (后端逻辑) |
| | `/orders/:orderId` | `GET`| **Private** | 获取单个订单详情 | ✅ 已完成 (后端逻辑) |
| **Subscription** | `/subscriptions/me` |`GET` | **Private** | 获取当前用户订阅状态 | ✅ 已完成 (后端逻辑) |
| | `/subscriptions/me` |`DELETE`| **Private** | 取消订阅 | ✅ 已完成 (后端逻辑) |
| **Task** | `/tasks` | `POST` | **Private** | 提交一个新任务 (支持文件上传) | ✅ 已完成 (包含订阅权限检查) |
| | `/tasks` | `GET` | **Private** | 获取当前用户任务历史 | ✅ 已完成 (后端逻辑) |
| | `/tasks/:taskId` | `GET` | **Private** | 获取单个任务详情 | ✅ 已完成 (后端逻辑) |
| | `/tasks/:taskId/status` | `GET` | **Private** | 获取指定任务的状态 | ✅ 已完成 |
| | `/tasks/:taskId/download` | `GET` | **Private** | 获取任务结果的下载链接 | ✅ 已完成 |
| **Payment**| `/payment/notify/wechat`| `POST` | Public | 接收微信支付回调 | ✅ 已完成 (后端逻辑) |
| | `/payment/notify/alipay`| `POST` | Public | 接收支付宝支付回调 | ✅ 已完成 (后端逻辑) |
| **Admin** | `/admin/dashboard/stats` | `GET` | **Admin** | 获取管理仪表盘统计数据 | ✅ 已完成 |
| | `/admin/users` | `GET` | **Admin** | 获取用户列表 | ✅ 已完成 |
| | `/admin/users` | `POST` | **Admin** | 创建用户 | ✅ 已完成 |
| | `/admin/users/:userId` | `GET` | **Admin** | 获取用户详情 | ✅ 已完成 |
| | `/admin/users/:userId` | `PUT` | **Admin** | 更新用户信息 | ✅ 已完成 |
| | `/admin/users/:userId` | `DELETE` | **Admin** | 删除用户 | ✅ 已完成 |
| | `/admin/tasks` | `GET` | **Admin** | 获取任务列表 | ✅ 已完成 |
| | `/admin/tasks/:taskId` | `GET` | **Admin** | 获取任务详情 | ✅ 已完成 |
| | `/admin/orders` | `GET` | **Admin** | 获取订单列表 | ✅ 已完成 |
| | `/admin/orders/:orderId` | `GET` | **Admin** | 获取订单详情 | ✅ 已完成 |
| | `/admin/subscriptions` | `GET` | **Admin** | 获取订阅列表 | ✅ 已完成 |
| | `/admin/subscriptions/:subId` | `PUT` | **Admin** | 更新订阅状态 | ✅ 已完成 |
| | `/admin/plans` | `GET` | **Admin** | 获取计划列表 | ✅ 已完成 |
| | `/admin/plans` | `POST` | **Admin** | 创建计划 | ✅ 已完成 |
| | `/admin/plans/:planId` | `PUT` | **Admin** | 更新计划 | ✅ 已完成 |
| | `/admin/plans/:planId` | `DELETE` | **Admin** | 删除计划 | ✅ 已完成 |
| | `/admin/tools` | `GET` | **Admin** | 获取工具列表 | ✅ 已完成 |
| | `/admin/tools` | `POST` | **Admin** | 创建工具 | ✅ 已完成 |
| | `/admin/tools/:toolId` | `GET` | **Admin** | 获取工具详情 | ✅ 已完成 |
| | `/admin/tools/:toolId` | `PUT` | **Admin** | 更新工具 | ✅ 已完成 |
| | `/admin/tools/:toolId` | `DELETE` | **Admin** | 删除工具 | ✅ 已完成 |

---

## 10. 路由系统详解

### 10.1. 后端路由 (Express)

*   在`backend/src/index.ts`中，创建了一个主路由`apiV1Router`，并统一添加`/api/v1`前缀。
*   `backend/src/routes/`目录下的每个文件 (`auth.routes.ts`, `task.routes.ts`等) 都定义了一个模块化的`express.Router`。
*   所有业务模块的路由（包括`auth`, `user`, `plan`, `order`, `payment`, `subscription`, `task`）都已正确挂载到主应用实例上，形成了清晰的、按功能划分的路由结构。

#### **当前实现状态**

1.  **管理后台路由已完成**: 已实现完整的管理后台API路由系统，包括用户管理、任务管理、订单管理、计划管理、工具管理、订阅管理和仪表盘统计等功能。
2.  **权限中间件已应用**: `auth.ts`中的`requireRole(Role.ADMIN)`中间件已正确应用到所有管理后台路由，确保只有管理员角色可以访问。
3.  **路由模块化**: 所有管理后台路由都在`admin.routes.ts`中统一管理，结构清晰，易于维护。

### 10.2. 前端路由 (React Router)

*   在`frontend/src/App.tsx`中，使用`react-router-dom`的`<BrowserRouter>`和`<Routes>`组件来定义全站路由。
*   `frontend/src/pages`目录下的文件或子目录对应各个页面。
*   路由配置将URL路径映射到对应的页面组件，并使用`<ProtectedRoute />`组件实现了路由守卫，保护需要登录才能访问的页面。

#### **当前实现状态**

1.  **管理员路由守卫已完成**: 已实现`<AdminRoute />`组件，用于保护后台管理页面，只有Admin角色的用户才能访问。
2.  **管理后台页面已完成**: 已完成所有管理后台页面的开发，包括：
    - `/admin/dashboard`: 管理仪表盘
    - `/admin/users`: 用户管理页面
    - `/admin/tasks`: 任务管理页面
    - `/admin/orders`: 订单管理页面
    - `/admin/plans`: 计划管理页面
    - `/admin/subscriptions`: 订阅管理页面
    - `/admin/tools`: 工具管理页面
    - `/admin/login`: 管理员登录页面
3.  **管理后台布局**: 已实现`<AdminLayout />`组件，提供统一的管理后台布局和侧边栏导航。
4.  **工具页面已完成**: 已实现三个专业的EDA工具页面：
    - `/tools/sdc-generator`: SDC约束文件生成器
    - `/tools/clk-generator`: 时钟生成器
    - `/tools/memory-generator`: 内存数据生成器

---

## 11. 生产部署详解

将应用从本地开发环境迁移到真实生产环境，需要一套系统化的策略来确保服务的**高可用性、高安全性、可观测性和可维护性**。

### 11.1. CI/CD 自动化流程 (建议使用 GitHub Actions)

建立CI/CD流水线是实现快速、可靠交付的核心。当代码被推送到`main`分支时，将自动触发以下流程：

1.  **代码检查与测试 (Check & Test)**:
    *   运行`ESLint`进行静态代码分析，确保代码风格一致性。
    *   运行所有单元测试 (`jest`) 和集成测试 (`supertest`)，确保核心业务逻辑的正确性。
    *   使用`npm audit`或`Snyk`扫描项目依赖，检查是否存在已知的安全漏洞。
2.  **构建Docker镜像 (Build)**:
    *   为后端应用(`backend`)和后台工作进程(`toolWorker`)分别构建生产环境的Docker镜像。
    *   构建前端应用 (`frontend`) 的静态文件。
3.  **容器镜像安全扫描 (Scan)**:
    *   将构建好的Docker镜像推送到**阿里云容器镜像服务 (ACR)** 的一个临时tag。
    *   触发ACR的自动安全扫描功能，检查镜像中是否存在操作系统或软件层面的漏洞。
4.  **推送与部署 (Push & Deploy)**:
    *   安全扫描通过后，将镜像打上正式的版本tag（如`v1.2.3`）并推送到ACR。
    *   触发**阿里云容器服务ACK (Kubernetes)** 的滚动更新（Rolling Update）部署策略。Kubernetes会逐步用新版本的应用容器替换旧版本，确保服务在更新过程中不中断。
    *   运行数据库迁移脚本 (`npx prisma migrate deploy`)，确保数据库结构与新版应用代码兼容。

### 11.2. 生产环境配置与密钥管理

直接在生产服务器上使用`.env`文件是极不安全的实践。应采用云服务商提供的密钥管理服务：

*   **使用阿里云参数存储/KMS**:
    *   所有敏感信息（如`DATABASE_URL`, `JWT_SECRET`, 支付密钥等）应存储在**阿里云参数存储服务**中，或使用**密钥管理服务 (KMS)** 进行加密。
    *   在应用启动时，通过赋予ECS/ACK实例的**RAM角色**权限，从参数存储中拉取配置并注入到应用的环境变量中。
    *   这样可以实现配置与代码的分离，并对敏感信息的访问进行严格的权限控制和审计。

### 11.3. 监控、日志与告警 (Observability)

建立完善的可观测性体系，是快速定位和解决生产问题的关键。

*   **集中化日志管理**:
    *   **日志收集**: 所有应用（`backend`, `worker`）都应使用`pino`等库将日志以JSON格式输出到`stdout`。配置ACK或ECS的日志代理，将这些容器日志统一收集到**阿里云日志服务 (SLS)**。
    *   **日志分析**: 在SLS中，可以对日志进行实时查询、分析，并创建仪表盘来监控错误率、业务指标等。
*   **性能与指标监控**:
    *   **指标暴露**: 后端应用应集成`prom-client`库，通过一个`/metrics`端点暴露符合Prometheus格式的性能指标（如：API延迟、请求速率、Node.js事件循环延迟、内存使用等）。
    *   **指标采集与展示**: 使用**阿里云Prometheus监控服务**来定期抓取`/metrics`端点的数据。使用配套的**Grafana服务**创建仪表盘，对系统健康状况进行可视化展示。
*   **告警系统**:
    *   在SLS或Prometheus中配置告警规则。当关键指标超过阈值时（例如：API错误率连续5分钟高于1%、平均响应时间超过500ms、任务队列长度持续增长），系统会自动通过**钉钉、短信或电话**通知相关的开发和运维人员。

### 11.4. 生产环境安全与维护

*   **网络安全**:
    *   所有服务都应部署在**专有网络 (VPC)** 中。
    *   使用精细化的**安全组规则**，仅允许必要的端口和服务之间进行通信（例如，只允许后端应用访问数据库的3306端口）。
    *   在负载均衡器前部署**Web应用防火墙 (WAF)**，抵御SQL注入、XSS等常见攻击。
*   **健康检查**:
    *   在ACK/Kubernetes中，为后端服务配置**Liveness Probe**（存活探针）和**Readiness Probe**（就绪探针）。
    *   **Liveness Probe**用于检测应用是否僵死，如果探针失败，Kubernetes会自动重启容器。
    *   **Readiness Probe**用于检测应用是否准备好接收流量，如果探针失败，Kubernetes会暂时将该实例从负载均衡中移除，直到它恢复正常。这对于防止在应用启动过程中或处理耗时任务时接收新请求至关重要。

## 12. 已开发和待开发网页详解

### 12.1. 已开发网页清单 (完整核对)

经全面核对，前端已完成的页面组件覆盖了完整的用户旅程和管理功能。清单如下：

#### 12.1.1. 认证相关页面 (✅ 已完成)
*   `/login`: 用户登录页面
*   `/register`: 用户注册页面
*   `/email-verification-result`: 邮箱验证结果页面
*   `/forgot-password`: 忘记密码页面
*   `/reset-password`: 密码重置页面

#### 12.1.2. 主要功能页面 (✅ 已完成)
*   `/`: 应用首页
*   `/membership`: 会员计划和价格页面
*   `/contact`: 联系我们页面
*   `/profile`: 用户个人资料设置页面

#### 12.1.3. 工具页面 (✅ 已完成)
*   `/tools/sdc-generator`: SDC约束文件生成器 (316行代码，完整实现)
*   `/tools/clk-generator`: 时钟生成器
*   `/tools/memory-generator`: 内存数据生成器

#### 12.1.4. 订单与支付页面 (✅ 已完成)
*   `/order/confirm`: 订单确认页面
*   `/order/checkout`: 支付页面 (164行代码，支持微信支付和支付宝)
*   `/order/details/:orderNo`: 订单详情页面
*   `/user/orders`: 订单历史页面
*   `/payment/result`: 支付结果页面

#### 12.1.5. 管理后台页面 (✅ 已完成)
*   `/admin/login`: 管理员登录页面
*   `/admin/dashboard`: 管理仪表盘 (346行代码，完整的统计数据展示)
*   `/admin/users`: 用户管理页面 (561行代码，完整的CRUD功能)
*   `/admin/tasks`: 任务管理页面 (437行代码)
*   `/admin/orders`: 订单管理页面 (394行代码)
*   `/admin/plans`: 计划管理页面 (367行代码)
*   `/admin/subscriptions`: 订阅管理页面
*   `/admin/tools`: 工具管理页面

#### 12.1.6. 通用页面 (✅ 已完成)
*   `/*`: 404错误页面

### 12.2. 待优化和扩展的功能页面

基于当前已完成的页面开发状态，以下是可进一步优化和扩展的功能：

1.  **用户体验优化**
    *   **实时状态更新**: 工具执行页面当前使用轮询方式查询任务状态，可优化为WebSocket实时推送。
    *   **支付状态监控**: 支付页面可增加支付状态实时监控，提升用户体验。
    *   **面包屑导航**: 为管理后台页面添加面包屑导航，提升导航体验。

2.  **管理功能增强**
    *   **审计日志页面**: 虽然后端已实现审计日志功能，但前端可增加`/admin/audit-logs`页面用于安全追溯。
    *   **系统监控页面**: 可增加更详细的系统性能监控页面，展示服务器状态、任务队列状态等。

3.  **内容管理系统**
    *   `/feedback`: **用户反馈中心**。允许用户提交Bug报告或功能建议。
    *   `/guides`: **技术指南列表页**。
    *   `/guides/:slug`: **技术指南详情页**。
    *   `/news`: **新闻公告列表页**。
    *   `/news/:slug`: **新闻公告详情页**。

4.  **移动端适配**
    *   当前页面已基本实现响应式设计，但可进一步优化移动端用户体验。
    *   考虑为移动端用户提供PWA支持。

5.  **国际化支持**
    *   当前页面使用中文，可考虑添加多语言支持。

---

## 13. 后续优化维护迭代建议

本节内容将基于当前代码的完整实现情况和真实SaaS业务场景，从**高安全性、高性能、高可扩展性、高效维护与迭代**四个维度，提出具体、可落地的优化建议。

**当前项目状态总结**: 
LogicCore项目已经是一个功能完备的EDA工具SaaS平台，包含完整的用户认证、工具执行、订阅支付、管理后台等核心功能。前端有40+个shadcn/ui组件，后端有完整的API系统，工具执行系统支持安全的Docker容器执行。项目已基本达到生产就绪状态。

### 13.1. 高安全性 (High Security) 增强

1.  **访问控制 (RBAC) 已完成并可进一步细化**:
    *   **已完成**: `auth.ts`中的`requireRole`中间件已正确实现并应用于所有管理后台API路由。`User`模型已包含`role`字段（`USER`, `ADMIN`），实现了严格的管理员权限隔离。
    *   **已完成**: 订阅权限检查中间件`checkTaskExecutionPermission`已在`subscription.ts`中实现，并在任务提交时进行权限验证。
    *   **可优化**: 进一步细化权限控制逻辑，如按工具类型设置不同的权限要求，或实现更复杂的配额管理。
2.  **输入验证与处理已基本完成**:
    *   **已完成**: `toolWorker.py`已实现安全的Docker容器执行，包括STS临时凭证管理和OSS文件上传下载。
    *   **已完成**: `task.schema.ts`已使用Zod进行输入验证，工具参数经过严格校验。
    *   **可优化**: 根据每个`Tool`的`inputSchema`动态生成更精细的Zod校验器。
3.  **Docker执行环境已加固**:
    *   **已完成**: `toolWorker.py`已实现安全的Docker容器执行，支持阿里云ACR私有镜像拉取。
    *   **可优化**: 进一步配置Docker守护进程以Rootless模式运行，使用`distroless`镜像减小攻击面。
4.  **审计日志已实现**:
    *   **已完成**: `AuditLog`模型已在数据库中定义，管理后台服务中已实现审计日志记录功能。
    *   **可优化**: 为前端添加审计日志查看页面，完善日志记录的覆盖范围。

### 13.2. 高性能 (High Performance) 优化

1.  **数据库性能已优化**:
    *   **已完成**: `schema.prisma`中已添加完整的数据库索引，包括`Task`表的`@@index([userId, status])`、`@@index([userId, createdAt])`等复合索引，以及`Order`、`Subscription`等表的性能索引。
    *   **已完成**: 后端服务中已使用Prisma的`select`和`include`进行优化查询，管理后台的聚合统计使用了`groupBy`和`_count`。
    *   **可优化**: 对于更复杂的统计查询，可考虑使用原生SQL或引入缓存层。
2.  **优化任务状态查询**:
    *   **引入WebSocket**: 当前通过前端轮询`GET /tasks/:taskId/status`的方式会产生大量无效HTTP请求。应使用`ws`库或`Socket.io`在后端建立一个WebSocket服务。当`toolWorker.ts`更新任务状态时，通过WebSocket将状态变更实时推送给对应的客户端，实现真正的实时更新并大幅降低服务器压力。
3.  **缓存策略**:
    *   **数据层缓存**: `Plan`和`Tool`列表这类几乎不变但请求频繁的数据，应在`plan.service.ts`和`tool.service.ts`中增加缓存逻辑。首次请求从数据库获取后存入Redis（`SETEX`带过期时间），后续请求优先从Redis读取。
4.  **前端性能**:
    *   **代码分割 (Code Splitting)**: 使用`React.lazy()`和`Suspense`对非核心页面（如个人中心、历史订单）和后台管理页面进行懒加载，减小初始包体积。
    *   **Bundle分析**: 使用`rollup-plugin-visualizer`等Vite插件分析最终打包产物的大小，定位并优化过大的依赖库。
    *   **长列表虚拟化**: 对于任务历史、订单历史等可能很长的列表，应使用`@tanstack/react-virtual`等虚拟列表库，只渲染视口内可见的列表项，避免大量DOM节点导致的性能问题。

### 13.3. 高可扩展性 (High Scalability) 规划

1.  **解耦后台工作进程**:
    *   **拆分Worker**: 当前的`toolWorker.ts`是单体的。为了应对不同工具资源消耗不一的情况，应将其重构为"调度器-执行器"模式。
        *   **调度器 (Scheduler)**: 仍然监听主`task_queue`，但它的唯一职责是根据任务类型，将任务ID转发到不同的专用队列中（如`sdc_task_queue`, `memory_gen_queue`）。
        *   **执行器 (Executors)**: 创建多个专门的Worker进程，每个进程只监听自己的队列。这样可以为计算密集型工具的执行器分配更多CPU和内存资源的ECS实例，而为IO密集型工具分配不同的资源，实现精细化的资源调配和独立扩展。
2.  **升级消息队列**:
    *   当业务量巨大时，Redis的List作为队列的可靠性不足（如消费者进程崩溃可能导致消息丢失）。应考虑迁移到更专业的**RabbitMQ**或**Kafka**。它们提供了消息持久化、发送确认（ACK）、死信队列（用于处理失败任务）和灵活的路由策略，能更好地保证任务不丢失。
3.  **探索微服务化**:
    *   随着业务变得复杂，可将当前单体后端中高度内聚且相对独立的业务领域拆分为微服务。首要候选者是：
        *   **支付服务**: 将所有与支付宝/微信支付的交互、订单状态管理和回调处理封装成一个独立服务。
        *   **认证服务**: 封装用户注册、登录、JWT管理等功能。

### 13.4. 高效维护与迭代 (Efficient Maintenance & Iteration)

1.  **完善测试策略**:
    *   **单元测试**: 使用`jest`为所有`services`层中的核心业务函数（如订阅续费逻辑、支付状态机转换）编写单元测试。
    *   **集成测试**: 使用`supertest`和连接到测试数据库的Prisma客户端，为每个API端点编写集成测试，验证"控制器-服务-数据库"的完整链路。
    *   **端到端(E2E)测试**: 使用`Playwright`或`Cypress`编写脚本，自动化测试最关键的用户旅程，如：注册->登录->提交任务->查看结果；选择计划->支付->验证订阅成功。将E2E测试集成到CI/CD流程中，作为部署前的最后一道防线。
2.  **引入特性标志 (Feature Flags)**:
    *   集成一个特性标志管理系统（如开源的`Unleash`或商业化的`LaunchDarkly`）。所有新功能（尤其是大型或有风险的功能）都应包裹在特性标志中。这使得团队可以将未完成的代码安全地合并到主分支，并在生产环境中对特定用户群体（如内部员工、beta测试者）开启新功能，实现灰度发布和快速风险控制。
3.  **组件驱动开发 (Component-Driven Development)**:
    *   **引入Storybook**: 为前端项目引入Storybook。所有`shadcn/ui`组件和自定义的复合组件都应有对应的Story。这不仅能生成一个实时的组件文档，还能让开发者在隔离的环境中开发和测试UI组件，极大提升开发效率和组件质量。
4.  **DevOps文化建设**:
    *   **文档即代码**: 将本文档（`state_dev2.md`）也纳入版本控制，并作为每次需求变更或架构调整时必须更新的交付物，确保文档的鲜活性。
    *   **强调可观测性**: 团队应养成依赖Grafana仪表盘和SLS日志来监控系统健康状况的习惯，将性能指标作为衡量开发质量的重要标准之一。
