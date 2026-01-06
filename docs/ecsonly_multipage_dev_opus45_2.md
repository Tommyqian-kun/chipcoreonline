# ECS ONLY模式多页面交互开发文档 (第三部分)

> 本文档基于 LogicCore 项目的实际代码实现，详细阐述 ECS ONLY 模式下多页面交互的工具执行流程、日志管理、系统部署和优化建议。

---

## 第9章：工具执行流程详解

### 9.1 概述

本章节详细阐述目前开发好的 **SDC** 和 **UPF** 两个工具各自完整的任务执行流程。在 ECS ONLY 模式下，工具执行采用本地文件存储 + Docker 容器化执行的架构，无需依赖阿里云 OSS 和 ACR 服务。

#### 9.1.1 核心执行组件

| 组件 | 位置 | 职责 |
|------|------|------|
| 前端控制器 | `app/backend/src/controllers/sdc_thrpages.controller.ts`<br>`app/backend/src/controllers/upf_thrpages.controller.ts` | 处理初始化请求、文件上传、表格数据保存 |
| Excel服务 | `app/backend/src/services/excel_thrpages.service.ts` | Excel文件解析、数据库同步、数据验证 |
| Worker进程 | `app/backend/src/workers/toolWorker.py` | 任务队列消费、容器执行管理 |
| 容器管理器 | `app/backend/src/workers/container_manager.py` | Docker容器生命周期管理 |
| 文件管理器 | `toolWorker.py:EcsLocalFileManager` | 本地目录结构创建、文件复制 |

---

### 9.2 SDC工具完整执行流程

#### 9.2.1 执行流程总览图

```mermaid
flowchart TB
    Start([用户访问SDC工具页面]) --> Upload[上传3个输入文件<br/>hier.yaml, vlog.v, dcont.xlsx]
    Upload --> Init[初始化任务<br/>生成taskId]
    Init --> PythonScript[执行Python脚本<br/>sdc_dg_gen.py]
    PythonScript --> GenerateExcel[生成cont.xlsx<br/>包含表格结构]
    GenerateExcel --> DBInit[(数据库初始化<br/>创建表结构)]
    DBInit --> ParseExcel[解析Excel文件<br/>同步到数据库]
    ParseExcel --> Validate[数据一致性验证]
    Validate -->|验证失败| Error[返回错误]
    Validate -->|验证成功| UserFill[用户填写表格数据]
    UserFill --> SaveData[保存数据到数据库]
    SaveData --> Submit[用户提交任务]
    Submit --> PushRedis[推送任务到Redis队列]
    PushRedis --> WorkerFetch[Worker获取任务]
    WorkerFetch --> CheckImage[检查Docker镜像]
    CheckImage -->|镜像不存在| LoadTar[从tar文件加载镜像]
    CheckImage -->|镜像存在| CreateDirs[创建jobs目录结构]
    LoadTar --> CreateDirs
    CreateDirs --> CopyFiles[复制文件到工作目录]
    CopyFiles --> StartContainer[启动Docker容器]
    StartContainer --> ContainerExec[容器执行工具命令<br/>3分钟超时]
    ContainerExec -->|成功| Package[打包结果文件]
    ContainerExec -->|超时| Timeout[标记EXECUTION_TIMEOUT]
    ContainerExec -->|失败| Failed[标记FAILED]
    Package --> CleanWork[清理work目录]
    CleanWork --> ScheduleCleanup[标记2分钟后清理temp]
    ScheduleCleanup --> Completed([任务完成])
    Timeout --> CleanupFail[清理所有资源]
    Failed --> CleanupFail
    CleanupFail --> End([结束])
    Completed --> Download[用户下载结果zip]
    Download --> After2Min[2分钟后自动清理temp]
    After2Min --> End
```

#### 9.2.2 详细执行步骤

##### 阶段一：前端初始化与文件上传 (a1-a3)

**API路由**: `POST /api/v1/sdc/thrpages/initialize`

**核心代码位置**: `sdc_thrpages.controller.ts:initializeTask`

```typescript
// 1. 验证文件上传完整性
if (!files?.hierYamlFile?.[0] || !files?.vlogFile?.[0] || !files?.dcontXlsxFile?.[0]) {
  return res.status(400).json({ error: '必须上传hier.yaml、vlog.v和dcont.xlsx文件' });
}

// 2. 生成任务ID
const taskId = uuidv4();

// 3. 创建任务目录
const taskDir = path.join(tempUploadDir, taskId);
await fsPromises.mkdir(taskDir, { recursive: true });

// 4. 保存上传文件
await fsPromises.writeFile(hierYamlPath, files.hierYamlFile[0].buffer);
await fsPromises.writeFile(vlogPath, files.vlogFile[0].buffer);
await fsPromises.writeFile(dcontPath, files.dcontXlsxFile[0].buffer);
```

**生成的目录结构**:
```
temp/{taskId}/
├── hier.yaml      # 层次结构文件
├── vlog.v         # 网表文件
└── dcont.xlsx     # 原始输入文件
```

##### 阶段二：Excel生成与数据库初始化 (a4-a7)

**Python脚本调用**: `sdc_dg_gen.py sdc_dg_gen -taskid <taskid> -dg`

```python
# 核心功能
# 1. 解析hier.yaml和vlog.v，生成设计层次结构
# 2. 基于模板生成cont.xlsx，包含所有Sheet页
# 3. 设置表格列结构和下拉选项
```

**数据库初始化流程**:

```typescript
// 1. 初始化全局表结构模板
await ExcelThrpagesService.initializeDatabaseSchema('sdc');

// 2. 创建任务特定表结构副本
await ExcelThrpagesService.createTaskSpecificTableStructure(taskId, userId, 'sdc');

// 3. 解析Excel并同步数据
await ExcelThrpagesService.parseTaskExcelFile(taskId, userId, contPath, 'sdc');

// 4. 验证数据一致性
const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
  taskId, userId, contPath, true
);
```

**数据库表结构**:
```sql
-- Sheet表 (模板)
Sheet {
  id, sheetName, sheetIndex, displayOrder,
  toolType, isTemplate, createdAt, updatedAt
}

-- Table表 (列定义)
Table {
  id, tableId, tableName, displayName, displayOrder,
  columnIndex, columnName, columnType, dropdownOptions,
  toolType, taskId, isTemplate, sheetId
}

-- TableData表 (用户数据)
TableData {
  id, tableId, rowIndex, cellIndex, cellValue,
  taskId, userId, createdAt, updatedAt
}
```

##### 阶段三：用户填写数据 (a8-a10)

**前端表格操作**:
- 用户通过多页面界面逐Sheet填写数据
- 每次保存调用 `POST /api/v1/sdc/thrpages/{taskId}/data`
- 数据实时同步到 `TableData` 表

**保存数据API**:
```typescript
// sdc_thrpages.controller.ts:saveSheetData
const { sheetName, tableName, rowIndex, cellIndex, cellValue } = req.body;

await prisma.tableData.upsert({
  where: {
    tableId_rowIndex_cellIndex_taskId: {
      tableId, rowIndex, cellIndex, taskId
    }
  },
  update: { cellValue },
  create: { tableId, rowIndex, cellIndex, cellValue, taskId, userId }
});
```
**检查数据API**:
```
```
##### 阶段四：任务提交与队列处理 (a11-a13)

**提交API**: `POST /api/v1/sdc/thrpages/{taskId}/submit`

```typescript
// 1. 将任务状态更新为PENDING
await prisma.task.update({
  where: { id: taskId },
  data: { status: 'PENDING' }
});

// 2. 推送到Redis队列
await redisClient.lpush('task_queue', JSON.stringify({
  taskId,
  userId,
  toolId: 'sdc-generator',
  toolType: 'sdcgen'
}));

// 3. 返回提交成功
res.json({ success: true, message: '任务已提交' });
```

##### 阶段五：Worker执行任务 (a14-a20)

**Worker主流程** (`toolWorker.py:process_task`):

```python
def process_task(task_id):
    # a14: 获取任务
    task = session.query(Task).filter_by(id=task_id).first()
    task_logger = TaskLogger(task_id, task.userId)

    # a15: 更新状态为RUNNING
    task.status = 'RUNNING'
    task.startedAt = datetime.now(timezone.utc)
    session.commit()

    # a16: 执行ECS Only模式处理
    if task.deploymentMode == 'ecs_only':
        success = process_task_ecs_only(task, task_logger, session)

    # a21: 更新最终状态
    if success:
        task.status = 'COMPLETED'
    else:
        task.status = 'FAILED'
    task.finishedAt = datetime.now(timezone.utc)
    session.commit()
```

**ECS Only详细处理** (`process_task_ecs_only`):

```python
# a8: Worker获取任务ID，进度30%
task_logger.update_task_progress('WORKER_ASSIGNED', session)

# a9: 检查并加载Docker镜像
image_name = tool.dockerImage  # logiccore/sdc-generator:latest
if not check_local_image_exists(image_name):
    load_image_from_tar(image_name, task_logger)

# a10: 创建jobs目录结构 (进度45%)
file_manager.create_directories(module_name, tool_type)
# 生成目录结构:
# jobs/{taskId}/
# ├── input/    # 输入文件
# ├── output/   # 结果文件
# ├── logs/     # 日志文件
# └── work/{modName}/sdcgen/
#     ├── inputs/  # 工具输入
#     ├── outputs/ # 工具输出
#     ├── logs/    # 工具日志
#     └── rpts/    # 报告文件

# a10: 复制temp文件 (进度47%)
process_temp_files(task, task_logger, file_manager)
# temp/{taskId}/* -> jobs/{taskId}/input/
#                   -> jobs/{taskId}/work/{modName}/sdcgen/inputs/

# a11: 启动容器执行 (进度50%)
container = container_manager.create_container(
    task.id, image_name,
    command=["run"],
    environment=env_vars,
    volumes=volumes,
    nano_cpus=2e9,           # 2 CPU核心
    mem_limit="16g",         # 16GB内存
    network_mode='none',     # 无网络
    read_only=True,          # 只读文件系统
    tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'}
)

# 等待容器完成 (3分钟超时)
result = container.wait(timeout=180)
exit_code = result['StatusCode']
```

**环境变量配置**:
```python
env_vars = {
    'TASK_ID': task.id,
    'USER_ID': task.userId,
    'TOOL_ID': task.toolId,
    'DEPLOYMENT_MODE': 'ecs_only',
    'MODULE_NAME': module_name,
    'TOOL_TYPE': 'sdcgen',
    'SDC_MOD_NAME': module_name,
    'SDC_IS_FLAT': str(params.get('isFlat', False)).lower(),
    'USER_PERMISSION_TYPE': 'fre',  # 或 'pro'
    'JOB_INPUT_DIR': '/data/input',
    'JOB_OUTPUT_DIR': '/data/output',
    'JOB_LOG_DIR': '/data/logs'
}
```

**Docker卷挂载**:
```python
volumes = {
    '/data/chipcore/jobs/{taskId}/input': {
        'bind': '/data/input',
        'mode': 'ro'  # 只读
    },
    '/data/chipcore/jobs/{taskId}/output': {
        'bind': '/data/output',
        'mode': 'rw'  # 读写
    },
    '/data/chipcore/jobs/{taskId}/logs': {
        'bind': '/data/logs',
        'mode': 'rw'
    },
    '/data/chipcore/jobs/{taskId}/work': {
        'bind': '/data/work',
        'mode': 'rw'
    }
}
```

##### 阶段六：结果处理与清理 (a22-a24)

**容器成功完成 (exit_code=0)**:

```python
# a12: 检查结果文件 (进度85%)
output_dir = file_manager.get_output_dir()
container_zip_pattern = os.path.join(output_dir, f"result_{task.id}_{tool_type}_*.zip")
container_zip_files = glob.glob(container_zip_pattern)

if container_zip_files:
    # 使用容器生成的zip文件
    result_zip = os.path.basename(container_zip_files[0])
else:
    # Worker重新打包
    result_zip = file_manager.package_results(tool_name, module_name, tool_type)

# a13: 清理work目录 (进度92%)
work_dir = file_manager.get_work_dir()
shutil.rmtree(work_dir)

# a14: 标记2分钟后清理temp (进度95%)
cleanup_temp_files(task.id, task_logger, "task_completed")

# 更新数据库
task.outputFile = result_zip
task.downloadStatus = 'AVAILABLE'
task.downloadTimeRemaining = 120  # 2分钟
session.commit()
```

**容器执行超时 (3分钟)**:

```python
# 更新状态为EXECUTION_TIMEOUT
task.status = 'EXECUTION_TIMEOUT'
task.errorMessage = f"Container execution timeout after {execution_time:.0f} seconds"

# 清理所有资源
cleanup_container_for_task(task.id, "execution_timeout")
cleanup_temp_files(task.id, task_logger, "execution_timeout")
shutil.rmtree(file_manager.task_dir)  # 清理jobs目录
```

**容器执行失败 (exit_code != 0)**:

```python
task.status = 'FAILED'
task.errorMessage = f"Container execution failed with exit code {exit_code}"

cleanup_container_for_task(task.id, "task_failed")
cleanup_temp_files(task.id, task_logger, "task_failed")
```

##### 阶段七：结果下载与最终清理 (a25-a26)

**下载API**: `GET /api/v1/download/{taskId}/file/{filename}`

```typescript
// 1. 验证用户权限
const task = await prisma.task.findFirst({ where: { id: taskId, userId: req.user.id } });

// 2. 检查下载状态
if (task.downloadStatus !== 'AVAILABLE' || task.downloadTimeRemaining <= 0) {
  return res.status(403).json({ error: '下载已过期' });
}

// 3. 构建文件路径
const filePath = path.join(ECS_JOBS_DIR, taskId, 'output', filename);

// 4. 发送文件
res.download(filePath, filename);
```

**2分钟后自动清理** (`cleanup_temp_files`):

```python
def cleanup_temp_files(task_id, task_logger, cleanup_reason):
    temp_dir = os.path.join(temp_upload_dir, task_id)

    # 检查是否满足清理条件
    if cleanup_reason == "task_completed":
        task = session.query(Task).filter_by(id=task_id).first()
        time_since_completion = datetime.now(timezone.utc) - task.finishedAt

        if time_since_completion.total_seconds() > 2 * 60:  # 2分钟
            should_cleanup = True
            shutil.rmtree(temp_dir)
```

---

### 9.3 UPF工具完整执行流程

#### 9.3.1 执行流程总览图

```mermaid
flowchart TB
    Start([用户访问UPF工具页面]) --> Upload[上传4个输入文件<br/>hier.yaml, pvlog.v, pobj.tcl, pcell.yaml]
    Upload --> Init[初始化任务<br/>生成taskId]
    Init --> PythonScript[执行Python脚本<br/>upf_dg_gen.py]
    PythonScript --> GenerateExcel[生成pcont.xlsx<br/>包含表格结构]
    GenerateExcel --> DBInit[(数据库初始化<br/>创建表结构)]
    DBInit --> ParseExcel[解析Excel文件<br/>同步到数据库]
    ParseExcel --> UpdateColumns[更新动态列结构<br/>UPF特有步骤]
    UpdateColumns --> Validate[数据一致性验证]
    Validate -->|验证失败| Error[返回错误]
    Validate -->|验证成功| UserFill[用户填写表格数据]
    UserFill --> SaveData[保存数据到数据库]
    SaveData --> Submit[用户提交任务]
    Submit --> PushRedis[推送任务到Redis队列]
    PushRedis --> WorkerFetch[Worker获取任务]
    WorkerFetch --> CheckImage[检查Docker镜像]
    CheckImage -->|镜像不存在| LoadTar[从tar文件加载镜像]
    CheckImage -->|镜像存在| CreateDirs[创建jobs目录结构]
    LoadTar --> CreateDirs
    CreateDirs --> CopyFiles[复制文件到工作目录]
    CopyFiles --> StartContainer[启动Docker容器]
    StartContainer --> ContainerExec[容器执行工具命令<br/>3分钟超时]
    ContainerExec -->|成功| Package[打包结果文件]
    ContainerExec -->|超时| Timeout[标记EXECUTION_TIMEOUT]
    ContainerExec -->|失败| Failed[标记FAILED]
    Package --> CleanWork[清理work目录]
    CleanWork --> ScheduleCleanup[标记2分钟后清理temp]
    ScheduleCleanup --> Completed([任务完成])
    Timeout --> CleanupFail[清理所有资源]
    Failed --> CleanupFail
    CleanupFail --> End([结束])
    Completed --> Download[用户下载结果zip]
    Download --> After2Min[2分钟后自动清理temp]
    After2Min --> End
```

#### 9.3.2 UPF工具特有差异

**与SDC工具的主要差异**:

| 特性 | SDC工具 | UPF工具 |
|------|---------|---------|
| 输入文件数量 | 3个 (hier.yaml, vlog.v, dcont.xlsx) | 4个 (hier.yaml, pvlog.v, pobj.tcl, pcell.yaml) |
| Python脚本 | sdc_dg_gen.py | upf_dg_gen.py |
| 生成Excel文件 | cont.xlsx | pcont.xlsx |
| 数据库初始化 | 一次初始化 | 两次初始化 (模板+动态列) |
| 工具类型标识 | sdc/sdcgen | upf/upfgen |
| Docker镜像 | logiccore/sdc-generator:latest | logiccore/upf-generator:latest |

**UPF特有的二次数据库初始化**:

```typescript
// upf_thrpages.controller.ts:initializeTask

// 第一次初始化：创建基础表结构
await ExcelThrpagesService.createTaskSpecificTableStructure(task.id, userId, 'upf');

// UPF特有：第二次初始化，更新动态列结构
await ExcelThrpagesService.updateTaskSpecificDynamicTableColumns(
  task.id,
  pcontPath  // pcont.xlsx路径
);
```

**动态列更新逻辑** (`excel_thrpages.service.ts`):

```typescript
static async updateTaskSpecificDynamicTableColumns(
  taskId: string,
  excelFilePath: string
): Promise<void> {
  // 1. 读取Excel文件，获取动态列信息
  const workbook = xlsx.readFile(excelFilePath);

  // 2. 遍历每个Sheet页
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');

    // 3. 解析动态列定义
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = xlsx.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];

      if (cell && cell.v.startsWith('DYNAMIC_COL:')) {
        const colConfig = this.parseDynamicColumnConfig(cell.v);

        // 4. 更新数据库Table表
        await prisma.table.create({
          data: {
            tableId: generateTableId(),
            tableName: colConfig.name,
            columnType: colConfig.type,
            dropdownOptions: colConfig.options,
            toolType: 'upf',
            taskId: taskId,
            isTemplate: false
          }
        });
      }
    }
  }
}
```

---

### 9.4 目录结构与文件映射

#### 9.4.1 完整目录结构

```
LogicCore/
├── app/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── controllers/     # 前端控制器
│   │   │   │   ├── sdc_thrpages.controller.ts
│   │   │   │   └── upf_thrpages.controller.ts
│   │   │   ├── services/        # 业务服务
│   │   │   │   ├── excel_thrpages.service.ts
│   │   │   │   ├── task-cleanup.service.ts
│   │   │   │   └── ecs-local-storage.service.ts
│   │   │   └── workers/         # Worker进程
│   │   │       ├── toolWorker.py
│   │   │       └── container_manager.py
│   │   └── .env                 # 环境变量配置
│   └── frontend/                # 前端代码
├── temp/                        # 临时上传目录
│   └── {taskId}/
│       ├── hier.yaml
│       ├── vlog.v
│       └── dcont.xlsx
├── jobs/                        # 任务执行目录
│   └── {taskId}/
│       ├── input/               # 输入文件
│       ├── output/              # 结果文件
│       │   └── result_{taskId}_{toolType}_*.zip
│       ├── logs/                # 日志文件
│       │   ├── container.log
│       │   └── worker_*.log
│       └── work/                # 工作目录 (执行后清理)
│           └── {modName}/
│               └── {toolType}/
│                   ├── inputs/
│                   ├── outputs/
│                   ├── logs/
│                   └── rpts/
└── logs/                        # 任务日志 (项目根目录)
    └── {taskId}/
        └── worker_*.log
```

#### 9.4.2 文件生命周期

```mermaid
stateDiagram-v2
    [*] --> Uploaded: 用户上传到temp/{taskId}
    Uploaded --> Copied: Worker复制到jobs/{taskId}/input
    Copied --> Processing: 容器执行处理
    Processing --> Result: 生成结果到jobs/{taskId}/output
    Result --> Downloading: 用户下载 (2分钟窗口)
    Downloading --> Cleaned: 2分钟后清理
    Processing --> Failed: 执行失败
    Failed --> Cleaned: 立即清理
    Cleaned --> [*]
```

---

### 9.5 任务进度映射表

**进度百分比映射** (`toolWorker.py:update_task_progress`):

| 步骤 | 进度 | 说明 |
|------|------|------|
| WORKER_ASSIGNED | 30% | Worker获取任务ID |
| CONTAINER_IMAGE_LOADING | 35% | 工具容器加载 |
| JOBS_DIRECTORY_CREATION | 45% | 创建jobs目录 |
| TEMP_TO_JOBS_COPY | 47% | 复制数据文件 |
| CONTAINER_EXECUTION | 50% | 容器启动执行 |
| RUNNING | 50% | 容器执行中 |
| RESULT_PACKAGING | 85% | 生成结果并打包 |
| GENERATING_RESULTS | 85% | 生成结果并打包 |
| WORK_DIRECTORY_CLEANUP | 92% | 清理jobs/{taskId}/work目录 |
| CLEANING_WORKSPACE | 92% | 清理work目录 |
| TEMP_CLEANUP_SCHEDULE | 95% | 清理temp/{taskId}目录 |
| CLEANING_TEMP | 95% | 清理temp目录 |
| COMPLETED | 100% | 任务完成 |

---

## 第10章：日志管理与监控

### 10.1 日志系统架构

#### 10.1.1 日志分类

| 日志类型 | 存储位置 | 文件格式 | 用途 |
|----------|----------|----------|------|
| 任务日志 | `logs/{taskId}/worker_*.log` | JSON行 | 任务执行全过程记录 |
| 容器日志 | `jobs/{taskId}/logs/container.log` | 文本 | Docker容器输出 |
| 前端操作日志 | `logs/{taskId}/frontend.log` | JSON行 | 用户操作记录 |
| API请求日志 | `logs/api_*.log` | JSON | HTTP请求日志 |

#### 10.1.2 日志类设计

**TaskLogger类** (`toolWorker.py:158-489`):

```python
class TaskLogger:
    def __init__(self, task_id, user_id):
        self.task_id = task_id
        self.user_id = user_id
        self.logs = []
        self.start_time = time.time()

        # 日志目录配置
        self.logs_dir = os.environ.get('TASK_LOGS_DIR',
                                        os.path.join(os.getcwd(), 'logs'))
        self.task_log_dir = os.path.join(self.logs_dir, task_id)

        # 创建日志文件
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        self.log_file_path = os.path.join(self.task_log_dir,
                                           f'worker_{timestamp}.log')
```

**日志记录方法**:

```python
def log(self, level, category, message, details=None):
    entry = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'level': level,           # INFO, WARN, ERROR
        'category': category,     # TASK, DATABASE, DOCKER, FILE, etc.
        'message': message,
        'details': details,
        'taskId': self.task_id,
        'userId': self.user_id,
        'elapsedSeconds': round(time.time() - self.start_time, 3)
    }
    self.logs.append(entry)

    # 写入文件
    with open(self.log_file_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, default=str, ensure_ascii=False) + '\n')
```

### 10.2 日志内容详解

#### 10.2.1 任务初始化日志

```json
{
  "timestamp": "2025-01-15T10:30:00.123Z",
  "level": "INFO",
  "category": "TASK",
  "message": "Starting task processing",
  "details": {
    "toolId": "sdc-generator",
    "status": "PENDING",
    "parameters": {
      "modName": "cpu_top",
      "isFlat": false,
      "toolType": "sdcgen"
    },
    "deploymentMode": "ecs_only"
  },
  "taskId": "abc123...",
  "userId": "user_001",
  "elapsedSeconds": 0.000
}
```

#### 10.2.2 数据库操作日志

```json
{
  "timestamp": "2025-01-15T10:30:01.234Z",
  "level": "INFO",
  "category": "DATABASE",
  "message": "SELECT on Task: SUCCESS",
  "details": {
    "taskId": "abc123...",
    "operation": "SELECT",
    "table": "Task"
  }
}
```

#### 10.2.3 Docker容器日志

**容器启动日志**:
```json
{
  "timestamp": "2025-01-15T10:30:10.456Z",
  "level": "INFO",
  "category": "CONTAINER",
  "message": "Container operation: create",
  "details": {
    "operation": "create",
    "containerInfo": {
      "name": "tool-abc123-1736935810456-a1b2c3d4",
      "image": "logiccore/sdc-generator:latest",
      "volumes": 4,
      "envVars": 15
    },
    "success": true
  }
}
```

**容器执行日志**:
```json
{
  "timestamp": "2025-01-15T10:30:15.789Z",
  "level": "INFO",
  "category": "CONTAINER",
  "message": "Container execution completed",
  "details": {
    "exitCode": 0,
    "executionTime": 45.234,
    "outputSize": 2048576
  }
}
```

#### 10.2.4 文件操作日志

```json
{
  "timestamp": "2025-01-15T10:30:05.678Z",
  "level": "INFO",
  "category": "FILE",
  "message": "File operation: copy",
  "details": {
    "operation": "copy",
    "source": "/data/chipcore/temp/abc123/hier.yaml",
    "destination": "/data/chipcore/jobs/abc123/input/hier.yaml",
    "fileSize": 4096,
    "success": true
  }
}
```

#### 10.2.5 步骤进度日志

```json
{
  "timestamp": "2025-01-15T10:30:12.345Z",
  "level": "INFO",
  "category": "STEP",
  "message": "Completed: Creating jobs directory structure",
  "details": {
    "step": "JOBS_DIRECTORY_CREATION",
    "action": "SUCCESS",
    "durationSeconds": 0.234,
    "jobsPath": "jobs/abc123",
    "moduleName": "cpu_top",
    "toolType": "sdcgen"
  }
}
```

### 10.3 容器日志文件结构

**container_execution.log** 格式:

```
[2025-01-15T10:30:00.000Z] === Container Execution Start ===
[2025-01-15T10:30:00.001Z] Container Name: tool-abc123-1736935800123-a1b2c3d4
[2025-01-15T10:30:00.002Z] Docker Image: logiccore/sdc-generator:latest
[2025-01-15T10:30:00.003Z] Task ID: abc123...
[2025-01-15T10:30:00.004Z] Tool Type: sdcgen
[2025-01-15T10:30:00.005Z] Module Name: cpu_top
[2025-01-15T10:30:00.006Z] Environment Variables: {...}
[2025-01-15T10:30:00.007Z] Volume Mounts: {...}
[2025-01-15T10:30:00.008Z] Resource Limits: {...}
[2025-01-15T10:30:00.009Z] Platform: Linux 6.6.87.2-microsoft-standard-WSL2
[2025-01-15T10:30:00.010Z] === Pre-Container Directory Status ===
[2025-01-15T10:30:00.011Z] INPUT:
[2025-01-15T10:30:00.012Z]   Original: /data/chipcore/jobs/abc123/input
[2025-01-15T10:30:00.013Z]   Normalized: /data/chipcore/jobs/abc123/input
[2025-01-15T10:30:00.014Z]   Container: /data/input
[2025-01-15T10:30:00.015Z]   Files: 3 items
[2025-01-15T10:30:00.016Z]     ✅ hier.yaml: 4096 bytes
[2025-01-15T10:30:00.017Z]     ✅ vlog.v: 16384 bytes
[2025-01-15T10:30:00.018Z]     ✅ cont.xlsx: 8192 bytes
[2025-01-15T10:30:05.000Z] === Container Output Logs ===
[2025-01-15T10:30:05.001Z] [SDC] Starting SDC Generator v1.0...
[2025-01-15T10:30:10.000Z] [SDC] Processing hier.yaml...
[2025-01-15T10:30:30.000Z] [SDC] Generating constraints...
[2025-01-15T10:30:45.000Z] [SDC] Writing output files...
[2025-01-15T10:30:50.000Z] [SDC] Completed successfully
[2025-01-15T10:30:50.001Z] === Container Execution Completed Successfully ===
```

### 10.4 常见问题日志解析

#### 10.4.1 问题诊断表

| 日志关键词 | 可能原因 | 解决方案 |
|------------|----------|----------|
| `Docker image not found` | 镜像不存在 | 检查镜像是否已加载或tar文件是否存在 |
| `Container execution timeout` | 容器执行超过3分钟 | 检查工具输入数据是否过大 |
| `Permission denied` | 目录权限问题 | 检查jobs目录权限设置 |
| `No such file or directory` | 输入文件缺失 | 检查temp目录文件是否完整 |
| `Database connection failed` | 数据库连接失败 | 检查PostgreSQL服务状态 |
| `Redis connection refused` | Redis连接失败 | 检查Redis服务状态 |
| `ValidationError` | 数据验证失败 | 检查用户填写的数据格式 |

#### 10.4.2 错误日志示例

**镜像缺失错误**:
```json
{
  "level": "ERROR",
  "category": "IMAGE",
  "message": "Docker image not found locally and failed to load from tar file",
  "details": {
    "imageName": "logiccore/sdc-generator:latest",
    "tarFilePath": "/data/chipcore/docker/sdc-generator.tar",
    "error": "File not found"
  }
}
```

**容器超时错误**:
```json
{
  "level": "ERROR",
  "category": "CONTAINER",
  "message": "Container execution timeout",
  "details": {
    "timeout": 180,
    "executionTime": 180.123,
    "containerName": "tool-abc123-1736935800123-a1b2c3d4"
  }
}
```

**文件缺失错误**:
```json
{
  "level": "ERROR",
  "category": "FILE",
  "message": "Required input file not found",
  "details": {
    "requiredFile": "hier.yaml",
    "tempDir": "/data/chipcore/temp/abc123",
    "existingFiles": ["vlog.v", "dcont.xlsx"]
  }
}
```

### 10.5 日志监控与告警

#### 10.5.1 监控指标

| 指标 | 监控方式 | 告警阈值 |
|------|----------|----------|
| 任务执行时间 | `elapsedSeconds` | > 180秒 |
| 容器退出码 | `exitCode` | != 0 |
| 磁盘使用量 | `workDirSize` | > 10GB |
| 内存使用量 | Docker stats | > 16GB |
| 任务失败率 | 任务状态统计 | > 10% |

#### 10.5.2 日志查询命令

```bash
# 查看特定任务的所有日志
cat logs/{taskId}/worker_*.log | jq

# 查找错误日志
grep '"level":"ERROR"' logs/*/worker_*.log

# 统计任务执行时间
jq -r '.elapsedSeconds' logs/*/worker_*.log | awk '{sum+=$1; count++} END {print sum/count}'

# 查看容器日志
tail -f jobs/{taskId}/logs/container.log

# 实时监控任务进度
watch -n 1 'jq -r \'select(.category=="PROGRESS")\' logs/{taskId}/worker_*.log'
```

---

## 第11章：Windows和Linux系统部署指南

### 11.1 系统要求对比

| 组件 | Windows | Linux (Ubuntu) |
|------|---------|----------------|
| 操作系统 | Windows 10/11 + WSL2 | Ubuntu 20.04/22.04 LTS |
| Python | 3.8+ (WSL2) | 3.8+ |
| Node.js | 18+ (WSL2) | 18+ |
| Docker | Docker Desktop | Docker Engine |
| 数据库 | PostgreSQL 14+ | PostgreSQL 14+ |
| 缓存 | Redis 6+ | Redis 6+ |
| 磁盘空间 | 100GB+ | 100GB+ |
| 内存 | 16GB+ | 16GB+ |

### 11.2 Windows部署步骤

#### 11.2.1 前置条件安装

```powershell
# 1. 安装WSL2
wsl --install

# 2. 在WSL2中安装Docker Desktop
# 下载并安装 Docker Desktop for Windows

# 3. 安装PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# 4. 安装Redis
sudo apt install redis-server

# 5. 安装Node.js和Python
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install python3 python3-pip
```

#### 11.2.2 环境变量配置

创建 `.env` 文件：

```bash
# 数据库连接 (Windows路径)
DATABASE_URL="postgresql://username:password@localhost:5432/chip_tools_db"

# 部署模式
DEPLOYMENT_MODE="ecs_only"

# 目录配置 (Windows路径格式)
TEMP_UPLOAD_DIR="E:/project/LogicCore/temp"
ECS_JOBS_DIR="E:/project/LogicCore/jobs"
ECS_TEMPLATES_DIR="E:/project/LogicCore/stuff/tool_template"
TASK_LOGS_DIR="E:/project/LogicCore/logs"

# Redis连接
REDIS_URL="redis://localhost:6379"

# 服务端口
PORT="8080"
ECS_FILE_DOWNLOAD_PORT="8081"
```

#### 11.2.3 跨平台路径处理

代码中已实现路径规范化 (`toolWorker.py:22-40`):

```python
def normalize_docker_path(host_path: str) -> str:
    """规范化Docker挂载路径，确保Windows和Linux兼容性"""
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

**示例路径转换**:
```
Windows: E:\project\LogicCore\jobs\abc123
   ↓ 转换
Docker:  /e/project/LogicCore/jobs/abc123
```

### 11.3 Linux部署步骤

#### 11.3.1 系统准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装依赖
sudo apt install -y curl wget git build-essential

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 11.3.2 创建目录结构

```bash
# 创建项目目录
sudo mkdir -p /data/chipcore
sudo chown $USER:$USER /data/chipcore

# 创建子目录
cd /data/chipcore
mkdir -p {jobs,temp,templates,docker,logs,backups}
```

#### 11.3.3 环境变量配置

```bash
# .env.production
DEPLOYMENT_MODE="ecs_only"
DATABASE_URL="postgresql://chipuser:chipass@localhost:5432/chip_tools_db"
REDIS_URL="redis://localhost:6379"

# 生产环境目录
TEMP_UPLOAD_DIR="/data/chipcore/temp"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates"
ECS_DOCKER_DIR="/data/chipcore/docker"
TASK_LOGS_DIR="/data/chipcore/logs"
BACKUP_LOCAL_DIR="/data/chipcore/backups"

# 超时配置
ECS_TEMP_CLEANUP_INTERVAL="120"
ECS_DOWNLOAD_TIMEOUT="120"
CONTAINER_EXECUTION_TIMEOUT_MINUTES="3"
```

### 11.4 Docker镜像部署

#### 11.4.1 镜像准备

```bash
# 1. 从tar文件加载镜像
docker load -i /data/chipcore/docker/sdc-generator.tar
docker load -i /data/chipcore/docker/upf-generator.tar

# 2. 验证镜像
docker images | grep logiccore

# 输出:
# logiccore/sdc-generator   latest   abc123...   2GB ago   2.5GB
# logiccore/upf-generator   latest   def456...   1GB ago   2.3GB
```

#### 11.4.2 镜像检查函数

代码实现 (`toolWorker.py`):

```python
def check_local_image_exists(image_name: str) -> bool:
    """检查本地Docker镜像是否存在"""
    try:
        docker_client.images.get(image_name)
        return True
    except docker.errors.ImageNotFound:
        return False

def load_image_from_tar(image_name: str, task_logger) -> bool:
    """从tar文件加载Docker镜像"""
    # 提取镜像名称
    image_short_name = image_name.split(':')[0].split('/')[-1]

    # 查找tar文件
    docker_dir = os.environ.get('ECS_DOCKER_DIR', '/data/chipcore/docker')
    tar_pattern = os.path.join(docker_dir, f'{image_short_name}*.tar')
    tar_files = glob.glob(tar_pattern)

    if not tar_files:
        task_logger.log('ERROR', 'IMAGE', f'No tar file found for {image_name}')
        return False

    # 加载镜像
    with open(tar_files[0], 'rb') as f:
        docker_client.images.load(f)

    task_logger.log('INFO', 'IMAGE', f'Loaded image from {tar_files[0]}')
    return True
```

### 11.5 服务部署与启动

#### 11.5.1 后端服务部署

```bash
# 进入后端目录
cd app/backend

# 安装依赖
npm install

# 构建TypeScript
npm run build

# 启动服务
npm run start:prod
```

#### 11.5.2 Worker进程部署

```bash
# 启动Worker
cd app/backend/src/workers

# 单Worker模式
python3 toolWorker.py

# 多Worker模式 (使用PM2)
pm2 start toolWorker.py --name chipcore-worker --instances 4
```

#### 11.5.3 使用systemd管理服务

创建服务文件 `/etc/systemd/system/chipcore.service`:

```ini
[Unit]
Description=LogicCore Backend Service
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=chipcore
WorkingDirectory=/data/chipcore/app/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /data/chipcore/app/backend/dist/main.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable chipcore
sudo systemctl start chipcore
sudo systemctl status chipcore
```

### 11.6 跨平台部署注意事项

#### 11.6.1 路径分隔符问题

| 问题 | Windows | Linux | 解决方案 |
|------|---------|-------|----------|
| 路径分隔符 | `\` | `/` | 使用 `path.join()` 或 `os.path.join()` |
| Docker卷路径 | `C:\path` | `/path` | 使用 `normalize_docker_path()` |
| 环境变量路径 | 需要转义 | 直接使用 | 使用双引号包裹 |

#### 11.6.2 文件权限问题

```bash
# Linux下设置正确的文件权限
sudo chown -R $USER:$USER /data/chipcore
chmod -R 755 /data/chipcore
chmod 600 /data/chipcore/app/backend/.env
```

#### 11.6.3 网络配置差异

| 配置项 | Windows | Linux |
|--------|---------|-------|
| Docker网络 | NAT模式 | bridge模式 |
| Redis连接 | localhost:6379 | localhost:6379 |
| PostgreSQL | localhost:5432 | /var/run/postgresql |

### 11.7 生产环境部署建议

#### 11.7.1 推荐部署平台

| 场景 | 推荐平台 | 原因 |
|------|----------|------|
| 开发测试 | Windows + WSL2 | 便于开发调试 |
| 小规模生产 | 单台ECS | 成本低，部署简单 |
| 中等规模 | ECS + SLB | 负载均衡，高可用 |
| 大规模生产 | K8s集群 | 弹性伸缩，易维护 |

#### 11.7.2 推荐配置

```yaml
# 单台ECS配置
cpu: 8核
memory: 32GB
disk: 200GB SSD
bandwidth: 10Mbps

# 软件版本
os: Ubuntu 22.04 LTS
docker: 24.0+
postgresql: 14.x
redis: 7.x
node: 18.x LTS
python: 3.10+
```

#### 11.7.3 安全加固

```bash
# 1. 配置防火墙
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8080/tcp  # API服务

# 2. 限制数据库访问
sudo iptables -A INPUT -p tcp --dport 5432 -s 127.0.0.1 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -j DROP

# 3. 定期更新
sudo apt update && sudo apt upgrade -y

# 4. 配置日志轮转
sudo vi /etc/logrotate.d/chipcore
```

---

## 第12章：优化建议与重构方向

### 12.1 深度分析和优化建议

#### 12.1.1 代码冗余分析

**冗余代码位置1**: `toolWorker.py:1380-1428`

环境变量设置代码重复定义了两次：

```python
# 第一次定义 (行1380-1428)
env_vars = {
    'TASK_ID': task.id,
    'USER_ID': task.userId,
    # ... 15个环境变量
}

# 第二次定义 (行1431-1479) - 完全重复
env_vars = {
    'TASK_ID': task.id,
    'USER_ID': task.userId,
    # ... 相同的15个环境变量
}
```

**建议**: 删除重复代码，使用统一的变量定义。

**冗余代码位置2**: `process_task_ecs_oss_acr` 函数

代码中存在大量与 `process_task_ecs_only` 重复的逻辑，但项目明确只支持 ECS Only 模式。

**建议**:
1. 删除整个 `process_task_ecs_oss_acr` 函数及其相关代码
2. 删除 Aliyun SDK 导入和 STS 凭证相关代码
3. 简化部署模式判断逻辑

#### 12.1.2 状态管理问题分析

**问题1**: 进度更新机制不一致

当前存在两套进度更新机制：
1. Worker通过 `update_task_progress()` 更新数据库
2. 通过 `update_task_status_via_api()` 发送WebSocket通知

```python
# toolWorker.py:313-387
def update_task_progress(self, current_step, shared_session=None):
    # ... 更新数据库
    task.progress = progress
    task.currentStep = current_step
    session.commit()

    # ... 通过API发送通知
    update_task_status_via_api(self.task_id, task.status, {...})
```

**问题**: 如果API调用失败，数据库已更新但前端未收到通知，导致状态不一致。

**建议**: 实现事务性更新，要么全部成功，要么回滚。

**问题2**: 任务状态转换缺少验证

当前代码允许直接修改任务状态，没有状态机验证：

```python
# 可能出现非法状态转换
task.status = 'FAILED'  # 从任何状态都可以直接变成FAILED
```

**建议**: 实现状态机模式，定义合法的状态转换规则。

#### 12.1.3 前后端一致性问题

**问题1**: 工具类型标识不一致

| 组件 | SDC工具标识 | UPF工具标识 |
|------|-------------|-------------|
| 数据库Tool表 | sdc-generator | upf-generator |
| 参数toolType | sdcgen | upfgen |
| 支持的工具类型 | sdc, sdcgen | upf, upfgen |

**建议**: 统一使用单一标识，建议使用数据库中的 `toolType` 字段。

**问题2**: 进度映射硬编码

进度百分比在 Worker 中硬编码，前端需要保持同步：

```python
# toolWorker.py:317-336
step_progress_mapping = {
    'WORKER_ASSIGNED': 30,
    'CONTAINER_IMAGE_LOADING': 35,
    # ...
}
```

**建议**: 将进度配置移到数据库或配置文件，前后端共享。

#### 12.1.4 安全漏洞评估

**漏洞1**: SQL注入风险 (中等)

```typescript
// task-cleanup.service.ts:26
await prisma.table.deleteMany({
  where: {
    taskId,
    isTemplate: false
  } as any  // 使用 as any 绕过类型检查
});
```

**建议**: 移除 `as any`，使用正确的类型定义。

**漏洞2**: 内部API密钥硬编码 (低)

```python
# toolWorker.py:134
headers = {
    'X-Internal-API-Key': os.environ.get('INTERNAL_API_KEY', 'worker-internal-key')
}
```

**问题**: 如果环境变量未设置，使用弱默认密钥。

**建议**: 强制要求设置环境变量，不使用默认值。

**漏洞3**: 容器逃逸风险 (低)

```python
# toolWorker.py:1613-1617
container = container_manager.create_container(
    # ...
    read_only=True,
    tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},
    security_opt=['no-new-privileges:true']
)
```

**评估**: 已采取较好的安全措施，但可以进一步加固：
- 添加 `cap_drop=['ALL']`
- 使用 `user` 参数指定非root用户运行

#### 12.1.5 并行执行实现问题

**当前状态**: 项目使用Redis队列实现简单的任务分发，但没有真正的并行控制。

```python
# toolWorker.py:539-584
class RedisConnectionPool:
    def __init__(self, redis_url: str, max_connections: int = 10):
        self.max_connections = max_connections
```

**问题**:
1. 没有实现并发任务数量限制
2. 没有资源预留机制
3. 可能出现资源竞争

**建议**: 实现基于资源的任务调度：

```python
class ResourceManager:
    def __init__(self, total_cpu, total_memory):
        self.total_cpu = total_cpu
        self.total_memory = total_memory
        self.used_cpu = 0
        self.used_memory = 0
        self.lock = threading.Lock()

    def can_allocate(self, cpu_request, memory_request):
        with self.lock:
            return (self.used_cpu + cpu_request <= self.total_cpu and
                    self.used_memory + memory_request <= self.total_memory)

    def allocate(self, cpu_request, memory_request):
        with self.lock:
            self.used_cpu += cpu_request
            self.used_memory += memory_request

    def release(self, cpu_request, memory_request):
        with self.lock:
            self.used_cpu -= cpu_request
            self.used_memory -= memory_request
```

### 12.2 识别需要重构的功能逻辑

#### 12.2.1 Worker进程管理

**当前问题**:
- 使用简单的 Python 脚本运行，缺少进程管理
- 崩溃后无法自动恢复
- 无法实现多Worker负载均衡

**重构建议**: 使用 PM2 或 Supervisor 管理Worker进程

```javascript
// ecosystem.config.js (PM2配置)
module.exports = {
  apps: [{
    name: 'chipcore-worker',
    script: './app/backend/src/workers/toolWorker.py',
    interpreter: 'python3',
    instances: 4,  // 4个Worker进程
    exec_mode: 'cluster',
    max_memory_restart: '2G',
    env: {
      DEPLOYMENT_MODE: 'ecs_only',
      WORKER_ID: 'worker-$ {NODE_APP_INSTANCE}'
    }
  }]
};
```

#### 12.2.2 文件清理机制

**当前问题**:
- 清理逻辑分散在多个位置
- 没有统一的清理策略
- 可能出现清理失败导致磁盘空间耗尽

**重构建议**: 创建独立的清理服务

```python
class CleanupService:
    def __init__(self):
        self.cleanup_policies = {
            'task_completed': {'delay': 120, 'retain': ['output']},
            'task_failed': {'delay': 0, 'retain': []},
            'task_timeout': {'delay': 0, 'retain': []}
        }

    def schedule_cleanup(self, task_id, reason):
        policy = self.cleanup_policies.get(reason, {})
        delay = policy.get('delay', 0)

        if delay > 0:
            threading.Timer(delay, self.cleanup_task, args=[task_id, reason]).start()
        else:
            self.cleanup_task(task_id, reason)

    def cleanup_task(self, task_id, reason):
        # 统一的清理逻辑
        pass
```

#### 12.2.3 错误处理机制

**当前问题**:
- 错误处理不统一
- 缺少重试机制
- 错误信息不够详细

**重构建议**: 实现统一的错误处理和重试策略

```python
class RetryableError(Exception):
    """可重试的错误"""
    pass

class FatalError(Exception):
    """致命错误，不应重试"""
    pass

def with_retry(max_retries=3, delay=1):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except RetryableError as e:
                    if attempt == max_retries - 1:
                        raise
                    time.sleep(delay * (2 ** attempt))
            raise FatalError(f"Max retries exceeded: {func.__name__}")
        return wrapper
    return decorator
```

### 12.3 Linux部署需要修改的地方

#### 12.3.1 路径处理

**当前代码**: 已经实现了跨平台路径处理

**建议**:
1. 在Linux生产环境中使用绝对路径
2. 避免使用相对路径
3. 统一路径配置来源

```python
# 推荐配置
ECS_JOBS_DIR="/data/chipcore/jobs"  # 绝对路径
TEMP_UPLOAD_DIR="/data/chipcore/temp"  # 绝对路径
```

#### 12.3.2 权限管理

**当前问题**: 代码中没有明确处理文件权限

**建议**:
1. 创建专门的系统用户运行服务
2. 设置正确的文件权限和属主

```bash
# 创建服务用户
sudo useradd -r -s /bin/false chipcore
sudo chown -R chipcore:chipcore /data/chipcore
```

#### 12.3.3 服务依赖管理

**建议**: 使用systemd管理服务依赖

```ini
[Unit]
Description=LogicCore Worker
After=network.target docker.service postgresql.service redis.service
Requires=docker.service

[Service]
User=chipcore
Group=chipcore
WorkingDirectory=/data/chipcore/app/backend/src/workers
ExecStart=/usr/bin/python3 toolWorker.py
Restart=always
RestartSec=10
```

### 12.4 支付系统完善建议

#### 12.4.1 当前状态

代码中存在支付相关的配置和基础实现，但功能不完整：

```typescript
// .env.example
ALIPAY_APP_ID="your-alipay-app-id"
ALIPAY_PRIVATE_KEY="your-alipay-private-key"
WECHAT_APP_ID="your-wechat-app-id"
WECHAT_APP_SECRET="your-wechat-app-secret"
```

#### 12.4.2 缺失功能

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 支付宝支付接口 | 未实现 | 高 |
| 微信支付接口 | 未实现 | 高 |
| 支付回调验证 | 未实现 | 高 |
| 订单管理 | 未实现 | 高 |
| 退款处理 | 未实现 | 中 |
| 支付记录查询 | 未实现 | 中 |
| 财务报表 | 未实现 | 低 |

#### 12.4.3 实现建议

**1. 支付宝支付实现**

```typescript
// services/alipay.service.ts
import AlipaySdk from 'alipay-sdk';

export class AlipayService {
  private alipay: AlipaySdk;

  constructor() {
    this.alipay = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID,
      privateKey: process.env.ALIPAY_PRIVATE_KEY,
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
      gateway: 'https://openapi.alipay.com/gateway.do'
    });
  }

  async createPayment(orderId: string, amount: number) {
    const result = await this.alipay.exec('alipay.trade.page.pay', {
      notify_url: `${process.env.API_BASE_URL}/api/v1/payment/alipay/notify`,
      bizContent: {
        out_trade_no: orderId,
        total_amount: amount.toString(),
        subject: '芯片工具服务',
        product_code: 'FAST_INSTANT_TRADE_PAY'
      }
    });
    return result;
  }

  async verifyNotification(params: any): Promise<boolean> {
    return this.alipay.checkNotifySign(params);
  }
}
```

**2. 订单管理模型**

```sql
CREATE TABLE "PaymentOrder" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "taskId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL,  -- PENDING, PAID, FAILED, REFUNDED
  "paymentMethod" TEXT,    -- ALIPAY, WECHAT
  "transactionId" TEXT,
  "createdAt" TIMESTAMP NOT NULL,
  "paidAt" TIMESTAMP,
  "refundId" TEXT,
  "refundAmount" DECIMAL(10,2)
);

CREATE INDEX "PaymentOrder_userId_idx" ON "PaymentOrder"("userId");
CREATE INDEX "PaymentOrder_taskId_idx" ON "PaymentOrder"("taskId");
```

**3. 支付回调路由**

```typescript
// routes/payment.routes.ts
router.post('/alipay/notify', async (req, res) => {
  const verified = await AlipayService.verifyNotification(req.body);

  if (verified && req.body.trade_status === 'TRADE_SUCCESS') {
    await PaymentService.updateOrderStatus(
      req.body.out_trade_no,
      'PAID',
      req.body.trade_no
    );

    // 激活用户会员
    await UserService.activateMembership(req.body.passback_params.userId);
  }

  res.send('success');
});
```

### 12.5 Windows vs Linux 环境变量差异分析

#### 12.5.1 差异对照表

| 环境变量 | Windows默认值 | Linux默认值 | 说明 |
|----------|---------------|-------------|------|
| `TEMP_UPLOAD_DIR` | `./temp` | `/tmp/logiccore_temp` | 临时上传目录 |
| `ECS_JOBS_DIR` | `./jobs` | `/data/chipcore/jobs` | 任务执行目录 |
| `ECS_TEMPLATES_DIR` | `./templates` | `/data/chipcore/templates` | 模板目录 |
| `TASK_LOGS_DIR` | `./logs` | `/var/log/chipcore` | 日志目录 |
| `DATABASE_URL` | `localhost:5432` | `/var/run/postgresql` | 数据库连接 |

#### 12.5.2 路径规范化处理

**问题**: Windows和Linux路径格式不同

**解决方案**: 代码已实现 `normalize_docker_path` 函数

```python
# toolWorker.py:22-40
def normalize_docker_path(host_path: str) -> str:
    normalized = os.path.normpath(host_path)

    if platform.system() == 'Windows':
        normalized = normalized.replace('\\', '/')
        if len(normalized) >= 2 and normalized[1] == ':':
            drive = normalized[0].lower()
            path_part = normalized[2:] if len(normalized) > 2 else ''
            normalized = f'/{drive}{path_part}'

    return normalized
```

**建议**: 在环境变量配置文档中明确说明路径格式要求

### 12.6 跨平台部署保障方案

#### 12.6.1 配置验证脚本

```python
# scripts/validate_config.py
import os
import platform
import sys

def validate_config():
    """验证环境配置是否正确"""
    errors = []

    # 检查必需的环境变量
    required_vars = [
        'DATABASE_URL',
        'REDIS_URL',
        'DEPLOYMENT_MODE',
        'TEMP_UPLOAD_DIR',
        'ECS_JOBS_DIR'
    ]

    for var in required_vars:
        if not os.environ.get(var):
            errors.append(f"Missing required environment variable: {var}")

    # 检查目录是否存在
    dir_vars = ['TEMP_UPLOAD_DIR', 'ECS_JOBS_DIR', 'TASK_LOGS_DIR']
    for var in dir_vars:
        dir_path = os.environ.get(var)
        if dir_path and not os.path.exists(dir_path):
            errors.append(f"Directory does not exist: {var}={dir_path}")

    # 检查Docker
    try:
        import docker
        client = docker.from_env()
        client.ping()
    except Exception as e:
        errors.append(f"Docker is not available: {e}")

    # 检查数据库连接
    try:
        from sqlalchemy import create_engine
        engine = create_engine(os.environ['DATABASE_URL'])
        conn = engine.connect()
        conn.close()
    except Exception as e:
        errors.append(f"Database connection failed: {e}")

    # 检查Redis连接
    try:
        import redis
        client = redis.from_url(os.environ['REDIS_URL'])
        client.ping()
    except Exception as e:
        errors.append(f"Redis connection failed: {e}")

    return errors

if __name__ == '__main__':
    errors = validate_config()
    if errors:
        print("Configuration validation failed:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print("Configuration validation passed!")
        sys.exit(0)
```

#### 12.6.2 部署检查清单

```markdown
## 部署前检查清单

### Windows + WSL2
- [ ] WSL2已安装并正常运行
- [ ] Docker Desktop已安装并启动
- [ ] PostgreSQL服务正在运行
- [ ] Redis服务正在运行
- [ ] 环境变量已配置 (.env文件)
- [ ] 数据库已初始化 (prisma migrate)
- [ ] Docker镜像已加载
- [ ] 目录权限正确配置
- [ ] 防火墙允许必要端口

### Linux (Ubuntu)
- [ ] 系统已更新到最新版本
- [ ] Docker Engine已安装并运行
- [ ] PostgreSQL服务正在运行
- [ ] Redis服务正在运行
- [ ] 环境变量已配置
- [ ] 数据库已初始化
- [ ] Docker镜像已加载
- [ ] 系统用户已创建
- [ ] 日志轮转已配置
- [ ] systemd服务已配置
- [ ] 防火墙规则已设置
```

#### 12.6.3 健康检查端点

```typescript
// routes/health.routes.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import redis from '../config/redis';
import * as docker from 'dockerode';

const prisma = new PrismaClient();
const dockerClient = new docker();

export const healthCheck = async (req: Request, res: Response) => {
  const checks = {
    database: 'unknown',
    redis: 'unknown',
    docker: 'unknown',
    jobs_dir: 'unknown',
    temp_dir: 'unknown'
  };

  // 检查数据库
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (e) {
    checks.database = 'error: ' + e.message;
  }

  // 检查Redis
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (e) {
    checks.redis = 'error: ' + e.message;
  }

  // 检查Docker
  try {
    await dockerClient.ping();
    checks.docker = 'ok';
  } catch (e) {
    checks.docker = 'error: ' + e.message;
  }

  // 检查目录
  const jobsDir = process.env.ECS_JOBS_DIR;
  const tempDir = process.env.TEMP_UPLOAD_DIR;

  checks.jobs_dir = require('fs').existsSync(jobsDir) ? 'ok' : 'missing';
  checks.temp_dir = require('fs').existsSync(tempDir) ? 'ok' : 'missing';

  const allOk = Object.values(checks).every(v => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'unhealthy',
    checks,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    deploymentMode: process.env.DEPLOYMENT_MODE
  });
};
```

---

## 附录A：核心代码位置索引

| 功能 | 文件路径 | 行号 |
|------|----------|------|
| SDC初始化 | `sdc_thrpages.controller.ts` | 25-350 |
| UPF初始化 | `upf_thrpages.controller.ts` | 25-337 |
| Excel解析 | `excel_thrpages.service.ts` | 1-1500 |
| Worker主流程 | `toolWorker.py` | 1164-1310 |
| ECS Only处理 | `toolWorker.py` | 1311-1895 |
| 容器管理 | `container_manager.py` | 1-206 |
| 文件管理器 | `toolWorker.py` | 692-885 |
| 日志记录器 | `toolWorker.py` | 158-490 |
| 路径规范化 | `toolWorker.py` | 22-72 |
| Temp文件处理 | `toolWorker.py` | 2518-2787 |
| 清理逻辑 | `toolWorker.py` | 2788-2900 |

---

## 附录B：环境变量完整列表

```bash
# ===== 基础配置 =====
DATABASE_URL="postgresql://user:pass@localhost:5432/chip_tools_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secret-key"
PORT="8080"
NODE_ENV="production"

# ===== 部署模式 =====
DEPLOYMENT_MODE="ecs_only"  # 或 ecs_oss_acr

# ===== 目录配置 =====
TEMP_UPLOAD_DIR="/data/chipcore/temp"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates"
ECS_DOCKER_DIR="/data/chipcore/docker"
TASK_LOGS_DIR="/data/chipcore/logs"
BACKUP_LOCAL_DIR="/data/chipcore/backups"

# ===== 超时配置 =====
ECS_TEMP_CLEANUP_INTERVAL="120"        # 2分钟
ECS_DOWNLOAD_TIMEOUT="120"             # 2分钟
CONTAINER_EXECUTION_TIMEOUT_MINUTES="3"  # 3分钟
TASK_TIMEOUT_SECONDS="1800"            # 30分钟

# ===== 资源配置 =====
ECS_TOTAL_CPU="8"
ECS_TOTAL_MEMORY_GB="64"
JOB_CPU_REQUEST="2"
JOB_MEMORY_REQUEST_GB="16"

# ===== 队列配置 =====
TASK_QUEUE_NAME="task_queue"
MAX_QUEUE_SIZE="48"

# ===== 支付配置 (可选) =====
ALIPAY_APP_ID=""
ALIPAY_PRIVATE_KEY=""
ALIPAY_PUBLIC_KEY=""
WECHAT_APP_ID=""
WECHAT_APP_SECRET=""

# ===== 内部API =====
INTERNAL_API_KEY="change-this-in-production"

# ===== Worker配置 =====
WORKER_ID="worker-01"
ECS_INSTANCE_ID="ecs-single-instance"
```

---

**文档版本**: 1.0
**生成日期**: 2025-01-15
**适用代码版本**: 基于 app/ 目录实际代码
**作者**: Claude (Opus 4.5)
**审核状态**: 待审核
