# SDC工具本地测试指南

## 📋 测试环境对比

### 真实生产环境 vs 本地开发环境

| 组件 | 生产环境 | 本地开发环境 | 测试方案 |
|------|----------|--------------|----------|
| **前端** | React + Nginx | React Dev Server | ✅ 完全一致 |
| **后端API** | Node.js + Express | Node.js + Express | ✅ 完全一致 |
| **数据库** | PostgreSQL (云端) | PostgreSQL (本地) | ✅ 结构一致 |
| **Redis** | Redis (云端) | Redis (本地) | ✅ 功能一致 |
| **OSS存储** | 阿里云OSS | MinIO (本地) | ⚠️ 需要模拟 |
| **Docker** | ECS + ACR | 本地Docker | ⚠️ 需要本地镜像 |
| **Worker** | Python Worker | Python Worker | ✅ 逻辑一致 |

## 🛠️ 本地测试环境搭建

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
  -p 6379:6379 redis:7

# 3. 启动MinIO (模拟OSS)
docker run -d --name minio-test \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### 2. 环境变量配置

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

# 本地Docker配置
DOCKER_HOST=unix:///var/run/docker.sock
ACR_REGISTRY=localhost:5000
```

### 3. 数据库初始化

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

## 🧪 分阶段测试方案

### 阶段1: 前端UI和表单验证测试

**测试目标**: 验证新增的输入检查机制

```bash
# 启动前端
cd frontend
npm run dev

# 测试用例
1. 空ModName提交 → 应显示"ModName不能为空"
2. 特殊字符ModName → 应显示"只能包含字母、数字和下划线"
3. 缺少文件上传 → 应显示"请上传所有必需的文件"
4. 大文件上传 → 应显示"文件大小不能超过5MB"
5. 空文件上传 → 应显示"文件内容为空"
6. 格式错误文件 → 应显示具体格式错误信息
```

**预期结果**:
- 按钮状态: 初始蓝橙渐变 → 点击后灰色"Validating..." → 检查失败恢复蓝橙渐变
- 错误提示: 红色Toast显示具体错误信息
- 状态显示: 紫色"正在检查用户输入..."框出现并消失

### 阶段2: 后端API和权限测试

**测试目标**: 验证API接口和权限检查

```bash
# 启动后端
cd backend
npm run dev

# 测试用例
1. 未登录用户提交 → 重定向到登录页
2. 无订阅用户提交 → 显示订阅提示
3. 超出配额用户提交 → 显示配额限制
4. 正常用户提交 → 成功创建任务
```

**模拟测试数据**:
```sql
-- 创建测试用户
INSERT INTO User (id, email, emailVerified, subscriptionType) 
VALUES ('test-user-1', 'test@example.com', true, 'PROFESSIONAL');

-- 创建测试工具
INSERT INTO Tool (id, name, dockerImage, status) 
VALUES ('sdc-generator', 'SDC Generator', 'localhost:5000/sdc-generator:latest', 'ACTIVE');
```

### 阶段3: 文件处理和OSS模拟测试

**测试目标**: 验证文件上传和存储逻辑

```bash
# 创建MinIO buckets
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/test-user-input
mc mb local/test-job-results
mc mb local/test-job-logs

# 测试文件上传
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Authorization: Bearer test-token" \
  -F "toolId=sdc-generator" \
  -F "parameters={\"modName\":\"test_module\",\"isFlat\":false}" \
  -F "files=@test_hier.yaml" \
  -F "files=@test_vlog.v" \
  -F "files=@test_dcont.xlsx"
```

**验证点**:
- MinIO中文件路径: `test-user-1/task-id/inputs/hier.yaml`
- 数据库Task记录创建
- Redis队列中任务添加

### 阶段4: Docker容器执行模拟

**测试目标**: 验证SDC工具Docker执行逻辑

```bash
# 构建本地SDC镜像
cd scripts
docker build -f docker_sdc_generator_Dockerfile -t localhost:5000/sdc-generator:latest .

# 手动测试容器执行
docker run --rm \
  -v /tmp/test_sdc:/data \
  -e TASK_ID=test-task-123 \
  -e SDC_MOD_NAME=test_module \
  -e SDC_IS_FLAT=false \
  localhost:5000/sdc-generator:latest
```

**预期输出**:
- 容器正常启动和执行
- 生成outputs/logs/rpts三个目录
- 创建sdc_result.zip文件

### 阶段5: Worker完整流程测试

**测试目标**: 验证Python Worker的完整执行流程

```bash
# 启动Worker
cd backend/src/workers
python toolWorker.py

# 监控日志
tail -f worker.log
```

**测试流程**:
1. Worker从Redis获取任务
2. 从MinIO下载输入文件
3. 启动Docker容器执行
4. 上传结果到MinIO
5. 更新数据库状态
6. 清理临时文件

## 🔍 关键测试点对比

### 生产环境 vs 本地环境差异

| 测试点 | 生产环境行为 | 本地环境模拟 | 验证方法 |
|--------|--------------|--------------|----------|
| **文件上传** | 阿里云OSS | MinIO | 检查文件路径和内容 |
| **镜像拉取** | ACR私有仓库 | 本地镜像 | 检查容器启动成功 |
| **STS凭证** | 阿里云临时凭证 | MinIO固定凭证 | 检查OSS操作权限 |
| **网络隔离** | VPC内网 | 本地网络 | 检查服务间通信 |
| **资源限制** | ECS资源限制 | 本地资源 | 检查容器资源使用 |

### 业务逻辑一致性验证

```javascript
// 测试脚本: test/integration_test.js
const testCases = [
  {
    name: "完整SDC工具执行流程",
    steps: [
      "用户登录和权限验证",
      "文件上传和格式检查", 
      "任务提交和队列处理",
      "Docker容器执行",
      "结果文件生成和打包",
      "文件下载和清理"
    ],
    expectedResults: [
      "任务状态正确更新",
      "文件正确存储在OSS",
      "sdc_result.zip包含三个目录",
      "临时文件被正确清理"
    ]
  }
];
```

## 📊 测试数据准备

### 标准测试文件

```yaml
# test_files/hier.yaml
pwr:
  VDD_CORE: TT0P750V TT0P700V TT0P650V
  VDD_IO: TT3P300V TT3P000V TT2P700V

hier:
  test_module:
    hdlevel: top
    alias: TESTMOD
    prime_pwr: VDD_CORE
```

```verilog
// test_files/vlog.v
module test_module(
    input clk,
    input rst_n,
    input [31:0] data_in,
    output reg [31:0] data_out
);
    always @(posedge clk) begin
        if (!rst_n) data_out <= 0;
        else data_out <= data_in;
    end
endmodule
```

## 🎯 测试成功标准

### 功能测试通过标准
- ✅ 输入验证机制正确工作
- ✅ 按钮状态变化符合设计
- ✅ 文件上传和存储正确
- ✅ Docker容器正常执行
- ✅ 结果文件正确生成
- ✅ 下载功能正常工作

### 性能测试通过标准
- ✅ 文件上传速度 < 10秒 (5MB文件)
- ✅ 任务执行时间 < 5分钟
- ✅ 内存使用 < 2GB
- ✅ 临时文件清理完整

## 🚀 部署前最终验证

```bash
# 运行完整测试套件
npm run test:integration

# 检查所有服务状态
docker ps
curl http://localhost:8080/health
curl http://localhost:3000

# 验证数据一致性
psql -d logiccore_dev -c "SELECT * FROM Task WHERE status='COMPLETED';"
```

**通过标准**: 所有测试用例通过，无错误日志，资源使用正常。
