# ECS Only模式下SDC/UPF工具多页面交互任务数据库操作分析报告

## 1. 概述

本报告详细分析了SDC/UPF工具在ECS Only模式下，多页面交互任务执行过程中数据库的相关操作。分析涵盖了从任务初始化到最终清理的完整生命周期。

### 1.1 核心数据库表结构

```
User           - 用户信息和认证
Tool           - 工具定义和配置
Task           - 任务记录和状态
Sheet          - 多页面工具的表单结构定义
Table          - 表格结构定义
TableData      - 表格数据（任务级隔离）
Subscription   - 用户订阅信息
Order          - 订单记录
```

### 1.2 任务状态枚举

```
DRAFT           - 多页面交互：用户正在填写需求，不计入超时时间
PENDING         - 任务已入队，等待Worker处理
RUNNING         - 任务正在执行
COMPLETED       - 任务已完成
FAILED          - 任务执行失败
CANCELLED       - 任务已取消
QUEUE_TIMEOUT   - 队列等待超时
EXECUTION_TIMEOUT - 执行超时
```

---

## 2. 任务提交流程（a1-a7阶段）的数据库操作

### 2.1 步骤a1：用户提交初始化请求

**API端点**: `POST /api/v1/sdc-thrpages/initialize`

**数据库操作**：

#### 2.1.1 查询或创建Tool记录

```typescript
// sdc_thrpages.controller.ts:118-127
let tool = await prisma.tool.findFirst({
  where: {
    OR: [
      { name: 'SDC Generator' },
      { name: 'sdc-generator' },
      { toolType: 'sdc' },
      { toolType: 'sdcgen' }
    ]
  }
});

if (!tool) {
  tool = await prisma.tool.create({
    data: {
      name: 'SDC Generator',
      toolType: 'sdcgen',
      description: 'System Design Constraints Generator Tool',
      version: '1.0.0',
      dockerImage: 'logiccore/sdc-generator:latest',
      inputSchema: { /* ... */ }
    }
  });
}
```

**涉及的数据库表**: `Tool`
- **SELECT操作**: 查询工具是否存在
- **INSERT操作** (可选): 如果工具不存在则创建

---

### 2.2 步骤a2：创建Task数据库记录

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:154-171
task = await prisma.task.create({
  data: {
    id: taskId,
    userId,
    toolId: tool.id,
    status: 'DRAFT' as TaskStatus,
    parameters: {
      modName,
      isFlat,
      toolType: 'sdcgen',
      isMultiPage: true,
      pageMethod: 'multi'
    },
    deploymentMode: 'ecs_only',
    localStoragePath: taskDir
  }
});
```

**涉及的数据库表**: `Task`
- **INSERT操作**: 创建任务记录
- **字段说明**:
  - `id`: 唯一任务ID（UUID）
  - `userId`: 用户ID
  - `toolId`: 工具ID
  - `status`: 'DRAFT'（草稿状态）
  - `parameters`: 任务参数（JSON格式）
  - `deploymentMode`: 'ecs_only'
  - `localStoragePath`: 本地存储路径

---

### 2.3 步骤a3：检查并初始化数据库表结构

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:252-262
const existingSheets = await prisma.sheet.findMany({
  where: { toolType: 'sdc' }
});

if (existingSheets.length === 0) {
  await ExcelThrpagesService.initializeSdcDatabaseSchemaHardcoded();
}
```

**涉及的数据库表**: `Sheet`, `Table`
- **SELECT操作**: 检查表结构是否存在
- **INSERT操作** (可选): 如果表结构不存在则初始化

**初始化表结构详细操作**:

```typescript
// excel_thrpages.service.ts:450-476
for (const sheetDef of sdcSchemaDefinition) {
  // 创建Sheet记录
  const sheet = await prisma.sheet.create({
    data: {
      toolType: 'sdc',
      sheetName: sheetDef.sheetName,
      displayOrder: sheetDef.displayOrder
    }
  });

  // 创建Table记录
  for (const tableDef of sheetDef.tables) {
    await prisma.table.create({
      data: {
        sheetId: sheet.id,
        toolType: 'sdc',
        tableName: tableDef.tableName,
        columnsSchema: { columns: tableDef.columns },
        displayOrder: tableDef.displayOrder,
        taskId: null, // 模板表，不绑定特定任务
        isTemplate: true
      }
    });
  }
}
```

**SDC工具表结构**:
- VarDef (Sheet) → TMVAR (Table)
- ClkDef (Sheet) → TMCLK (Table)
- IODly (Sheet) → TMIODLY (Table)
- Exp (Sheet) → TMIOEXP, TMINOUT, TMINTEXP, TMSTPGATE (Tables)

---

### 2.4 步骤a4：解析Excel文件并保存数据到数据库

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:266
await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, dcontPath);
```

**详细操作流程**:

```typescript
// excel_thrpages.service.ts:1138
// 1. 清理该任务的现有数据
await prisma.tableData.deleteMany({ where: { taskId } });

// 2. 查询表结构
sheets = await prisma.sheet.findMany({
  where: { toolType: 'sdc' },
  include: {
    tables: {
      where: { taskId: null }, // SDC使用模板表结构
      orderBy: { displayOrder: 'asc' }
    }
  }
});

// 3. 解析Excel并保存表格数据
for (const sheet of sheets) {
  for (const table of sheet.tables) {
    await parseTableData(worksheet, table, taskId, userId, sheetName);
  }
}
```

**表格数据解析和保存**:

```typescript
// excel_thrpages.service.ts:1417-1600
private static async parseTableData(
  worksheet: ExcelJS.Worksheet,
  table: any,
  taskId: string,
  userId: string,
  sheetName: string,
  allTableNames: string[]
): Promise<void> {
  const columnsSchema = table.columnsSchema?.columns || [];
  const tableLocation = getTableLocation(worksheet, table.tableName);

  const dataStartRow = tableLocation.rowStart + 2; // 跳过表名和列头
  const maxRow = tableLocation.maxRow;

  const tableDataRecords = [];

  for (let rowNumber = 1; rowNumber <= (maxRow - dataStartRow + 1); rowNumber++) {
    const rowData = {};
    let hasData = false;

    for (const column of columnsSchema) {
      const cell = worksheet.getCell(dataStartRow + rowNumber - 1, column.index);
      if (cell.value !== null && cell.value !== undefined) {
        rowData[column.name] = cell.value;
        hasData = true;
      }
    }

    if (hasData) {
      tableDataRecords.push({
        userId,
        taskId,
        tableId: table.id,
        sheetId: table.sheetId,
        rowNumber,
        rowData: rowData,
        dropdownData: null, // 可选：下拉数据
        validationData: null // 可选：验证数据
      });
    }
  }

  // 批量插入数据
  if (tableDataRecords.length > 0) {
    await prisma.tableData.createMany({
      data: tableDataRecords
    });
  }
}
```

**涉及的数据库表**: `TableData`
- **DELETE操作**: 清理任务现有数据
- **SELECT操作**: 查询表结构定义
- **INSERT批量操作**: 保存表格数据

**数据特点**:
- 每个单元格的数据作为独立记录存储
- 支持下拉数据和验证规则的存储
- 任务级数据隔离（通过taskId）

---

### 2.5 步骤a5：验证数据一致性

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:271-275
const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
  task.id,
  userId,
  dcontPath
);
```

**验证逻辑**:

```typescript
// 从数据库读取数据并对比Excel文件内容
const dbData = await prisma.tableData.findMany({
  where: { taskId },
  include: { table: true }
});

// 与Excel文件内容对比
// 验证数据行数、列数、单元格值等
```

**涉及的数据库表**: `TableData`
- **SELECT操作**: 查询任务数据用于验证

---

### 2.6 步骤a6：释放并发槽位（DRAFT状态）

```typescript
// sdc_thrpages.controller.ts:299-306
const { userConcurrentCheck } = await import('../services/user-concurrent-check.service');
await userConcurrentCheck.releaseConcurrentSlot(userId);
```

**说明**: DRAFT状态的任务不占用并发槽位，立即释放。

---

## 3. 用户编辑数据阶段的数据库操作

### 3.1 获取Sheet数据

**API端点**: `GET /api/v1/sdc-thrpages/:taskId/sheet/:sheetName`

**数据库操作**：

```typescript
// excel_thrpages.service.ts:3676+
const tables = await prisma.table.findMany({
  where: {
    sheet: { sheetName: sheetName },
    toolType: 'sdc',
    taskId: null // SDC使用模板
  },
  include: {
    sheet: true,
    tableData: {
      where: { taskId }
    }
  }
});
```

**涉及的数据库表**: `Table`, `Sheet`, `TableData`
- **SELECT操作**: 获取表结构和数据

---

### 3.2 保存Sheet数据

**API端点**: `POST /api/v1/sdc-thrpages/:taskId/sheet/:sheetName/save`

**数据库操作**：

```typescript
// excel_thrpages.service.ts:3769+
for (const tableData of tables) {
  const { tableId, tableName, data } = tableData;

  for (let rowNumber = 0; rowNumber < data.length; rowNumber++) {
    const rowData = data[rowNumber];

    // 使用upsert操作：存在则更新，不存在则创建
    await prisma.tableData.upsert({
      where: {
        taskId_tableId_rowNumber: {
          taskId,
          tableId,
          rowNumber: rowNumber + 1
        }
      },
      update: {
        rowData: rowData
      },
      create: {
        userId,
        taskId,
        tableId,
        sheetId,
        rowNumber: rowNumber + 1,
        rowData: rowData
      }
    });
  }
}
```

**涉及的数据库表**: `TableData`
- **UPSERT操作**: 更新或插入表格数据
- **使用唯一约束**: `taskId_tableId_rowNumber`

---

### 3.3 DataSav：保存Dirty数据

**API端点**: `POST /api/v1/sdc-thrpages/data-sav`

**数据库操作**：

```typescript
// excel_thrpages.service.ts:2240+
for (const dirtySheet of dirtySheetData) {
  const { sheetName, sheetId, tables } = dirtySheet;

  for (const tableData of tables) {
    const { tableId, tableName, data } = tableData;

    // 批量upsert操作
    const upsertData = data.map((row, index) => ({
      userId,
      taskId,
      tableId,
      sheetId,
      rowNumber: index + 1,
      rowData: row
    }));

    // 先删除旧数据，再批量插入
    await prisma.tableData.deleteMany({
      where: {
        taskId,
        tableId
      }
    });

    await prisma.tableData.createMany({
      data: upsertData
    });
  }
}
```

**涉及的数据库表**: `TableData`
- **DELETE批量操作**: 删除表格旧数据
- **CREATE批量操作**: 创建新数据

---

### 3.4 DataChk：数据检查

**API端点**: `POST /api/v1/sdc-thrpages/data-chk`

**数据库操作**：

```typescript
// excel_thrpages.service.ts:2440+
// 1. 同步数据库数据到Excel文件
await syncDatabaseToExcelFile(taskId, userId, dcontPath);

// 2. 执行检查脚本（不涉及数据库操作）

// syncDatabaseToExcelFile的数据库操作：
const sheets = await prisma.sheet.findMany({
  where: { toolType: 'sdc' },
  include: {
    tables: {
      where: { taskId: null },
      orderBy: { displayOrder: 'asc' }
    }
  }
});

for (const sheet of sheets) {
  for (const table of sheet.tables) {
    const tableData = await prisma.tableData.findMany({
      where: {
        taskId,
        tableId: table.id
      },
      orderBy: { rowNumber: 'asc' }
    });

    // 将数据写入Excel文件
  }
}
```

**涉及的数据库表**: `Sheet`, `Table`, `TableData`
- **SELECT操作**: 读取数据用于同步到Excel

---

## 4. 任务提交执行阶段（a8-a14）的数据库操作

### 4.1 步骤a8：查询订阅信息和并发检查

**API端点**: `POST /api/v1/sdc-thrpages/:taskId/submit`

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:622-629
const subscription = await prisma.subscription.findFirst({
  where: {
    userId: userId,
    status: 'ACTIVE',
    endDate: { gt: new Date() }
  },
  include: { plan: true }
});
```

**涉及的数据库表**: `Subscription`, `Plan`
- **SELECT操作**: 查询用户订阅信息

---

### 4.2 步骤a9：验证任务权限

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:653-655
const task = await prisma.task.findFirst({
  where: { id: taskId, userId }
});
```

**涉及的数据库表**: `Task`
- **SELECT操作**: 验证任务权限

---

### 4.3 步骤a10：任务入队和状态更新

**数据库操作**：

```typescript
// sdc_thrpages.controller.ts:668
await redisClient.rpush('task_queue', taskId);

// sdc_thrpages.controller.ts:678-684
await prisma.task.update({
  where: { id: taskId },
  data: {
    status: 'PENDING' as TaskStatus,
    queuedAt: new Date()
  }
});
```

**涉及的数据库表**: `Task`
- **UPDATE操作**: 更新任务状态为PENDING

---

### 4.4 步骤a11：Worker处理任务

**Python Worker数据库操作**：

```python
# toolWorker.py:1166-1194
def process_task(task_id):
    session = Session()
    task = session.query(Task).filter_by(id=task_id).first()

    # 更新任务状态为RUNNING
    task.status = 'RUNNING'
    task.startedAt = datetime.now(timezone.utc)
    session.commit()

    # 执行任务...
```

**涉及的数据库表**: `Task`
- **SELECT操作**: 查询任务信息
- **UPDATE操作**: 更新任务状态为RUNNING

---

### 4.5 步骤a12：更新任务进度

**数据库操作**：

```python
# toolWorker.py:313-387
def update_task_progress(self, current_step, shared_session=None):
    session = shared_session or self.get_db_session()

    task = session.query(Task).filter(Task.id == self.task_id).first()
    if task:
        task.progress = progress  # 30%, 35%, 45%, ...
        task.currentStep = current_step
        task.stepStartedAt = datetime.now(timezone.utc)
        task.updatedAt = datetime.now(timezone.utc)

        session.commit()
        session.flush()
```

**涉及的数据库表**: `Task`
- **UPDATE操作**: 更新任务进度
- **进度映射**:
  - WORKER_ASSIGNED: 30%
  - CONTAINER_IMAGE_LOADING: 35%
  - JOBS_DIRECTORY_CREATION: 45%
  - TEMP_TO_JOBS_COPY: 47%
  - CONTAINER_EXECUTION: 50%
  - RESULT_PACKAGING: 85%
  - WORK_DIRECTORY_CLEANUP: 92%
  - TEMP_CLEANUP_SCHEDULE: 95%
  - COMPLETED: 100%

---

### 4.6 步骤a13：容器执行超时处理

**数据库操作**：

```python
# toolWorker.py:1715-1727
task = session.query(Task).filter(Task.id == task.id).first()
if task:
    task.status = 'EXECUTION_TIMEOUT'
    task.finishedAt = datetime.now(timezone.utc)
    task.errorMessage = f"Container execution timeout after {execution_time:.0f} seconds"
    session.commit()
    session.flush()
```

**涉及的数据库表**: `Task`
- **UPDATE操作**: 更新任务状态为EXECUTION_TIMEOUT

---

### 4.7 步骤a14：任务完成处理

#### 4.7.1 成功完成

**数据库操作**：

```python
# toolWorker.py:1851-1863
task = session.query(Task).filter(Task.id == task.id).first()
if task:
    task.status = 'COMPLETED'
    task.finishedAt = datetime.now(timezone.utc)
    task.outputFile = result_zip
    task.downloadStatus = 'AVAILABLE'
    session.commit()
    session.flush()
```

**涉及的数据库表**: `Task`
- **UPDATE操作**: 更新任务状态为COMPLETED
- **字段更新**:
  - `status`: 'COMPLETED'
  - `finishedAt`: 完成时间
  - `outputFile`: 结果文件名
  - `downloadStatus`: 'AVAILABLE'

---

#### 4.7.2 执行失败

**数据库操作**：

```python
# toolWorker.py:1887-1898
task = session.query(Task).filter(Task.id == task.id).first()
if task:
    task.status = 'FAILED'
    task.finishedAt = datetime.now(timezone.utc)
    task.errorMessage = f"Container execution failed with exit code {exit_code}"
    session.commit()
    session.flush()
```

**涉及的数据库表**: `Task`
- **UPDATE操作**: 更新任务状态为FAILED

---

## 5. 任务完成后的数据清理机制

### 5.1 正常完成任务的清理（2分钟下载期后）

**清理时机**: 任务完成2分钟后

**清理流程**:

```typescript
// cleanup.service.ts:86-185
private static async checkCompletedTasksForPreciseCleanup(): Promise<void> {
  // 查找最近3分钟内完成的任务
  const completedTasks = await prisma.task.findMany({
    where: {
      status: 'COMPLETED',
      finishedAt: {
        not: null,
        gte: new Date(Date.now() - 3 * 60 * 1000)
      },
      cleanedAt: null
    }
  });

  for (const task of completedTasks) {
    const timeSinceCompletion = now - task.finishedAt.getTime();

    // 如果刚好到达2分钟清理时间
    if (timeSinceCompletion >= downloadTimeoutMs) {
      // 执行完整清理
      await this.performCompleteTaskCleanup(task.id, 'DOWNLOAD_TIMEOUT_EXPIRED');

      // 更新任务cleanedAt时间戳
      await prisma.task.update({
        where: { id: task.id },
        data: { cleanedAt: new Date() }
      });
    }
  }
}
```

**涉及的数据库表**: `Task`
- **SELECT操作**: 查找待清理任务
- **UPDATE操作**: 更新cleanedAt时间戳

---

### 5.2 完整清理操作

**清理内容**:

```typescript
// cleanup.service.ts:257-298
private static async performCompleteTaskCleanup(taskId: string, reason: string): Promise<void> {
  // 1. 清理Docker容器
  await this.cleanupTaskContainer(taskId);

  // 2. 清理jobs目录
  await this.cleanupJobsDirectory(taskId);

  // 3. 清理temp目录
  await this.cleanupTempDirectory(taskId);

  // 4. 清理logs目录
  await this.cleanupLogsDirectory(taskId);

  // 5. 清理Redis中的任务记录
  await this.cleanupRedisTaskRecords(taskId);

  // 6. 清理Excel多页面交互数据
  await this.cleanupExcelThrpagesData(taskId);
}
```

---

### 5.3 Excel多页面数据清理（a15步骤）

**数据库操作**：

```typescript
// cleanup.service.ts:700-716
private static async cleanupExcelThrpagesData(taskId: string): Promise<void> {
  // 清理该任务相关的数据库table_data表格数据
  await ExcelThrpagesService.cleanupTaskData(taskId);
}

// excel_thrpages.service.ts中的cleanupTaskData方法：
static async cleanupTaskData(taskId: string): Promise<void> {
  // 删除TableData记录
  await prisma.tableData.deleteMany({
    where: { taskId }
  });
}
```

**涉及的数据库表**: `TableData`
- **DELETE批量操作**: 删除任务的所有表格数据

**保留内容**:
- `Sheet`表记录（表模型）
- `Table`表记录（表结构）
- `Task`表记录（任务历史）

**清理内容**:
- `TableData`表记录（用户填写的表格数据）

---

### 5.4 失败任务的清理

**清理时机**:
- 执行超时任务：5分钟后
- 失败任务：5分钟后
- 队列超时任务：5分钟后

**数据库操作**：

```typescript
// cleanup.service.ts:598-695
private static async validateCleanupConditions(taskId: string, metadata: any): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      finishedAt: true,
      timeoutType: true,
      outputFile: true,
      createdAt: true,
      startedAt: true,
      cleanedAt: true
    }
  });

  // 检查清理条件...
}

// cleanup.service.ts:764-870
static async cleanupFailedTask(
  taskId: string,
  toolType: 'sdc' | 'upf',
  cleanupMode: 'all' | 'jobs_only' | 'temp_logs'
): Promise<{...}> {
  // 1. 清理jobs目录
  // 2. 清理temp和logs目录（可选）
  // 3. 清理Excel多页面交互数据
  await this.cleanupExcelThrpagesData(taskId);

  // 4. 更新任务的cleanedAt时间戳
  await prisma.task.update({
    where: { id: taskId },
    data: { cleanedAt: now }
  });
}
```

**涉及的数据库表**: `Task`, `TableData`
- **SELECT操作**: 查询任务信息
- **UPDATE操作**: 更新cleanedAt时间戳
- **DELETE操作**: 删除TableData数据

---

## 6. 任务状态管理的数据库操作

### 6.1 状态协调服务

**定时检查**: 每5分钟执行一次

**数据库操作**：

```typescript
// task-state-manager.service.ts:28-59
async reconcileTaskStates(): Promise<void> {
  // 1. 检查长时间运行的任务
  await this.checkStuckTasks();

  // 2. 检查孤儿任务
  await this.checkOrphanTasks();

  // 3. 检查状态不一致的任务
  await this.checkInconsistentTasks();
}
```

---

### 6.2 检查卡住的任务

**数据库操作**：

```typescript
// task-state-manager.service.ts:64-134
private async checkStuckTasks(): Promise<void> {
  const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);

  const stuckTasks = await prisma.task.findMany({
    where: {
      status: 'RUNNING',
      updatedAt: { lt: stuckThreshold }
    },
    select: {
      id: true,
      userId: true,
      status: true,
      updatedAt: true,
      createdAt: true
    }
  });

  for (const task of stuckTasks) {
    // 检查容器状态
    const containerStatus = await this.checkContainerStatus(task.id);

    if (!containerStatus.isRunning) {
      // 更新任务状态为失败
      await updateTaskStatus(task.id, 'FAILED', {
        errorMessage: 'Container not found or stopped unexpectedly',
        failureReason: 'CONTAINER_LOST',
        finishedAt: new Date()
      });
    }
  }
}
```

**涉及的数据库表**: `Task`
- **SELECT操作**: 查询卡住的任务
- **UPDATE操作**: 更新任务状态

---

### 6.3 检查孤儿任务

**数据库操作**：

```typescript
// task-state-manager.service.ts:139-196
private async checkOrphanTasks(): Promise<void> {
  const orphanThreshold = new Date(Date.now() - 10 * 60 * 1000);

  const orphanTasks = await prisma.task.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: orphanThreshold }
    }
  });

  for (const task of orphanTasks) {
    const isInQueue = await this.checkTaskInQueue(task.id);

    if (!isInQueue) {
      // 标记为失败
      await updateTaskStatus(task.id, 'FAILED', {
        errorMessage: 'Task was not found in execution queue',
        failureReason: 'QUEUE_LOST',
        finishedAt: new Date()
      });
    }
  }
}
```

**涉及的数据库表**: `Task`
- **SELECT操作**: 查询潜在的孤儿任务
- **UPDATE操作**: 更新任务状态

---

## 7. 数据库数据保留策略

### 7.1 任务完成后保留的数据

**永久保留**:
- `Task`表记录（任务历史、元数据）
- `Sheet`表记录（表模型定义）
- `Table`表记录（表结构定义，taskId=null的模板）

**临时保留**:
- `TableData`表记录（用户数据，2分钟后删除）

**删除时机**: 任务完成2分钟下载期结束后

---

### 7.2 任务失败后保留的数据

**永久保留**:
- `Task`表记录（失败历史，用于分析）
- `Sheet`表记录（表模型定义）
- `Table`表记录（表结构定义）

**临时保留**:
- `TableData`表记录（5分钟后删除）
- `temp/{taskId}`目录（5分钟后删除）
- `logs/{taskId}`目录（24小时后删除）
- `jobs/{taskId}`目录（5分钟后删除）

---

### 7.3 数据清理汇总表

| 数据类型 | 正常完成 | 执行失败 | 队列超时 | 用户删除 |
|---------|---------|---------|---------|---------|
| Task记录 | ✅ 永久保留 | ✅ 永久保留 | ✅ 永久保留 | ❌ 删除 |
| TableData | ❌ 2分钟后删除 | ❌ 5分钟后删除 | ❌ 5分钟后删除 | ❌ 删除 |
| jobs目录 | ❌ 2分钟后删除 | ❌ 5分钟后删除 | ❌ 5分钟后删除 | ❌ 删除 |
| temp目录 | ❌ 2分钟后删除 | ❌ 5分钟后删除 | ❌ 5分钟后删除 | ❌ 删除 |
| logs目录 | ❌ 2分钟后删除 | ✅ 24小时保留 | ✅ 24小时保留 | ❌ 删除 |
| Sheet/Table模板 | ✅ 永久保留 | ✅ 永久保留 | ✅ 永久保留 | ✅ 永久保留 |

---

## 8. 数据库操作性能优化

### 8.1 批量操作

```typescript
// 批量插入数据
await prisma.tableData.createMany({
  data: tableDataRecords,
  skipDuplicates: true
});

// 批量删除数据
await prisma.tableData.deleteMany({
  where: { taskId }
});
```

---

### 8.2 索引优化

**数据库索引**:

```prisma
model TableData {
  @@unique([taskId, tableId, rowNumber])
  @@index([userId, taskId])
  @@index([taskId])
  @@index([tableId])
  @@index([sheetId])
}

model Task {
  @@index([userId, status])
  @@index([userId, createdAt])
  @@index([status, createdAt])
  @@index([queuedAt])
}
```

---

### 8.3 事务管理

```python
# Python Worker使用事务
session.commit()
session.flush()
```

---

## 9. 总结

### 9.1 数据库操作类型统计

| 操作类型 | 使用场景 | 频率 |
|---------|---------|------|
| SELECT | 查询任务、用户、表结构 | 高频 |
| INSERT | 创建任务、保存数据 | 中频 |
| UPDATE | 更新任务状态、进度 | 高频 |
| DELETE | 清理任务数据 | 低频 |
| UPSERT | 保存表格数据 | 中频 |

---

### 9.2 关键数据流

```
用户提交 → Task创建 → 表结构初始化 → Excel解析 → TableData存储
     ↓
用户编辑 → 数据保存/更新
     ↓
任务提交 → 状态更新 → 入队 → Worker处理
     ↓
容器执行 → 进度更新 → 完成标记
     ↓
结果下载 → 2分钟倒计时 → 数据清理
```

---

### 9.3 数据一致性保证

1. **事务管理**: 使用commit/flush确保数据持久化
2. **唯一约束**: taskId + tableId + rowNumber确保数据唯一性
3. **状态同步**: 数据库、Redis、WebSocket三层同步
4. **定期检查**: 状态协调服务定期检查并修复不一致

---

## 10. 附录

### 10.1 相关文件列表

```
app/backend/src/
├── controllers/sdc_thrpages.controller.ts    # 任务初始化和提交
├── services/excel_thrpages.service.ts        # Excel数据解析和保存
├── services/task-cleanup.service.ts          # 任务数据清理
├── services/cleanup.service.ts               # 完整清理服务
├── services/task-state-manager.service.ts    # 状态管理
├── workers/toolWorker.py                     # 任务执行Worker
└── prisma/schema.prisma                      # 数据库模型定义
```

---

### 10.2 数据库表关系图

```
User (1) ←→ (N) Task
           ↓
        (1) Tool
           ↓
Task (1) ←→ (N) TableData
           ↓
        (N) Table
           ↓
        (1) Sheet
```

---

### 10.3 时间线总结

| 时间点 | 操作 | 数据库变化 |
|-------|------|----------|
| T+0s | 用户初始化任务 | Task创建（DRAFT） |
| T+1s | Excel解析完成 | TableData插入 |
| T+Ns | 用户编辑数据 | TableData更新 |
| T+Ns | 用户提交任务 | Task更新（PENDING） |
| T+Ns | Worker获取任务 | Task更新（RUNNING） |
| T+Ns | 进度更新 | Task.progress更新 |
| T+Ns | 任务完成 | Task更新（COMPLETED） |
| T+120s | 下载期结束 | TableData删除，cleanedAt设置 |

---

**报告生成时间**: 2026-01-06
**分析版本**: LogicCore v9 (6320358)
**部署模式**: ECS Only
**分析工具类型**: SDC/UPF多页面交互
