# EDA工具系统数据库和文件结构文档
## 支持SDC和UPF工具的完整数据库和文件结构

## 📊 数据库结构

### Tool表结构

```sql
CREATE TABLE Tool (
    id VARCHAR(50) PRIMARY KEY,                     -- 工具ID ('sdc-generator', 'upf-generator')
    name VARCHAR(100) NOT NULL,                     -- 工具显示名称
    description TEXT,                               -- 工具描述
    dockerImage VARCHAR(200) NOT NULL,              -- Docker镜像名称
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    inputFileTypes JSON,                            -- 支持的输入文件类型
    parameters JSON,                                -- 工具参数Schema
    version VARCHAR(20) DEFAULT '1.0.0',           -- 工具版本
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 工具数据示例
INSERT INTO Tool VALUES
('sdc-generator', 'SDC高效生成', 'SDC约束文件生成器', 'logiccore/sdc-generator:latest', 'ACTIVE',
 '["hier.yaml","vlog.v","dcont.xlsx"]', '{"modName":"string","isFlat":"boolean"}', '1.0.0'),
('upf-generator', 'UPF高效生成', 'UPF功耗管理文件生成器', 'logiccore/upf-generator:latest', 'ACTIVE',
 '["hier.yaml","pvlog.v","pobj.tcl","pcont.xlsx"]', '{"modName":"string","version":"string","isFlat":"boolean"}', '1.0.0');
```

### Task表结构

```sql
CREATE TABLE Task (
    id VARCHAR(255) PRIMARY KEY,                    -- 任务唯一ID (UUID)
    userId VARCHAR(255) NOT NULL,                   -- 用户ID
    toolId VARCHAR(50) NOT NULL,                    -- 工具ID (外键关联Tool.id)
    status ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
    parameters JSON,                                -- 任务参数和配置
    inputOssPath VARCHAR(500),                      -- 输入文件OSS目录路径
    outputOssPath VARCHAR(500),                     -- 输出文件OSS路径
    logOssPath VARCHAR(500),                        -- 日志文件OSS路径
    errorMessage TEXT,                              -- 错误信息
    workerId VARCHAR(255),                          -- 执行Worker ID
    ecsInstanceId VARCHAR(255),                     -- ECS实例ID
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    startedAt TIMESTAMP,                            -- 开始执行时间
    finishedAt TIMESTAMP,                           -- 完成时间

    -- 外键关系
    FOREIGN KEY (userId) REFERENCES User(id),
    FOREIGN KEY (toolId) REFERENCES Tool(id),

    -- 索引
    INDEX idx_user_tool (userId, toolId),
    INDEX idx_status (status),
    INDEX idx_created (createdAt)
);
```

### Task.parameters字段结构（按工具分类）

#### SDC工具任务参数
```json
{
  "modName": "cpu_core",                            // 模块名称
  "isFlat": false,                                  // 是否扁平化模式

  // 文件路径信息（OSS路径）
  "inputOssDirectory": "user123/task456",           // OSS输入目录
  "outputOssDirectory": "user123/task456",          // OSS输出目录
  "logOssDirectory": "user123/task456",             // OSS日志目录

  // 输入文件列表（相对于inputOssDirectory）
  "inputFiles": {
    "hierYamlFile": "hier.yaml",                    // 层次结构文件
    "vlogFile": "vlog.v",                           // Verilog文件
    "dcontFile": "dcont.xlsx"                       // 设计约束文件
  }
}
```

#### UPF工具任务参数
```json
{
  "modName": "soc_top",                             // 模块名称
  "version": "2.0",                                 // UPF版本
  "isFlat": false,                                  // 是否扁平化模式（暂不支持）

  // 文件路径信息（OSS路径）
  "inputOssDirectory": "user123/task789",           // OSS输入目录
  "outputOssDirectory": "user123/task789",          // OSS输出目录
  "logOssDirectory": "user123/task789",             // OSS日志目录

  // 输入文件列表（相对于inputOssDirectory）
  "inputFiles": {
    "hierYamlFile": "hier.yaml",                    // 层次结构文件
    "pvlogFile": "pvlog.v",                         // 功耗Verilog文件
    "pobjTclFile": "pobj.tcl",                      // 功耗对象TCL脚本
    "pcontXlsxFile": "pcont.xlsx"                   // 功耗约束配置文件
  }
}
```

## 🗂️ OSS存储结构

### OSS Bucket组织结构（按真实业务场景）

```
OSS_BUCKET_USER_INPUT (用户输入文件存储)
├── ${userId}/
│   └── ${taskId}/                 # 每个任务独立目录，不区分工具类型
│       ├── hier.yaml              # 层次结构配置文件（SDC/UPF通用）
│       ├── vlog.v                 # Verilog设计文件（SDC工具专用）
│       ├── dcont.xlsx             # 设计约束文件（SDC工具专用）
│       ├── pvlog.v                # 功耗Verilog文件（UPF工具专用）
│       ├── pobj.tcl               # 功耗对象TCL脚本（UPF工具专用）
│       └── pcont.xlsx             # 功耗约束配置文件（UPF工具专用）

OSS_BUCKET_JOB_RESULTS (任务结果文件存储)
├── ${userId}/
│   └── ${taskId}/
│       ├── sdc_result.zip         # SDC工具结果包（仅SDC任务生成）
│       ├── upf_result.zip         # UPF工具结果包（仅UPF任务生成）
│       └── download_credentials.json # STS下载凭证文件

OSS_BUCKET_JOB_LOGS (任务执行日志存储)
├── ${userId}/
│   └── ${taskId}/
│       └── execution.log          # 完整执行日志（包含所有执行步骤）
```

### 工具特定的文件组织

#### SDC工具任务文件结构
```
# 输入文件 (OSS_BUCKET_USER_INPUT)
user123/sdc_task_456/
├── hier.yaml                      # 必需：层次结构定义
├── vlog.v                         # 必需：Verilog设计文件
└── dcont.xlsx                     # 必需：设计约束配置

# 输出文件 (OSS_BUCKET_JOB_RESULTS)
user123/sdc_task_456/
├── sdc_result.zip                 # 主结果包，包含：
│                                  #   - outputs/: 生成的SDC文件
│                                  #   - logs/: 执行日志
│                                  #   - rpts/: 分析报告
└── download_credentials.json      # STS临时下载凭证

# 日志文件 (OSS_BUCKET_JOB_LOGS)
user123/sdc_task_456/
└── execution.log                  # 完整的SDC工具执行日志
```

#### UPF工具任务文件结构
```
# 输入文件 (OSS_BUCKET_USER_INPUT)
user123/upf_task_789/
├── hier.yaml                      # 必需：层次结构定义
├── pvlog.v                        # 必需：功耗Verilog文件
├── pobj.tcl                       # 必需：功耗对象TCL脚本
└── pcont.xlsx                     # 必需：功耗约束配置

# 输出文件 (OSS_BUCKET_JOB_RESULTS)
user123/upf_task_789/
├── upf_result.zip                 # 主结果包，包含：
│                                  #   - outputs/: 生成的UPF文件
│                                  #   - logs/: 执行日志
│                                  #   - rpts/: 分析报告
└── download_credentials.json      # STS临时下载凭证

# 日志文件 (OSS_BUCKET_JOB_LOGS)
user123/upf_task_789/
└── execution.log                  # 完整的UPF工具执行日志
```

### 实际OSS路径示例

```bash
# SDC工具任务示例 (taskId: sdc_20250712_001)
## 输入文件
user123/sdc_20250712_001/hier.yaml
user123/sdc_20250712_001/vlog.v
user123/sdc_20250712_001/dcont.xlsx

## 输出文件
user123/sdc_20250712_001/sdc_result.zip
user123/sdc_20250712_001/download_credentials.json

## 日志文件
user123/sdc_20250712_001/execution.log

# UPF工具任务示例 (taskId: upf_20250712_002)
## 输入文件
user123/upf_20250712_002/hier.yaml
user123/upf_20250712_002/pvlog.v
user123/upf_20250712_002/pobj.tcl
user123/upf_20250712_002/pcont.xlsx

## 输出文件
user123/upf_20250712_002/upf_result.zip
user123/upf_20250712_002/download_credentials.json

## 日志文件
user123/upf_20250712_002/execution.log
```

## 🖥️ ECS生产环境文件结构

### ECS服务器目录结构（生产环境）

```
/data/chipcore/                    # 生产环境根目录
├── app/                           # 应用程序目录
│   ├── backend/                   # 后端应用
│   ├── frontend/                  # 前端应用（如果部署在ECS）
│   └── logs/                      # 应用日志
├── templates/                     # 模板文件存储（生产环境）
│   ├── sdcgen/                    # SDC工具模板
│   │   └── sdcgen.zip             # SDC工具模板压缩包
│   ├── upfgen/                    # UPF工具模板
│   │   └── upfgen.zip             # UPF工具模板压缩包
│   └── README.md                  # 模板说明文档
├── jobs/                          # 临时任务执行目录
│   └── ${taskId}/                 # 每个任务的临时工作目录
│       ├── input/                 # 从OSS下载的输入文件
│       ├── output/                # 生成的输出文件
│       ├── logs/                  # 执行日志
│       └── work/                  # 工具工作目录
└── docker/                       # Docker相关文件
    ├── images/                    # 本地镜像缓存
    └── volumes/                   # Docker卷挂载点
```

### 环境变量配置（生产环境）

```bash
# 模板文件路径配置
TEMPLATE_ROOT_PATH="/data/chipcore/templates"

# 临时工作目录配置
TEMP_JOBS_DIR="/data/chipcore/jobs"

# OSS配置
OSS_BUCKET_USER_INPUT="chipcore-user-input"
OSS_BUCKET_JOB_RESULTS="chipcore-job-results"
OSS_BUCKET_JOB_LOGS="chipcore-job-logs"

# Docker配置
DOCKER_REGISTRY="registry.cn-hangzhou.aliyuncs.com/chipcore"
```

## 🐳 Docker容器内文件结构

### SDC工具容器内结构
```
/data/                             # 容器内数据目录（挂载点）
├── input/                         # 输入文件挂载点
│   ├── hier.yaml                  # 从OSS下载的输入文件
│   ├── vlog.v
│   └── dcont.xlsx
├── output/                        # 输出文件挂载点
│   └── sdc_result.zip             # 生成的结果文件
├── logs/                          # 日志文件挂载点
│   └── execution.log              # 执行日志
└── work/                          # 工具工作目录挂载点
    └── ${modName}/                # 模块工作目录
        └── sdc/                   # SDC工具专用目录
            ├── inputs/            # 工具输入文件
            ├── outputs/           # 工具输出文件
            ├── logs/              # 工具日志
            └── rpts/              # 工具报告
```

### UPF工具容器内结构
```
/data/                             # 容器内数据目录（挂载点）
├── input/                         # 输入文件挂载点
│   ├── hier.yaml                  # 从OSS下载的输入文件
│   ├── pvlog.v
│   ├── pobj.tcl
│   └── pcont.xlsx
├── output/                        # 输出文件挂载点
│   └── upf_result.zip             # 生成的结果文件
├── logs/                          # 日志文件挂载点
│   └── execution.log              # 执行日志
└── work/                          # 工具工作目录挂载点
    └── ${modName}/                # 模块工作目录
        └── upf/                   # UPF工具专用目录
            ├── inputs/            # 工具输入文件
            ├── outputs/           # 工具输出文件
            ├── logs/              # 工具日志
            └── rpts/              # 工具报告
```

### 临时目录生命周期管理

```bash
# ECS上的临时目录结构
/data/chipcore/jobs/${taskId}/
├── input/                         # 从OSS下载的输入文件
├── output/                        # 生成的输出文件（上传到OSS前）
├── logs/                          # 任务执行日志
└── work/                          # Docker容器工作目录

# 生命周期：
# 1. 任务开始时创建
# 2. Docker容器挂载这些目录
# 3. 任务完成后自动清理（释放磁盘空间）
```

## 🔄 任务执行数据流（按工具分类）

### SDC工具任务执行流程

#### 1. 任务提交阶段
```sql
-- 创建SDC任务记录
INSERT INTO Task (
    id, userId, toolId, status,
    inputOssPath, parameters
) VALUES (
    'sdc_20250712_001', 'user123', 'sdc-generator', 'PENDING',
    'user123/sdc_20250712_001',
    '{
        "modName": "cpu_core",
        "isFlat": false,
        "inputOssDirectory": "user123/sdc_20250712_001",
        "outputOssDirectory": "user123/sdc_20250712_001",
        "logOssDirectory": "user123/sdc_20250712_001",
        "inputFiles": {
            "hierYamlFile": "hier.yaml",
            "vlogFile": "vlog.v",
            "dcontFile": "dcont.xlsx"
        }
    }'
);
```

#### 2. 文件上传阶段
```bash
# SDC工具输入文件上传到OSS_BUCKET_USER_INPUT
user123/sdc_20250712_001/hier.yaml
user123/sdc_20250712_001/vlog.v
user123/sdc_20250712_001/dcont.xlsx
```

#### 3. Worker执行阶段
```bash
# 1. 创建ECS临时目录
/data/chipcore/jobs/sdc_20250712_001/
├── input/
├── output/
├── logs/
└── work/

# 2. 从OSS下载输入文件
# 3. 启动SDC Docker容器
# 4. 执行SDC工具命令序列
# 5. 打包输出结果为sdc_result.zip
# 6. 上传结果到OSS_BUCKET_JOB_RESULTS
# 7. 清理临时目录
```

### UPF工具任务执行流程

#### 1. 任务提交阶段
```sql
-- 创建UPF任务记录
INSERT INTO Task (
    id, userId, toolId, status,
    inputOssPath, parameters
) VALUES (
    'upf_20250712_002', 'user123', 'upf-generator', 'PENDING',
    'user123/upf_20250712_002',
    '{
        "modName": "soc_top",
        "version": "2.0",
        "isFlat": false,
        "inputOssDirectory": "user123/upf_20250712_002",
        "outputOssDirectory": "user123/upf_20250712_002",
        "logOssDirectory": "user123/upf_20250712_002",
        "inputFiles": {
            "hierYamlFile": "hier.yaml",
            "pvlogFile": "pvlog.v",
            "pobjTclFile": "pobj.tcl",
            "pcontXlsxFile": "pcont.xlsx"
        }
    }'
);
```

#### 2. 文件上传阶段
```bash
# UPF工具输入文件上传到OSS_BUCKET_USER_INPUT
user123/upf_20250712_002/hier.yaml
user123/upf_20250712_002/pvlog.v
user123/upf_20250712_002/pobj.tcl
user123/upf_20250712_002/pcont.xlsx
```

#### 3. Worker执行阶段
```bash
# 1. 创建ECS临时目录
/data/chipcore/jobs/upf_20250712_002/
├── input/
├── output/
├── logs/
└── work/

# 2. 从OSS下载输入文件
# 3. 启动UPF Docker容器
# 4. 执行UPF工具命令序列：
#    - xonst upfgen -gen_dir ./ -blocks ${modName} -setup
#    - xonst upfgen -gen_dir ./ -hier_yaml hier.yaml -chk_only -blocks ${modName}
#    - xonst upfgen -gen_dir ./ -hier_yaml hier.yaml -blocks ${modName} -upf
#    - xonst upfgen -gen_dir ./ -hier_yaml hier.yaml -blocks ${modName} -chk_upf
# 5. 打包输出结果为upf_result.zip
# 6. 上传结果到OSS_BUCKET_JOB_RESULTS
# 7. 清理临时目录
```

### 4. 任务完成阶段

#### SDC工具任务完成
```sql
-- 更新SDC任务状态为COMPLETED
UPDATE Task SET
    status = 'COMPLETED',
    finishedAt = NOW(),
    outputOssPath = 'user123/sdc_20250712_001/sdc_result.zip',
    logOssPath = 'user123/sdc_20250712_001/execution.log'
WHERE id = 'sdc_20250712_001';
```

```bash
# SDC工具结果文件上传到OSS
OSS_BUCKET_JOB_RESULTS:
  user123/sdc_20250712_001/sdc_result.zip
  user123/sdc_20250712_001/download_credentials.json

OSS_BUCKET_JOB_LOGS:
  user123/sdc_20250712_001/execution.log
```

#### UPF工具任务完成
```sql
-- 更新UPF任务状态为COMPLETED
UPDATE Task SET
    status = 'COMPLETED',
    finishedAt = NOW(),
    outputOssPath = 'user123/upf_20250712_002/upf_result.zip',
    logOssPath = 'user123/upf_20250712_002/execution.log'
WHERE id = 'upf_20250712_002';
```

```bash
# UPF工具结果文件上传到OSS
OSS_BUCKET_JOB_RESULTS:
  user123/upf_20250712_002/upf_result.zip
  user123/upf_20250712_002/download_credentials.json

OSS_BUCKET_JOB_LOGS:
  user123/upf_20250712_002/execution.log
## 📋 生产环境配置参数

### 环境变量配置（生产环境）

```bash
# OSS存储配置
OSS_BUCKET_USER_INPUT="chipcore-user-input"
OSS_BUCKET_JOB_RESULTS="chipcore-job-results"
OSS_BUCKET_JOB_LOGS="chipcore-job-logs"

# 路径配置
TEMPLATE_ROOT_PATH="/data/chipcore/templates"
TEMP_JOBS_DIR="/data/chipcore/jobs"

# Docker镜像配置
DOCKER_REGISTRY="registry.cn-hangzhou.aliyuncs.com/chipcore"
SDC_DOCKER_IMAGE="logiccore/sdc-generator:latest"
UPF_DOCKER_IMAGE="logiccore/upf-generator:latest"

# STS配置
STS_ROLE_ARN="acs:ram::account:role/ChipCoreWorkerRole"
STS_SESSION_NAME="chipcore-worker-session"
```

### 文件大小和资源限制

```bash
# 输入文件限制
MAX_INPUT_FILE_SIZE=10MB          # 单个输入文件最大10MB
MAX_TOTAL_INPUT_SIZE=50MB         # 所有输入文件总计最大50MB

# 输出文件限制
MAX_OUTPUT_FILE_SIZE=200MB        # 输出ZIP文件最大200MB

# 临时目录限制
MAX_TEMP_DIR_SIZE=1GB             # 单个任务临时目录最大1GB
TEMP_DIR_CLEANUP_HOURS=24         # 24小时后强制清理临时目录

# Docker容器资源限制
DOCKER_MEMORY_LIMIT=2GB           # 容器内存限制
DOCKER_CPU_LIMIT=2.0              # 容器CPU限制
DOCKER_EXECUTION_TIMEOUT=600      # 容器执行超时时间（秒）
```

## 🔍 监控和维护策略

### 关键监控指标

#### 1. 数据库监控
```sql
-- 任务状态统计
SELECT toolId, status, COUNT(*) as count
FROM Task
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY toolId, status;

-- 平均执行时间
SELECT toolId,
       AVG(TIMESTAMPDIFF(SECOND, startedAt, finishedAt)) as avg_duration_seconds
FROM Task
WHERE status = 'COMPLETED' AND startedAt IS NOT NULL AND finishedAt IS NOT NULL
GROUP BY toolId;
```

#### 2. OSS存储监控
- 各bucket存储使用量和增长趋势
- 文件上传下载成功率
- STS凭证使用情况
- 存储成本分析

#### 3. ECS资源监控
- 临时目录磁盘使用量
- Docker容器资源使用情况
- 任务并发数量和队列长度
- 系统负载和性能指标

### 数据生命周期管理

```bash
# OSS文件生命周期策略
用户输入文件 (OSS_BUCKET_USER_INPUT):
  - 30天后自动删除

任务结果文件 (OSS_BUCKET_JOB_RESULTS):
  - 7天内：标准存储
  - 7-90天：低频访问存储
  - 90天后：归档存储
  - 1年后：删除

任务日志文件 (OSS_BUCKET_JOB_LOGS):
  - 30天内：标准存储
  - 30-180天：低频访问存储
  - 180天后：删除
```

### 数据库清理策略

```sql
-- 清理策略
DELETE FROM Task
WHERE status = 'FAILED'
  AND createdAt < DATE_SUB(NOW(), INTERVAL 6 MONTH);

-- 归档策略
CREATE TABLE Task_Archive AS
SELECT * FROM Task
WHERE status = 'COMPLETED'
  AND finishedAt < DATE_SUB(NOW(), INTERVAL 1 YEAR);
```

## 🚀 部署检查清单

### 生产环境部署前检查

- [ ] 数据库表结构已创建并初始化
- [ ] OSS Bucket已创建并配置生命周期策略
- [ ] ECS目录结构已创建并设置正确权限
- [ ] Docker镜像已构建并推送到ACR
- [ ] 环境变量已正确配置
- [ ] STS角色和权限已配置
- [ ] 模板文件已部署到指定目录
- [ ] 监控和日志系统已配置
- [ ] 备份和恢复策略已制定

### 功能验证清单

- [ ] SDC工具完整执行流程测试
- [ ] UPF工具完整执行流程测试
- [ ] 模板下载功能测试
- [ ] 文件上传下载功能测试
- [ ] 错误处理和恢复测试
- [ ] 并发任务执行测试
- [ ] 资源限制和清理测试

---

**注意**: 本文档描述的是完整的生产环境架构。在开发阶段，部分功能（如OSS、ECS、ACR）使用本地模拟，但代码逻辑必须完全兼容生产环境要求。
