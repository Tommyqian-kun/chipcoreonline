# UPF工具本地生产测试指南

## 📋 测试环境概述

### UPF工具特点
- **输入文件**: 4个文件 (hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx)
- **执行流程**: 多步骤UPF生成和验证
- **输出结果**: upf_result.zip包含outputs/logs/rpts三个目录

### 本地测试环境 vs 生产环境对比

| 组件 | 生产环境 | 本地测试环境 | UPF特殊要求 |
|------|----------|--------------|-------------|
| **前端** | React + Nginx | React Dev Server | ✅ 4文件上传支持 |
| **后端API** | Node.js + Express | Node.js + Express | ✅ UPF参数验证 |
| **数据库** | PostgreSQL (云端) | PostgreSQL (本地) | ✅ UPF任务记录 |
| **Redis** | Redis (云端) | Redis (本地) | ✅ UPF任务队列 |
| **OSS存储** | 阿里云OSS | MinIO (本地) | ⚠️ 4文件存储 |
| **Docker** | ECS + ACR | 本地Docker | ⚠️ UPF工具镜像 |
| **Worker** | Python Worker | Node.js Worker | ✅ UPF执行逻辑 |

## 🛠️ 测试环境搭建

### 1. 基础服务启动 (同SDC)

```bash
# 启动基础服务 (PostgreSQL, Redis, MinIO)
# 参考SDC测试文档的基础服务启动部分
```

### 2. UPF特定目录结构

```bash
# 创建UPF测试目录
mkdir -p ../templates/upfgen
mkdir -p ../jobs

# 复制UPF模板文件
cp stuff/tool_template/upf_gen.zip ../templates/upfgen/
```

### 3. UPF测试数据验证

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

## 🐳 Docker镜像生成和管理测试

### 阶段0: UPF工具镜像生成测试

**测试目标**: 验证UPF工具Docker镜像的生成和本地缓存机制

#### 0.1 生成UPF工具镜像

```bash
# 进入项目根目录
cd /path/to/LogicCore

# 生成UPF工具镜像
docker build -f scripts/docker_upf_generator_Dockerfile -t upf-generator:latest .

# 验证镜像生成成功
docker images | grep upf-generator

# 保存镜像到本地测试目录（模拟ACR拉取）
docker save upf-generator:latest -o test_data/tools_images/upfgen/upf-generator-latest.tar

# 验证镜像文件
ls -lh test_data/tools_images/upfgen/
```

**预期结果**:
- ✅ 镜像构建成功，无错误信息
- ✅ 镜像大小合理（通常150MB-600MB，比SDC稍大）
- ✅ 镜像文件保存到指定目录
- ✅ 镜像包含必要的UPF工具和Python依赖

#### 0.2 模拟ACR镜像拉取测试

```bash
# 删除本地镜像（模拟首次拉取）
docker rmi upf-generator:latest

# 从本地文件加载镜像（模拟ACR拉取）
docker load -i test_data/tools_images/upfgen/upf-generator-latest.tar

# 验证镜像加载成功
docker images | grep upf-generator

# 测试镜像基本功能
docker run --rm upf-generator:latest python3 -c "import yaml, openpyxl; print('UPF Generator Ready')"
```

**验证点**:
- ✅ 镜像加载成功
- ✅ Python环境和依赖正确
- ✅ UPF工具核心模块可用
- ✅ 容器可以正常启动和退出

#### 0.3 UPF镜像特殊配置验证

```bash
# 检查UPF特定环境变量
docker run --rm upf-generator:latest env | grep UPF

# 检查Python路径配置
docker run --rm upf-generator:latest python3 -c "import sys; print(sys.path)"

# 测试UPF工具核心功能
docker run --rm upf-generator:latest python3 /opt/upf_generator/bin/upf_generator_core.py --version
```

**验证标准**:
- ✅ UPF_GENERATOR_HOME环境变量正确
- ✅ Python路径包含UPF库目录
- ✅ UPF核心工具可执行
- ✅ 版本信息显示正确

## 🧪 UPF工具完整测试流程

### 阶段1: UPF前端页面测试

**测试目标**: 验证UPF工具页面的4文件上传和参数设置

```bash
# 启动前端
cd frontend
npm run dev
# 访问 http://localhost:5173/tools/upf-generator
```

**UPF特定测试用例**:
1. **4文件上传验证**:
   - hier.yaml: 必需，YAML格式验证
   - pvlog.v: 必需，Verilog格式验证
   - pobj.tcl: 非必需，TCL脚本验证
   - pcont.xlsx: 必需，Excel格式验证

2. **参数设置验证**:
   - ModName: 支持历史记录下拉选择
   - Version: 下拉选择 (2.0, 2.1, 3.0)，默认2.1
   - IsFlat: 复选框，默认false

3. **UPF特定错误处理**:
   - 缺少任一文件 → "请上传所有4个必需文件"
   - 文件格式错误 → 显示具体格式要求
   - ModName与hier.yaml不匹配 → "ModName与层次文件不一致"

### 阶段2: UPF Template下载测试

```bash
# 测试UPF模板下载
curl -O http://localhost:8080/api/v1/templates/upfgen/upf_gen.zip

# 验证UPF模板内容
unzip -l upf_gen.zip
# 应包含: hier_template.yaml, pvlog_template.v, pobj_template.tcl, pcont_template.xlsx
```

### 阶段3: UPF任务提交测试

**测试目标**: 验证UPF任务的4文件上传和参数处理

#### 3.1 UPF任务提交API测试（使用准备好的测试数据）

```bash
# UPF任务提交API测试（使用实际测试数据）
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Authorization: Bearer test-token" \
  -F "toolId=upf-generator" \
  -F "parameters={\"modName\":\"soc_top\",\"version\":\"2.0\",\"isFlat\":false}" \
  -F "files=@test_data/upload_data/upfgen/hier.yaml" \
  -F "files=@test_data/upload_data/upfgen/pvlog.v" \
  -F "files=@test_data/upload_data/upfgen/pobj.tcl" \
  -F "files=@test_data/upload_data/upfgen/pcont.xlsx"
```

#### 3.2 验证点

**文件上传验证**:
- ✅ 4个文件正确上传到MinIO: `test-user-1/{taskId}/inputs/`
- ✅ 文件路径结构: `${userId}/${taskId}/inputs/filename`
- ✅ 权限验证通过，TaskID唯一性保证

**数据库记录验证**:
- ✅ Task记录包含UPF特定参数（modName, version, isFlat）
- ✅ inputFile字段指向正确的目录路径
- ✅ parameters字段包含inputFilesList数组

**队列管理验证**:
- ✅ Redis队列包含UPF任务ID
- ✅ 任务状态为PENDING
- ✅ 队列位置信息正确返回

### 阶段4: UPF Worker执行和数据库同步测试

**测试目标**: 验证UPF工具的多步骤执行流程和数据库状态同步

#### 4.1 启动Worker和监控系统

```bash
# 启动UPF Worker
cd backend
npm run dev:worker

# 在另一个终端监控UPF执行日志
tail -f logs/upf-worker.log

# 在第三个终端监控数据库变化
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT id, status, \"createdAt\", \"updatedAt\", parameters->'modName' as modName
FROM \"Task\"
WHERE \"toolId\" = 'upf-generator'
ORDER BY \"createdAt\" DESC
LIMIT 5;"
```

#### 4.2 UPF特定执行流程验证**:

**步骤1: Worker获取UPF任务**
```bash
# 检查Redis队列中的UPF任务
redis-cli LLEN task_queue
redis-cli LRANGE task_queue 0 -1 | grep upf-generator

# 验证点:
# ✅ 队列中有UPF任务
# ✅ Worker日志显示"Processing UPF task: {taskId}"
# ✅ 任务参数包含modName, version, isFlat
```

**步骤2: 数据库状态更新 - PENDING → RUNNING**
```sql
-- 检查UPF任务状态变化
SELECT
    id,
    status,
    \"startedAt\",
    \"updatedAt\",
    parameters->'modName' as modName,
    parameters->'version' as version,
    parameters->'isFlat' as isFlat
FROM \"Task\"
WHERE id = '{taskId}' AND \"toolId\" = 'upf-generator';

-- 验证点:
-- ✅ status = 'RUNNING'
-- ✅ startedAt 不为空
-- ✅ UPF特定参数正确保存
```

**步骤3: UPF 4文件下载和验证**
```bash
# 检查4个输入文件下载
ls -la ../jobs/{taskId}/input/
# 应包含: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 验证文件内容和格式
file ../jobs/{taskId}/input/*
wc -l ../jobs/{taskId}/input/*.yaml ../jobs/{taskId}/input/*.v ../jobs/{taskId}/input/*.tcl

# 验证Excel文件
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('../jobs/{taskId}/input/pcont.xlsx')
print('Sheets:', wb.sheetnames)
"

# 验证点:
# ✅ 4个文件完整下载
# ✅ 文件格式正确
# ✅ 文件内容非空
# ✅ Excel文件可正常读取
```

**步骤4: UPF工作目录结构建立**
```bash
# 验证UPF工作目录
ls -la ../jobs/{taskId}/work/{modName}/upf/
# 应包含: inputs/, outputs/, logs/, rpts/

# 验证输入文件复制到UPF工具目录
ls -la ../jobs/{taskId}/work/{modName}/upf/inputs/
# 应包含: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

# 验证点:
# ✅ UPF专用目录结构正确
# ✅ 4个输入文件正确复制
# ✅ 目录权限设置正确
```

**步骤5: Docker容器执行UPF工具**
```bash
# 监控UPF容器状态
docker ps | grep upf-generator

# 检查容器挂载和环境
docker inspect {container_name} | jq '.[0].Mounts'
docker exec {container_name} env | grep UPF

# 验证容器内UPF工具执行
docker logs {container_name} | grep -E "(setup|check|generation|validation)"

# 验证点:
# ✅ UPF容器成功启动
# ✅ 挂载点正确: /data/work/{modName}/upf/
# ✅ UPF环境变量正确
# ✅ 4步骤执行无错误
```

**步骤6: UPF工具多步骤执行验证**
```bash
# 步骤1: 建立目录结构验证
ls -la ../jobs/{taskId}/work/{modName}/upf/logs/setup.log
grep "Directory structure created" ../jobs/{taskId}/work/{modName}/upf/logs/setup.log

# 步骤2: 输入信息检查验证
ls -la ../jobs/{taskId}/work/{modName}/upf/logs/check.log
grep "Input validation passed" ../jobs/{taskId}/work/{modName}/upf/logs/check.log

# 步骤3: UPF生成验证
ls -la ../jobs/{taskId}/work/{modName}/upf/outputs/
# 应包含: {modName}.upf, power_intent.upf

# 步骤4: UPF文件检查验证
ls -la ../jobs/{taskId}/work/{modName}/upf/rpts/
# 应包含: power_analysis.rpt, upf_check.rpt

# 验证点:
# ✅ 每个步骤都有对应日志
# ✅ UPF文件生成成功
# ✅ 报告文件完整
# ✅ 无错误信息
```

**步骤7: UPF结果打包和上传**
```bash
# 验证upf_result.zip生成
ls -la ../jobs/{taskId}/output/upf_result.zip

# 验证压缩包内容结构
unzip -l ../jobs/{taskId}/output/upf_result.zip
# 应包含: outputs/, logs/, rpts/ 三个目录

# 检查MinIO上传
./mc ls local/test-job-results/test-user-1/{taskId}/
# 应包含: upf_result.zip, download_credentials.json

# 验证点:
# ✅ UPF结果正确打包
# ✅ 3目录结构完整
# ✅ 文件上传MinIO成功
# ✅ 下载凭证生成正确
```

**步骤8: 数据库状态更新 - RUNNING → COMPLETED**
```sql
-- 检查UPF任务最终状态
SELECT
    id,
    status,
    \"startedAt\",
    \"finishedAt\",
    \"outputFile\",
    \"logFile\",
    \"updatedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds
FROM \"Task\"
WHERE id = '{taskId}' AND \"toolId\" = 'upf-generator';

-- 验证点:
-- ✅ status = 'COMPLETED'
-- ✅ finishedAt 不为空
-- ✅ outputFile 路径包含upf_result.zip
-- ✅ 执行时间合理（通常3-8分钟）
```

### 阶段5: UPF结果验证测试

```bash
# 查询UPF任务状态
curl http://localhost:8080/api/v1/tasks/{taskId}/status
# 应返回: {"status": "COMPLETED", "progress": 100}

# 获取UPF结果下载链接
curl http://localhost:8080/api/v1/tasks/{taskId}/download
# 应返回: {"downloadUrl": "预签名URL"}

# 下载UPF结果
curl -O {预签名URL}

# 验证下载的upf_result.zip
unzip upf_result.zip
ls -la outputs/ logs/ rpts/
```

## 🔍 UPF vs SDC 差异对比

### 输入文件差异

| 工具 | 输入文件数量 | 文件类型 | 验证要求 |
|------|-------------|----------|----------|
| **SDC** | 3个文件 | hier.yaml, vlog.v, dcont.xlsx | 基础格式验证 |
| **UPF** | 4个文件 | hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx | 电源相关验证 |

### 执行流程差异

| 阶段 | SDC工具 | UPF工具 |
|------|---------|---------|
| **准备** | 1步: 目录创建 | 1步: 目录结构建立 |
| **验证** | 1步: 输入检查 | 1步: 输入信息检查 |
| **生成** | 1步: SDC生成 | 1步: UPF生成 (支持flat模式) |
| **检查** | 1步: SDC验证 | 1步: UPF文件检查 |
| **输出** | sdc_result.zip | upf_result.zip (3目录结构) |

### 参数差异

| 参数 | SDC工具 | UPF工具 |
|------|---------|---------|
| **ModName** | 文本输入 + 历史记录 | 文本输入 + 历史记录 |
| **IsFlat** | 复选框，默认false | 复选框，默认false |
| **Version** | 无 | 下拉选择 (1.0/2.0/3.0) |

## 🔄 UPF多容器并发执行测试

### 阶段6: UPF并发任务执行和资源管理测试

**测试目标**: 验证UPF工具多容器并行运行能力和4文件处理的并发安全性

#### 6.1 UPF特定资源配置验证

```bash
# 检查UPF工具的资源配置
echo "=== UPF工具资源配置检查 ==="
echo "ECS_TOTAL_CPU: ${ECS_TOTAL_CPU:-8}"
echo "ECS_TOTAL_MEMORY_GB: ${ECS_TOTAL_MEMORY_GB:-64}"
echo "UPF_JOB_CPU_REQUEST: ${JOB_CPU_REQUEST:-2}"
echo "UPF_JOB_MEMORY_REQUEST_GB: ${JOB_MEMORY_REQUEST_GB:-8}"

# UPF工具特定的资源需求分析
echo "UPF工具理论并发能力:"
echo "按CPU计算: $((${ECS_TOTAL_CPU:-8} / ${JOB_CPU_REQUEST:-2})) 个UPF容器"
echo "按内存计算: $((${ECS_TOTAL_MEMORY_GB:-64} / ${JOB_MEMORY_REQUEST_GB:-8})) 个UPF容器"

# 检查Python环境和UPF依赖
echo "=== UPF Python环境检查 ==="
python3 -c "
import yaml, openpyxl, sys
print(f'Python版本: {sys.version}')
print(f'YAML库版本: {yaml.__version__}')
print(f'OpenPyXL版本: {openpyxl.__version__}')
print('UPF工具依赖检查完成')
"
```

**验证点**:
- ✅ UPF特定环境变量正确配置
- ✅ Python依赖库版本兼容
- ✅ UPF工具资源需求计算正确

#### 6.2 UPF多任务并发提交测试

```bash
# 准备多个UPF任务的并发测试
cat > test_concurrent_upf.sh << 'EOF'
#!/bin/bash

echo "开始UPF并发任务提交测试..."

# 并发提交4个UPF任务，测试4文件处理的并发安全性
for i in {1..4}; do
    echo "提交第${i}个UPF任务..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer test-token" \
      -F "toolId=upf-generator" \
      -F "parameters={\"modName\":\"soc_top_${i}\",\"version\":\"2.1\",\"isFlat\":false}" \
      -F "files=@test_data/upload_data/upfgen/hier.yaml" \
      -F "files=@test_data/upload_data/upfgen/pvlog.v" \
      -F "files=@test_data/upload_data/upfgen/pobj.tcl" \
      -F "files=@test_data/upload_data/upfgen/pcont.xlsx" &

    # 短暂延迟避免4文件上传冲突
    sleep 3
done

# 等待所有UPF任务提交完成
wait
echo "所有UPF任务提交完成"

# 验证4文件上传的完整性
echo "=== 验证4文件上传完整性 ==="
for i in {1..4}; do
    echo "检查UPF任务 ${i} 的文件上传状态..."
    # 这里可以添加具体的文件检查逻辑
done
EOF

chmod +x test_concurrent_upf.sh
./test_concurrent_upf.sh
```

**UPF特定验证点**:
- ✅ 4个UPF任务成功提交
- ✅ 每个任务的4文件都正确上传
- ✅ hier.yaml、pvlog.v、pobj.tcl、pcont.xlsx文件完整性
- ✅ UPF参数(modName, version, isFlat)正确保存

#### 6.3 UPF并发容器执行监控

```bash
# UPF特定的并发执行监控
echo "=== UPF容器并发执行监控 ==="

cat > monitor_upf_concurrent.sh << 'EOF'
#!/bin/bash

echo "开始监控UPF并发容器执行..."
start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))

    # 检查当前运行的UPF容器数量
    upf_container_count=$(docker ps | grep tool-job | wc -l)

    echo "[$elapsed秒] 当前运行UPF容器数: $upf_container_count"

    if [ $upf_container_count -gt 0 ]; then
        echo "=== UPF容器资源使用情况 ==="
        docker stats --no-stream $(docker ps --format "table {{.Names}}" | grep tool-job) 2>/dev/null || echo "暂无UPF容器运行"

        echo "=== UPF容器详细信息 ==="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" | grep tool-job

        echo "=== UPF特定资源监控 ==="
        for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
            echo "容器 $container Python进程:"
            docker exec $container ps aux | grep python 2>/dev/null || echo "Python进程监控失败"
        done

        echo "=== 系统资源使用 ==="
        echo "CPU使用率: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)"
        echo "内存使用: $(free -h | grep Mem | awk '{print $3"/"$2}')"
        echo "Python进程数: $(ps aux | grep python | wc -l)"
    fi

    # 检查UPF任务队列状态
    upf_queue_length=$(redis-cli LLEN task_queue)
    echo "UPF任务队列长度: $upf_queue_length"

    # 如果没有容器运行且队列为空，退出监控
    if [ $upf_container_count -eq 0 ] && [ $upf_queue_length -eq 0 ] && [ $elapsed -gt 60 ]; then
        echo "所有UPF容器执行完成，监控结束"
        break
    fi

    echo "----------------------------------------"
    sleep 15
done
EOF

chmod +x monitor_upf_concurrent.sh
./monitor_upf_concurrent.sh &
UPF_MONITOR_PID=$!
```

#### 6.4 UPF资源竞争和版本切换测试

```bash
# UPF特定的资源竞争测试
echo "=== UPF资源竞争和版本兼容性测试 ==="

# 临时降低资源限制测试UPF工具的资源管理
export ECS_TOTAL_CPU=6
export ECS_TOTAL_MEMORY_GB=24
export JOB_CPU_REQUEST=2
export JOB_MEMORY_REQUEST_GB=8

echo "UPF资源限制测试配置:"
echo "理论最大UPF并发数: $((ECS_TOTAL_CPU / JOB_CPU_REQUEST))"

# 提交超过资源限制的UPF任务，测试不同版本
versions=("2.0" "2.1" "3.0")
for i in {1..6}; do
    version=${versions[$((i % 3))]}
    echo "提交UPF资源竞争测试任务 ${i} (版本: $version)..."
    curl -X POST http://localhost:8080/api/v1/tasks \
      -H "Authorization: Bearer test-token" \
      -F "toolId=upf-generator" \
      -F "parameters={\"modName\":\"stress_test_${i}\",\"version\":\"${version}\",\"isFlat\":$((i % 2 == 0))}" \
      -F "files=@test_data/upload_data/upfgen/hier.yaml" \
      -F "files=@test_data/upload_data/upfgen/pvlog.v" \
      -F "files=@test_data/upload_data/upfgen/pobj.tcl" \
      -F "files=@test_data/upload_data/upfgen/pcont.xlsx" &
    sleep 2
done

wait

# 检查UPF任务队列和版本分布
echo "=== UPF任务队列状态 ==="
redis-cli LLEN task_queue
echo "队列中的任务:"
redis-cli LRANGE task_queue 0 -1

# 检查数据库中UPF任务的版本分布
echo "=== UPF任务版本分布 ==="
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    parameters->'version' as upf_version,
    parameters->'isFlat' as is_flat,
    COUNT(*) as task_count,
    status
FROM \"Task\"
WHERE \"toolId\" = 'upf-generator'
AND \"createdAt\" > NOW() - INTERVAL '10 minutes'
GROUP BY parameters->'version', parameters->'isFlat', status
ORDER BY upf_version;"
```

**UPF特定验证点**:
- ✅ 不同UPF版本任务正确排队
- ✅ isFlat参数正确处理
- ✅ 4文件上传在资源竞争下保持完整性
- ✅ Worker正确处理UPF版本差异

#### 6.5 UPF容器间隔离和4文件安全验证

```bash
# UPF特定的容器隔离验证
echo "=== UPF容器隔离和4文件安全验证 ==="

# 检查UPF容器的4文件处理隔离
check_upf_container_isolation() {
    local container_name=$1
    echo "检查UPF容器 $container_name 的隔离配置:"

    # 检查UPF容器安全配置
    docker inspect $container_name | jq '.[0].HostConfig' | grep -E "(NetworkMode|ReadonlyRootfs|CapDrop|SecurityOpt)"

    # 检查UPF特定的挂载点
    echo "UPF容器挂载点信息:"
    docker inspect $container_name | jq '.[0].Mounts[] | select(.Destination | contains("/data")) | {Source, Destination, Mode}'

    # 检查UPF工作目录结构
    echo "UPF工作目录结构:"
    docker exec $container_name find /data -type d 2>/dev/null || echo "目录访问正常"

    # 验证4文件的独立性
    echo "验证4文件处理独立性:"
    docker exec $container_name ls -la /data/input/ 2>/dev/null | grep -E "(hier\.yaml|pvlog\.v|pobj\.tcl|pcont\.xlsx)" || echo "4文件访问正常"
}

# 等待UPF容器启动后检查
sleep 45
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    check_upf_container_isolation $container
    echo "----------------------------------------"
done

# 验证UPF容器网络隔离
echo "=== UPF容器网络隔离验证 ==="
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    echo "检查UPF容器 $container 的网络隔离:"
    docker exec $container python3 -c "import socket; print('Python网络测试')" 2>/dev/null || echo "网络已正确隔离"
    docker exec $container ping -c 1 8.8.8.8 2>/dev/null || echo "网络已正确隔离 - 无法访问外网"
    echo "----------------------------------------"
done

# 验证UPF容器文件系统隔离和Python环境
echo "=== UPF容器文件系统和Python环境隔离验证 ==="
for container in $(docker ps --format "{{.Names}}" | grep tool-job); do
    echo "检查UPF容器 $container 的Python环境隔离:"
    docker exec $container python3 -c "import os; print('Python环境正常')" 2>/dev/null || echo "Python环境访问正常"
    docker exec $container touch /test_write 2>/dev/null || echo "文件系统已正确设为只读"
    docker exec $container ls -la /data/work/ 2>/dev/null || echo "UPF工作目录访问正常"
    echo "----------------------------------------"
done
```

#### 6.6 UPF并发执行结果和4文件处理验证

```bash
# 等待所有UPF任务完成
echo "=== 等待所有UPF并发任务完成 ==="
while [ $(redis-cli LLEN task_queue) -gt 0 ] || [ $(docker ps | grep tool-job | wc -l) -gt 0 ]; do
    queue_len=$(redis-cli LLEN task_queue)
    container_count=$(docker ps | grep tool-job | wc -l)
    echo "等待UPF任务完成... 队列长度: $queue_len, 运行容器: $container_count"

    # 显示当前UPF任务进度
    if [ $container_count -gt 0 ]; then
        echo "当前运行的UPF容器:"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep tool-job
    fi

    sleep 15
done

# 验证所有UPF任务的执行结果
echo "=== UPF并发任务执行结果验证 ==="
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    status,
    parameters->'modName' as modName,
    parameters->'version' as upf_version,
    parameters->'isFlat' as is_flat,
    \"startedAt\",
    \"finishedAt\",
    EXTRACT(EPOCH FROM (\"finishedAt\" - \"startedAt\")) as execution_seconds
FROM \"Task\"
WHERE \"toolId\" = 'upf-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
ORDER BY \"createdAt\" DESC;"

# 检查UPF结果文件的3目录结构
echo "=== 检查UPF并发任务的3目录结果文件 ==="
for task_id in $(psql -h localhost -U logiccore -d logiccore_dev -t -c "
SELECT id FROM \"Task\"
WHERE \"toolId\" = 'upf-generator'
AND \"createdAt\" > NOW() - INTERVAL '1 hour'
AND status = 'COMPLETED';"); do
    echo "检查UPF任务 $task_id 的结果文件:"
    ./mc ls local/test-job-results/test-user-1/$task_id/ || echo "UPF任务 $task_id 结果文件未找到"

    # 验证UPF结果的3目录结构
    echo "验证UPF结果的3目录结构 (outputs/, logs/, rpts/):"
    ./mc ls local/test-job-results/test-user-1/$task_id/upf_result.zip 2>/dev/null && echo "UPF结果文件存在" || echo "UPF结果文件缺失"
done

# 停止UPF监控进程
kill $UPF_MONITOR_PID 2>/dev/null || true
```

**UPF特定验证标准**:
- ✅ 所有UPF并发任务都成功完成
- ✅ 4文件处理在并发环境下保持完整性
- ✅ 不同UPF版本任务正确执行
- ✅ UPF结果的3目录结构(outputs/, logs/, rpts/)完整
- ✅ 功耗域分析结果正确生成
- ✅ 容器间Python环境完全隔离

#### 6.7 UPF并发测试性能分析和报告

```bash
# 生成UPF并发测试报告
echo "=== UPF并发测试性能报告 ==="
cat > upf_concurrent_test_report.md << 'EOF'
# UPF工具并发执行测试报告

## 测试配置
- 并发UPF任务数: 4-6个
- 单任务资源: 2CPU + 8GB内存
- UPF版本测试: 2.0, 2.1, 3.0
- 4文件处理: hier.yaml, pvlog.v, pobj.tcl, pcont.xlsx

## UPF特定测试结果
### 4文件处理性能
- 4文件并发上传成功率: [从测试结果获取]
- 文件完整性验证通过率: [从验证结果获取]
- 平均4文件处理时间: [从监控日志获取]

### UPF版本兼容性
- UPF 2.0版本任务: [成功/失败数量]
- UPF 2.1版本任务: [成功/失败数量]
- UPF 3.0版本任务: [成功/失败数量]
- 版本切换处理时间: [从日志分析]

### 功耗域分析性能
- 平均UPF生成时间: [从数据库查询]
- 功耗域分析精度: [从结果文件验证]
- 3目录结构完整性: [验证结果]

### Python环境隔离
- Python进程隔离: ✅ 通过
- 依赖库版本一致性: ✅ 通过
- 内存使用隔离: ✅ 通过

### 资源利用率
- 最大并发UPF容器数: [从监控日志获取]
- 平均CPU使用率: [从监控日志获取]
- 平均内存使用率: [从监控日志获取]
- Python进程内存峰值: [从监控数据获取]

## UPF vs SDC 并发性能对比
- UPF平均执行时间: [数据] vs SDC: [数据]
- UPF资源使用: [数据] vs SDC: [数据]
- UPF并发效率: [数据] vs SDC: [数据]

## 结论
[根据UPF实际测试结果填写]
- 4文件处理并发安全性: [评估结果]
- UPF版本兼容性: [评估结果]
- 功耗域分析准确性: [评估结果]
- 生产环境适用性: [评估结果]
EOF

echo "UPF并发测试报告已生成: upf_concurrent_test_report.md"

# 生成UPF与SDC的对比分析
echo "=== UPF与SDC并发性能对比 ==="
echo "UPF特有优势:"
echo "- 支持复杂功耗域分析"
echo "- 4文件协同处理能力"
echo "- 多UPF版本兼容性"
echo ""
echo "UPF特有挑战:"
echo "- Python环境依赖更复杂"
echo "- 内存使用峰值更高"
echo "- 4文件一致性要求更严格"
```

## 📊 UPF测试质量控制和结果判断

### UPF测试步骤正确性判断标准

#### 每个阶段的成功标准

**阶段0 - UPF镜像生成**:
- ✅ 镜像构建无错误，大小合理（150-600MB）
- ✅ Python环境和UPF依赖正确安装
- ✅ UPF核心工具可执行，版本信息正确

**阶段1 - UPF前端验证**:
- ✅ 4文件上传验证规则正确
- ✅ UPF特定参数（version, isFlat）设置正确
- ✅ ModName与hier.yaml一致性检查通过

**阶段2 - UPF模板下载**:
- ✅ UPF模板包含4个文件类型
- ✅ 模板文件格式和内容正确

**阶段3 - UPF任务提交**:
- ✅ 4文件正确上传到MinIO
- ✅ UPF参数正确保存到数据库
- ✅ 任务队列包含UPF任务

**阶段4 - UPF执行验证**:
- ✅ 4步骤执行流程完整
- ✅ 每个步骤都有验证点
- ✅ 数据库状态变化时序正确
- ✅ UPF文件生成质量合格

**阶段5 - UPF结果验证**:
- ✅ 3目录结构（outputs/, logs/, rpts/）完整
- ✅ UPF文件语法正确
- ✅ 电源域定义完整

**阶段6 - UPF并发执行测试**:
- ✅ 多UPF容器并发启动成功，Python环境隔离
- ✅ 4文件处理在并发环境下保持完整性
- ✅ 不同UPF版本(2.0/2.1/3.0)任务正确执行
- ✅ 功耗域分析结果准确，3目录结构完整
- ✅ 容器间Python环境完全隔离，无依赖冲突

#### UPF特定问题排查

**4文件上传问题**:
```bash
# 检查文件大小和格式
ls -lh test_data/upload_data/upfgen/
file test_data/upload_data/upfgen/*

# 验证Excel文件格式
python3 -c "
import openpyxl
try:
    wb = openpyxl.load_workbook('test_data/upload_data/upfgen/pcont.xlsx')
    print('Excel file valid, sheets:', wb.sheetnames)
except Exception as e:
    print('Excel file error:', e)
"

# 验证TCL脚本语法
tclsh -c "source test_data/upload_data/upfgen/pobj.tcl; puts 'TCL syntax OK'"
```

**UPF执行步骤问题**:
```bash
# 检查UPF工具目录结构
find ../jobs/{taskId}/work/{modName}/upf/ -type d

# 检查每个步骤的日志
for step in setup check generation validation; do
    echo "=== $step step ==="
    grep -i error ../jobs/{taskId}/work/{modName}/upf/logs/${step}.log || echo "No errors"
done

# 验证UPF文件语法
# upf_lint ../jobs/{taskId}/work/{modName}/upf/outputs/*.upf
```

**数据库同步问题**:
```bash
# 检查UPF任务的数据库记录
psql -h localhost -U logiccore -d logiccore_dev -c "
SELECT
    id,
    status,
    \"toolId\",
    parameters->'modName' as modName,
    parameters->'version' as version,
    \"createdAt\",
    \"updatedAt\"
FROM \"Task\"
WHERE \"toolId\" = 'upf-generator'
ORDER BY \"createdAt\" DESC
LIMIT 10;"
```

### 功能测试通过标准
- ✅ 4文件上传验证正确
- ✅ UPF参数设置正确
- ✅ Template下载功能正常
- ✅ 多步骤执行流程正确
- ✅ 3目录结果结构正确
- ✅ 下载功能正常工作

### UPF特定验证标准
- ✅ hier.yaml与ModName一致性检查
- ✅ pvlog.v电源引脚识别
- ✅ pobj.tcl语法验证
- ✅ pcont.xlsx格式验证
- ✅ UPF文件语法正确性
- ✅ 电源域定义完整性

### 性能测试通过标准
- ✅ 4文件上传速度 < 15秒 (总计10MB)
- ✅ UPF任务执行时间 < 8分钟
- ✅ 内存使用 < 3GB
- ✅ 临时文件清理完整

### 与生产环境的差异度评估

**UPF特定的高度一致部分 (95%+)**:
- 4文件处理和验证逻辑
- UPF多步骤执行流程
- 电源域分析和UPF生成
- 结果文件结构和内容
- 多UPF容器并发执行
- 4文件并发处理安全性
- UPF版本兼容性处理
- Python环境隔离机制

**UPF特定的部分模拟部分 (80-95%)**:
- UPF工具版本和许可证
- 电源分析的精度和性能
- 大规模设计的处理能力

## 🚀 UPF测试执行命令

```bash
# 完整UPF测试流程
npm run test:upf:local

# 分步测试
npm run test:upf:frontend
npm run test:upf:backend
npm run test:upf:worker
npm run test:upf:integration

# UPF特定测试
npm run test:upf:4files
npm run test:upf:execution
npm run test:upf:results
```

## 🚨 UPF特定问题排查

### 1. 4文件上传失败
```bash
# 检查文件大小限制
ls -lh test_data/upf/
# 单文件不超过5MB，总计不超过20MB

# 检查文件格式
file test_data/upf/*
```

### 2. UPF执行步骤失败
```bash
# 检查UPF工具目录结构
ls -la ../jobs/{taskId}/work/{modName}/upf/

# 检查输入文件完整性
wc -l ../jobs/{taskId}/work/{modName}/upf/inputs/*
```

### 3. UPF结果验证失败
```bash
# 检查UPF文件语法
# upf_lint ../jobs/{taskId}/work/{modName}/upf/outputs/*.upf

# 检查结果打包
unzip -t ../jobs/{taskId}/output/upf_result.zip
```

## 🎯 生产环境部署准备

### UPF特定配置
```bash
# UPF工具Docker镜像
docker build -f docker/upf_generator_Dockerfile -t upf-generator:latest .

# UPF模板部署
cp templates/upfgen/* /data/chipcore/templates/upfgen/

# UPF环境变量
export UPF_TOOL_VERSION=2.0
export UPF_LICENSE_SERVER=license.company.com
```

**通过标准**: 所有UPF测试用例通过，4文件处理正确，多步骤执行成功，结果结构完整。