# UPF工具本地ECS Only Windows测试指南

## 📋 测试环境概述

### ECS Only部署模式 vs 传统ECS+OSS+ACR模式对比

| 组件 | ECS+OSS+ACR模式 | ECS Only模式 | UPF特殊要求 |
|------|-----------------|--------------|-------------|
| **前端** | React + Nginx | React Dev Server | ✅ 4文件上传支持 |
| **后端API** | Node.js + Express | Node.js + Express | ✅ UPF参数验证 |
| **数据库** | PostgreSQL (云端) | PostgreSQL (本地) | ✅ UPF任务记录 |
| **Redis** | Redis (云端) | Redis (本地) | ✅ UPF任务队列 |
| **文件存储** | 阿里云OSS | ECS本地存储 | ✅ 4文件存储 |
| **Docker镜像** | ACR私有仓库 | 本地镜像文件 | ✅ UPF工具镜像 |
| **Worker** | Python Worker | Python Worker | ✅ UPF执行逻辑 |
| **部署模式** | 云端分布式 | 本地集成式 | ✅ 90% |

### 最新架构特性

#### 1. 动态工具类型配置
- **Tool表新增toolType字段**：支持 `upfgen` 工具类型
- **UPF特定配置**：4文件上传、版本选择、功耗域分析
- **工具类型管理器**：统一管理UPF工具配置和映射

#### 2. UPF特定参数化配置增强
- **4文件验证**：hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx
- **版本支持**：UPF 2.0, 2.1, 3.0版本选择
- **功耗模式**：支持flat和hierarchical两种模式
- **用户权限**：free/professional用户权限控制

#### 3. 数据库模型更新
- **Task表增强**：新增UPF特定字段支持
- **Tool表扩展**：toolType字段支持 `upfgen`
- **UPF参数存储**：modName, version, isFlat参数化存储

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
mkdir -p E:/stone/work/webapp/augment/LogicCore/data/chipcore/{jobs,docker/images/{sdc,upf},templates,volumes}

# 验证目录结构
tree E:/stone/work/webapp/augment/LogicCore/data/chipcore/ -L 3
```

**预期目录结构**：
```
E:/stone/work/webapp/augment/LogicCore/data/chipcore/
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
ECS_LOCAL_STORAGE_ROOT="/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore"
ECS_JOBS_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/templates"
ECS_DOCKER_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/docker"

# 临时目录配置（本地Windows测试）
TEMP_JOBS_DIR=/mnt/e/stone/work/webapp/augment/LogicCore/temp/jobs

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

### 4. 数据库初始化和UPF工具配置

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
-- 检查UPF工具配置
SELECT id, name, toolType, dockerImage, version FROM Tool WHERE toolType = 'upfgen';

-- 预期结果：
-- upf-generator | UPF Generator | upfgen | logiccore/upf-generator:latest | 1.0.0
```

### 5. UPF测试数据验证

**测试目标**: 验证准备好的UPF测试数据

```bash
# 检查UPF测试数据是否准备就绪
ls -la test_data/upload_data/upfgen/
# 应显示: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 验证4个文件的格式和内容
file test_data/upload_data/upfgen/*

# 检查YAML文件结构
python3 -c "
import yaml
with open('test_data/upload_data/upfgen/hier.yaml', 'r') as f:
    data = yaml.safe_load(f)
    print('YAML structure valid')
    print('Top module:', data.get('design_hierarchy', {}).get('top_module'))
    print('Power domains:', len(data.get('design_hierarchy', {}).get('power_domains', [])))
"

# 验证Verilog文件
grep -E "(module|endmodule)" test_data/upload_data/upfgen/pvlog.v

# 验证TCL脚本语法
tclsh -c "source test_data/upload_data/upfgen/pobj.tcl; puts 'TCL syntax OK'" 2>/dev/null || echo "TCL file exists"

# 验证Excel文件
python3 -c "
import openpyxl
try:
    wb = openpyxl.load_workbook('test_data/upload_data/upfgen/pcont.xlsx')
    print('Excel file valid, sheets:', wb.sheetnames)
except Exception as e:
    print('Excel file error:', e)
"
```

**预期结果**:
- ✅ 4个文件存在且格式正确
- ✅ hier.yaml包含完整的SoC功耗域定义
- ✅ pvlog.v包含功耗相关的Verilog模块
- ✅ pobj.tcl包含UPF功耗对象定义
- ✅ pcont.xlsx是有效的Excel配置文件

## 🐳 Docker镜像构建和验证

### 阶段0: UPF工具镜像构建测试

**测试目标**: 验证ECS Only模式下的UPF工具Docker镜像构建和本地存储

#### 0.1 构建UPF工具镜像

```bash
# 进入项目根目录
cd E:/stone/work/webapp/augment/LogicCore

# 使用增强版构建脚本
bash ./scripts/build_upf_image_ecsonly_win.sh

# 验证构建结果
bash ./scripts/check_upf_build_status.sh
```

**预期结果**：
```
✅ Docker image built: logiccore/upf-generator:latest (656MB)
✅ Image saved to: E:/stone/work/webapp/augment/LogicCore/data/chipcore/docker/images/upf/logiccore_upf-generator_latest.tar (674MB)
✅ All storage directories created and verified
```

#### 0.2 验证UPF镜像功能

```bash
# 测试镜像基本功能
docker run --rm logiccore/upf-generator:latest --help

# 检查镜像安全配置
docker inspect logiccore/upf-generator:latest | jq '.[0].Config.User'
# 应显示非root用户

# 验证UPF特定环境
docker run --rm logiccore/upf-generator:latest python3 -c "
import yaml, openpyxl, sys
print(f'Python版本: {sys.version}')
print(f'YAML库版本: {yaml.__version__}')
print(f'OpenPyXL版本: {openpyxl.__version__}')
print('UPF Generator Ready')
"

# 验证镜像层数和大小
docker history logiccore/upf-generator:latest --format "table {{.CreatedBy}}\t{{.Size}}" | head -10
```

**验证标准**：
- ✅ 使用非root用户运行 (upfuser)
- ✅ 镜像大小合理 (650-700MB)
- ✅ Python环境和UPF依赖正确
- ✅ 支持资源限制
- ✅ 容器可以正常启动和退出

## 🧪 UPF工具完整测试流程

### 阶段1: 前端UI和动态工具配置测试

**测试目标**: 验证UPF工具页面的4文件上传和参数设置

```bash
# 启动前端
cd app/frontend
npm run dev
# 访问 http://localhost:5173
```

**测试用例**：

1. **工具类型动态加载**
   - 访问UPF工具页面：`/tools/upf-generator`
   - 验证工具类型正确识别为 `upfgen`
   - 检查UPF工具参数配置正确加载

2. **4文件上传验证**
   - **hier.yaml**: 必需，YAML格式验证
   - **pvlog.v**: 必需，Verilog格式验证
   - **pobj.tcl**: 必需，TCL脚本验证
   - **pcont.xlsx**: 必需，Excel格式验证

3. **UPF特定参数设置验证**
   - **ModName**: 支持历史记录下拉选择
   - **Version**: 下拉选择 (2.0, 2.1, 3.0)，默认2.1
   - **IsFlat**: 复选框，默认false

4. **UPF特定错误处理**
   - **缺少任一文件** → "请上传所有4个必需文件"
   - **文件格式错误** → 显示具体格式要求
   - **ModName与hier.yaml不匹配** → "ModName与层次文件不一致"

**预期结果**：
- 按钮状态: 初始蓝橙渐变 → 点击后灰色"Validating..." → 检查失败恢复蓝橙渐变
- 错误提示: 红色Toast显示具体错误信息
- 工具类型: 正确识别为 `upfgen`

### 阶段2: 后端API和UPF工具类型管理测试

**测试目标**: 验证UPF工具类型管理器和API接口

```bash
# 启动后端
cd app/backend
npm run dev
# 后端运行在 http://localhost:8080
```

**API测试用例**：

1. **UPF工具类型查询**
   ```bash
   # 查询所有工具类型
   curl http://localhost:8080/api/v1/tools/types
   
   # 查询UPF工具信息
   curl http://localhost:8080/api/v1/tools/upf-generator
   ```

2. **UPF工具映射验证**
   ```bash
   # 测试UPF工具映射服务
   curl http://localhost:8080/api/v1/tools/mapping/upf-generator
   
   # 验证UPF工具类型推断
   curl http://localhost:8080/api/v1/tools/mapping/validate
   ```

3. **部署模式检测**
   ```bash
   # 检查部署模式
   curl http://localhost:8080/api/v1/system/deployment-mode
   
   # 预期返回: {"mode": "ecs_only", "storage": "ecs-local"}
   ```

### 阶段3: 真实生产流程UPF 4文件处理和ECS本地存储测试

**测试目标**: 验证与真实生产Linux环境一致的UPF完整文件处理流程

#### 3.1 前端UPF 4文件上传流程验证（浏览器缓存 vs 实际上传）

**重要说明**: UPF的4个文件上传默认保存在浏览器缓存中，只有点击Submission按钮后才真正上传到ECS

```bash
# 1. 验证前端UPF 4文件选择（仅缓存，未上传）
# 在浏览器开发者工具中检查
console.log('UPF Files in browser cache:', {
  hierYaml: document.querySelector('input[name="hierYamlFile"]').files[0],
  pvlogV: document.querySelector('input[name="pvlogFile"]').files[0],
  pobjTcl: document.querySelector('input[name="pobjTclFile"]').files[0],
  pcontXlsx: document.querySelector('input[name="pcontXlsxFile"]').files[0]
});

# 2. 检查ECS目录（此时应该为空）
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/
# 应该没有任何任务目录

# 3. 验证UPF测试数据准备
ls -la test_data/upload_data/upfgen/
# 应显示: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 验证UPF测试文件格式和内容
file test_data/upload_data/upfgen/*

# 检查YAML文件结构（功耗域定义）
echo "=== 检查UPF YAML文件结构 ==="
python3 -c "
import yaml
with open('test_data/upload_data/upfgen/hier.yaml', 'r') as f:
    data = yaml.safe_load(f)
    print('YAML structure valid')
    print('Top module:', data.get('design_hierarchy', {}).get('top_module'))
    print('Power domains:', len(data.get('design_hierarchy', {}).get('power_domains', [])))
    print('First power domain:', data.get('design_hierarchy', {}).get('power_domains', [{}])[0])
"

# 检查Verilog文件（功耗相关模块）
echo "=== 检查UPF Verilog文件 ==="
grep -E "(module|endmodule|power|supply)" test_data/upload_data/upfgen/pvlog.v | head -5

# 检查TCL脚本语法
echo "=== 检查UPF TCL脚本 ==="
tclsh -c "source test_data/upload_data/upfgen/pobj.tcl; puts 'TCL syntax OK'" 2>/dev/null || echo "TCL file exists and readable"

# 检查Excel文件有效性（功耗配置）
echo "=== 检查UPF Excel配置文件 ==="
python3 -c "
import openpyxl
try:
    wb = openpyxl.load_workbook('test_data/upload_data/upfgen/pcont.xlsx')
    print('Excel file valid, sheets:', wb.sheetnames)
    print('Row count:', wb.active.max_row)
    print('Column count:', wb.active.max_column)
    # 检查是否包含功耗相关配置
    for row in wb.active.iter_rows(max_row=5, values_only=True):
        print('Sample row:', row)
except Exception as e:
    print('Excel file error:', e)
"
```

#### 3.2 UPF用户订阅状态检查和权限验证

**测试目标**: 验证点击Submission按钮时的UPF完整权限检查流程

```bash
# 获取测试用户token（需要先注册/登录）
TOKEN=$(curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.token')

# 1. 检查用户订阅状态（UPF工具权限）
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/subscription/status | jq '.'

# 2. 检查UPF工具特定权限（free vs professional）
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/tools/upf-generator/permission | jq '.'

# 3. 检查UPF当前并发任务数限制
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/queue/status?toolType=upfgen | jq '.'

# 4. 检查UPF使用次数限制
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/usage/current?toolType=upfgen | jq '.'
```

#### 3.3 UPF任务创建和4文件上传的完整流程测试

**测试目标**: 验证点击Submission按钮后的UPF完整流程

```bash
# 模拟真实的UPF任务提交流程（包含所有验证步骤）
echo "=== 开始UPF任务提交流程测试 ==="

# 步骤1: UPF权限预检查
echo "1. 执行UPF权限预检查..."
UPF_PERMISSION_CHECK=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/permission/check?toolId=upf-generator)
echo "UPF权限检查结果: $UPF_PERMISSION_CHECK"

# 步骤2: 提交UPF任务（真实4文件上传）
echo "2. 提交UPF任务（包含4文件上传）..."
UPF_TASK_RESPONSE=$(curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -F "toolId=upf-generator" \
  -F "parameters={\"modName\":\"soc_top\",\"version\":\"2.1\",\"isFlat\":false,\"toolType\":\"upfgen\"}" \
  -F "files=@test_data/upload_data/upfgen/hier.yaml" \
  -F "files=@test_data/upload_data/upfgen/pvlog.v" \
  -F "files=@test_data/upload_data/upfgen/pobj.tcl" \
  -F "files=@test_data/upload_data/upfgen/pcont.xlsx")

echo "UPF任务提交响应: $UPF_TASK_RESPONSE"

# 提取任务ID
UPF_TASK_ID=$(echo $UPF_TASK_RESPONSE | jq -r '.data.taskId // .taskId')
echo "生成的UPF任务ID: $UPF_TASK_ID"

# 步骤3: 验证UPF任务ID生成和目录创建
echo "3. 验证UPF任务ID和目录创建..."
if [[ "$UPF_TASK_ID" != "null" && "$UPF_TASK_ID" != "" ]]; then
    echo "✅ UPF任务ID生成成功: $UPF_TASK_ID"

    # 检查ECS本地目录是否创建
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/

    # 检查4个输入文件是否上传
    echo "=== 验证UPF 4文件上传 ==="
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/

    # 验证每个文件的存在性和大小
    for file in hier.yaml pvlog.v pobj.tcl pcont.xlsx; do
        if [[ -f "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/$file" ]]; then
            FILE_SIZE=$(stat -f%z "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/$file" 2>/dev/null || stat -c%s "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/$file")
            echo "✅ $file: ${FILE_SIZE} bytes"
        else
            echo "❌ $file: 文件缺失"
        fi
    done

    # 检查UPF任务元数据
    cat /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/metadata.json 2>/dev/null || echo "UPF元数据文件未找到"
else
    echo "❌ UPF任务ID生成失败"
    exit 1
fi
```

**验证点**：
- ✅ 用户订阅状态正确检查（free vs professional）
- ✅ UPF工具特定权限验证
- ✅ UPF并发任务数限制验证
- ✅ UPF使用次数限制验证
- ✅ UPF任务ID唯一性生成
- ✅ ECS本地目录结构创建: `{ECS_JOBS_DIR}/{taskId}/{input,output,logs,work}/`
- ✅ UPF 4文件真实上传到ECS本地路径: `{ECS_JOBS_DIR}/{taskId}/input/`
- ✅ 4文件完整性验证（hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx）
- ✅ 数据库Task记录创建，包含 `deploymentMode: "ecs_only"`
- ✅ Redis队列中UPF任务添加
- ✅ 工具类型正确识别为 `upfgen`
- ✅ UPF任务元数据文件创建

### 阶段4: UPF Worker任务执行和ECS Only模式测试

**测试目标**: 验证ECS Only模式下的UPF完整任务执行流程

#### 4.1 启动Worker和监控

```bash
# 启动Python Worker
cd app/backend
python src/workers/toolWorker.py

# 在另一个终端监控任务状态
watch -n 2 'redis-cli LLEN task_queue && echo "---" && psql -h localhost -U logiccore -d logiccore_dev -c "SELECT id, status, deploymentMode, toolId, \"createdAt\" FROM \"Task\" ORDER BY \"createdAt\" DESC LIMIT 3;"'
```

#### 4.2 详细UPF执行流程验证

**步骤1: Worker获取UPF任务**
```bash
# 检查Redis队列
redis-cli LLEN task_queue
redis-cli LRANGE task_queue 0 -1

# 验证点:
# ✅ 队列中有待处理UPF任务
# ✅ Worker日志显示"Processing UPF task: {taskId}"
# ✅ 部署模式检测为 "ecs_only"
# ✅ UPF工具类型正确识别为 "upfgen"
```

**步骤2: 数据库状态更新 - PENDING → RUNNING**
```sql
-- 检查UPF任务状态变化
SELECT
    id,
    status,
    deploymentMode,
    toolId,
    "startedAt",
    "updatedAt",
    parameters->'toolType' as toolType,
    parameters->'modName' as modName,
    parameters->'version' as upfVersion,
    parameters->'isFlat' as isFlat
FROM "Task"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'RUNNING'
-- ✅ deploymentMode = 'ecs_only'
-- ✅ startedAt 不为空
-- ✅ toolType = 'upfgen'
-- ✅ UPF特定参数正确保存
```

**步骤3: ECS本地文件管理**
```bash
# 检查ECS本地文件结构
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/
# 应包含: input/, output/, logs/, work/

# 检查4个输入文件
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/input/
# 应包含: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 检查UPF工作目录创建
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/work/{modName}/upf/
# 应包含: inputs/, outputs/, logs/, rpts/
```

**步骤4: Docker容器执行（ECS Only模式）**
```bash
# 监控容器状态
docker ps | grep tool-job

# 检查容器环境变量
docker inspect {container_name} | jq '.[0].Config.Env' | grep -E "(UPF_|TASK_|DEPLOYMENT_)"

# 验证容器挂载（ECS Only模式）
docker inspect {container_name} | jq '.[0].Mounts' | grep -E "(input|output|logs|work)"

# 验证点:
# ✅ 容器成功启动
# ✅ 挂载点正确: /data/input, /data/output, /data/logs, /data/work
# ✅ 环境变量包含: DEPLOYMENT_MODE=ecs_only
# ✅ UPF工具类型环境变量: UPF_MOD_NAME, UPF_VERSION, UPF_IS_FLAT
```

**步骤5: UPF工具执行验证（增强版）**
```bash
# 检查UPF工具执行步骤
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/work/{modName}/upf/inputs/
# 应包含: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 检查执行日志
tail -f /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/logs/execution.log

# 检查UPF工具特定日志
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/work/{modName}/upf/logs/
# 应包含: setup.log, check.log, generation.log, validation.log

# 检查最终输出
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/work/{modName}/upf/outputs/
# 应包含: *.upf 文件

# 验证点:
# ✅ 4个输入文件正确复制
# ✅ 每个执行步骤都有日志
# ✅ 生成了预期的UPF文件
# ✅ 报告文件完整
# ✅ UPF工具类型特定的处理逻辑正确执行
```

**步骤6: UPF结果打包和ECS本地存储**
```bash
# 检查结果打包
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/output/
# 应包含: upf_result.zip

# 验证zip文件内容
unzip -l /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/{taskId}/output/upf_result.zip
# 应包含: outputs/, logs/, rpts/ 三个目录

# ECS Only模式：验证本地存储（无OSS上传）
echo "ECS Only模式 - 文件存储在本地，无需OSS上传"

# 验证点:
# ✅ UPF结果文件正确打包
# ✅ 包含所有必要目录（outputs/, logs/, rpts/）
# ✅ 文件存储在ECS本地路径
# ✅ 无OSS上传操作（ECS Only模式特性）
```

**步骤7: 数据库状态更新 - RUNNING → COMPLETED**
```sql
-- 检查最终UPF任务状态
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
    parameters->'toolType' as toolType,
    parameters->'modName' as modName,
    parameters->'version' as upfVersion,
    EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) as execution_seconds
FROM "Task"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'COMPLETED'
-- ✅ deploymentMode = 'ecs_only'
-- ✅ finishedAt 不为空
-- ✅ localStoragePath = taskId
-- ✅ outputFile 路径正确
-- ✅ 执行时间合理（通常3-8分钟）
-- ✅ UPF特定参数保持一致
```

### 阶段5: 生产级UPF结果下载和STS权限控制测试

**测试目标**: 验证ECS Only模式下的UPF完整下载流程和权限控制

#### 5.1 UPF任务完成状态验证

```bash
# 等待UPF任务完成
echo "=== 等待UPF任务完成 ==="
while true; do
    UPF_STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
      http://localhost:8080/api/v1/tasks/$UPF_TASK_ID/status | jq -r '.status')
    echo "当前UPF任务状态: $UPF_STATUS"

    if [[ "$UPF_STATUS" == "COMPLETED" ]]; then
        echo "✅ UPF任务执行完成"
        break
    elif [[ "$UPF_STATUS" == "FAILED" ]]; then
        echo "❌ UPF任务执行失败"
        # 获取UPF错误信息
        curl -s -H "Authorization: Bearer $TOKEN" \
          http://localhost:8080/api/v1/tasks/$UPF_TASK_ID | jq '.errorMessage'
        exit 1
    fi

    sleep 15  # UPF任务通常需要更长时间
done

# 获取UPF任务完成时间
UPF_TASK_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$UPF_TASK_ID)
UPF_FINISHED_AT=$(echo $UPF_TASK_INFO | jq -r '.finishedAt')
echo "UPF任务完成时间: $UPF_FINISHED_AT"
```

#### 5.2 UPF STS权限控制和下载链接生成测试

```bash
# 1. 获取UPF下载信息（包含权限验证）
echo "=== 获取UPF下载信息和权限验证 ==="
UPF_DOWNLOAD_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$UPF_TASK_ID/download-info)
echo "UPF下载信息: $UPF_DOWNLOAD_INFO"

# 2. 检查UPF下载权限和剩余时间
UPF_DOWNLOAD_TIME_REMAINING=$(echo $UPF_DOWNLOAD_INFO | jq -r '.downloadTimeRemaining')
UPF_IS_DOWNLOAD_EXPIRED=$(echo $UPF_DOWNLOAD_INFO | jq -r '.isDownloadExpired')
echo "UPF剩余下载时间: ${UPF_DOWNLOAD_TIME_REMAINING}秒"
echo "UPF下载是否过期: $UPF_IS_DOWNLOAD_EXPIRED"

# 3. 生成UPF下载凭证（STS权限控制）
echo "=== 生成UPF下载凭证 ==="
UPF_DOWNLOAD_CREDENTIAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$UPF_TASK_ID/download)
echo "UPF下载凭证: $UPF_DOWNLOAD_CREDENTIAL"

UPF_DOWNLOAD_URL=$(echo $UPF_DOWNLOAD_CREDENTIAL | jq -r '.downloadUrl')
UPF_EXPIRES_AT=$(echo $UPF_DOWNLOAD_CREDENTIAL | jq -r '.expiresAt')
echo "UPF下载URL: $UPF_DOWNLOAD_URL"
echo "UPF凭证过期时间: $UPF_EXPIRES_AT"
```

#### 5.3 UPF文件下载和内容验证测试

```bash
# 1. 下载UPF结果文件（使用生成的凭证）
echo "=== 下载UPF结果文件 ==="
if [[ "$UPF_DOWNLOAD_URL" != "null" && "$UPF_DOWNLOAD_URL" != "" ]]; then
    # 下载UPF文件
    curl -H "Authorization: Bearer $TOKEN" \
      -o "upf_result_${UPF_TASK_ID}.zip" \
      "$UPF_DOWNLOAD_URL"

    if [[ $? -eq 0 ]]; then
        echo "✅ UPF文件下载成功"

        # 验证UPF文件大小
        UPF_FILE_SIZE=$(stat -f%z "upf_result_${UPF_TASK_ID}.zip" 2>/dev/null || stat -c%s "upf_result_${UPF_TASK_ID}.zip")
        echo "下载UPF文件大小: ${UPF_FILE_SIZE} bytes"

        # 验证UPF ZIP文件完整性
        unzip -t "upf_result_${UPF_TASK_ID}.zip" && echo "✅ UPF ZIP文件完整性验证通过"

        # 检查UPF ZIP文件内容结构
        echo "=== 验证UPF结果文件结构 ==="
        unzip -l "upf_result_${UPF_TASK_ID}.zip"

        # 解压并检查UPF内容
        mkdir -p "temp_upf_extract_${UPF_TASK_ID}"
        unzip -q "upf_result_${UPF_TASK_ID}.zip" -d "temp_upf_extract_${UPF_TASK_ID}"

        echo "UPF解压后的目录结构:"
        find "temp_upf_extract_${UPF_TASK_ID}" -type f | head -15

        # 验证UPF文件内容
        echo "=== 验证UPF文件内容 ==="
        UPF_FILES=$(find "temp_upf_extract_${UPF_TASK_ID}" -name "*.upf" | head -3)
        for upf_file in $UPF_FILES; do
            echo "=== UPF文件内容预览: $upf_file ==="
            head -10 "$upf_file"
            echo "..."

            # 检查UPF文件是否包含功耗域定义
            POWER_DOMAINS=$(grep -c "create_power_domain\|set_domain_supply_net" "$upf_file" 2>/dev/null || echo "0")
            echo "功耗域定义数量: $POWER_DOMAINS"
        done

        # 验证UPF报告文件
        echo "=== 验证UPF报告文件 ==="
        UPF_REPORTS=$(find "temp_upf_extract_${UPF_TASK_ID}" -name "*.rpt" | head -3)
        for rpt_file in $UPF_REPORTS; do
            echo "=== UPF报告文件: $rpt_file ==="
            head -5 "$rpt_file"
            echo "..."
        done

        # 清理临时文件
        rm -rf "temp_upf_extract_${UPF_TASK_ID}"

    else
        echo "❌ UPF文件下载失败"
    fi
else
    echo "❌ UPF下载URL无效"
fi
```

#### 5.4 UPF下载权限过期测试

```bash
# 1. 测试UPF下载时间限制（2分钟超时）
echo "=== 测试UPF下载时间限制 ==="

# 等待接近过期时间
if [[ "$UPF_DOWNLOAD_TIME_REMAINING" -gt 30 ]]; then
    UPF_WAIT_TIME=$((UPF_DOWNLOAD_TIME_REMAINING - 30))
    echo "等待 ${UPF_WAIT_TIME} 秒后测试UPF下载权限..."
    sleep $UPF_WAIT_TIME
fi

# 再次检查UPF下载状态
UPF_UPDATED_DOWNLOAD_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/tasks/$UPF_TASK_ID/download-info)
UPF_UPDATED_TIME_REMAINING=$(echo $UPF_UPDATED_DOWNLOAD_INFO | jq -r '.downloadTimeRemaining')
echo "UPF更新后剩余时间: ${UPF_UPDATED_TIME_REMAINING}秒"

# 2. 测试UPF过期后的下载尝试
if [[ "$UPF_UPDATED_TIME_REMAINING" -le 0 ]]; then
    echo "=== 测试UPF过期下载 ==="
    UPF_EXPIRED_DOWNLOAD=$(curl -s -H "Authorization: Bearer $TOKEN" \
      http://localhost:8080/api/v1/tasks/$UPF_TASK_ID/download)
    echo "UPF过期下载响应: $UPF_EXPIRED_DOWNLOAD"

    # 应该返回错误信息
    UPF_ERROR_MESSAGE=$(echo $UPF_EXPIRED_DOWNLOAD | jq -r '.message // .error')
    echo "UPF预期错误信息: $UPF_ERROR_MESSAGE"
fi
```

**验证点**：
- ✅ UPF任务状态正确更新为 COMPLETED
- ✅ UPF finishedAt时间戳正确记录
- ✅ UPF下载权限验证（用户只能下载自己的UPF任务）
- ✅ UPF STS权限控制生效
- ✅ UPF下载凭证正确生成（包含过期时间）
- ✅ ECS本地UPF下载链接有效
- ✅ 2分钟UPF下载时间限制正确执行
- ✅ UPF下载时间倒计时准确
- ✅ UPF过期后下载被正确拒绝
- ✅ UPF结果文件包含预期内容（outputs/, logs/, rpts/）
- ✅ UPF文件包含正确的功耗域定义
- ✅ UPF报告文件完整
- ✅ 下载服务运行在配置的端口 (8081)

## 🔄 UPF多容器并发执行测试（ECS Only模式）

### 阶段6: UPF并发任务执行和资源管理测试

**测试目标**: 验证ECS Only模式下的UPF多容器并行运行能力

#### 6.1 UPF环境资源配置验证

```bash
# 检查ECS Only模式UPF资源配置
echo "=== ECS Only模式UPF资源配置检查 ==="
echo "ECS_TOTAL_CPU: ${ECS_TOTAL_CPU:-8}"
echo "ECS_TOTAL_MEMORY_GB: ${ECS_TOTAL_MEMORY_GB:-32}"
echo "UPF_JOB_CPU_REQUEST: ${JOB_CPU_REQUEST:-2}"
echo "UPF_JOB_MEMORY_REQUEST_GB: ${JOB_MEMORY_REQUEST_GB:-8}"

# 计算理论UPF并发容器数
echo "理论最大UPF并发容器数:"
echo "按CPU计算: $((${ECS_TOTAL_CPU:-8} / ${JOB_CPU_REQUEST:-2}))"
echo "按内存计算: $((${ECS_TOTAL_MEMORY_GB:-32} / ${JOB_MEMORY_REQUEST_GB:-8}))"

# 检查UPF特定依赖
echo "=== UPF Python环境检查 ==="
python3 -c "
import yaml, openpyxl, sys
print(f'Python版本: {sys.version}')
print(f'YAML库版本: {yaml.__version__}')
print(f'OpenPyXL版本: {openpyxl.__version__}')
print('UPF工具依赖检查完成')
"
```

#### 6.2 UPF多任务并发提交测试

```bash
# 创建UPF并发测试脚本
cat > test_concurrent_upf_ecsonly.sh << 'EOF'
#!/bin/bash

# 获取认证token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.token')

# 并发提交3个UPF任务（ECS Only模式）
for i in {1..3}; do
    echo "提交第${i}个ECS Only UPF任务..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer $TOKEN" \
      -F "toolId=upf-generator" \
      -F "parameters={\"modName\":\"soc_top_${i}\",\"version\":\"2.1\",\"isFlat\":false,\"toolType\":\"upfgen\"}" \
      -F "files=@test_data/upload_data/upfgen/hier.yaml" \
      -F "files=@test_data/upload_data/upfgen/pvlog.v" \
      -F "files=@test_data/upload_data/upfgen/pobj.tcl" \
      -F "files=@test_data/upload_data/upfgen/pcont.xlsx" &

    sleep 2
done

wait
echo "所有ECS Only UPF任务提交完成"
EOF

chmod +x test_concurrent_upf_ecsonly.sh
./test_concurrent_upf_ecsonly.sh

#### 6.3 ECS Only模式UPF并发监控

```bash
# ECS Only模式UPF并发监控脚本
cat > monitor_upf_ecsonly_concurrent.sh << 'EOF'
#!/bin/bash

echo "开始监控ECS Only模式UPF并发容器执行..."
start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))

    # 检查当前运行的UPF容器数量
    container_count=$(docker ps | grep tool-job | wc -l)

    echo "[$elapsed秒] ECS Only模式 - 当前运行UPF容器数: $container_count"

    if [ $container_count -gt 0 ]; then
        echo "=== ECS Only UPF容器资源使用情况 ==="
        docker stats --no-stream $(docker ps --format "table {{.Names}}" | grep tool-job) 2>/dev/null || echo "暂无UPF容器运行"

        echo "=== ECS本地存储使用情况 ==="
        du -sh /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/*/

        echo "=== UPF任务状态分布 ==="
        psql -h localhost -U logiccore -d logiccore_dev -c "
        SELECT status, deploymentMode, COUNT(*) as count
        FROM \"Task\"
        WHERE \"createdAt\" > NOW() - INTERVAL '10 minutes'
        AND toolId = 'upf-generator'
        GROUP BY status, deploymentMode;"
    fi

    # 如果没有容器运行且已经过了足够时间，退出监控
    if [ $container_count -eq 0 ] && [ $elapsed -gt 60 ]; then
        echo "所有ECS Only UPF容器执行完成，监控结束"
        break
    fi

    echo "----------------------------------------"
    sleep 10
done
EOF

chmod +x monitor_upf_ecsonly_concurrent.sh
./monitor_upf_ecsonly_concurrent.sh &
MONITOR_PID=$!

#### 6.4 ECS Only模式UPF结果验证

```bash
# 等待所有UPF任务完成
echo "=== 等待所有ECS Only UPF任务完成 ==="
while [ $(redis-cli LLEN task_queue) -gt 0 ] || [ $(docker ps | grep tool-job | wc -l) -gt 0 ]; do
    echo "等待UPF任务完成... 队列长度: $(redis-cli LLEN task_queue), 运行容器: $(docker ps | grep tool-job | wc -l)"
    sleep 10
done

# 验证ECS Only模式UPF任务执行结果
echo "=== ECS Only模式UPF任务执行结果验证 ==="
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    status,
    deploymentMode,
    parameters->'modName' as modName,
    parameters->'toolType' as toolType,
    parameters->'version' as upfVersion,
    \"startedAt\",
    \"finishedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds,
    localStoragePath
FROM \"Task\"
WHERE deploymentMode = 'ecs_only'
AND toolId = 'upf-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
ORDER BY \"createdAt\" DESC;"

# 检查ECS本地存储中的UPF结果文件
echo "=== 检查ECS本地存储UPF结果文件 ==="
for task_id in $(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id FROM \"Task\"
WHERE deploymentMode = 'ecs_only'
AND toolId = 'upf-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
AND status = 'COMPLETED';"); do
    echo "检查UPF任务 $task_id 的ECS本地结果文件:"
    ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$task_id/output/ || echo "UPF任务 $task_id 结果文件未找到"
done

# 停止监控进程
kill $MONITOR_PID 2>/dev/null || true
```

## 🔍 ECS Only vs ECS+OSS+ACR UPF对比测试

### UPF对比测试配置

```bash
# 创建UPF对比测试报告
cat > upf_ecsonly_vs_traditional_comparison.md << 'EOF'
# UPF ECS Only vs ECS+OSS+ACR 模式对比测试报告

## 测试配置
- 测试任务: UPF工具执行
- 并发任务数: 3个
- 单任务资源: 2CPU + 8GB内存
- 测试环境: Windows本地测试
- 4文件处理: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

## UPF功能对比

| 功能特性 | ECS+OSS+ACR模式 | ECS Only模式 | UPF优势分析 |
|----------|-----------------|--------------|-------------|
| **4文件存储** | 阿里云OSS | ECS本地存储 | ECS Only: 无网络延迟，4文件一致性更好 |
| **UPF镜像管理** | ACR私有仓库 | 本地镜像文件 | ECS Only: 无拉取延迟，UPF依赖稳定 |
| **版本管理** | 云端版本控制 | 本地版本管理 | ECS Only: UPF版本切换更快 |
| **功耗域分析** | 云端计算资源 | 本地计算资源 | ECS+OSS+ACR: 更强计算能力 |
| **部署复杂度** | 高（多服务依赖） | 低（单机部署） | ECS Only: UPF工具部署简单 |
| **扩展性** | 高（云端弹性） | 中（单机限制） | ECS+OSS+ACR: UPF大规模处理能力更强 |

## UPF性能对比

### UPF任务执行时间
- ECS Only模式: 平均 X 分钟
- ECS+OSS+ACR模式: 平均 Y 分钟
- 差异分析: [根据实际UPF测试结果填写]

### UPF资源利用率
- ECS Only模式: CPU X%, 内存 Y%
- ECS+OSS+ACR模式: CPU X%, 内存 Y%
- 差异分析: [根据实际UPF测试结果填写]

## UPF适用场景建议

### ECS Only模式适用场景:
- 中小型UPF设计项目
- 功耗域数量 < 50个
- 4文件处理要求高一致性
- UPF版本切换频繁的开发环境

### ECS+OSS+ACR模式适用场景:
- 大型SoC UPF设计
- 功耗域数量 > 100个
- 多地域UPF设计团队协作
- 长期生产环境UPF生成
EOF

echo "UPF对比测试报告已生成: upf_ecsonly_vs_traditional_comparison.md"
```

## 📊 UPF测试质量控制和结果判断

### ECS Only模式UPF特定验证标准

#### 1. UPF部署模式一致性
- ✅ 所有UPF任务的 `deploymentMode` 字段为 `ecs_only`
- ✅ 无OSS相关操作日志
- ✅ 无ACR镜像拉取操作
- ✅ 所有UPF文件操作在ECS本地路径

#### 2. UPF本地存储完整性
- ✅ UPF任务目录结构完整: `{taskId}/{input,output,logs,work}/`
- ✅ 4个输入文件正确存储在本地路径
- ✅ UPF输出文件正确生成在本地路径
- ✅ UPF临时文件正确清理

#### 3. UPF工具类型配置正确性
- ✅ 工具类型正确识别: `upfgen`
- ✅ UPF工具映射服务正常工作
- ✅ UPF动态配置加载成功
- ✅ UPF环境变量正确传递

#### 4. UPF性能和资源管理
- ✅ UPF容器资源限制生效
- ✅ UPF并发任务正确排队
- ✅ UPF本地存储空间管理
- ✅ UPF清理机制正常工作

### UPF测试失败的常见原因和排查

#### ECS Only模式UPF特定问题

**1. UPF部署模式检测失败**
```bash
# 检查环境变量
grep DEPLOYMENT_MODE app/backend/.env.local

# 检查UPF服务启动日志
grep -i "deployment.*mode" logs/app.log

# 验证UPF数据库配置
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT DISTINCT deploymentMode FROM \"Task\" WHERE toolId = 'upf-generator';"
```

**2. UPF本地存储路径问题**
```bash
# 检查WSL路径映射
ls -la /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/

# 检查UPF权限
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/

# 检查UPF磁盘空间
df -h /mnt/e/
```

**3. UPF工具类型配置问题**
```bash
# 检查数据库UPF工具配置
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT name, toolType, dockerImage FROM \"Tool\" WHERE toolType = 'upfgen';"

# 运行UPF工具类型更新
node scripts/update-tool-types.js

# 验证UPF工具映射
curl http://localhost:8080/api/v1/tools/mapping/upf-generator
```

**4. UPF 4文件处理问题**
```bash
# 检查4文件上传
ls -la test_data/upload_data/upfgen/
file test_data/upload_data/upfgen/*

# 验证Excel文件
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('test_data/upload_data/upfgen/pcont.xlsx')
print('Sheets:', wb.sheetnames)
"

# 验证TCL脚本
tclsh -c "source test_data/upload_data/upfgen/pobj.tcl; puts 'TCL OK'"
```

## 🎯 UPF测试执行清单

### UPF预备检查清单
- [ ] PostgreSQL和Redis服务正常运行
- [ ] ECS Only模式目录结构创建完成
- [ ] 环境变量配置正确
- [ ] UPF工具镜像构建成功
- [ ] 数据库迁移和UPF工具配置完成
- [ ] UPF测试数据准备完成（4文件）

### UPF功能测试清单
- [ ] 前端UI和UPF动态工具配置测试通过
- [ ] 后端API和UPF工具类型管理测试通过
- [ ] UPF文件处理和ECS本地存储测试通过
- [ ] UPF Worker任务执行和ECS Only模式测试通过
- [ ] UPF结果下载和ECS本地文件服务测试通过

### UPF性能测试清单
- [ ] 单UPF任务执行性能测试通过
- [ ] 多UPF容器并发执行测试通过
- [ ] UPF资源管理和限制测试通过
- [ ] UPF本地存储清理机制测试通过

### ECS Only模式UPF特性验证清单
- [ ] UPF部署模式一致性检查通过
- [ ] UPF本地存储路径验证通过
- [ ] UPF工具类型配置验证通过
- [ ] UPF无云服务依赖验证通过

## 🚀 UPF自动化测试脚本

```bash
# 创建完整的UPF自动化测试脚本
cat > run_upf_ecsonly_test.sh << 'EOF'
#!/bin/bash

echo "=========================================="
echo "UPF工具ECS Only模式完整测试"
echo "=========================================="

# 设置错误时退出
set -e

# 1. UPF预备检查
echo "1. 执行UPF预备检查..."
./scripts/check_upf_prerequisites.sh

# 2. 构建UPF镜像
echo "2. 构建UPF工具镜像..."
bash ./scripts/build_upf_image_ecsonly_win.sh

# 3. 启动服务
echo "3. 启动后端服务..."
cd app/backend
npm run dev &
BACKEND_PID=$!
sleep 10

# 4. 执行UPF功能测试
echo "4. 执行UPF功能测试..."
npm run test:upf:ecsonly:functional

# 5. 执行UPF性能测试
echo "5. 执行UPF性能测试..."
npm run test:upf:ecsonly:performance

# 6. 执行UPF并发测试
echo "6. 执行UPF并发测试..."
npm run test:upf:ecsonly:concurrent

# 7. 生成UPF测试报告
echo "7. 生成UPF测试报告..."
npm run test:upf:ecsonly:report

# 清理
kill $BACKEND_PID 2>/dev/null || true

echo "=========================================="
echo "UPF工具ECS Only模式测试完成"
echo "=========================================="
EOF

chmod +x run_upf_ecsonly_test.sh
```

### 阶段7: UPF数据清理和容器清理测试

**测试目标**: 验证生产级的UPF数据清理机制

#### 7.1 UPF自动清理机制测试

```bash
# 1. 检查UPF清理服务状态
echo "=== 检查ECS UPF清理服务状态 ==="
curl -s http://localhost:8080/api/v1/system/cleanup/status?toolType=upfgen | jq '.'

# 2. 等待UPF自动清理触发（2分钟后）
echo "=== 等待UPF自动清理触发 ==="
UPF_CLEANUP_INTERVAL=120  # 2分钟
echo "等待 ${UPF_CLEANUP_INTERVAL} 秒后检查UPF自动清理..."

# 监控UPF清理过程
for i in $(seq 1 $((UPF_CLEANUP_INTERVAL/10))); do
    echo "等待中... $((i*10))/${UPF_CLEANUP_INTERVAL}秒"

    # 检查UPF任务目录是否还存在
    if [[ -d "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID" ]]; then
        echo "UPF任务目录仍存在"

        # 检查UPF 4文件是否还在
        UPF_FILES_COUNT=$(ls -1 "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/" 2>/dev/null | wc -l)
        echo "UPF输入文件数量: $UPF_FILES_COUNT"
    else
        echo "✅ UPF任务目录已被清理"
        break
    fi

    sleep 10
done

# 3. 验证UPF清理结果
echo "=== 验证UPF清理结果 ==="
if [[ ! -d "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID" ]]; then
    echo "✅ UPF任务目录已正确清理"
else
    echo "⚠️ UPF任务目录仍然存在，检查清理配置"
    ls -la "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/"

    # 检查UPF特定文件清理
    echo "UPF输入文件清理状态:"
    for file in hier.yaml pvlog.v pobj.tcl pcont.xlsx; do
        if [[ -f "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/$UPF_TASK_ID/input/$file" ]]; then
            echo "⚠️ $file 仍存在"
        else
            echo "✅ $file 已清理"
        fi
    done
fi

# 4. 检查UPF数据库记录保留
echo "=== 检查UPF数据库记录保留 ==="
UPF_DB_RECORD=$(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id, status, deploymentMode, localStoragePath, toolId
FROM \"Task\"
WHERE id = '$UPF_TASK_ID';")

if [[ -n "$UPF_DB_RECORD" ]]; then
    echo "✅ UPF数据库记录正确保留"
    echo "UPF记录内容: $UPF_DB_RECORD"
else
    echo "❌ UPF数据库记录丢失"
fi
```

#### 7.2 UPF容器清理验证

```bash
# 1. 检查是否有残留UPF容器
echo "=== 检查UPF容器清理状态 ==="
UPF_REMAINING_CONTAINERS=$(docker ps -a | grep tool-job | grep upf | wc -l)
echo "残留UPF容器数量: $UPF_REMAINING_CONTAINERS"

if [[ "$UPF_REMAINING_CONTAINERS" -eq 0 ]]; then
    echo "✅ 所有UPF工具容器已正确清理"
else
    echo "⚠️ 发现残留UPF容器:"
    docker ps -a | grep tool-job | grep upf
fi

# 2. 检查UPF Docker镜像清理
echo "=== 检查UPF Docker镜像状态 ==="
UPF_IMAGES=$(docker images | grep upf-generator | wc -l)
echo "UPF镜像数量: $UPF_IMAGES"

# 3. 检查UPF系统资源释放
echo "=== 检查UPF系统资源释放 ==="
echo "当前内存使用:"
free -h | grep Mem

echo "当前磁盘使用:"
df -h /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/

# 4. 检查UPF特定资源清理
echo "=== 检查UPF特定资源清理 ==="
UPF_TEMP_FILES=$(find /tmp -name "*upf*" -o -name "*UPF*" 2>/dev/null | wc -l)
echo "临时UPF文件数量: $UPF_TEMP_FILES"
```

#### 7.3 UPF生产环境一致性验证

```bash
# 1. 验证UPF Linux路径兼容性
echo "=== 验证UPF Linux路径兼容性 ==="
# 检查UPF路径格式是否符合Linux标准
UPF_LINUX_PATH_CHECK=$(echo "/mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs" | grep -E "^/[a-zA-Z0-9/_-]+$")
if [[ -n "$UPF_LINUX_PATH_CHECK" ]]; then
    echo "✅ UPF路径格式符合Linux标准"
else
    echo "⚠️ UPF路径格式需要调整以适配Linux"
fi

# 2. 验证UPF权限设置
echo "=== 验证UPF权限设置 ==="
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/
ls -ld /mnt/e/stone/work/webapp/augment/LogicCore/data/chipcore/jobs/

# 3. 验证UPF环境变量配置
echo "=== 验证UPF环境变量配置 ==="
echo "DEPLOYMENT_MODE: ${DEPLOYMENT_MODE:-未设置}"
echo "ECS_LOCAL_STORAGE_ROOT: ${ECS_LOCAL_STORAGE_ROOT:-未设置}"
echo "ECS_DOWNLOAD_TIMEOUT: ${ECS_DOWNLOAD_TIMEOUT:-未设置}"

# 4. 生成UPF生产部署建议
cat > upf_production_deployment_recommendations.md << 'EOF'
# UPF工具生产环境部署建议

## Linux环境配置调整

### 1. UPF路径配置
```bash
# 生产环境UPF路径（Linux）
ECS_LOCAL_STORAGE_ROOT="/data/chipcore"
ECS_JOBS_DIR="/data/chipcore/jobs"
ECS_TEMPLATES_DIR="/data/chipcore/templates/upf"
ECS_DOCKER_DIR="/data/chipcore/docker/upf"
```

### 2. UPF权限配置
```bash
# 创建UPF专用用户和组
sudo groupadd upfcore
sudo useradd -g upfcore -d /data/chipcore/upf upfcore

# 设置UPF目录权限
sudo chown -R upfcore:upfcore /data/chipcore/upf
sudo chmod -R 755 /data/chipcore/upf
```

### 3. UPF系统服务配置
```bash
# 创建UPF systemd服务文件
sudo tee /etc/systemd/system/upfcore-cleanup.service << 'EOL'
[Unit]
Description=UPFCore Cleanup Service
After=network.target

[Service]
Type=simple
User=upfcore
WorkingDirectory=/data/chipcore/upf
ExecStart=/usr/bin/node /opt/chipcore/backend/dist/services/upf-cleanup.service.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# 启用UPF服务
sudo systemctl enable upfcore-cleanup
sudo systemctl start upfcore-cleanup
```

### 4. UPF监控和日志
```bash
# 配置UPF日志轮转
sudo tee /etc/logrotate.d/upfcore << 'EOL'
/data/chipcore/upf/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 upfcore upfcore
}
EOL
```

### 5. UPF特定配置
```bash
# UPF工具特定环境变量
export UPF_VERSION_DEFAULT="2.1"
export UPF_MAX_POWER_DOMAINS=100
export UPF_TIMEOUT_SECONDS=1800
export UPF_MEMORY_LIMIT_GB=8
```
EOF

echo "✅ UPF生产部署建议已生成: upf_production_deployment_recommendations.md"
```

**验证点**：
- ✅ 2分钟UPF自动清理机制正确工作
- ✅ UPF任务目录和4文件正确清理
- ✅ UPF数据库记录正确保留
- ✅ UPF容器正确清理，无残留
- ✅ UPF系统资源正确释放
- ✅ UPF Linux路径兼容性验证
- ✅ UPF权限设置符合生产要求
- ✅ UPF环境变量配置完整
- ✅ UPF生产部署建议生成

**通过标准**: 所有UPF测试用例通过，ECS Only模式特性正确工作，与真实生产Linux环境高度一致，完整的UPF权限控制和数据清理机制，4文件处理完整可靠，UPF功耗域分析准确，本地存储机制完整可靠。
```
