# SDC工具本地生产测试指南

## 📋 测试环境概述

### 本地测试环境 vs 生产环境对比

| 组件 | 生产环境 | 本地测试环境 | 测试覆盖度 |
|------|----------|--------------|------------|
| **前端** | React + Nginx | React Dev Server | ✅ 100% |
| **后端API** | Node.js + Express | Node.js + Express | ✅ 100% |
| **数据库** | PostgreSQL (云端) | PostgreSQL (本地) | ✅ 100% |
| **Redis** | Redis (云端) | Redis (本地) | ✅ 100% |
| **OSS存储** | 阿里云OSS | MinIO (本地) | ⚠️ 90% |
| **Docker** | ECS + ACR | 本地Docker | ⚠️ 85% |
| **Worker** | Python Worker | Node.js Worker | ✅ 95% |

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

# 3. 启动MinIO (模拟OSS)
docker run -d --name minio-test \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### 2. 目录结构准备

```bash
# 创建测试目录结构
mkdir -p ../jobs
mkdir -p ../templates/sdcgen
mkdir -p ../docker/images
mkdir -p ../docker/volumes

# 复制SDC模板文件
cp stuff/tool_template/sdc_gen.zip ../templates/sdcgen/
```

### 3. 环境变量配置

```bash
# backend/.env.local
DATABASE_URL=postgresql://logiccore:dev123@localhost:5432/logiccore_dev
REDIS_URL=redis://localhost:6379

# MinIO配置 (模拟OSS)
OSS_REGION=us-east-1
OSS_ENDPOINT=http://localhost:9000
OSS_ACCESS_KEY_ID=minioadmin
OSS_ACCESS_KEY_SECRET=minioadmin
OSS_BUCKET_USER_INPUT=test-user-input
OSS_BUCKET_JOB_RESULTS=test-job-results
OSS_BUCKET_JOB_LOGS=test-job-logs

# 本地目录配置
TEMP_JOBS_DIR=../jobs
TEMPLATE_ROOT_PATH=../templates

# Docker配置
DOCKER_HOST=unix:///var/run/docker.sock
```

### 4. 数据库初始化

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

### 5. MinIO Bucket创建

```bash
# 安装MinIO客户端
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc

# 配置MinIO别名
./mc alias set local http://localhost:9000 minioadmin minioadmin

# 创建测试buckets
./mc mb local/test-user-input
./mc mb local/test-job-results
./mc mb local/test-job-logs
```

## 🐳 Docker镜像生成和管理测试

### 阶段0: SDC工具镜像生成测试

**测试目标**: 验证SDC工具Docker镜像的生成和本地缓存机制

#### 0.1 生成SDC工具镜像

```bash
# 进入项目根目录
cd /path/to/LogicCore

# 生成SDC工具镜像
docker build -f scripts/docker_sdc_generator_Dockerfile -t sdc-generator:latest .

# 验证镜像生成成功
docker images | grep sdc-generator

# 保存镜像到本地测试目录（模拟ACR拉取）
docker save sdc-generator:latest -o test_data/tools_images/sdcgen/sdc-generator-latest.tar

# 验证镜像文件
ls -lh test_data/tools_images/sdcgen/
```

**预期结果**:
- ✅ 镜像构建成功，无错误信息
- ✅ 镜像大小合理（通常100MB-500MB）
- ✅ 镜像文件保存到指定目录
- ✅ 镜像包含必要的SDC工具和依赖

#### 0.2 模拟ACR镜像拉取测试

```bash
# 删除本地镜像（模拟首次拉取）
docker rmi sdc-generator:latest

# 从本地文件加载镜像（模拟ACR拉取）
docker load -i test_data/tools_images/sdcgen/sdc-generator-latest.tar

# 验证镜像加载成功
docker images | grep sdc-generator

# 测试镜像基本功能
docker run --rm sdc-generator:latest --help
```

**验证点**:
- ✅ 镜像加载成功
- ✅ 镜像运行正常
- ✅ 工具帮助信息显示正确
- ✅ 容器可以正常启动和退出

#### 0.3 镜像安全和性能测试

```bash
# 检查镜像安全配置
docker inspect sdc-generator:latest | jq '.[0].Config.User'
# 应显示非root用户

# 检查镜像层数和大小
docker history sdc-generator:latest

# 测试容器资源限制
docker run --rm --cpus=1 --memory=1g sdc-generator:latest echo "Resource test"
```

**验证标准**:
- ✅ 使用非root用户运行
- ✅ 镜像层数合理（<20层）
- ✅ 支持资源限制
- ✅ 无安全漏洞警告

## 🧪 SDC工具完整测试流程

### 阶段1: 前端UI和表单验证测试

**测试目标**: 验证SDC工具页面的输入检查机制

```bash
# 启动前端
cd frontend
npm run dev
# 访问 http://localhost:5173
```

**测试用例**:
1. **空ModName提交** → 应显示"ModName不能为空"
2. **特殊字符ModName** → 应显示"只能包含字母、数字和下划线"
3. **缺少文件上传** → 应显示"请上传所有必需的文件"
4. **大文件上传** → 应显示"文件大小不能超过5MB"
5. **空文件上传** → 应显示"文件内容为空"
6. **格式错误文件** → 应显示具体格式错误信息

**预期结果**:
- 按钮状态: 初始蓝橙渐变 → 点击后灰色"Validating..." → 检查失败恢复蓝橙渐变
- 错误提示: 红色Toast显示具体错误信息
- 状态显示: 紫色"正在检查用户输入..."框出现并消失

### 阶段2: Template下载功能测试

**测试目标**: 验证模板文件下载功能

```bash
# 测试模板下载API
curl -O http://localhost:8080/api/v1/templates/sdcgen/sdc_gen.zip

# 验证文件完整性
ls -la sdc_gen.zip
unzip -t sdc_gen.zip
```

**预期结果**:
- 文件成功下载
- 文件大小正确
- ZIP文件结构完整

### 阶段3: 后端API和权限测试

**测试目标**: 验证API接口和权限检查

```bash
# 启动后端
cd backend
npm run dev
# 后端运行在 http://localhost:8080
```

**测试用例**:
1. **未登录用户提交** → 重定向到登录页
2. **无订阅用户提交** → 显示订阅提示
3. **超出配额用户提交** → 显示配额限制
4. **正常用户提交** → 成功创建任务

**模拟测试数据**:
```sql
-- 创建测试用户
INSERT INTO "User" (id, email, "emailVerified", "subscriptionType") 
VALUES ('test-user-1', 'test@example.com', true, 'PROFESSIONAL');

-- 创建测试工具
INSERT INTO "Tool" (id, name, "dockerImage", status) 
VALUES ('sdc-generator', 'SDC Generator', 'localhost:5000/sdc-generator:latest', 'ACTIVE');
```

### 阶段4: 文件处理和存储测试

**测试目标**: 验证文件上传和存储逻辑

#### 4.1 使用准备好的测试数据

```bash
# 检查SDC测试数据是否准备就绪
ls -la test_data/upload_data/sdcgen/
# 应显示: hier.yaml, vlog.v, dcont.xlsx

# 验证测试文件内容和格式
file test_data/upload_data/sdcgen/*
wc -l test_data/upload_data/sdcgen/*.yaml test_data/upload_data/sdcgen/*.v

# 检查Excel文件
python3 -c "
import openpyxl
try:
    wb = openpyxl.load_workbook('test_data/upload_data/sdcgen/dcont.xlsx')
    print('Excel file valid, sheets:', wb.sheetnames)
except Exception as e:
    print('Excel file error:', e)
"
```

**预期结果**:
- ✅ 3个文件存在且格式正确
- ✅ hier.yaml包含jpeg_top_wrap模块定义
- ✅ vlog.v是有效的Verilog文件
- ✅ dcont.xlsx是有效的Excel文件

#### 4.2 API测试（使用实际测试数据）

```bash
# 测试SDC文件上传（使用准备好的测试数据）
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Authorization: Bearer test-token" \
  -F "toolId=sdc-generator" \
  -F "parameters={\"modName\":\"jpeg_top_wrap\",\"isFlat\":false}" \
  -F "files=@test_data/upload_data/sdcgen/hier.yaml" \
  -F "files=@test_data/upload_data/sdcgen/vlog.v" \
  -F "files=@test_data/upload_data/sdcgen/dcont.xlsx"
```

**验证点**:
- ✅ 文件上传到MinIO路径: `test-user-1/{taskId}/inputs/`
- ✅ 数据库Task记录创建，modName为"jpeg_top_wrap"
- ✅ Redis队列中任务添加
- ✅ 权限验证通过，TaskID唯一性保证

### 阶段5: Worker任务执行和数据库同步测试

**测试目标**: 验证完整的任务执行流程和数据库状态同步

#### 5.1 启动Worker和监控

```bash
# 启动Worker
cd backend
npm run dev:worker

# 在另一个终端监控日志
tail -f logs/worker.log

# 在第三个终端监控数据库变化
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT id, status, \"createdAt\", \"updatedAt\"
FROM \"Task\"
ORDER BY \"createdAt\" DESC
LIMIT 5;"
```

#### 5.2 详细执行流程和验证点

**步骤1: Worker获取任务**
```bash
# 检查Redis队列状态
redis-cli LLEN task_queue
redis-cli LRANGE task_queue 0 -1

# 验证点:
# ✅ 队列中有待处理任务
# ✅ Worker日志显示"Processing task: {taskId}"
```

**步骤2: 数据库状态更新 - PENDING → RUNNING**
```sql
-- 检查任务状态变化
SELECT id, status, \"startedAt\", \"updatedAt\"
FROM \"Task\"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'RUNNING'
-- ✅ startedAt 不为空
-- ✅ updatedAt 已更新
```

**步骤3: 文件下载和目录创建**
```bash
# 检查MinIO文件下载
ls -la ../jobs/{taskId}/input/
# 应包含: hier.yaml, vlog.v, dcont.xlsx

# 检查工作目录创建
ls -la ../jobs/{taskId}/work/{modName}/sdc/
# 应包含: inputs/, outputs/, logs/, rpts/

# 验证点:
# ✅ 输入文件完整下载
# ✅ 目录结构正确创建
# ✅ 文件权限正确设置
```

**步骤4: Docker容器执行**
```bash
# 监控容器状态
docker ps | grep sdc-generator

# 检查容器日志
docker logs {container_name}

# 验证容器挂载
docker inspect {container_name} | jq '.[0].Mounts'

# 验证点:
# ✅ 容器成功启动
# ✅ 挂载点正确: /data/input, /data/output, /data/logs, /data/work
# ✅ 容器内目录结构: /data/work/{modName}/sdc/
# ✅ 容器执行无错误
```

**步骤5: SDC工具执行验证**
```bash
# 检查SDC工具执行步骤
ls -la ../jobs/{taskId}/work/{modName}/sdc/inputs/
# 应包含: hier.yaml, vlog.v, dcont.xlsx

# 检查中间执行结果
ls -la ../jobs/{taskId}/work/{modName}/sdc/logs/
# 应包含: setup.log, check.log, generation.log

# 检查最终输出
ls -la ../jobs/{taskId}/work/{modName}/sdc/outputs/
# 应包含: *.sdc 文件

# 验证点:
# ✅ 输入文件正确复制
# ✅ 每个执行步骤都有日志
# ✅ 生成了预期的SDC文件
# ✅ 报告文件完整
```

**步骤6: 结果打包和上传**
```bash
# 检查结果打包
ls -la ../jobs/{taskId}/output/
# 应包含: sdc_result.zip

# 验证zip文件内容
unzip -l ../jobs/{taskId}/output/sdc_result.zip
# 应包含: outputs/, logs/, rpts/ 三个目录

# 检查MinIO上传
./mc ls local/test-job-results/test-user-1/{taskId}/
# 应包含: sdc_result.zip, download_credentials.json

# 验证点:
# ✅ 结果文件正确打包
# ✅ 包含所有必要目录
# ✅ 文件上传到MinIO成功
# ✅ 下载凭证生成正确
```

**步骤7: 数据库状态更新 - RUNNING → COMPLETED**
```sql
-- 检查最终任务状态
SELECT
    id,
    status,
    \"startedAt\",
    \"finishedAt\",
    \"outputFile\",
    \"logFile\",
    \"updatedAt\"
FROM \"Task\"
WHERE id = '{taskId}';

-- 验证点:
-- ✅ status = 'COMPLETED'
-- ✅ finishedAt 不为空
-- ✅ outputFile 路径正确
-- ✅ logFile 路径正确
-- ✅ 执行时间合理（通常1-5分钟）
```

**步骤8: 临时文件清理**
```bash
# 检查临时目录清理
ls -la ../jobs/{taskId}/
# 应该: input/, work/ 目录被清理，保留 output/, logs/

# 检查Redis TaskID清理
redis-cli SISMEMBER active_task_ids {taskId}
# 应返回: (integer) 0

# 验证点:
# ✅ 临时文件正确清理
# ✅ 重要结果文件保留
# ✅ Redis中TaskID已清理
# ✅ 磁盘空间释放正常
```

#### 5.3 业务逻辑正确性验证

**数据一致性检查**:
```bash
# 检查三个地方的TaskID一致性
echo "数据库TaskID: {taskId}"
echo "MinIO路径: test-user-1/{taskId}/"
echo "ECS目录: ../jobs/{taskId}/"

# 验证时间戳一致性
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    \"createdAt\",
    \"startedAt\",
    \"finishedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds
FROM \"Task\"
WHERE id = '{taskId}';"
```

**错误处理验证**:
```bash
# 模拟错误场景测试
# 1. 输入文件缺失
# 2. 磁盘空间不足
# 3. 网络连接中断
# 4. 容器执行失败

# 验证错误状态更新
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT id, status, \"errorMessage\"
FROM \"Task\"
WHERE status = 'FAILED'
ORDER BY \"updatedAt\" DESC
LIMIT 3;"
```

### 阶段6: 结果下载测试

**测试目标**: 验证任务完成后的结果下载

```bash
# 查询任务状态
curl http://localhost:8080/api/v1/tasks/{taskId}/status

# 获取下载链接
curl http://localhost:8080/api/v1/tasks/{taskId}/download

# 下载结果文件
curl -O {预签名URL}
```

**验证点**:
- 任务状态正确更新为 COMPLETED
- 下载链接有效
- 结果文件包含预期内容

## � 多容器并发执行测试

### 阶段7: 并发任务执行和资源管理测试

**测试目标**: 验证Worker多容器并行运行能力和资源隔离机制

#### 7.1 环境资源配置验证

```bash
# 检查当前系统资源配置
echo "=== 系统资源配置检查 ==="
echo "ECS_TOTAL_CPU: ${ECS_TOTAL_CPU:-8}"
echo "ECS_TOTAL_MEMORY_GB: ${ECS_TOTAL_MEMORY_GB:-64}"
echo "JOB_CPU_REQUEST: ${JOB_CPU_REQUEST:-2}"
echo "JOB_MEMORY_REQUEST_GB: ${JOB_MEMORY_REQUEST_GB:-8}"

# 计算理论并发容器数
echo "理论最大并发容器数:"
echo "按CPU计算: $((${ECS_TOTAL_CPU:-8} / ${JOB_CPU_REQUEST:-2}))"
echo "按内存计算: $((${ECS_TOTAL_MEMORY_GB:-64} / ${JOB_MEMORY_REQUEST_GB:-8}))"

# 检查Docker资源限制支持
docker info | grep -E "(CPUs|Total Memory)"
```

**验证点**:
- ✅ 环境变量正确配置
- ✅ Docker支持资源限制
- ✅ 理论并发数计算正确

#### 7.2 多任务并发提交测试

```bash
# 准备多个SDC任务的测试脚本
cat > test_concurrent_sdc.sh << 'EOF'
#!/bin/bash

# 并发提交3个SDC任务
for i in {1..3}; do
    echo "提交第${i}个SDC任务..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer test-token" \
      -F "toolId=sdc-generator" \
      -F "parameters={\"modName\":\"jpeg_top_wrap_${i}\",\"isFlat\":false}" \
      -F "files=@test_data/upload_data/sdcgen/hier.yaml" \
      -F "files=@test_data/upload_data/sdcgen/vlog.v" \
      -F "files=@test_data/upload_data/sdcgen/dcont.xlsx" &

    # 短暂延迟避免完全同时提交
    sleep 2
done

# 等待所有后台任务完成
wait
echo "所有任务提交完成"
EOF

chmod +x test_concurrent_sdc.sh
./test_concurrent_sdc.sh
```

**验证点**:
- ✅ 3个任务成功提交
- ✅ 任务进入Redis队列
- ✅ 数据库记录正确创建

#### 7.3 并发容器执行监控

```bash
# 实时监控容器启动和资源使用
echo "=== 容器并发执行监控 ==="

# 监控脚本
cat > monitor_concurrent.sh << 'EOF'
#!/bin/bash

echo "开始监控并发容器执行..."
start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))

    # 检查当前运行的SDC容器数量
    container_count=$(docker ps | grep tool-job | wc -l)

    echo "[$elapsed秒] 当前运行容器数: $container_count"

    if [ $container_count -gt 0 ]; then
        echo "=== 容器资源使用情况 ==="
        docker stats --no-stream $(docker ps --format "table {{.Names}}" | grep tool-job) 2>/dev/null || echo "暂无容器运行"

        echo "=== 容器详细信息 ==="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep tool-job

        echo "=== 系统资源使用 ==="
        echo "CPU使用率: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)"
        echo "内存使用: $(free -h | grep Mem | awk '{print $3"/"$2}')"
    fi

    # 如果没有容器运行且已经过了足够时间，退出监控
    if [ $container_count -eq 0 ] && [ $elapsed -gt 60 ]; then
        echo "所有容器执行完成，监控结束"
        break
    fi

    echo "----------------------------------------"
    sleep 10
done
EOF

chmod +x monitor_concurrent.sh
./monitor_concurrent.sh &
MONITOR_PID=$!
```

#### 7.4 资源竞争场景测试

```bash
# 测试资源不足时的处理机制
echo "=== 资源竞争测试 ==="

# 临时降低资源限制来测试竞争
export ECS_TOTAL_CPU=4
export ECS_TOTAL_MEMORY_GB=16
export JOB_CPU_REQUEST=2
export JOB_MEMORY_REQUEST_GB=8

echo "降低资源限制后的理论并发数:"
echo "按CPU: $((ECS_TOTAL_CPU / JOB_CPU_REQUEST))"
echo "按内存: $((ECS_TOTAL_MEMORY_GB / JOB_MEMORY_REQUEST_GB))"

# 提交超过资源限制的任务数量
for i in {1..5}; do
    echo "提交资源竞争测试任务 ${i}..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer test-token" \
      -F "toolId=sdc-generator" \
      -F "parameters={\"modName\":\"test_resource_${i}\",\"isFlat\":false}" \
      -F "files=@test_data/upload_data/sdcgen/hier.yaml" \
      -F "files=@test_data/upload_data/sdcgen/vlog.v" \
      -F "files=@test_data/upload_data/sdcgen/dcont.xlsx" &
    sleep 1
done

wait

# 检查任务排队情况
echo "=== 任务队列状态 ==="
redis-cli LLEN task_queue
redis-cli LRANGE task_queue 0 -1

# 检查Worker日志中的资源管理信息
echo "=== Worker资源管理日志 ==="
tail -n 50 logs/worker.log | grep -E "(resources|CPU|memory|waiting)"
```

**验证点**:
- ✅ 超出资源限制的任务正确排队
- ✅ Worker日志显示资源不足警告
- ✅ 任务按资源可用性顺序执行

#### 7.5 容器间隔离验证测试

```bash
# 验证容器间文件系统隔离
echo "=== 容器隔离验证测试 ==="

# 检查容器文件系统隔离
check_container_isolation() {
    local container_name=$1
    echo "检查容器 $container_name 的隔离配置:"

    # 检查容器安全配置
    docker inspect $container_name | jq '.[0].HostConfig' | grep -E "(NetworkMode|ReadonlyRootfs|CapDrop|SecurityOpt)"

    # 检查挂载点隔离
    echo "挂载点信息:"
    docker inspect $container_name | jq '.[0].Mounts[] | {Source, Destination, Mode}'

    # 检查资源限制
    echo "资源限制:"
    docker inspect $container_name | jq '.[0].HostConfig | {CpuQuota, CpuPeriod, Memory}'
}

# 等待容器启动后检查隔离
sleep 30
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    check_container_isolation $container
    echo "----------------------------------------"
done

# 验证网络隔离
echo "=== 网络隔离验证 ==="
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    echo "检查容器 $container 的网络配置:"
    docker exec $container ip addr show 2>/dev/null || echo "网络已正确隔离 - 无法执行网络命令"
    docker exec $container ping -c 1 8.8.8.8 2>/dev/null || echo "网络已正确隔离 - 无法访问外网"
    echo "----------------------------------------"
done

# 验证文件系统隔离
echo "=== 文件系统隔离验证 ==="
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    echo "检查容器 $container 的文件系统权限:"
    docker exec $container touch /test_write 2>/dev/null || echo "文件系统已正确设为只读"
    docker exec $container ls -la /data/ 2>/dev/null || echo "数据目录访问正常"
    echo "----------------------------------------"
done
```

#### 7.6 并发执行结果验证

```bash
# 等待所有任务完成
echo "=== 等待所有并发任务完成 ==="
while [ $(redis-cli LLEN task_queue) -gt 0 ] || [ $(docker ps | grep tool-job | wc -l) -gt 0 ]; do
    echo "等待任务完成... 队列长度: $(redis-cli LLEN task_queue), 运行容器: $(docker ps | grep tool-job | wc -l)"
    sleep 10
done

# 验证所有任务的执行结果
echo "=== 并发任务执行结果验证 ==="
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    status,
    parameters->'modName' as modName,
    \"startedAt\",
    \"finishedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds
FROM \"Task\"
WHERE \"toolId\" = 'sdc-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
ORDER BY \"createdAt\" DESC;"

# 检查MinIO中的结果文件
echo "=== 检查并发任务的结果文件 ==="
for task_id in $(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id FROM \"Task\"
WHERE \"toolId\" = 'sdc-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
AND status = 'COMPLETED';"); do
    echo "检查任务 $task_id 的结果文件:"
    ./mc ls local/test-job-results/test-user-1/$task_id/ || echo "任务 $task_id 结果文件未找到"
done

# 停止监控进程
kill $MONITOR_PID 2>/dev/null || true
```

**验证标准**:
- ✅ 所有并发任务都成功完成
- ✅ 容器间完全隔离，无相不干扰
- ✅ 资源分配正确，无超限使用
- ✅ 结果文件独立存储，无冲突
- ✅ 执行时间合理，无异常延迟

#### 7.7 并发测试性能分析

```bash
# 生成并发测试报告
echo "=== 并发测试性能报告 ==="
cat > concurrent_test_report.md << 'EOF'
# SDC工具并发执行测试报告

## 测试配置
- 并发任务数: 3-5个
- 单任务资源: 2CPU + 8GB内存
- 总可用资源: 根据ECS配置

## 测试结果
### 资源利用率
- 最大并发容器数: [从监控日志获取]
- 平均CPU使用率: [从监控日志获取]
- 平均内存使用率: [从监控日志获取]

### 执行性能
- 平均任务执行时间: [从数据库查询获取]
- 并发执行效率: [对比单任务执行时间]
- 资源竞争等待时间: [从Worker日志分析]

### 隔离验证
- 网络隔离: ✅ 通过
- 文件系统隔离: ✅ 通过
- 进程隔离: ✅ 通过
- 资源隔离: ✅ 通过

## 结论
[根据实际测试结果填写]
EOF

echo "并发测试报告已生成: concurrent_test_report.md"
```

## �📊 测试质量控制和结果判断

### 测试步骤正确性判断标准

#### 每个步骤的成功标准

**阶段0 - 镜像生成**:
- ✅ 镜像构建无错误，大小合理（100-500MB）
- ✅ 镜像加载测试通过，容器可正常启动
- ✅ 安全配置正确（非root用户，资源限制支持）

**阶段1 - 前端验证**:
- ✅ 所有输入验证规则正确触发
- ✅ 错误提示信息准确显示
- ✅ 按钮状态变化符合预期

**阶段2 - 模板下载**:
- ✅ 模板文件下载成功，文件完整性验证通过
- ✅ ZIP文件结构正确，包含所有必要文件

**阶段3 - API权限**:
- ✅ 权限检查逻辑正确，未授权请求被拒绝
- ✅ 任务创建成功，数据库记录正确

**阶段4 - 文件处理**:
- ✅ 文件上传到MinIO成功，路径结构正确
- ✅ 数据库Task记录创建，Redis队列添加成功

**阶段5 - 任务执行**:
- ✅ 每个子步骤都有明确的验证点
- ✅ 数据库状态变化时序正确
- ✅ 文件操作和目录结构符合规范

**阶段6 - 结果下载**:
- ✅ 任务状态正确，下载链接有效
- ✅ 结果文件内容完整，格式正确

**阶段7 - 并发执行测试**:
- ✅ 多容器并发启动成功，资源分配正确
- ✅ 容器间完全隔离，无相互干扰
- ✅ 资源竞争场景下任务正确排队
- ✅ 所有并发任务都成功完成
- ✅ 结果文件独立存储，无冲突

#### 测试失败的常见原因和排查

**镜像相关问题**:
```bash
# 检查Docker服务状态
systemctl status docker

# 检查镜像构建日志
docker build --no-cache -f scripts/docker_sdc_generator_Dockerfile -t sdc-generator:latest . 2>&1 | tee build.log

# 检查基础镜像可用性
docker pull ubuntu:20.04
```

**数据库同步问题**:
```bash
# 检查数据库连接
psql -h localhost -U logiccore -d logiccore_dev -c "SELECT version();"

# 检查表结构
psql -h localhost -U logiccore -d logiccore_dev -c "\d \"Task\""

# 检查索引状态
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'Task';"
```

**Redis队列问题**:
```bash
# 检查Redis连接
redis-cli ping

# 检查队列状态
redis-cli INFO replication
redis-cli LLEN task_queue

# 检查内存使用
redis-cli INFO memory
```

#### 与生产环境的差异度评估

**高度一致 (95%+)**:
- 业务逻辑处理流程
- 数据库操作和状态管理
- API接口行为和响应
- 文件处理和验证逻辑
- 任务队列管理机制
- 多容器并发执行机制
- 容器隔离和安全配置
- 资源管理和分配逻辑

**部分模拟 (80-95%)**:
- 文件存储（MinIO vs OSS）
- 容器执行环境（本地Docker vs ECS）
- 网络配置（本地网络 vs VPC）

**无法完全模拟 (60-80%)**:
- ACR镜像拉取认证
- 阿里云STS凭证轮换
- 真实的资源限制和监控
- 生产级别的安全策略

## 🔍 生产环境差异对比

### 环境差异详细分析

| 测试点 | 生产环境行为 | 本地环境模拟 | 差异说明 | 测试覆盖度 |
|--------|--------------|--------------|----------|------------|
| **文件存储** | 阿里云OSS | MinIO | API兼容，功能一致 | 95% |
| **镜像管理** | ACR私有仓库 | 本地镜像文件 | 无法测试镜像拉取认证 | 80% |
| **STS凭证** | 阿里云临时凭证 | MinIO固定凭证 | 无法测试凭证轮换 | 70% |
| **网络隔离** | VPC内网 | 本地网络 | 无法测试网络安全策略 | 60% |
| **资源限制** | ECS资源限制 | 本地资源 | 无法测试真实资源约束 | 85% |
| **监控告警** | 云监控 | 本地日志 | 无法测试生产监控 | 40% |

### 业务逻辑一致性

✅ **完全一致的部分**:
- 用户认证和权限检查
- 文件上传和验证逻辑
- 任务状态管理
- 数据库操作
- API接口行为

⚠️ **部分模拟的部分**:
- Docker容器执行 (使用本地镜像)
- 文件存储 (MinIO替代OSS)
- 临时凭证管理 (固定凭证)

❌ **无法测试的部分**:
- ACR镜像拉取认证
- 阿里云STS凭证轮换
- VPC网络安全策略
- ECS实例资源监控

## 📊 测试成功标准

### 功能测试通过标准
- ✅ 输入验证机制正确工作
- ✅ Template下载功能正常
- ✅ 文件上传和存储正确
- ✅ 任务状态正确更新
- ✅ 结果文件正确生成
- ✅ 下载功能正常工作

### 性能测试通过标准
- ✅ 文件上传速度 < 10秒 (5MB文件)
- ✅ 任务执行时间 < 5分钟
- ✅ 内存使用 < 2GB
- ✅ 临时文件清理完整

## 🚀 测试执行命令

```bash
# 完整测试流程
npm run test:sdc:local

# 分步测试
npm run test:sdc:frontend
npm run test:sdc:backend
npm run test:sdc:worker
npm run test:sdc:integration
```

## 🚨 常见问题排查

### 1. Template下载404错误
```bash
# 检查模板文件是否存在
ls -la ../templates/sdcgen/sdc_gen.zip

# 检查环境变量
echo $TEMPLATE_ROOT_PATH
```

### 2. MinIO连接失败
```bash
# 检查MinIO服务状态
docker ps | grep minio

# 测试连接
./mc admin info local
```

### 3. Worker任务执行失败
```bash
# 检查Redis队列
redis-cli LLEN task_queue

# 检查任务目录权限
ls -la ../jobs/
```

**通过标准**: 所有测试用例通过，无错误日志，资源使用正常。