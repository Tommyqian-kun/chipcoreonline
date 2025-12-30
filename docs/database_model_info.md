# LogicCore数据库模型详细文档

## 📊 数据库架构概述

LogicCore项目使用PostgreSQL数据库，通过Prisma ORM进行数据管理。数据库设计支持完整的用户认证、订阅管理、支付处理、工具执行等业务逻辑。

## 🗃️ 数据库表结构详细说明

### 1. User表 - 用户信息管理

```sql
CREATE TABLE "User" (
    "id" TEXT PRIMARY KEY,                    -- CUID格式的用户ID
    "email" TEXT UNIQUE NOT NULL,             -- 用户邮箱（唯一）
    "password" TEXT NOT NULL,                 -- 加密后的密码
    "name" TEXT,                             -- 用户姓名（可选）
    "avatar" TEXT,                           -- 头像URL（可选）
    "isVerified" BOOLEAN DEFAULT false,      -- 邮箱验证状态
    "role" "Role" DEFAULT 'USER',            -- 用户角色（USER/ADMIN）
    "verificationToken" TEXT UNIQUE,         -- 邮箱验证令牌
    "resetPasswordToken" TEXT UNIQUE,        -- 密码重置令牌
    "createdAt" TIMESTAMP DEFAULT now(),     -- 创建时间
    "updatedAt" TIMESTAMP                    -- 更新时间
);
```

**关系**:
- 一对多: User → Task (用户可以有多个任务)
- 一对多: User → Order (用户可以有多个订单)
- 一对一: User → Subscription (用户最多有一个活跃订阅)
- 一对多: User → AuditLog (用户操作日志)

### 2. Plan表 - 会员套餐管理

```sql
CREATE TABLE "Plan" (
    "id" TEXT PRIMARY KEY,                   -- CUID格式的套餐ID
    "name" TEXT UNIQUE NOT NULL,             -- 套餐名称（Free/Professional）
    "description" TEXT,                      -- 套餐描述
    "price_month" DECIMAL(10,2) NOT NULL,    -- 月付价格
    "price_year" DECIMAL(10,2) NOT NULL,     -- 年付价格
    "features" JSONB NOT NULL,               -- 套餐功能配置
    "createdAt" TIMESTAMP DEFAULT now(),     -- 创建时间
    "updatedAt" TIMESTAMP                    -- 更新时间
);
```

**features字段结构（ECS Only部署方式）**:
```json
{
  // === 使用限制配置 ===
  "totalUsageLimit": 20,               // 总使用次数限制（Free用户）
  "monthlyUsageLimit": 50,             // 月度使用次数限制（Pro用户）
  "concurrentTasks": 2,                // 并发任务数限制

  // === 技术支持配置 ===
  "emailConsultations": 5,             // 技术资讯次数
  "supportLevel": "basic",             // 支持级别（basic/priority）
  "onlineConsultation": false,         // 是否支持线上交流

  // === 功能权限配置 ===
  "advancedFeatures": false,           // 高级功能访问权限
  "customService": false,              // 定制化技术服务支持
  "apiAccess": false,                  // API接口访问权限

  // === 存储和下载配置 ===
  "storageSpaceMB": 20,                // 存储空间限制（MB）
  "downloadTimeoutMinutes": 2,         // 下载超时时间（分钟）
  "autoCleanup": true,                 // 自动清理任务数据

  // === 数据保留配置 ===
  "dataRetentionDays": 0,              // 数据保留天数（0表示立即清理）

  // === 计费类型配置 ===
  "billingType": "total_usage"         // 计费类型（total_usage/monthly_usage）
}
```

**Free计划配置示例**:
```json
{
  "totalUsageLimit": 20,
  "monthlyUsageLimit": null,
  "concurrentTasks": 2,
  "emailConsultations": 5,
  "supportLevel": "basic",
  "onlineConsultation": false,
  "advancedFeatures": false,
  "customService": false,
  "apiAccess": false,
  "storageSpaceMB": 20,
  "downloadTimeoutMinutes": 2,
  "autoCleanup": true,
  "dataRetentionDays": 0,
  "billingType": "total_usage"
}
```

**Professional计划配置示例**:
```json
{
  "totalUsageLimit": null,
  "monthlyUsageLimit": 50,
  "concurrentTasks": 5,
  "emailConsultations": 10,
  "supportLevel": "priority",
  "onlineConsultation": true,
  "advancedFeatures": true,
  "customService": true,
  "apiAccess": true,
  "storageSpaceMB": 50,
  "downloadTimeoutMinutes": 2,
  "autoCleanup": true,
  "dataRetentionDays": 0,
  "billingType": "monthly_usage"
}
```

### 3. Tool表 - 工具配置管理

```sql
CREATE TABLE "Tool" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的工具ID
    "name" TEXT UNIQUE NOT NULL,         -- 工具名称
    "description" TEXT NOT NULL,         -- 工具描述
    "toolType" TEXT DEFAULT 'sdc',       -- 工具类型（sdc/upf/clk/mem）
    "inputSchema" JSONB NOT NULL,        -- 输入参数Schema
    "dockerImage" TEXT NOT NULL,         -- Docker镜像名称
    "version" TEXT NOT NULL,             -- 工具版本
    "configTemplate" JSONB,              -- 配置模板
    "isPublic" BOOLEAN DEFAULT true,     -- 是否公开可用
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**inputSchema字段结构示例**:
```json
{
  "modName": {
    "type": "string",
    "required": true,
    "description": "模块名称"
  },
  "isFlat": {
    "type": "boolean",
    "default": false,
    "description": "是否扁平化"
  },
  "version": {
    "type": "string",
    "enum": ["2.0", "2.1", "3.0"],
    "default": "2.1"
  }
}
```

### 4. Task表 - 任务执行管理

```sql
CREATE TABLE "Task" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的任务ID
    "userId" TEXT NOT NULL,              -- 用户ID（外键）
    "toolId" TEXT NOT NULL,              -- 工具ID（外键）
    "status" "TaskStatus" DEFAULT 'PENDING', -- 任务状态
    "parameters" JSONB NOT NULL,         -- 任务参数
    "inputFile" TEXT,                    -- 输入文件路径
    "outputFile" TEXT,                   -- 输出文件路径
    "logFile" TEXT,                      -- 日志文件路径
    "deploymentMode" TEXT DEFAULT 'ecs_only', -- 部署模式
    "ecsInstanceId" TEXT,                -- ECS实例ID
    "localStoragePath" TEXT,             -- ECS本地存储路径
    "startedAt" TIMESTAMP,               -- Worker开始处理时间
    "containerStartedAt" TIMESTAMP,      -- 容器真正开始执行时间（超时计算起点）
    "finishedAt" TIMESTAMP,              -- 任务完成时间
    "queuedAt" TIMESTAMP DEFAULT now(),  -- 任务入队时间
    "workerId" TEXT,                     -- 执行Worker ID
    "retryCount" INTEGER DEFAULT 0,      -- 当前重试次数
    "maxRetries" INTEGER DEFAULT 3,      -- 最大重试次数
    "originalTaskId" TEXT,               -- 原始任务ID（重试任务专用）
    "errorMessage" TEXT,                 -- 错误信息
    "failureReason" TEXT,                -- 失败原因分类
    "downloadStatus" "DownloadStatus" DEFAULT 'NOT_DOWNLOADED', -- 下载状态
    "downloadedAt" TIMESTAMP,            -- 下载时间
    "downloadTimeRemaining" INTEGER,     -- 下载倒计时（秒）
    "timeoutAt" TIMESTAMP,               -- 超时时间
    "timeoutType" "TimeoutType" DEFAULT 'NONE', -- 超时类型
    "progress" INTEGER DEFAULT 0,        -- 任务进度百分比 (0-100)
    "currentStep" TEXT,                  -- 当前执行步骤
    "stepStartedAt" TIMESTAMP,           -- 当前步骤开始时间
    "cleanedAt" TIMESTAMP,               -- 任务清理完成时间
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**TaskStatus枚举值**:
- `PENDING`: 等待执行
- `RUNNING`: 正在执行
- `COMPLETED`: 执行完成
- `FAILED`: 执行失败
- `CANCELLED`: 已取消
- `QUEUE_TIMEOUT`: 队列超时
- `EXECUTION_TIMEOUT`: 执行超时

**DownloadStatus枚举值**:
- `NOT_DOWNLOADED`: 未下载
- `AVAILABLE`: 可下载
- `DOWNLOADED`: 已下载
- `EXPIRED`: 已过期

**TimeoutType枚举值**:
- `NONE`: 无超时
- `QUEUE_TIMEOUT`: 队列超时
- `EXECUTION_TIMEOUT`: 执行超时

**重要字段详细说明**:

#### 时间相关字段
- **`createdAt`**: 任务创建时间
  - 类型: TIMESTAMP
  - 含义: 用户提交任务的时间
  - 使用场景: 任务排序、统计分析

- **`queuedAt`**: 任务入队时间
  - 类型: TIMESTAMP
  - 含义: 任务进入Redis队列的时间
  - 使用场景: 队列等待时间统计、超时检查

- **`startedAt`**: Worker开始处理时间
  - 类型: TIMESTAMP
  - 含义: Worker从Redis队列获取任务的时间
  - 使用场景: Worker处理时间统计

- **`containerStartedAt`**: 容器真正开始执行时间
  - 类型: TIMESTAMP
  - 含义: Docker容器启动并开始执行工具的时间
  - 使用场景: **3分钟超时计算的精确起点**

- **`finishedAt`**: 任务完成时间
  - 类型: TIMESTAMP
  - 含义: 任务执行完成（成功或失败）的时间
  - 使用场景: 执行时长统计、2分钟下载期计算起点

#### 重试机制字段
- **`retryCount`**: 当前重试次数
  - 类型: INTEGER
  - 默认值: 0
  - 取值范围: 0-3
  - 含义: 当前任务已经重试的次数
  - 使用场景: 重试逻辑判断、失败统计

- **`maxRetries`**: 最大重试次数
  - 类型: INTEGER
  - 默认值: 3
  - 取值范围: 1-10
  - 含义: 任务允许的最大重试次数
  - 使用场景: 重试上限控制、配置管理

- **`originalTaskId`**: 原始任务ID
  - 类型: TEXT (nullable)
  - 含义: 重试任务指向的原始任务ID
  - 使用场景: 重试任务追踪、数据关联
  - 说明: 只有重试任务才有此值，原始任务为null

#### 错误处理字段
- **`errorMessage`**: 错误信息
  - 类型: TEXT (nullable)
  - 含义: 任务失败时的详细错误信息
  - 使用场景: 错误诊断、用户反馈、日志记录

**parameters字段结构示例**:
```json
{
  "modName": "jpeg_top_wrap",
  "isFlat": false,
  "version": "2.1",
  "toolType": "sdc",
  "inputFilesDirectory": "user123/task456/inputs",
  "outputDirectory": "user123/task456/outputs",
  "logDirectory": "user123/task456/logs",
  "inputFilesList": ["hier.yaml", "vlog.v", "dcont.xlsx"],
  "userPermissionType": "free"
}
```

### 5. Order表 - 订单管理

```sql
CREATE TABLE "Order" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的订单ID
    "userId" TEXT NOT NULL,              -- 用户ID（外键）
    "planId" TEXT NOT NULL,              -- 套餐ID（外键）
    "status" "OrderStatus" DEFAULT 'PENDING', -- 订单状态
    "amount" DECIMAL(10,2) NOT NULL,     -- 订单金额
    "paymentMethod" "PaymentMethod" NOT NULL, -- 支付方式
    "paymentId" TEXT,                    -- 支付平台交易ID
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**OrderStatus枚举值**:
- `PENDING`: 待支付
- `PAID`: 已支付
- `FAILED`: 支付失败
- `CANCELED`: 已取消

**PaymentMethod枚举值**:
- `WECHAT`: 微信支付
- `ALIPAY`: 支付宝支付

### 6. Subscription表 - 订阅管理

```sql
CREATE TABLE "Subscription" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的订阅ID
    "userId" TEXT UNIQUE NOT NULL,       -- 用户ID（外键，唯一）
    "planId" TEXT NOT NULL,              -- 套餐ID（外键）
    "orderId" TEXT UNIQUE,               -- 订单ID（外键，可选，Free用户无需订单）
    "status" "SubscriptionStatus" DEFAULT 'ACTIVE', -- 订阅状态
    "startDate" TIMESTAMP NOT NULL,      -- 订阅开始时间
    "endDate" TIMESTAMP NOT NULL,        -- 订阅结束时间
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**重要变更说明**:
- `orderId`字段现在是可选的（`NULL`），因为Free用户注册时不需要创建订单
- Free用户可以直接拥有订阅，无需支付流程
- Professional用户仍需要通过订单支付后创建订阅

**SubscriptionStatus枚举值**:
- `ACTIVE`: 活跃订阅
- `CANCELED`: 已取消
- `EXPIRED`: 已过期

### 7. AuditLog表 - 操作审计日志

```sql
CREATE TABLE "AuditLog" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的日志ID
    "actorId" TEXT NOT NULL,             -- 操作者ID（外键）
    "action" TEXT NOT NULL,              -- 操作类型
    "targetId" TEXT NOT NULL,            -- 操作目标ID
    "details" JSONB,                     -- 操作详情
    "createdAt" TIMESTAMP DEFAULT now()  -- 操作时间
);
```

### 8. Feedback表 - 用户反馈管理

```sql
CREATE TABLE "Feedback" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的反馈ID
    "firstName" TEXT NOT NULL,           -- 用户名
    "lastName" TEXT NOT NULL,            -- 用户姓
    "email" TEXT NOT NULL,               -- 联系邮箱
    "message" TEXT NOT NULL,             -- 反馈内容
    "status" "FeedbackStatus" DEFAULT 'PENDING', -- 处理状态
    "response" TEXT,                     -- 管理员回复
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**FeedbackStatus枚举值**:
- `PENDING`: 待处理
- `IN_PROGRESS`: 处理中
- `RESOLVED`: 已解决
- `CLOSED`: 已关闭

## 🔧 多页面交互功能数据库模型

### 9. Sheet表 - Excel工作表结构管理

```sql
CREATE TABLE "sheets" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的Sheet ID
    "tool_type" TEXT NOT NULL,           -- 工具类型（sdc/upf/clk/mem）
    "sheet_name" TEXT NOT NULL,          -- Sheet名称（VarDef/ClkDef/IODly/IOExp/IntExp/Exp）
    "display_order" INTEGER NOT NULL,    -- 显示顺序
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**重要特性**:
- **工具类型关联**: 每个工具类型有独立的Sheet配置
- **唯一性约束**: `(tool_type, sheet_name)` 组合唯一
- **显示顺序**: 控制前端页面中Sheet的显示顺序
- **索引优化**: 按`tool_type`建立索引，提高查询效率

**关系**:
- 一对多: Sheet → Table (一个Sheet包含多个Table)
- 一对多: Sheet → TableData (一个Sheet包含多个数据记录)

### 10. Table表 - Excel表格结构管理

```sql
CREATE TABLE "tables" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的Table ID
    "sheet_id" TEXT NOT NULL,            -- Sheet ID（外键）
    "tool_type" TEXT NOT NULL,           -- 工具类型（冗余字段，便于查询）
    "table_name" TEXT NOT NULL,          -- 表格名称（TMVAR/TMCLK/TMIOEXP等）
    "columns_schema" JSONB NOT NULL,     -- 列结构定义
    "display_order" INTEGER NOT NULL,    -- 在Sheet中的显示顺序
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**columns_schema字段结构**:
```json
{
  "columns": [
    {
      "index": 1,
      "name": "VarName",
      "type": "string",
      "required": true,
      "description": "变量名称"
    },
    {
      "index": 2,
      "name": "VarValue",
      "type": "number",
      "required": false,
      "description": "变量值"
    },
    {
      "index": 3,
      "name": "Comment",
      "type": "string",
      "required": false,
      "description": "备注信息"
    }
  ]
}
```

**重要特性**:
- **Sheet关联**: 通过`sheet_id`关联到具体的Sheet
- **工具类型冗余**: `tool_type`字段便于跨Sheet查询
- **唯一性约束**: `(sheet_id, table_name)` 组合唯一
- **列结构定义**: `columns_schema`存储完整的列定义信息
- **多重索引**: 按`tool_type`、`sheet_id`建立索引

**关系**:
- 多对一: Table → Sheet (多个Table属于一个Sheet)
- 一对多: Table → TableData (一个Table包含多个数据行)

### 11. TableData表 - Excel表格数据存储

```sql
CREATE TABLE "table_data" (
    "id" TEXT PRIMARY KEY,               -- CUID格式的数据ID
    "user_id" TEXT NOT NULL,             -- 用户ID（权限控制）
    "task_id" TEXT NOT NULL,             -- 任务ID（数据隔离）
    "table_id" TEXT NOT NULL,            -- Table ID（外键）
    "sheet_id" TEXT NOT NULL,            -- Sheet ID（外键，冗余便于查询）
    "row_number" INTEGER NOT NULL,       -- 行号（从1开始，必须为正数）
    "row_data" JSONB NOT NULL,           -- 行数据（JSON格式）
    "createdAt" TIMESTAMP DEFAULT now(), -- 创建时间
    "updatedAt" TIMESTAMP                -- 更新时间
);
```

**row_data字段结构示例**:
```json
{
  "VarName": "CLK_PERIOD",
  "VarValue": 10.0,
  "Comment": "主时钟周期定义"
}
```

**重要特性**:
- **用户权限控制**: 通过`user_id`确保数据安全
- **任务数据隔离**: 通过`task_id`实现任务间数据隔离
- **行号管理**: `row_number`必须为正数，表示实际表格行号
- **JSON数据存储**: `row_data`使用JSONB类型，支持高效查询
- **唯一性约束**: `(task_id, table_id, row_number)` 组合唯一
- **多重索引**: 按`user_id+task_id`、`task_id`、`table_id`、`sheet_id`建立索引

**数据安全和权限**:
- **读取权限**: 只能读取自己的`user_id`对应的数据
- **任务隔离**: 不同`task_id`的数据完全隔离
- **自动清理**: 任务完成或取消后，相关数据自动清理

**关系**:
- 多对一: TableData → Table (多个数据行属于一个Table)
- 多对一: TableData → Sheet (多个数据行属于一个Sheet)

## 🔄 多页面交互数据流

### 数据同步流程

#### 1. 初始化阶段
```sql
-- 解析模板文件，初始化Sheet和Table结构
INSERT INTO "sheets" (tool_type, sheet_name, display_order) VALUES ('sdc', 'VarDef', 1);
INSERT INTO "tables" (sheet_id, tool_type, table_name, columns_schema, display_order)
VALUES (sheet_id, 'sdc', 'TMVAR', columns_json, 1);
```

#### 2. 任务初始化
```sql
-- 解析任务生成的dcont.xlsx文件，导入数据
INSERT INTO "table_data" (user_id, task_id, table_id, sheet_id, row_number, row_data)
VALUES (user_id, task_id, table_id, sheet_id, 1, '{"VarName": "CLK_PERIOD", "VarValue": 10.0}');
```

#### 3. 前端交互
```sql
-- 获取Sheet列表
SELECT * FROM "sheets" WHERE tool_type = 'sdc' ORDER BY display_order;

-- 获取指定Sheet的表格数据
SELECT t.table_name, t.columns_schema, td.row_number, td.row_data
FROM "tables" t
LEFT JOIN "table_data" td ON t.id = td.table_id AND td.task_id = $taskId
WHERE t.sheet_id = $sheetId AND td.user_id = $userId
ORDER BY t.display_order, td.row_number;
```

#### 4. 数据保存
```sql
-- 清理现有数据
DELETE FROM "table_data" WHERE task_id = $taskId AND sheet_id = $sheetId;

-- 批量插入新数据
INSERT INTO "table_data" (user_id, task_id, table_id, sheet_id, row_number, row_data)
VALUES
  (user_id, task_id, table_id, sheet_id, 1, row_data_1),
  (user_id, task_id, table_id, sheet_id, 2, row_data_2);
```

#### 5. 数据检查和导出
```sql
-- 同步数据库数据到Excel文件和JSON文件
SELECT sheet_name, table_name, row_number, row_data
FROM "table_data" td
JOIN "tables" t ON td.table_id = t.id
JOIN "sheets" s ON td.sheet_id = s.id
WHERE td.task_id = $taskId AND td.user_id = $userId
ORDER BY s.display_order, t.display_order, td.row_number;
```

### 数据清理策略

#### 任务完成后清理
```sql
-- 清理任务相关的表格数据（保留Sheet和Table结构）
DELETE FROM "table_data" WHERE task_id = $taskId;
```

#### 用户数据隔离
```sql
-- 确保用户只能访问自己的数据
SELECT * FROM "table_data"
WHERE task_id = $taskId AND user_id = $userId;
```

## 🔗 表关系图

```
User (1) ←→ (0..1) Subscription
User (1) ←→ (0..*) Order
User (1) ←→ (0..*) Task
User (1) ←→ (0..*) AuditLog
User (1) ←→ (0..*) TableData

Plan (1) ←→ (0..*) Subscription
Plan (1) ←→ (0..*) Order

Tool (1) ←→ (0..*) Task

Order (1) ←→ (0..1) Subscription

Sheet (1) ←→ (0..*) Table
Sheet (1) ←→ (0..*) TableData

Table (1) ←→ (0..*) TableData
Table (1) ←→ (1) Sheet

TableData (1) ←→ (1) Table
TableData (1) ←→ (1) Sheet
TableData (1) ←→ (1) User (通过user_id)
```

## 📈 数据库索引策略

### 当前生产索引（基于Prisma Schema）
```sql
-- User表索引
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- Task表复合索引（高频查询优化）
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");
CREATE INDEX "Task_toolId_status_idx" ON "Task"("toolId", "status");
CREATE INDEX "Task_userId_status_createdAt_idx" ON "Task"("userId", "status", "createdAt");
CREATE INDEX "Task_deploymentMode_status_idx" ON "Task"("deploymentMode", "status");
CREATE INDEX "Task_downloadStatus_idx" ON "Task"("downloadStatus");
CREATE INDEX "Task_timeoutType_idx" ON "Task"("timeoutType");
CREATE INDEX "Task_queuedAt_idx" ON "Task"("queuedAt");

-- Order表索引
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_paymentMethod_status_idx" ON "Order"("paymentMethod", "status");
CREATE INDEX "Order_userId_status_createdAt_idx" ON "Order"("userId", "status", "createdAt");

-- Subscription表索引
CREATE INDEX "Subscription_status_endDate_idx" ON "Subscription"("status", "endDate");
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- Feedback表索引
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_email_idx" ON "Feedback"("email");

-- AuditLog表索引
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- 多页面交互功能表索引
-- Sheet表索引
CREATE UNIQUE INDEX "sheets_tool_type_sheet_name_key" ON "sheets"("tool_type", "sheet_name");
CREATE INDEX "sheets_tool_type_idx" ON "sheets"("tool_type");

-- Table表索引
CREATE UNIQUE INDEX "tables_sheet_id_table_name_key" ON "tables"("sheet_id", "table_name");
CREATE INDEX "tables_tool_type_idx" ON "tables"("tool_type");
CREATE INDEX "tables_sheet_id_idx" ON "tables"("sheet_id");

-- TableData表索引
CREATE UNIQUE INDEX "table_data_task_id_table_id_row_number_key" ON "table_data"("task_id", "table_id", "row_number");
CREATE INDEX "table_data_user_id_task_id_idx" ON "table_data"("user_id", "task_id");
CREATE INDEX "table_data_task_id_idx" ON "table_data"("task_id");
CREATE INDEX "table_data_table_id_idx" ON "table_data"("table_id");
CREATE INDEX "table_data_sheet_id_idx" ON "table_data"("sheet_id");
```

### 索引使用场景分析

#### 任务查询索引
1. **用户任务历史**: `Task_userId_createdAt_idx`
   - 查询: `WHERE userId = ? ORDER BY createdAt DESC`
   - 频率: 极高（每次打开任务历史页面）

2. **任务状态过滤**: `Task_userId_status_createdAt_idx`
   - 查询: `WHERE userId = ? AND status = ? ORDER BY createdAt DESC`
   - 频率: 高（按状态筛选任务）

3. **系统监控查询**: `Task_status_createdAt_idx`
   - 查询: `WHERE status IN ('PENDING', 'RUNNING') ORDER BY createdAt`
   - 频率: 中（系统监控和清理任务）

4. **工具使用统计**: `Task_toolId_status_idx`
   - 查询: `WHERE toolId = ? AND status = 'COMPLETED'`
   - 频率: 中（工具使用分析）

#### 权限验证索引
1. **用户订阅查询**: `Subscription_userId_status_idx`
   - 查询: `WHERE userId = ? AND status = 'ACTIVE'`
   - 频率: 极高（每次任务提交前验证）

2. **订阅过期检查**: `Subscription_status_endDate_idx`
   - 查询: `WHERE status = 'ACTIVE' AND endDate < NOW()`
   - 频率: 中（定期过期检查）

### 性能优化建议

#### 查询优化
```sql
-- 优化用户使用量统计查询
EXPLAIN ANALYZE
SELECT COUNT(*) FROM "Task"
WHERE "userId" = 'user123' AND status IN ('COMPLETED', 'FAILED');
-- 使用索引: Task_userId_status_idx

-- 优化任务历史分页查询
EXPLAIN ANALYZE
SELECT * FROM "Task" t
JOIN "Tool" tool ON t."toolId" = tool.id
WHERE t."userId" = 'user123'
ORDER BY t."createdAt" DESC
LIMIT 20 OFFSET 40;
-- 使用索引: Task_userId_createdAt_idx
```

#### 索引维护
1. **定期重建索引**: 大量数据变更后重建索引
2. **监控索引使用**: 分析pg_stat_user_indexes视图
3. **清理无用索引**: 删除使用率低的索引
4. **分区考虑**: 大表可考虑按时间分区

## 🔄 数据库迁移历史

当前数据库版本基于Prisma迁移管理：
- **初始迁移**: `20250704085630_init` - 创建基础表结构
- **ECS支持**: 添加Task表的deploymentMode和localStoragePath字段
- **工具类型**: 添加Tool表的toolType字段支持多种工具类型
- **性能索引**: `20250705090616_add_performance_indexes` - 添加查询性能优化索引
- **Free用户优化**: `make_order_optional_for_free_users` - 使订阅表的orderId字段可选，支持Free用户无需订单直接订阅
- **重试机制增强**: `2024-01-XX` - 添加Task表重试相关字段
  - `retryCount`: 当前重试次数（默认0）
  - `maxRetries`: 最大重试次数（默认3）
  - `originalTaskId`: 原始任务ID（重试任务专用）
  - `containerStartedAt`: 容器真正开始执行时间
  - `queuedAt`: 任务入队时间
  - `errorMessage`: 错误信息

## 🚀 ECS Only部署方式特性

### 部署模式支持
LogicCore支持两种部署模式：
1. **ECS Only模式**（默认）：使用本地存储，适合单机部署
2. **ECS + OSS + ACR模式**：使用云存储和容器注册表，适合分布式部署

### ECS Only模式特性
- **本地存储**：任务数据存储在ECS本地磁盘
- **2分钟限时下载**：任务完成后2分钟内可下载结果
- **自动清理**：每2分钟自动清理过期任务数据
- **存储空间管理**：Free用户20MB，Professional用户50MB
- **即时清理**：任务完成后立即清理work目录，只保留结果压缩文件

### 权益计算逻辑
- **Free用户**：总量限制（20次），使用`totalUsageLimit`字段
- **Professional用户**：月度限制（50次/月），使用`monthlyUsageLimit`字段
- **使用统计**：通过Task表实时计算，无需额外存储字段

## �️ 数据保留策略

### 数据库记录保留
**重要说明**: 所有数据库记录永久保留，不会被自动清除。这些记录对系统分析和用户历史查询非常有价值。

#### 任务记录保留
- **Task表记录**: 永久保留，用于：
  - 用户任务历史查询
  - 系统执行状况分析
  - 工具使用模式统计
  - 失败原因分析和改进
- **记录大小**: 每条Task记录约1.2KB
  - 基础字段: ~400 bytes
  - JSON参数: ~800 bytes（主要变量）
  - 10万条记录约需120MB存储空间

#### 文件系统清理（保留数据库记录）
- **结果文件**: 任务完成2分钟后清理
- **日志文件**: 任务完成24小时后清理
- **临时文件**: work目录在任务完成后立即清理
- **数据库记录**: 永久保留，只更新cleanedAt字段标记清理状态

### 其他表记录保留
- **User表**: 永久保留（除非用户主动删除账户）
- **Order表**: 永久保留（财务审计需要）
- **Subscription表**: 永久保留（订阅历史追踪）
- **AuditLog表**: 建议保留1年（可配置）
- **Feedback表**: 永久保留（产品改进参考）

## 🔗 数据库关系逻辑详解

### 核心关系查询模式

#### 1. 用户权限验证查询
```sql
-- 查询用户当前权限和使用限制
SELECT u.id, u.email, s.status as subscription_status,
       p.features, p.name as plan_name
FROM "User" u
LEFT JOIN "Subscription" s ON u.id = s."userId" AND s.status = 'ACTIVE'
LEFT JOIN "Plan" p ON s."planId" = p.id
WHERE u.id = $userId;
```
**使用场景**: 任务提交前的权限检查
**关系条件**: user.id = subscription.userId AND subscription.status = 'ACTIVE'
**预期结果**: 返回用户当前活跃订阅和套餐权限

#### 2. 用户使用量统计查询
```sql
-- Free用户总使用量统计
SELECT COUNT(*) as total_usage
FROM "Task" t
WHERE t."userId" = $userId AND t.status IN ('COMPLETED', 'FAILED');

-- Professional用户月度使用量统计
SELECT COUNT(*) as monthly_usage
FROM "Task" t
WHERE t."userId" = $userId
  AND t.status IN ('COMPLETED', 'FAILED')
  AND t."createdAt" >= date_trunc('month', CURRENT_DATE);
```
**使用场景**: 任务提交前的使用量检查
**关系条件**: task.userId = user.id
**预期结果**: 返回用户当前使用量，用于限制检查

#### 3. 任务执行状态查询
```sql
-- 查询用户任务历史（带工具信息）
SELECT t.id, t.status, t.progress, t.currentStep, t.createdAt,
       t.finishedAt, t.downloadStatus, t.errorMessage,
       tool.name as tool_name, tool.toolType
FROM "Task" t
JOIN "Tool" tool ON t."toolId" = tool.id
WHERE t."userId" = $userId
ORDER BY t."createdAt" DESC
LIMIT 20;
```
**使用场景**: 任务历史页面显示
**关系条件**: task.toolId = tool.id AND task.userId = user.id
**预期结果**: 返回用户最近任务及工具信息

#### 4. 任务重试链查询
```sql
-- 查询任务的完整重试链
WITH RECURSIVE retry_chain AS (
  -- 查找原始任务
  SELECT id, "originalTaskId", "retryCount", status, "errorMessage"
  FROM "Task"
  WHERE id = $taskId AND "originalTaskId" IS NULL

  UNION ALL

  -- 查找所有重试任务
  SELECT t.id, t."originalTaskId", t."retryCount", t.status, t."errorMessage"
  FROM "Task" t
  JOIN retry_chain rc ON t."originalTaskId" = rc.id
)
SELECT * FROM retry_chain ORDER BY "retryCount";
```
**使用场景**: 重试历史分析、失败诊断
**关系条件**: retry_task.originalTaskId = original_task.id
**预期结果**: 返回完整的重试任务链

### 工具执行流程中的数据库操作

#### 阶段1: 任务提交验证
1. **用户认证**: 验证JWT token，获取user.id
2. **权限检查**: 查询User → Subscription → Plan关系
3. **使用量检查**: 统计Task表中用户的使用记录
4. **工具配置**: 查询Tool表获取inputSchema和dockerImage
5. **并发检查**: 统计用户当前PENDING/RUNNING任务数

#### 阶段2: 任务创建和入队
1. **创建Task记录**: 插入基础信息和parameters
2. **Redis入队**: 将task.id加入执行队列
3. **状态更新**: 更新task.status = 'PENDING', queuedAt = now()

#### 阶段3: 任务执行监控
1. **Worker获取**: 更新task.startedAt, workerId
2. **容器启动**: 更新task.containerStartedAt（超时计算起点）
3. **进度更新**: 定期更新task.progress, currentStep
4. **状态同步**: 通过WebSocket推送状态变化

#### 阶段4: 任务完成处理
1. **结果记录**: 更新task.outputFile, finishedAt, status
2. **下载状态**: 设置downloadStatus = 'AVAILABLE', downloadTimeRemaining
3. **清理标记**: 文件清理后更新cleanedAt字段
4. **统计更新**: 任务完成计入用户使用量

#### 阶段5: 失败处理和重试
1. **失败记录**: 更新task.status = 'FAILED', errorMessage, failureReason
2. **重试判断**: 检查task.retryCount < maxRetries
3. **重试创建**: 创建新Task记录，设置originalTaskId
4. **资源清理**: 清理失败任务的临时文件

## �📊 数据统计和监控

### 关键业务指标
1. **用户增长**: User表的createdAt字段统计
2. **订阅转化**: Subscription表的status统计
3. **工具使用**: Task表的toolId和status统计
4. **支付成功率**: Order表的status统计
5. **任务成功率**: Task表的status统计
6. **重试率**: Task表的retryCount统计
7. **执行时长**: Task表的containerStartedAt到finishedAt时长统计

### 性能监控查询
```sql
-- 任务成功率统计（按工具分组）
SELECT tool.name,
       COUNT(*) as total_tasks,
       COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_tasks,
       ROUND(COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM "Task" t
JOIN "Tool" tool ON t."toolId" = tool.id
WHERE t."createdAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tool.id, tool.name
ORDER BY success_rate DESC;

-- 用户活跃度统计
SELECT DATE(t."createdAt") as date,
       COUNT(DISTINCT t."userId") as active_users,
       COUNT(*) as total_tasks
FROM "Task" t
WHERE t."createdAt" >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(t."createdAt")
ORDER BY date;

-- 系统负载监控
SELECT COUNT(*) as pending_tasks,
       COUNT(CASE WHEN status = 'RUNNING' THEN 1 END) as running_tasks,
       AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "queuedAt"))/60) as avg_queue_wait_minutes
FROM "Task"
WHERE status IN ('PENDING', 'RUNNING');
```

### 存储增长监控
1. **表大小监控**: 定期检查各表的存储占用
2. **JSONB字段分析**: 监控parameters字段的平均大小
3. **索引效率**: 分析查询计划和索引使用情况
4. **清理效果**: 监控文件清理后的存储释放情况
