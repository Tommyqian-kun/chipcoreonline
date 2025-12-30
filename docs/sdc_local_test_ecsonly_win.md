# SDC工具本地ECS Only Windows测试指南

## 📋 测试环境概述

### ECS Only部署模式 vs 传统ECS+OSS+ACR模式对比

| 组件 | ECS+OSS+ACR模式 | ECS Only模式 | 测试覆盖度 |
|------|-----------------|--------------|------------|
| **前端** | React + Nginx | React Dev Server | ✅ 100% |
| **后端API** | Node.js + Express | Node.js + Express | ✅ 100% |
| **数据库** | PostgreSQL (云端) | PostgreSQL (本地) | ✅ 100% |
| **Redis** | Redis (云端) | Redis (本地) | ✅ 100% |
| **文件存储** | 阿里云OSS | ECS本地存储 | ✅ 95% |
| **Docker镜像** | ACR私有仓库 | 本地镜像文件 | ✅ 90% |
| **Worker** | Python Worker | Python Worker | ✅ 100% |
| **部署模式** | 云端分布式 | 本地集成式 | ✅ 85% |

### 最新架构特性

#### 1. 动态工具类型配置
- **Tool表新增toolType字段**：支持 `sdcgen`, `upfgen`, `clkgen`, `memgen`
- **工具类型管理器**：`toolTypeManager` 统一管理工具类型配置
- **动态工具映射**：前端工具名称与数据库ID的智能映射

#### 2. 参数化配置增强
- **环境变量验证**：使用Zod schema验证所有环境变量
- **部署模式检测**：自动检测并适配ECS Only或ECS+OSS+ACR模式
- **配置文件统一**：`.env.local` 集中管理所有配置参数

#### 3. 数据库模型更新
- **Task表增强**：新增 `deploymentMode`, `localStoragePath`, `startedAt`, `finishedAt`, `workerId`, `ecsInstanceId` 字段
- **Tool表扩展**：新增 `toolType` 字段支持工具分类
- **索引优化**：添加性能索引提升查询效率

## 🛠️ 测试环境搭建

### 1. 基础服务启动

```bash
# 1. 启动PostgreSQL
docker run -d --name postgres-test \
  -e POSTGRES_DB=logiccore_dev \
  -e POSTGRES_USER=logiccore \
  -e POSTGRES_PASSWORD=dev123 \
  -p 5432:5432 postgres:14

# 2. 启动Redis
docker run -d --name redis-test \
  -p 6379:6379 redis:7-alpine

# 验证服务状态
docker ps | grep -E "(postgres|redis)"
```

### 2. ECS Only模式目录结构

```bash
# 创建ECS Only模式的完整目录结构
mkdir -p E:/stone/work/webapp/augment/LogicCore/{jobs,docker/images/{sdc,upf},templates,volumes}

# 验证目录结构
tree E:/stone/work/webapp/augment/LogicCore/ -L 3
```

**预期目录结构**：
```
E:/stone/work/webapp/augment/LogicCore/
├── jobs/                    # 任务执行目录
├── docker/                  # Docker相关
│   ├── images/             # 镜像存储
│   │   ├── sdc/           # SDC工具镜像
│   │   └── upf/           # UPF工具镜像
│   └── volumes/           # 数据卷
└── templates/             # 工具模板
```

### 3. 环境变量配置 (app/backend/.env.local)

```bash
# 数据库配置
DATABASE_URL=postgresql://logiccore:dev123@localhost:5432/logiccore_dev
REDIS_URL=redis://localhost:6379

# ========================================
# ECS Only 部署模式配置（本地Windows测试）
# ========================================

# 部署模式控制（默认为ECS Only模式）
DEPLOYMENT_MODE="ecs_only"

# ECS Only模式专用配置（本地Windows测试目录结构 - WSL路径格式）
ECS_LOCAL_STORAGE_ROOT="/mnt/e/stone/work/webapp/augment/LogicCore"
ECS_JOBS_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/jobs"
ECS_TEMPLATES_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/templates"
ECS_DOCKER_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/docker"

# 临时目录配置（本地Windows测试）
TEMP_JOBS_DIR=/mnt/e/stone/work/webapp/augment/LogicCore/temp

# ECS资源配置
ECS_TOTAL_CPU=8
ECS_TOTAL_MEMORY_GB=32
JOB_CPU_REQUEST=2
JOB_MEMORY_REQUEST_GB=8

# 清理和超时配置
ECS_TEMP_CLEANUP_INTERVAL=120
ECS_DOWNLOAD_TIMEOUT=120
ECS_FILE_DOWNLOAD_PORT=8081

# 工具执行配置
TASK_QUEUE_NAME=task_queue
TASK_MAX_RETRIES=3
TASK_TIMEOUT=1800000
TASK_POLLING_INTERVAL=3000

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-for-development
JWT_EXPIRES_IN=7d

# 邮件配置（测试用）
SMTP_HOST=smtp.126.com
SMTP_PORT=587
SMTP_USER=aic_qlj816@126.com
SMTP_PASS=PCuwAsk5KnTj4fD5
```

### 4. 数据库初始化和工具配置

```bash
cd app/backend

# 1. 数据库迁移
npx prisma migrate dev

# 2. 运行工具类型更新脚本
node scripts/update-tool-types.js

# 3. 验证数据库配置
npx prisma studio
# 访问 http://localhost:5555 查看数据库内容
```

**验证Tool表配置**：
```sql
-- 检查工具配置
SELECT id, name, toolType, dockerImage, version FROM Tool;

-- 预期结果：
-- sdc-generator | SDC Generator | sdcgen | logiccore/sdc-generator:latest | 1.0.0
-- upf-generator | UPF Generator | upfgen | logiccore/upf-generator:latest | 1.0.0
```

## 🐳 Docker镜像构建和验证

### 阶段0: SDC工具镜像构建测试

**测试目标**: 验证ECS Only模式下的SDC工具Docker镜像构建和本地存储

#### 0.1 构建SDC工具镜像

```bash
# 进入项目根目录
cd E:/stone/work/webapp/augment/LogicCore

# 使用增强版构建脚本
bash ./scripts/build_sdc_image_ecsonly_win.sh

# 验证构建结果
bash ./scripts/check_sdc_build_status.sh
```

**预期结果**：
```
✅ Docker image built: logiccore/sdc-generator:latest (658MB)
✅ Image saved to: E:/stone/work/webapp/augment/LogicCore/docker/images/sdc/logiccore_sdc-generator_latest.tar (675MB)
✅ All storage directories created and verified
```

#### 0.2 验证镜像功能

```bash
# 测试镜像基本功能
docker run --rm logiccore/sdc-generator:latest --help

# 检查镜像安全配置
docker inspect logiccore/sdc-generator:latest | jq '.[0].Config.User'
# 应显示非root用户

# 验证镜像层数和大小
docker history logiccore/sdc-generator:latest --format "table {{.CreatedBy}}\t{{.Size}}" | head -10
```

**验证标准**：
- ✅ 使用非root用户运行 (upfuser)
- ✅ 镜像大小合理 (600-700MB)
- ✅ 支持资源限制
- ✅ 容器可以正常启动和退出

## 🧪 SDC工具完整测试流程

### 阶段1: 前端UI和动态工具配置测试

**测试目标**: 验证动态工具类型配置和前端UI集成

```bash
# 启动前端
cd app/frontend
npm run dev
# 访问 http://localhost:3000
```

**测试用例**：

1. **工具类型动态加载**
   - 访问SDC工具页面：`/tools/sdc-generator`
   - 验证工具类型正确识别为 `sdcgen`
   - 检查工具参数配置正确加载

2. **输入验证增强**
   - **空ModName提交** → 应显示"ModName不能为空"
   - **特殊字符ModName** → 应显示"只能包含字母、数字和下划线"
   - **缺少文件上传** → 应显示"请上传所有必需的文件"
   - **文件类型验证** → 验证 `.yaml`, `.v`, `.xlsx` 文件类型

3. **工具映射验证**
   ```javascript
   // 在浏览器控制台测试
   fetch('/api/v1/tools/mapping/sdc-generator')
     .then(r => r.json())
     .then(data => console.log('Tool mapping:', data));
   ```

**预期结果**：
- 按钮状态: 初始蓝橙渐变 → 点击后灰色"Validating..." → 检查失败恢复蓝橙渐变
- 错误提示: 红色Toast显示具体错误信息
- 工具类型: 正确识别为 `sdcgen`

### 阶段2: 后端API和工具类型管理测试

**测试目标**: 验证工具类型管理器和API接口

```bash
# 启动后端
cd app/backend
npm run dev
# 后端运行在 http://localhost:8080
```

**API测试用例**：

1. **工具类型查询**
   ```bash
   # 查询所有工具类型
   curl http://localhost:8080/api/v1/tools/types
   
   # 查询特定工具信息
   curl http://localhost:8080/api/v1/tools/sdc-generator
   ```

2. **工具映射验证**
   ```bash
   # 测试工具映射服务
   curl http://localhost:8080/api/v1/tools/mapping/sdc-generator
   
   # 验证工具类型推断
   curl http://localhost:8080/api/v1/tools/mapping/validate
   ```

3. **部署模式检测**
   ```bash
   # 检查部署模式
   curl http://localhost:8080/api/v1/system/deployment-mode
   
   # 预期返回: {"mode": "ecs_only", "storage": "ecs-local"}
   ```

### 阶段3: 真实生产流程文件处理和ECS本地存储测试

**测试目标**: 验证与真实生产Linux环境一致的完整文件处理流程

#### 3.1 前端文件上传流程验证（浏览器缓存 vs 实际上传）

**重要说明**: 文件上传默认保存在浏览器缓存中，只有点击Submission按钮后才真正上传到ECS

```bash
# 1. 验证前端文件选择（仅缓存，未上传）
# 在浏览器开发者工具中检查
console.log('Files in browser cache:', document.querySelector('input[type="file"]').files);

# 2. 检查ECS目录（此时应该为空）
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/
# 应该没有任何任务目录

# 3. 验证测试数据准备
ls -la test_data/upload_data/sdcgen/
# 应显示: hier.yaml, vlog.v, dcont.xlsx

# 验证测试文件格式和内容
file test_data/upload_data/sdcgen/*
head -5 test_data/upload_data/sdcgen/hier.yaml
grep -E "(module|endmodule)" test_data/upload_data/sdcgen/vlog.v | head -3

# 检查Excel文件有效性
python3 -c "
import openpyxl
try:
    wb = openpyxl.load_workbook('test_data/upload_data/sdcgen/dcont.xlsx')
    print('Excel file valid, sheets:', wb.sheetnames)
    print('Row count:', wb.active.max_row)
except Exception as e:
    print('Excel file error:', e)
"
```

#### 3.2 用户订阅状态检查和权限验证

**测试目标**: 验证点击Submission按钮时的完整权限检查流程

```bash
# 获取测试用户token（需要先注册/登录）
TOKEN=$(curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.token')

# 1. 检查用户订阅状态
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/subscription/status | jq '.'

# 2. 检查用户权限类型（free vs professional）
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/profile | jq '.subscription'

# 3. 检查当前并发任务数限制
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/queue/status | jq '.'

# 4. 检查使用次数限制
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/usage/current | jq '.'
```

#### 3.3 任务创建和文件上传的完整流程测试

**测试目标**: 验证点击Submission按钮后的完整流程

```bash
# 模拟真实的任务提交流程（包含所有验证步骤）
echo "=== 开始SDC任务提交流程测试 ==="

# 步骤1: 权限预检查
echo "1. 执行权限预检查..."
PERMISSION_CHECK=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/permission/check)
echo "权限检查结果: $PERMISSION_CHECK"

# 步骤2: 提交任务（真实文件上传）
echo "2. 提交SDC任务（包含文件上传）..."
TASK_RESPONSE=$(curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -F "toolId=sdc-generator" \
  -F "parameters={\"modName\":\"jpeg_top_wrap\",\"isFlat\":false,\"toolType\":\"sdcgen\"}" \
  -F "files=@test_data/upload_data/sdcgen/hier.yaml" \
  -F "files=@test_data/upload_data/sdcgen/vlog.v" \
  -F "files=@test_data/upload_data/sdcgen/dcont.xlsx")

echo "任务提交响应: $TASK_RESPONSE"

# 提取任务ID
TASK_ID=$(echo $TASK_RESPONSE | jq -r '.data.taskId // .taskId')
echo "生成的任务ID: $TASK_ID"

# 步骤3: 验证任务ID生成和目录创建
echo "3. 验证任务ID和目录创建..."
if [[ "$TASK_ID" != "null" && "$TASK_ID" != "" ]]; then
    echo "✅ 任务ID生成成功: $TASK_ID"

    # 检查ECS本地目录是否创建
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID/

    # 检查输入文件是否上传
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID/input/

    # 检查任务元数据
    cat /mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID/metadata.json 2>/dev/null || echo "元数据文件未找到"
else
    echo "❌ 任务ID生成失败"
    exit 1
fi
```

**验证点**：
- ✅ 用户订阅状态正确检查（free vs professional）
- ✅ 并发任务数限制验证
- ✅ 使用次数限制验证
- ✅ 任务ID唯一性生成
- ✅ ECS本地目录结构创建: `{ECS_JOBS_DIR}/{taskId}/{input,output,logs,work}/`
- ✅ 文件真实上传到ECS本地路径: `{ECS_JOBS_DIR}/{taskId}/input/`
- ✅ 数据库Task记录创建，包含 `deploymentMode: "ecs_only"`
- ✅ Redis队列中任务添加
- ✅ 工具类型正确识别为 `sdcgen`
- ✅ 任务元数据文件创建

### 阶段4: Worker任务执行和ECS Only模式测试

**测试目标**: 验证ECS Only模式下的完整任务执行流程

#### 4.1 启动Worker和监控

```bash
# 启动Python Worker
cd app/backend
python src/workers/toolWorker.py

# 在另一个终端监控任务状态
watch -n 2 'redis-cli LLEN task_queue && echo "---" && psql -h localhost -U logiccore -d logiccore_dev -c "SELECT id, status, deploymentMode, toolId, \"createdAt\" FROM \"Task\" ORDER BY \"createdAt\" DESC LIMIT 3;"'
```

#### 4.2 详细执行流程验证

**步骤1: Worker获取任务**
```bash
# 检查Redis队列
redis-cli LLEN task_queue
redis-cli LRANGE task_queue 0 -1

# 验证点:
# ✅ 队列中有待处理任务
# ✅ Worker日志显示"Processing task: {taskId}"
# ✅ 部署模式检测为 "ecs_only"
```

**步骤2: 数据库状态更新 - PENDING → RUNNING**
```sql
-- 检查任务状态变化
SELECT 
    id, 
    status, 
    deploymentMode,
    toolId,
    "startedAt", 
    "updatedAt",
    parameters->'toolType' as toolType
FROM "Task"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'RUNNING'
-- ✅ deploymentMode = 'ecs_only'
-- ✅ startedAt 不为空
-- ✅ toolType = 'sdcgen'
```

**步骤3: ECS本地文件管理**
```bash
# 检查ECS本地文件结构
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/
# 应包含: input/, output/, logs/, work/

# 检查输入文件
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/input/
# 应包含: hier.yaml, vlog.v, dcont.xlsx

# 检查工作目录创建
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/work/{modName}/sdc/
# 应包含: inputs/, outputs/, logs/, rpts/
```

**步骤4: Docker容器执行（ECS Only模式）**
```bash
# 监控容器状态
docker ps | grep tool-job

# 检查容器环境变量
docker inspect {container_name} | jq '.[0].Config.Env' | grep -E "(SDC_|TASK_|DEPLOYMENT_)"

# 验证容器挂载（ECS Only模式）
docker inspect {container_name} | jq '.[0].Mounts' | grep -E "(input|output|logs|work)"

# 验证点:
# ✅ 容器成功启动
# ✅ 挂载点正确: /data/input, /data/output, /data/logs, /data/work
# ✅ 环境变量包含: DEPLOYMENT_MODE=ecs_only
# ✅ 工具类型环境变量: SDC_MOD_NAME, SDC_IS_FLAT
```

**步骤5: SDC工具执行验证（增强版）**
```bash
# 检查工具执行步骤
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/work/{modName}/sdc/inputs/
# 应包含: hier.yaml, vlog.v, dcont.xlsx

# 检查执行日志
tail -f /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/logs/execution.log

# 检查工具特定日志
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/work/{modName}/sdc/logs/
# 应包含: setup.log, check.log, generation.log

# 检查最终输出
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/work/{modName}/sdc/outputs/
# 应包含: *.sdc 文件

# 验证点:
# ✅ 输入文件正确复制
# ✅ 每个执行步骤都有日志
# ✅ 生成了预期的SDC文件
# ✅ 报告文件完整
# ✅ 工具类型特定的处理逻辑正确执行
```

**步骤6: 结果打包和ECS本地存储**
```bash
# 检查结果打包
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/output/
# 应包含: sdc_result.zip

# 验证zip文件内容
unzip -l /mnt/e/stone/work/webapp/augment/LogicCore/jobs/{taskId}/output/sdc_result.zip
# 应包含: outputs/, logs/, rpts/ 三个目录

# ECS Only模式：验证本地存储（无OSS上传）
echo "ECS Only模式 - 文件存储在本地，无需OSS上传"

# 验证点:
# ✅ 结果文件正确打包
# ✅ 包含所有必要目录
# ✅ 文件存储在ECS本地路径
# ✅ 无OSS上传操作（ECS Only模式特性）
```

**步骤7: 数据库状态更新 - RUNNING → COMPLETED**
```sql
-- 检查最终任务状态
SELECT
    id,
    status,
    deploymentMode,
    toolId,
    "startedAt",
    "finishedAt",
    "outputFile",
    "logFile",
    localStoragePath,
    "updatedAt",
    parameters->'toolType' as toolType
FROM "Task"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'COMPLETED'
-- ✅ deploymentMode = 'ecs_only'
-- ✅ finishedAt 不为空
-- ✅ localStoragePath = taskId
-- ✅ outputFile 路径正确
-- ✅ 执行时间合理（通常1-5分钟）
```

### 阶段5: 生产级结果下载和STS权限控制测试

**测试目标**: 验证ECS Only模式下的完整下载流程和权限控制

#### 5.1 任务完成状态验证

```bash
# 等待任务完成
echo "=== 等待SDC任务完成 ==="
while true; do
    STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
      http://localhost:8080/api/v1/tasks/$TASK_ID/status | jq -r '.status')
    echo "当前任务状态: $STATUS"

    if [[ "$STATUS" == "COMPLETED" ]]; then
        echo "✅ 任务执行完成"
        break
    elif [[ "$STATUS" == "FAILED" ]]; then
        echo "❌ 任务执行失败"
        # 获取错误信息
        curl -s -H "Authorization: Bearer $TOKEN" \
          http://localhost:8080/api/v1/tasks/$TASK_ID | jq '.errorMessage'
        exit 1
    fi

    sleep 10
done

# 获取任务完成时间
TASK_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$TASK_ID)
FINISHED_AT=$(echo $TASK_INFO | jq -r '.finishedAt')
echo "任务完成时间: $FINISHED_AT"
```

#### 5.2 STS权限控制和下载链接生成测试

```bash
# 1. 获取下载信息（包含权限验证）
echo "=== 获取下载信息和权限验证 ==="
DOWNLOAD_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$TASK_ID/download-info)
echo "下载信息: $DOWNLOAD_INFO"

# 2. 检查下载权限和剩余时间
DOWNLOAD_TIME_REMAINING=$(echo $DOWNLOAD_INFO | jq -r '.downloadTimeRemaining')
IS_DOWNLOAD_EXPIRED=$(echo $DOWNLOAD_INFO | jq -r '.isDownloadExpired')
echo "剩余下载时间: ${DOWNLOAD_TIME_REMAINING}秒"
echo "下载是否过期: $IS_DOWNLOAD_EXPIRED"

# 3. 生成下载凭证（STS权限控制）
echo "=== 生成下载凭证 ==="
DOWNLOAD_CREDENTIAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$TASK_ID/download)
echo "下载凭证: $DOWNLOAD_CREDENTIAL"

DOWNLOAD_URL=$(echo $DOWNLOAD_CREDENTIAL | jq -r '.downloadUrl')
EXPIRES_AT=$(echo $DOWNLOAD_CREDENTIAL | jq -r '.expiresAt')
echo "下载URL: $DOWNLOAD_URL"
echo "凭证过期时间: $EXPIRES_AT"
```

#### 5.3 文件下载和内容验证测试

```bash
# 1. 下载结果文件（使用生成的凭证）
echo "=== 下载SDC结果文件 ==="
if [[ "$DOWNLOAD_URL" != "null" && "$DOWNLOAD_URL" != "" ]]; then
    # 下载文件
    curl -H "Authorization: Bearer $TOKEN" \
      -o "sdc_result_${TASK_ID}.zip" \
      "$DOWNLOAD_URL"

    if [[ $? -eq 0 ]]; then
        echo "✅ 文件下载成功"

        # 验证文件大小
        FILE_SIZE=$(stat -f%z "sdc_result_${TASK_ID}.zip" 2>/dev/null || stat -c%s "sdc_result_${TASK_ID}.zip")
        echo "下载文件大小: ${FILE_SIZE} bytes"

        # 验证ZIP文件完整性
        unzip -t "sdc_result_${TASK_ID}.zip" && echo "✅ ZIP文件完整性验证通过"

        # 检查ZIP文件内容结构
        echo "=== 验证SDC结果文件结构 ==="
        unzip -l "sdc_result_${TASK_ID}.zip"

        # 解压并检查内容
        mkdir -p "temp_extract_${TASK_ID}"
        unzip -q "sdc_result_${TASK_ID}.zip" -d "temp_extract_${TASK_ID}"

        echo "解压后的目录结构:"
        find "temp_extract_${TASK_ID}" -type f | head -10

        # 验证SDC文件内容
        SDC_FILES=$(find "temp_extract_${TASK_ID}" -name "*.sdc" | head -3)
        for sdc_file in $SDC_FILES; do
            echo "=== SDC文件内容预览: $sdc_file ==="
            head -10 "$sdc_file"
            echo "..."
        done

        # 清理临时文件
        rm -rf "temp_extract_${TASK_ID}"

    else
        echo "❌ 文件下载失败"
    fi
else
    echo "❌ 下载URL无效"
fi
```

#### 5.4 下载权限过期测试

```bash
# 1. 测试下载时间限制（2分钟超时）
echo "=== 测试下载时间限制 ==="

# 等待接近过期时间
if [[ "$DOWNLOAD_TIME_REMAINING" -gt 30 ]]; then
    WAIT_TIME=$((DOWNLOAD_TIME_REMAINING - 30))
    echo "等待 ${WAIT_TIME} 秒后测试下载权限..."
    sleep $WAIT_TIME
fi

# 再次检查下载状态
UPDATED_DOWNLOAD_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$TASK_ID/download-info)
UPDATED_TIME_REMAINING=$(echo $UPDATED_DOWNLOAD_INFO | jq -r '.downloadTimeRemaining')
echo "更新后剩余时间: ${UPDATED_TIME_REMAINING}秒"

# 2. 测试过期后的下载尝试
if [[ "$UPDATED_TIME_REMAINING" -le 0 ]]; then
    echo "=== 测试过期下载 ==="
    EXPIRED_DOWNLOAD=$(curl -s -H "Authorization: Bearer $TOKEN" \
      http://localhost:8080/api/v1/tasks/$TASK_ID/download)
    echo "过期下载响应: $EXPIRED_DOWNLOAD"

    # 应该返回错误信息
    ERROR_MESSAGE=$(echo $EXPIRED_DOWNLOAD | jq -r '.message // .error')
    echo "预期错误信息: $ERROR_MESSAGE"
fi
```

**验证点**：
- ✅ 任务状态正确更新为 COMPLETED
- ✅ finishedAt时间戳正确记录
- ✅ 下载权限验证（用户只能下载自己的任务）
- ✅ STS权限控制生效
- ✅ 下载凭证正确生成（包含过期时间）
- ✅ ECS本地下载链接有效
- ✅ 2分钟下载时间限制正确执行
- ✅ 下载时间倒计时准确
- ✅ 过期后下载被正确拒绝
- ✅ 结果文件包含预期内容（outputs/, logs/, rpts/）
- ✅ 下载服务运行在配置的端口 (8081)

## 🔍 ECS Only模式特性验证

### 1. 部署模式一致性检查

```bash
# 检查环境变量
echo "DEPLOYMENT_MODE: $DEPLOYMENT_MODE"

# 检查数据库记录
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT deploymentMode, COUNT(*) as count 
FROM \"Task\" 
GROUP BY deploymentMode;"

# 检查Worker日志中的部署模式
grep -i "deployment.*mode" logs/worker.log | tail -5
```

### 2. 本地存储路径验证

```bash
# 验证所有任务的本地存储路径
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT id, localStoragePath, deploymentMode 
FROM \"Task\" 
WHERE deploymentMode = 'ecs_only' 
ORDER BY \"createdAt\" DESC 
LIMIT 5;"

# 验证文件系统中的实际路径
for task_id in $(psql -h localhost -U logiccore -d logiccore_dev -t -c "SELECT id FROM \"Task\" WHERE deploymentMode = 'ecs_only' AND status = 'COMPLETED' LIMIT 3;"); do
    echo "Task $task_id:"
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/$task_id/
done
```

### 3. 工具类型配置验证

```bash
# 验证工具类型配置
curl http://localhost:8080/api/v1/tools/types | jq '.'

# 验证工具映射
curl http://localhost:8080/api/v1/tools/mapping/sdc-generator | jq '.'

# 验证数据库中的工具类型
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT name, toolType, dockerImage 
FROM \"Tool\" 
WHERE toolType IS NOT NULL;"
```

## 📊 测试成功标准

### 功能测试通过标准
- ✅ 动态工具类型配置正确工作
- ✅ ECS Only部署模式正确识别
- ✅ 本地文件存储机制正常
- ✅ 工具映射服务正确运行
- ✅ 任务状态正确更新
- ✅ 结果文件正确生成
- ✅ ECS本地下载功能正常

### 性能测试通过标准
- ✅ 文件处理速度 < 10秒 (5MB文件)
- ✅ 任务执行时间 < 5分钟
- ✅ 内存使用 < 8GB (配置限制)
- ✅ 本地存储清理完整

### ECS Only模式特性验证标准
- ✅ 无OSS依赖，完全本地存储
- ✅ 无ACR依赖，使用本地镜像
- ✅ 部署模式标识正确
- ✅ 本地文件服务正常运行

## 🚀 快速测试命令

```bash
# 完整ECS Only测试流程
npm run test:sdc:ecsonly

# 分步测试
npm run test:sdc:frontend     # 前端UI测试
npm run test:sdc:backend      # 后端API测试
npm run test:sdc:worker       # Worker执行测试
npm run test:sdc:integration  # 集成测试
```

## 🚨 常见问题排查

### 1. 部署模式检测错误
```bash
# 检查环境变量
echo $DEPLOYMENT_MODE

# 检查配置文件
grep DEPLOYMENT_MODE app/backend/.env.local
```

### 2. 工具类型映射失败
```bash
# 检查数据库工具配置
psql -h localhost -U logiccore -d logiccore_dev -c "SELECT * FROM \"Tool\";"

# 运行工具类型更新脚本
node scripts/update-tool-types.js
```

### 3. ECS本地存储路径错误
```bash
# 检查WSL路径映射
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/

# 检查环境变量路径
echo $ECS_JOBS_DIR
```

## 🔄 多容器并发执行测试（ECS Only模式）

### 阶段6: 并发任务执行和资源管理测试

**测试目标**: 验证ECS Only模式下的多容器并行运行能力

#### 6.1 环境资源配置验证

```bash
# 检查ECS Only模式资源配置
echo "=== ECS Only模式资源配置检查 ==="
echo "ECS_TOTAL_CPU: ${ECS_TOTAL_CPU:-8}"
echo "ECS_TOTAL_MEMORY_GB: ${ECS_TOTAL_MEMORY_GB:-32}"
echo "JOB_CPU_REQUEST: ${JOB_CPU_REQUEST:-2}"
echo "JOB_MEMORY_REQUEST_GB: ${JOB_MEMORY_REQUEST_GB:-8}"

# 计算理论并发容器数
echo "理论最大并发容器数:"
echo "按CPU计算: $((${ECS_TOTAL_CPU:-8} / ${JOB_CPU_REQUEST:-2}))"
echo "按内存计算: $((${ECS_TOTAL_MEMORY_GB:-32} / ${JOB_MEMORY_REQUEST_GB:-8}))"

# 检查Docker资源限制支持
docker info | grep -E "(CPUs|Total Memory)"
```

#### 6.2 多任务并发提交测试

```bash
# 创建并发测试脚本
cat > test_concurrent_sdc_ecsonly.sh << 'EOF'
#!/bin/bash

# 获取认证token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.token')

# 并发提交3个SDC任务（ECS Only模式）
for i in {1..3}; do
    echo "提交第${i}个ECS Only SDC任务..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer $TOKEN" \
      -F "toolId=sdc-generator" \
      -F "parameters={\"modName\":\"jpeg_top_wrap_${i}\",\"isFlat\":false,\"toolType\":\"sdcgen\"}" \
      -F "files=@test_data/upload_data/sdcgen/hier.yaml" \
      -F "files=@test_data/upload_data/sdcgen/vlog.v" \
      -F "files=@test_data/upload_data/sdcgen/dcont.xlsx" &

    sleep 2
done

wait
echo "所有ECS Only任务提交完成"
EOF

chmod +x test_concurrent_sdc_ecsonly.sh
./test_concurrent_sdc_ecsonly.sh
```

#### 6.3 ECS Only模式并发监控

```bash
# ECS Only模式并发监控脚本
cat > monitor_ecsonly_concurrent.sh << 'EOF'
#!/bin/bash

echo "开始监控ECS Only模式并发容器执行..."
start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))

    # 检查当前运行的容器数量
    container_count=$(docker ps | grep tool-job | wc -l)

    echo "[$elapsed秒] ECS Only模式 - 当前运行容器数: $container_count"

    if [ $container_count -gt 0 ]; then
        echo "=== ECS Only容器资源使用情况 ==="
        docker stats --no-stream $(docker ps --format "table {{.Names}}" | grep tool-job) 2>/dev/null || echo "暂无容器运行"

        echo "=== ECS本地存储使用情况 ==="
        du -sh /mnt/e/stone/work/webapp/augment/LogicCore/jobs/*/

        echo "=== 任务状态分布 ==="
        psql -h localhost -U logiccore -d logiccore_dev -c "
        SELECT status, deploymentMode, COUNT(*) as count
        FROM \"Task\"
        WHERE \"createdAt\" > NOW() - INTERVAL '10 minutes'
        GROUP BY status, deploymentMode;"
    fi

    # 如果没有容器运行且已经过了足够时间，退出监控
    if [ $container_count -eq 0 ] && [ $elapsed -gt 60 ]; then
        echo "所有ECS Only容器执行完成，监控结束"
        break
    fi

    echo "----------------------------------------"
    sleep 10
done
EOF

chmod +x monitor_ecsonly_concurrent.sh
./monitor_ecsonly_concurrent.sh &
MONITOR_PID=$!
```

#### 6.4 ECS Only模式结果验证

```bash
# 等待所有任务完成
echo "=== 等待所有ECS Only任务完成 ==="
while [ $(redis-cli LLEN task_queue) -gt 0 ] || [ $(docker ps | grep tool-job | wc -l) -gt 0 ]; do
    echo "等待任务完成... 队列长度: $(redis-cli LLEN task_queue), 运行容器: $(docker ps | grep tool-job | wc -l)"
    sleep 10
done

# 验证ECS Only模式任务执行结果
echo "=== ECS Only模式任务执行结果验证 ==="
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    status,
    deploymentMode,
    parameters->'modName' as modName,
    parameters->'toolType' as toolType,
    \"startedAt\",
    \"finishedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds,
    localStoragePath
FROM \"Task\"
WHERE deploymentMode = 'ecs_only'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
ORDER BY \"createdAt\" DESC;"

# 检查ECS本地存储中的结果文件
echo "=== 检查ECS本地存储结果文件 ==="
for task_id in $(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id FROM \"Task\"
WHERE deploymentMode = 'ecs_only'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
AND status = 'COMPLETED';"); do
    echo "检查任务 $task_id 的ECS本地结果文件:"
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/jobs/$task_id/output/ || echo "任务 $task_id 结果文件未找到"
done

# 停止监控进程
kill $MONITOR_PID 2>/dev/null || true
```

## 🔍 ECS Only vs ECS+OSS+ACR 对比测试

### 对比测试配置

```bash
# 创建对比测试报告
cat > ecsonly_vs_traditional_comparison.md << 'EOF'
# ECS Only vs ECS+OSS+ACR 模式对比测试报告

## 测试配置
- 测试任务: SDC工具执行
- 并发任务数: 3个
- 单任务资源: 2CPU + 8GB内存
- 测试环境: Windows本地测试

## 功能对比

| 功能特性 | ECS+OSS+ACR模式 | ECS Only模式 | 优势分析 |
|----------|-----------------|--------------|----------|
| **文件存储** | 阿里云OSS | ECS本地存储 | ECS Only: 无网络延迟，成本更低 |
| **镜像管理** | ACR私有仓库 | 本地镜像文件 | ECS Only: 无拉取延迟，离线可用 |
| **部署复杂度** | 高（多服务依赖） | 低（单机部署） | ECS Only: 部署简单，维护容易 |
| **扩展性** | 高（云端弹性） | 中（单机限制） | ECS+OSS+ACR: 更好的扩展性 |
| **成本** | 高（多服务费用） | 低（单机成本） | ECS Only: 成本优势明显 |
| **可靠性** | 高（云端冗余） | 中（单点故障） | ECS+OSS+ACR: 更高可靠性 |

## 性能对比

### 任务执行时间
- ECS Only模式: 平均 X 分钟
- ECS+OSS+ACR模式: 平均 Y 分钟
- 差异分析: [根据实际测试结果填写]

### 资源利用率
- ECS Only模式: CPU X%, 内存 Y%
- ECS+OSS+ACR模式: CPU X%, 内存 Y%
- 差异分析: [根据实际测试结果填写]

## 适用场景建议

### ECS Only模式适用场景:
- 小型团队或个人开发者
- 成本敏感的项目
- 对网络依赖要求低的场景
- 快速原型开发和测试

### ECS+OSS+ACR模式适用场景:
- 大型企业级应用
- 高并发、高可用要求
- 多地域部署需求
- 长期生产环境运行
EOF

echo "对比测试报告已生成: ecsonly_vs_traditional_comparison.md"
```

## 📊 测试质量控制和结果判断

### ECS Only模式特定验证标准

#### 1. 部署模式一致性
- ✅ 所有任务的 `deploymentMode` 字段为 `ecs_only`
- ✅ 无OSS相关操作日志
- ✅ 无ACR镜像拉取操作
- ✅ 所有文件操作在ECS本地路径

#### 2. 本地存储完整性
- ✅ 任务目录结构完整: `{taskId}/{input,output,logs,work}/`
- ✅ 输入文件正确存储在本地路径
- ✅ 输出文件正确生成在本地路径
- ✅ 临时文件正确清理

#### 3. 工具类型配置正确性
- ✅ 工具类型正确识别: `sdcgen`
- ✅ 工具映射服务正常工作
- ✅ 动态配置加载成功
- ✅ 环境变量正确传递

#### 4. 性能和资源管理
- ✅ 容器资源限制生效
- ✅ 并发任务正确排队
- ✅ 本地存储空间管理
- ✅ 清理机制正常工作

### 测试失败的常见原因和排查

#### ECS Only模式特定问题

**1. 部署模式检测失败**
```bash
# 检查环境变量
grep DEPLOYMENT_MODE app/backend/.env.local

# 检查服务启动日志
grep -i "deployment.*mode" logs/app.log

# 验证数据库配置
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT DISTINCT deploymentMode FROM \"Task\";"
```

**2. 本地存储路径问题**
```bash
# 检查WSL路径映射
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/

# 检查权限
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/jobs/

# 检查磁盘空间
df -h /mnt/e/
```

**3. 工具类型配置问题**
```bash
# 检查数据库工具配置
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT name, toolType, dockerImage FROM \"Tool\";"

# 运行工具类型更新
node scripts/update-tool-types.js

# 验证工具映射
curl http://localhost:8080/api/v1/tools/mapping/sdc-generator
```

## 🎯 测试执行清单

### 预备检查清单
- [ ] PostgreSQL和Redis服务正常运行
- [ ] ECS Only模式目录结构创建完成
- [ ] 环境变量配置正确
- [ ] SDC工具镜像构建成功
- [ ] 数据库迁移和工具配置完成

### 功能测试清单
- [ ] 前端UI和动态工具配置测试通过
- [ ] 后端API和工具类型管理测试通过
- [ ] 文件处理和ECS本地存储测试通过
- [ ] Worker任务执行和ECS Only模式测试通过
- [ ] 结果下载和ECS本地文件服务测试通过

### 性能测试清单
- [ ] 单任务执行性能测试通过
- [ ] 多容器并发执行测试通过
- [ ] 资源管理和限制测试通过
- [ ] 本地存储清理机制测试通过

### ECS Only模式特性验证清单
- [ ] 部署模式一致性检查通过
- [ ] 本地存储路径验证通过
- [ ] 工具类型配置验证通过
- [ ] 无云服务依赖验证通过

## 🚀 自动化测试脚本

```bash
# 创建完整的自动化测试脚本
cat > run_sdc_ecsonly_test.sh << 'EOF'
#!/bin/bash

echo "=========================================="
echo "SDC工具ECS Only模式完整测试"
echo "=========================================="

# 设置错误时退出
set -e

# 1. 预备检查
echo "1. 执行预备检查..."
./scripts/check_prerequisites.sh

# 2. 构建镜像
echo "2. 构建SDC工具镜像..."
bash ./scripts/build_sdc_image_ecsonly_win.sh

# 3. 启动服务
echo "3. 启动后端服务..."
cd app/backend
npm run dev &
BACKEND_PID=$!
sleep 10

# 4. 执行功能测试
echo "4. 执行功能测试..."
npm run test:sdc:ecsonly:functional

# 5. 执行性能测试
echo "5. 执行性能测试..."
npm run test:sdc:ecsonly:performance

# 6. 执行并发测试
echo "6. 执行并发测试..."
npm run test:sdc:ecsonly:concurrent

# 7. 生成测试报告
echo "7. 生成测试报告..."
npm run test:sdc:ecsonly:report

# 清理
kill $BACKEND_PID 2>/dev/null || true

echo "=========================================="
echo "SDC工具ECS Only模式测试完成"
echo "=========================================="
EOF

chmod +x run_sdc_ecsonly_test.sh
```

### 阶段7: 数据清理和容器清理测试

**测试目标**: 验证生产级的数据清理机制

#### 7.1 自动清理机制测试

```bash
# 1. 检查清理服务状态
echo "=== 检查ECS清理服务状态 ==="
curl -s http://localhost:8080/api/v1/system/cleanup/status | jq '.'

# 2. 等待自动清理触发（2分钟后）
echo "=== 等待自动清理触发 ==="
CLEANUP_INTERVAL=120  # 2分钟
echo "等待 ${CLEANUP_INTERVAL} 秒后检查自动清理..."

# 监控清理过程
for i in $(seq 1 $((CLEANUP_INTERVAL/10))); do
    echo "等待中... $((i*10))/${CLEANUP_INTERVAL}秒"

    # 检查任务目录是否还存在
    if [[ -d "/mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID" ]]; then
        echo "任务目录仍存在"
    else
        echo "✅ 任务目录已被清理"
        break
    fi

    sleep 10
done

# 3. 验证清理结果
echo "=== 验证清理结果 ==="
if [[ ! -d "/mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID" ]]; then
    echo "✅ 任务目录已正确清理"
else
    echo "⚠️ 任务目录仍然存在，检查清理配置"
    ls -la "/mnt/e/stone/work/webapp/augment/LogicCore/jobs/$TASK_ID/"
fi

# 4. 检查数据库记录保留
echo "=== 检查数据库记录保留 ==="
DB_RECORD=$(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id, status, deploymentMode, localStoragePath
FROM \"Task\"
WHERE id = '$TASK_ID';")

if [[ -n "$DB_RECORD" ]]; then
    echo "✅ 数据库记录正确保留"
    echo "记录内容: $DB_RECORD"
else
    echo "❌ 数据库记录丢失"
fi
```

#### 7.2 容器清理验证

```bash
# 1. 检查是否有残留容器
echo "=== 检查容器清理状态 ==="
REMAINING_CONTAINERS=$(docker ps -a | grep tool-job | wc -l)
echo "残留容器数量: $REMAINING_CONTAINERS"

if [[ "$REMAINING_CONTAINERS" -eq 0 ]]; then
    echo "✅ 所有工具容器已正确清理"
else
    echo "⚠️ 发现残留容器:"
    docker ps -a | grep tool-job
fi

# 2. 检查Docker镜像清理
echo "=== 检查Docker镜像状态 ==="
SDC_IMAGES=$(docker images | grep sdc-generator | wc -l)
echo "SDC镜像数量: $SDC_IMAGES"

# 3. 检查系统资源释放
echo "=== 检查系统资源释放 ==="
echo "当前内存使用:"
free -h | grep Mem

echo "当前磁盘使用:"
df -h /mnt/e/stone/work/webapp/augment/LogicCore/
```

#### 7.3 生产环境一致性验证

```bash
# 1. 验证Linux路径兼容性
echo "=== 验证Linux路径兼容性 ==="
# 检查路径格式是否符合Linux标准
LINUX_PATH_CHECK=$(echo "/mnt/e/stone/work/webapp/augment/LogicCore/jobs" | grep -E "^/[a-zA-Z0-9/_-]+$")
if [[ -n "$LINUX_PATH_CHECK" ]]; then
    echo "✅ 路径格式符合Linux标准"
else
    echo "⚠️ 路径格式需要调整以适配Linux"
fi

# 2. 验证权限设置
echo "=== 验证权限设置 ==="
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/jobs/

# 3. 验证环境变量配置
echo "=== 验证环境变量配置 ==="
echo "DEPLOYMENT_MODE: ${DEPLOYMENT_MODE:-未设置}"
echo "ECS_LOCAL_STORAGE_ROOT: ${ECS_LOCAL_STORAGE_ROOT:-未设置}"
echo "ECS_DOWNLOAD_TIMEOUT: ${ECS_DOWNLOAD_TIMEOUT:-未设置}"

# 4. 生成生产部署建议
cat > production_deployment_recommendations.md << 'EOF'
# SDC工具生产环境部署建议

## Linux环境配置调整

### 1. 路径配置
```bash
# 生产环境路径（Linux）
ECS_LOCAL_STORAGE_ROOT=""
ECS_JOBS_DIR="/jobs"
ECS_TEMPLATES_DIR="/templates"
ECS_DOCKER_DIR="/docker"
```

### 2. 权限配置
```bash
# 创建专用用户和组
sudo groupadd chipcore
sudo useradd -g chipcore -d  chipcore

# 设置目录权限
sudo chown -R chipcore:chipcore 
sudo chmod -R 755 
```

### 3. 系统服务配置
```bash
# 创建systemd服务文件
sudo tee /etc/systemd/system/chipcore-cleanup.service << 'EOL'
[Unit]
Description=ChipCore Cleanup Service
After=network.target

[Service]
Type=simple
User=chipcore
WorkingDirectory=
ExecStart=/usr/bin/node /opt/chipcore/backend/dist/services/cleanup.service.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# 启用服务
sudo systemctl enable chipcore-cleanup
sudo systemctl start chipcore-cleanup
```

### 4. 监控和日志
```bash
# 配置日志轮转
sudo tee /etc/logrotate.d/chipcore << 'EOL'
/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 chipcore chipcore
}
EOL
```
EOF

echo "✅ 生产部署建议已生成: production_deployment_recommendations.md"
```

**验证点**：
- ✅ 2分钟自动清理机制正确工作
- ✅ 任务目录和文件正确清理
- ✅ 数据库记录正确保留
- ✅ 容器正确清理，无残留
- ✅ 系统资源正确释放
- ✅ Linux路径兼容性验证
- ✅ 权限设置符合生产要求
- ✅ 环境变量配置完整
- ✅ 生产部署建议生成

**通过标准**: 所有测试用例通过，ECS Only模式特性正确工作，与真实生产Linux环境高度一致，完整的权限控制和数据清理机制，无错误日志，资源使用正常，本地存储机制完整可靠。
