LogicCore Worker 工作流程详解
根据代码分析，LogicCore 项目采用了多进程 + 异步的 Worker 架构来处理工具任务。以下是详细的工作流程：

🏗️ 整体架构
┌───────────────────────────────────────────────────────────────────────┐
│                           WorkerManager                               │
│                    (管理多个 Worker 进程)                              │
├───────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
│  │Worker-0 │  │Worker-1 │  │Worker-2 │  │Worker-3 │  ...              │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                   │
│       │            │            │            │                        │
│       └────────────┴────────────┴────────────┘                        │
│                           ↓                                           │
│              ┌───────────────────────────┐                            │
│              │   SharedResourceManager   │ (Redis原子操作管理资源)     │
│              └───────────────────────────┘                            │
└───────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        Redis 任务队列                                 │
│  • task_queue (任务队列)                                              │
│  • active_task_ids (活跃任务集合)                                      │
│  • worker:resources (资源使用状态)                                     │
└──────────────────────────────────────────────────────────────────────┘
📁 核心文件
文件	职责

worker_manager.py
管理多个 Worker 进程的启动、监控和资源分配

worker_process.py
独立 Worker 进程入口

toolWorker.py
核心任务处理逻辑，包含容器执行

container_manager.py
Docker 容器生命周期管理
🔄 详细工作流程
阶段 1：WorkerManager 启动
# worker_manager.py
class WorkerManager:
    def __init__(self):
        self.worker_count = int(os.getenv('WORKER_COUNT', 4))  # 默认4个Worker
        self.resource_manager = IndependentResourceManager()   # 共享资源管理
        self.queue_cleaner = QueueTimeoutCleaner(...)         # 队列超时清理
WorkerManager 在启动时会：

初始化 共享资源管理器 (

IndependentResourceManager
)
启动 队列超时清理器 (每分钟检查过期任务)
作为独立子进程启动多个 Worker
阶段 2：资源分配 (Lua 原子操作)
-- IndependentResourceManager.ALLOCATE_AND_GET_TASK_SCRIPT
-- 使用 Lua 脚本确保原子性操作
-- 1. 检查资源是否充足
if cpu_used + cpu_per_task > max_cpu or memory_used + memory_per_task > max_memory then
    return {'err', 'INSUFFICIENT_RESOURCES'}
end
-- 2. 检查队列是否有任务
if queue_length == 0 then
    return {'err', 'QUEUE_EMPTY'}
end
-- 3. 原子操作：获取任务 + 分配资源
local task_id = redis.call('LPOP', task_queue_key)
redis.call('HSET', resource_key, 'cpu_used', cpu_used + cpu_per_task)
redis.call('SADD', active_tasks_key, task_id)
return {'ok', task_id}
核心优点：使用 Redis Lua 脚本实现原子性资源检查和任务获取，完全避免竞态条件。

阶段 3：TaskWorker 异步任务处理
# worker_manager.py - TaskWorker 类
class TaskWorker:
    def __init__(self, worker_id, resource_manager):
        self.max_concurrent = int(os.getenv('MAX_CONCURRENT_PER_WORKER', 4))
        self.executor = ThreadPoolExecutor(max_workers=self.max_concurrent)
    async def run(self):
        while self.running:
            # 1. 检查本地并发限制
            if len(self.running_tasks) >= self.max_concurrent:
                await asyncio.sleep(1)
                continue
            
            # 2. 原子性获取任务（包含资源分配）
            task_id = self.resource_manager.try_allocate_and_get_task(queue_name)
            
            # 3. 创建异步任务处理
            async_task = asyncio.create_task(self._process_task_async_wrapper(task_id))
            self.running_tasks[task_id] = async_task
每个 Worker 支持多任务并发处理（默认最多4个）。

阶段 4：任务执行 (toolWorker.py)
这是核心任务处理流程：

┌─────────────────────────────────────────────────────────────────────┐
│                    process_task(task_id)                            │
├─────────────────────────────────────────────────────────────────────┤
│  Step 1: 初始化任务上下文                                            │
│    • 从数据库获取任务信息                                             │
│    • 初始化 TaskLogger                                              │
│    • 更新状态为 RUNNING                                              │
├─────────────────────────────────────────────────────────────────────┤
│  Step 2: 选择部署模式                                                │
│    • ecs_only: process_task_ecs_only()                              │
│    • ecs_oss_acr: process_task_ecs_oss_acr()                        │
├─────────────────────────────────────────────────────────────────────┤
│  Step 3: ECS Only 模式处理流程                                       │
│    a8: WORKER_ASSIGNED (30%)     - Worker获取任务                   │
│    a9: CONTAINER_IMAGE_LOADING (35%) - 检查/加载Docker镜像          │
│    a10: JOBS_DIRECTORY_CREATION (45%) - 创建jobs目录结构             │
│    a10: TEMP_TO_JOBS_COPY (47%)  - 复制temp文件到jobs               │
│    a11: CONTAINER_EXECUTION (50%) - 启动Docker容器执行              │
│    a12: RESULT_PACKAGING (85%)   - 打包结果文件                      │
│    a13: WORK_DIRECTORY_CLEANUP (92%) - 清理work目录                 │
│    a14: TEMP_CLEANUP_SCHEDULE (95%) - 清理temp目录                  │
│    COMPLETED (100%)              - 任务完成                          │
├─────────────────────────────────────────────────────────────────────┤
│  Step 4: 容器执行详情                                                │
│    • 创建唯一容器名称: tool-{taskId}-{timestamp}-{uuid}             │
│    • 挂载目录:                                                       │
│      /data/input (只读)  ← jobs/{taskId}/input                      │
│      /data/output (读写) ← jobs/{taskId}/output                     │
│      /data/logs (读写)   ← jobs/{taskId}/logs                       │
│      /data/work (读写)   ← jobs/{taskId}/work                       │
│    • 容器超时: 3分钟                                                 │
│    • 安全配置: network_mode=none, cap_drop=ALL, read_only=True     │
├─────────────────────────────────────────────────────────────────────┤
│  Step 5: 结果处理                                                    │
│    成功: 打包结果 → 更新数据库 → 清理temp/work目录                    │
│    失败/超时: 清理容器 → 清理所有临时目录 → 更新错误状态              │
└─────────────────────────────────────────────────────────────────────┘
阶段 5：容器管理 (container_manager.py)
class ContainerManager:
    MAX_CLEANUP_RETRIES = 3  # 清理重试次数
    RETRY_DELAY_SECONDS = 2  # 重试间隔
    def create_container(self, task_id, image_name, **kwargs):
        container_name = f"tool-job-{task_id}"
        container = self.docker_client.containers.run(
            image_name,
            name=container_name,
            detach=True,
            remove=False,  # 手动控制删除
            **kwargs
        )
        self.active_containers[task_id] = {...}  # 记录活跃容器
        return container
    def cleanup_container(self, task_id, force=False, reason="unknown"):
        # 带重试机制的容器清理
        # 处理4种情况：Worker崩溃、容器中止、正常完成、执行超时
⚙️ 关键配置参数
环境变量	默认值	说明
WORKER_COUNT	4	Worker 进程数量
MAX_CONCURRENT_PER_WORKER	4	每个 Worker 最大并发任务数
ECS_TOTAL_CPU	8	总 CPU 资源
ECS_TOTAL_MEMORY_GB	64	总内存资源 (GB)
JOB_CPU_REQUEST	2	每任务 CPU 需求
JOB_MEMORY_REQUEST_GB	16	每任务内存需求 (GB)
CONTAINER_EXECUTION_TIMEOUT_MINUTES	3	容器执行超时 (分钟)
TASK_TIMEOUT_SECONDS	1800	任务总超时 (30分钟)
📊 数据流图
用户提交任务
     ↓
┌─────────────────┐
│  API Server     │ ──→ 验证权限/配额
└─────────────────┘
     ↓ 
┌─────────────────┐
│  PostgreSQL     │ ──→ 创建 Task 记录 (PENDING)
└─────────────────┘
     ↓
┌─────────────────┐
│  Redis Queue    │ ──→ RPUSH task_queue {taskId}
└─────────────────┘
     ↓
┌─────────────────┐
│  Worker         │ ──→ Lua 脚本原子获取任务
└─────────────────┘
     ↓
┌─────────────────┐
│  Docker容器     │ ──→ 执行工具 (sdcgen/upfgen)
└─────────────────┘
     ↓
┌─────────────────┐
│  结果处理       │ ──→ 打包 ZIP → 更新数据库 → WebSocket 通知
└─────────────────┘
🔒 安全特性
容器隔离：network_mode=none, cap_drop=ALL
只读文件系统：read_only=True
资源限制：CPU/内存硬限制
权限控制：no-new-privileges:true
临时文件系统：/tmp 使用 noexec,nosuid