# toolWorker.py 重构方案文档 (最终修订版)

**创建日期**: 2025-01-15
**文件路径**: `app/backend/src/workers/toolWorker.py`
**当前行数**: 3,149 行
**目标行数**: 每个文件不超过 800 行
**修订说明**: 本文档整合了 `worker_refractor_solution_0115.md` 的审查结果和 `worker_refractor_gpt52codex_0115.md` 的循环导入修正建议

---

## 一、原方案问题分析

### 1.1 方案一（worker_refractor_solution_0115.md）核心问题

经过对 `toolWorker.py` 及相关代码文件的系统性审查，原重构方案存在以下问题：

| 问题编号 | 问题描述 | 影响 |
|---------|---------|------|
| P1 | **过度设计**：将 `process_task_ecs_only` 拆分为执行器类的多个方法，修改了代码结构逻辑 | 违反"不修改业务逻辑功能和代码结构逻辑"的要求 |
| P2 | **TaskLogger拆分错误**：将 `upload_to_oss()`、`generate_report()` 等方法移出类 | 破坏类的完整性，`upload_to_oss` 方法内部依赖 `self.logs`、`self.task_id` 等实例属性 |
| P3 | **依赖关系分析不完整**：未考虑 `worker_manager.py` 对 `toolWorker.py` 的导入依赖 | 重构后可能导致 `worker_manager.py` 无法正常导入 |
| P4 | **模块划分过细**：拆分为15个模块，增加维护复杂度 | 过于碎片化，不利于理解和维护 |
| P5 | **抽象基类引入**：创建 `TaskExecutor(ABC)` 抽象基类 | 引入了新的代码结构，违反原则 |
| P6 | **行数估算不准确**：原方案估算主入口文件约200行 | 实际需要保留的导入和兼容性代码远超此估算 |

**结论**：方案一不符合"结构逻辑不改、函数内部逻辑不改"的硬性约束，不能采用。

### 1.2 现有代码依赖关系

```
worker_manager.py
    ├── from toolWorker import process_task
    ├── from toolWorker import redis_client
    ├── from toolWorker import TASK_QUEUE_NAME
    ├── from toolWorker import set_shared_resource_manager
    ├── from toolWorker import cleanup_temp_files
    ├── from toolWorker import TaskLogger
    └── from toolWorker import Task (间接)

worker_process.py
    └── from worker_manager import IndependentResourceManager, TaskWorker

cleanup_container.py
    └── from container_manager import cleanup_container_for_task

container_manager.py
    └── 独立模块，被 toolWorker.py 导入
```

**关键约束**：`worker_manager.py` 大量导入 `toolWorker.py` 中的函数和类，重构必须保持这些导出接口不变。

### 1.3 关键调用链与业务逻辑（基线理解）

以下调用关系在重构中必须保持不变：

1. **process_task 主入口**：
```python
# 行 1247-1305
def process_task(task_id):
    # ...
    def task_execution():
        if deployment_mode == 'ecs_only':
            return process_task_ecs_only(task, task_logger, session)
        else:
            return process_task_ecs_oss_acr(task, task_logger, session)
```

2. **TaskLogger.update_task_progress 依赖 API 函数**：
```python
# 行 395-454
def update_task_progress(self, current_step, shared_session=None):
    # ...
    update_task_status_via_api_with_retry(self.task_id, task.status, {
        'progress': progress,
        'currentStep': current_step
    })
```

3. **worker_manager.py 运行期导入**：
```python
# 行 579-586
from toolWorker import process_task, redis_client, TASK_QUEUE_NAME, set_shared_resource_manager
self.process_task = process_task
self.redis_client = redis_client
```

---

## 二、循环导入风险分析（GPT52 Codex 方案的关键修正）

### 2.1 循环导入风险一：TaskLogger ↔ task_processor

**问题描述**：
- `TaskLogger.update_task_progress()` 调用 `update_task_status_via_api_with_retry`
- 如果将 API 函数放在 `task_processor.py`，而 `task_processor.py` 又需要导入 `TaskLogger`
- 这会导致 **必然的循环导入**

**依赖链**：
```
task_logger.py
    └── 需要 update_task_status_via_api_with_retry (如果在 task_processor.py)

task_processor.py
    └── 需要 TaskLogger (用于 process_task 等函数)
```

**解决方案**：将 API 重试与状态更新函数独立为 `toolsRefractor/api_client.py`，`TaskLogger` 与 `task_processor` 统一从该模块导入，彻底消除循环。

### 2.2 循环导入风险二：process_task ↔ ecs_oss_acr_processor

**问题描述**：
- `process_task()` 内部调用 `process_task_ecs_oss_acr()`
- 如果 `ecs_oss_acr_processor.py` 依赖 `task_processor` 内的 `initialize_task_context` 等函数
- 会形成双向引用的风险

**依赖链**：
```
task_processor.py
    └── 定义 process_task()
        └── 调用 process_task_ecs_oss_acr()

ecs_oss_acr_processor.py
    └── 定义 process_task_ecs_oss_acr()
        └── 需要 initialize_task_context (如果在 task_processor.py)
```

**解决方案**：
1. 把 `initialize_task_context` 抽到独立模块 `task_context.py`
2. 让 `process_task` 在函数内部按需导入 `process_task_ecs_oss_acr`，避免模块级循环

---

## 三、修订后的重构原则

### 3.1 核心约束（必须严格遵守）

1. **函数体不改**：所有函数/方法内部逻辑保持字节级一致（仅移动）
2. **调用路径不改**：`process_task` 仍作为任务入口，内部逻辑完全一致
3. **对外接口不变**：`toolWorker.py` 重导出所有对外可见符号
4. **文件行数 < 800**：模块拆分按功能边界、最小切分

### 3.2 设计原则

1. **最小化拆分**：只拆分必要的模块，避免过度碎片化
2. **按职责边界拆分**：根据功能边界进行模块划分
3. **保持函数完整性**：函数整体移动，不拆分函数内部逻辑
4. **向后兼容**：通过 `toolWorker.py` 的重导出保持兼容性
5. **消除循环导入**：通过独立模块和延迟导入解决循环依赖

---

## 四、代码结构分析

### 4.1 现有代码行数统计

| 代码段 | 行号范围 | 行数 | 职责 |
|-------|---------|------|------|
| 导入和环境配置 | 1-112 | 112 | 模块导入、环境变量加载 |
| API相关函数 | 113-238 | 126 | 重试装饰器、API状态更新函数 |
| TaskLogger类 | 239-598 | 360 | 任务日志记录 |
| 配置常量和Redis | 599-688 | 90 | 配置常量、Redis连接池 |
| 数据库模型 | 689-731 | 43 | Task、Tool模型定义 |
| initialize_task_context | 732-773 | 42 | 任务上下文初始化 |
| EcsLocalFileManager类 | 774-969 | 196 | ECS本地文件管理 |
| 资源管理 | 970-991 | 22 | 资源管理器接口 |
| 容器名称管理 | 992-1045 | 54 | 容器名称生成和释放 |
| 错误处理和超时 | 1046-1152 | 107 | 超时异常、清理管理器 |
| Aliyun辅助函数（注释） | 1153-1246 | 94 | STS、ACR、OSS辅助函数 |
| process_task主函数 | 1247-1394 | 148 | 任务处理入口 |
| process_task_ecs_only | 1395-2011 | 617 | ECS Only模式处理 |
| process_task_ecs_oss_acr | 2012-2556 | 545 | ECS+OSS+ACR模式处理 |
| worker_loop（废弃） | 2557-2631 | 75 | 旧Worker循环 |
| process_temp_files | 2632-2847 | 216 | 临时文件处理 |
| 系统状态函数 | 2848-2905 | 58 | 系统状态信息获取 |
| cleanup_temp_files | 2906-2994 | 89 | 临时文件清理 |
| Docker镜像函数 | 2995-3094 | 100 | 镜像检查和加载 |
| 主入口 | 3095-3149 | 55 | `__main__` 入口 |
| **总计** | | **3149** | |

---

## 五、最终重构方案（整合 GPT52 Codex 修正）

### 5.1 目标目录结构

```
app/backend/src/workers/
├── toolWorker.py                    # 入口 + 兼容重导出 + __main__ (~350行)
├── container_manager.py             # 已存在，不动
├── worker_manager.py                # 已存在，不动
├── worker_process.py                # 已存在，不动
├── cleanup_container.py             # 已存在，不动
└── toolsRefractor/
    ├── __init__.py                  # 模块导出 (~20行)
    ├── core.py                      # 环境加载/常量/客户端/DB模型 (~260行)
    ├── api_client.py                # retry + update_task_status_via_api (~120行) ★ 新增
    ├── task_logger.py               # TaskLogger 完整保留 (~380行)
    ├── file_manager.py              # normalize + prepare + EcsLocalFileManager (~250行)
    ├── task_context.py              # initialize_task_context (~60行) ★ 新增
    ├── task_runtime.py              # 资源管理/容器名/超时清理 (~230行)
    ├── ecs_only_processor.py        # process_task_ecs_only (~650行)
    ├── ecs_oss_acr_processor.py     # process_task_ecs_oss_acr + Aliyun注释块 (~650行)
    └── utils.py                     # worker_loop + temp/cleanup/system + docker镜像 (~480行)
```

**与之前方案的关键区别**：
1. 新增 `api_client.py` 模块 - 解决 TaskLogger ↔ task_processor 循环导入
2. 新增 `task_context.py` 模块 - 解决 process_task ↔ ecs_oss_acr_processor 循环导入
3. 将 `task_processor.py` 拆分为 `task_runtime.py` + `ecs_only_processor.py`

### 5.2 模块划分详细说明（完全"整体搬移"）

#### 模块A：`toolsRefractor/core.py` (~260行)

**包含内容（原位置保持一致顺序搬移）**：
- 环境变量加载与部署模式检测 (行 75-117, 231-237)
- 常量定义 `REDIS_URL`, `TASK_QUEUE_NAME`, `JOB_CPU_REQUEST` 等 (行 599-618)
- RedisConnectionPool 类 / redis_client (行 620-666)
- docker_client / core_client 初始化 (行 668-683)
- SQLAlchemy Base / engine / Session / Task / Tool (行 685-731)

**说明**：`core.py` 作为"唯一初始化入口"，其他模块只从此处读取全局对象，避免重复初始化。

**导出符号**：
```python
__all__ = [
    # 配置常量
    'REDIS_URL', 'DATABASE_URL', 'TASK_QUEUE_NAME',
    'ECS_TOTAL_CPU', 'ECS_TOTAL_MEMORY_GB',
    'JOB_CPU_REQUEST', 'JOB_MEMORY_REQUEST_GB',
    'OSS_REGION', 'OSS_BUCKET_USER_INPUT', 'OSS_BUCKET_JOB_RESULTS', 'OSS_BUCKET_JOB_LOGS',
    'ALIYUN_RAM_ROLE_ARN', 'ALIYUN_STS_REGION',
    'ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ACR_REGION',
    # 类
    'RedisConnectionPool', 'Task', 'Tool', 'Base',
    # 函数
    'get_redis_client', 'get_deployment_mode', 'is_ecs_only_mode', 'is_ecs_oss_acr_mode',
    # 实例
    'redis_client', 'docker_client', 'core_client', 'engine', 'Session',
    'deployment_mode',
]
```

#### 模块B：`toolsRefractor/api_client.py` (~120行) ★ 关键新增

**包含内容**：
- `retry_on_network_error` 装饰器 (行 118-148)
- `update_task_status_via_api` 函数 (行 150-189)
- `_update_task_status_via_api_internal` 函数 (行 191-226)
- `update_task_status_via_api_with_retry` 函数 (行 228-229)

**说明**：独立出 API 函数，消除 `TaskLogger` 与 `task_processor` 之间的循环依赖。`TaskLogger` 和 `process_task` 统一从此模块导入。

**导出符号**：
```python
__all__ = [
    'retry_on_network_error',
    'update_task_status_via_api',
    '_update_task_status_via_api_internal',
    'update_task_status_via_api_with_retry',
]
```

**依赖关系**：
```python
# 仅依赖标准库和 core 模块
import os
import logging
import functools
import requests
from datetime import datetime, timezone
# 无需导入其他 toolsRefractor/* 模块，避免循环
```

#### 模块C：`toolsRefractor/task_logger.py` (~380行)

**包含内容**：
- `TaskLogger` 类（完整原样复制）(行 239-598)

**导出符号**：
```python
__all__ = ['TaskLogger']
```

**依赖关系**：
```python
from .core import Task, Session  # 用于 update_task_progress 和 get_db_session
from .api_client import update_task_status_via_api_with_retry  # ★ 从 api_client 导入
```

#### 模块D：`toolsRefractor/file_manager.py` (~250行)

**包含内容**：
- `normalize_docker_path` 函数 (行 23-41)
- `prepare_container_volumes` 函数 (行 43-73)
- `EcsLocalFileManager` 类完整代码 (行 774-969)

**导出符号**：
```python
__all__ = [
    'normalize_docker_path',
    'prepare_container_volumes',
    'EcsLocalFileManager'
]
```

**依赖关系**：
```python
import os
import platform
import json
import shutil
import zipfile
import logging
from datetime import datetime, timezone
from typing import Dict
# 无需导入其他 toolsRefractor/* 模块
```

#### 模块E：`toolsRefractor/task_context.py` (~60行) ★ 关键新增

**包含内容**：
- `initialize_task_context` 函数 (行 732-773)

**说明**：专门拆出以避免 `process_task` 与 `ecs_oss_acr_processor` 的循环引用。

**导出符号**：
```python
__all__ = ['initialize_task_context']
```

**依赖关系**：
```python
from .core import Tool, Session
from .file_manager import EcsLocalFileManager
# task_logger 通过参数传入，不需要模块级导入
```

#### 模块F：`toolsRefractor/task_runtime.py` (~230行)

**包含内容**：
- 资源管理接口 `_legacy_resource_manager`, `_shared_resource_manager` (行 970-976)
- `set_shared_resource_manager`, `get_resource_manager` 函数 (行 978-990)
- `generate_unique_container_name`, `release_container_name` 函数 (行 992-1045)
- `TaskTimeoutError` 类 (行 1047-1049)
- `ResourceCleanupManager` 类 (行 1051-1072)
- `execute_with_timeout_and_cleanup` 函数 (行 1074-1130)
- `safe_container_operation` 函数 (行 1132-1151)

**导出符号**：
```python
__all__ = [
    # 资源管理
    'set_shared_resource_manager',
    'get_resource_manager',
    # 容器名称
    'generate_unique_container_name',
    'release_container_name',
    # 错误处理
    'TaskTimeoutError',
    'ResourceCleanupManager',
    'execute_with_timeout_and_cleanup',
    'safe_container_operation',
]
```

**依赖关系**：
```python
import os
import time
import uuid
import logging
import threading
from .core import ECS_TOTAL_CPU, ECS_TOTAL_MEMORY_GB
# 无需导入 task_logger 或其他处理模块
```

#### 模块G：`toolsRefractor/ecs_only_processor.py` (~650行)

**包含内容**：
- `process_task` 主函数 (行 1247-1394)
- `process_task_ecs_only` 函数（完整原样复制）(行 1395-2011)

**导出符号**：
```python
__all__ = [
    'process_task',
    'process_task_ecs_only',
]
```

**依赖关系**：
```python
from .core import (
    redis_client, docker_client, Session, Task, Tool,
    JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    get_deployment_mode
)
from .api_client import update_task_status_via_api_with_retry
from .task_logger import TaskLogger
from .file_manager import (
    EcsLocalFileManager, normalize_docker_path,
    prepare_container_volumes
)
from .task_context import initialize_task_context
from .task_runtime import (
    TaskTimeoutError, ResourceCleanupManager,
    execute_with_timeout_and_cleanup,
    generate_unique_container_name
)
from .utils import (
    process_temp_files, cleanup_temp_files,
    check_local_image_exists, load_image_from_tar
)
from container_manager import container_manager, cleanup_container_for_task

# ★ 延迟导入：在 process_task 函数内部导入 process_task_ecs_oss_acr
# 避免模块级循环导入
```

**关键实现细节 - 延迟导入**：
```python
def process_task(task_id):
    """处理单个任务 - 支持双部署模式"""
    # ... 原有代码 ...

    def task_execution():
        if deployment_mode == 'ecs_only':
            return process_task_ecs_only(task, task_logger, session)
        else:
            # ★ 延迟导入，避免模块级循环依赖
            from .ecs_oss_acr_processor import process_task_ecs_oss_acr
            return process_task_ecs_oss_acr(task, task_logger, session)

    # ... 原有代码 ...
```

#### 模块H：`toolsRefractor/ecs_oss_acr_processor.py` (~650行)

**包含内容**：
- `process_task_ecs_oss_acr` 函数（完整原样复制）(行 2012-2556)
- Aliyun helper 注释块（保持注释位置与内容，不做功能改动）(行 1153-1246)

**导出符号**：
```python
__all__ = [
    'process_task_ecs_oss_acr',
    # 以下函数当前已注释，保持注释状态
    # 'get_sts_credentials_for_task',
    # 'get_acr_login_info',
    # 'get_oss_bucket',
]
```

**依赖关系**：
```python
from .core import (
    docker_client, core_client, Session, Task, Tool,
    OSS_REGION, OSS_BUCKET_USER_INPUT, OSS_BUCKET_JOB_RESULTS, OSS_BUCKET_JOB_LOGS,
    ALIYUN_RAM_ROLE_ARN, JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    deployment_mode
)
from .task_logger import TaskLogger
from .file_manager import EcsLocalFileManager
from .task_context import initialize_task_context  # ★ 从独立模块导入
from .task_runtime import generate_unique_container_name
# 不需要导入 ecs_only_processor，避免循环
```

#### 模块I：`toolsRefractor/utils.py` (~480行)

**包含内容**：
- `worker_loop` 函数（废弃但保留）(行 2557-2631)
- `process_temp_files` 函数 (行 2632-2847)
- `get_system_status_info` 函数 (行 2848-2905)
- `cleanup_temp_files` 函数 (行 2906-2994)
- `check_local_image_exists` / `clean_dangling_images_for_repository` / `load_image_from_tar` (行 2995-3094)

**导出符号**：
```python
__all__ = [
    'worker_loop',  # 废弃，保留向后兼容
    'process_temp_files',
    'get_system_status_info',
    'cleanup_temp_files',
    'check_local_image_exists',
    'clean_dangling_images_for_repository',
    'load_image_from_tar',
]
```

**依赖关系**：
```python
from .core import (
    redis_client, docker_client, Session, Task,
    TASK_QUEUE_NAME, ECS_TOTAL_CPU, ECS_TOTAL_MEMORY_GB,
    JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    get_deployment_mode
)
from .task_logger import TaskLogger
from .task_runtime import get_resource_manager
```

#### 模块J：`toolsRefractor/__init__.py` (~20行)

**内容**：
```python
"""
Worker模块包
提供任务处理所需的所有组件
"""

from .core import *
from .api_client import *
from .task_logger import *
from .file_manager import *
from .task_context import *
from .task_runtime import *
from .ecs_only_processor import *
from .ecs_oss_acr_processor import *
from .utils import *
```

---

## 六、toolWorker.py 重导出策略（必须严格）

`toolWorker.py` 只做三件事：

1. 从 `toolsRefractor/*` 与 `container_manager` 导入所有现有符号
2. `__all__` 明确列出对外接口（与现有调用一致）
3. 保留 `__main__` 入口逻辑（原样复制）

### 6.1 必须覆盖的导出（最低集合）

以下符号必须从 `toolWorker.py` 导出，以保证 `worker_manager.py` 正常工作：

```python
# 核心函数
- process_task
- process_task_ecs_only
- process_task_ecs_oss_acr

# Redis/配置
- redis_client
- TASK_QUEUE_NAME
- JOB_CPU_REQUEST
- JOB_MEMORY_REQUEST_GB

# 类
- TaskLogger
- Task
- Tool
- Session
- Base

# 工具函数
- cleanup_temp_files
- process_temp_files
- worker_loop

# 资源管理
- set_shared_resource_manager
- get_resource_manager

# 容器相关
- generate_unique_container_name
- release_container_name
- container_manager
- cleanup_container_for_task

# 错误处理
- execute_with_timeout_and_cleanup
- TaskTimeoutError
- ResourceCleanupManager

# 文件管理
- normalize_docker_path
- prepare_container_volumes
- EcsLocalFileManager

# Docker镜像
- check_local_image_exists
- clean_dangling_images_for_repository
- load_image_from_tar
```

### 6.2 toolWorker.py 完整结构

```python
#!/usr/bin/env python3
"""
Worker主入口文件
负责初始化和启动Worker循环，同时作为模块接口导出所有公共符号
"""

# === 从子模块重导出所有公共符号 ===
from toolsRefractor.core import (
    REDIS_URL, DATABASE_URL, TASK_QUEUE_NAME,
    ECS_TOTAL_CPU, ECS_TOTAL_MEMORY_GB,
    JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    OSS_REGION, OSS_BUCKET_USER_INPUT, OSS_BUCKET_JOB_RESULTS, OSS_BUCKET_JOB_LOGS,
    ALIYUN_RAM_ROLE_ARN, ALIYUN_STS_REGION,
    ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ACR_REGION,
    RedisConnectionPool, Task, Tool, Base,
    get_redis_client, get_deployment_mode, is_ecs_only_mode, is_ecs_oss_acr_mode,
    redis_client, docker_client, core_client, engine, Session,
    deployment_mode,
)

from toolsRefractor.api_client import (
    retry_on_network_error,
    update_task_status_via_api,
    update_task_status_via_api_with_retry,
)

from toolsRefractor.task_logger import TaskLogger

from toolsRefractor.file_manager import (
    normalize_docker_path,
    prepare_container_volumes,
    EcsLocalFileManager,
)

from toolsRefractor.task_context import initialize_task_context

from toolsRefractor.task_runtime import (
    set_shared_resource_manager,
    get_resource_manager,
    generate_unique_container_name,
    release_container_name,
    TaskTimeoutError,
    ResourceCleanupManager,
    execute_with_timeout_and_cleanup,
    safe_container_operation,
)

from toolsRefractor.ecs_only_processor import (
    process_task,
    process_task_ecs_only,
)

from toolsRefractor.ecs_oss_acr_processor import (
    process_task_ecs_oss_acr,
)

from toolsRefractor.utils import (
    worker_loop,
    process_temp_files,
    get_system_status_info,
    cleanup_temp_files,
    check_local_image_exists,
    clean_dangling_images_for_repository,
    load_image_from_tar,
)

from container_manager import container_manager, cleanup_container_for_task

# === __all__ 定义所有公共符号 ===
__all__ = [
    # 配置常量
    'REDIS_URL', 'DATABASE_URL', 'TASK_QUEUE_NAME',
    'ECS_TOTAL_CPU', 'ECS_TOTAL_MEMORY_GB',
    'JOB_CPU_REQUEST', 'JOB_MEMORY_REQUEST_GB',
    'OSS_REGION', 'OSS_BUCKET_USER_INPUT', 'OSS_BUCKET_JOB_RESULTS', 'OSS_BUCKET_JOB_LOGS',
    # 类
    'RedisConnectionPool', 'Task', 'Tool', 'Base', 'TaskLogger', 'EcsLocalFileManager',
    'TaskTimeoutError', 'ResourceCleanupManager',
    # 函数
    'get_redis_client', 'get_deployment_mode', 'is_ecs_only_mode', 'is_ecs_oss_acr_mode',
    'normalize_docker_path', 'prepare_container_volumes',
    'retry_on_network_error', 'update_task_status_via_api', 'update_task_status_via_api_with_retry',
    'set_shared_resource_manager', 'get_resource_manager',
    'generate_unique_container_name', 'release_container_name',
    'execute_with_timeout_and_cleanup', 'safe_container_operation',
    'initialize_task_context', 'process_task', 'process_task_ecs_only', 'process_task_ecs_oss_acr',
    'worker_loop', 'process_temp_files', 'get_system_status_info', 'cleanup_temp_files',
    'check_local_image_exists', 'clean_dangling_images_for_repository', 'load_image_from_tar',
    # 实例
    'redis_client', 'docker_client', 'engine', 'Session', 'deployment_mode',
    'container_manager', 'cleanup_container_for_task',
]

# === 主入口 ===
if __name__ == '__main__':
    import logging
    import time

    logging.info("Starting Python Task Worker...")

    # 孤儿容器清理计数器（每10次空闲循环执行一次，约5分钟）
    orphan_cleanup_counter = 0
    ORPHAN_CLEANUP_INTERVAL = 10

    # 简单的Worker循环，直接监听Redis队列
    while True:
        try:
            logging.info("Waiting for tasks...")
            logging.info(f"Waiting for tasks from queue: {TASK_QUEUE_NAME}")
            result = redis_client.blpop(TASK_QUEUE_NAME, timeout=30)

            if result:
                queue_name, task_id_bytes = result
                task_id = task_id_bytes.decode('utf-8')

                remaining_queue_length = redis_client.llen(TASK_QUEUE_NAME)
                logging.info(f"Picked up task: {task_id}, remaining in queue: {remaining_queue_length}")

                active_tasks = redis_client.scard('active_task_ids') if redis_client.exists('active_task_ids') else 0
                logging.info(f"Queue status - Active tasks: {active_tasks}, Queue length: {remaining_queue_length}")

                try:
                    process_task(task_id)
                    logging.info(f"Task {task_id} completed successfully")
                except Exception as e:
                    logging.error(f"Error processing task {task_id}: {e}", exc_info=True)
            else:
                orphan_cleanup_counter += 1
                if orphan_cleanup_counter >= ORPHAN_CLEANUP_INTERVAL:
                    try:
                        logging.info("Running periodic orphan container cleanup...")
                        cleaned_count = container_manager.cleanup_orphaned_containers()
                        logging.info(f"Orphan container cleanup completed: {cleaned_count} containers cleaned")
                        orphan_cleanup_counter = 0
                    except Exception as cleanup_error:
                        logging.error(f"Error during orphan container cleanup: {cleanup_error}")

                logging.info("No tasks in queue, continuing to wait...")

        except KeyboardInterrupt:
            logging.info("Worker stopped by user")
            break
        except Exception as e:
            logging.error(f"Worker error: {e}", exc_info=True)
            time.sleep(5)
```

---

## 七、模块依赖关系图（无循环）

```
                    ┌─────────────┐
                    │   core.py   │  (基础配置，无依赖)
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │api_client.py│ │file_manager │ │task_runtime │
    │  (API函数)  │ │   .py       │ │    .py      │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           │               ▼               │
           │        ┌─────────────┐        │
           │        │task_context │        │
           │        │    .py      │        │
           │        └──────┬──────┘        │
           │               │               │
           ▼               │               │
    ┌─────────────┐        │               │
    │task_logger  │◄───────┘               │
    │    .py      │                        │
    └──────┬──────┘                        │
           │                               │
           │    ┌──────────────────────────┘
           │    │
           ▼    ▼
    ┌─────────────┐     ┌─────────────────┐
    │   utils.py  │     │ecs_oss_acr_    │
    │             │     │processor.py    │
    └──────┬──────┘     └────────┬────────┘
           │                     │
           │                     │ (无反向依赖)
           ▼                     │
    ┌─────────────────┐          │
    │ecs_only_       │◄─────────┘ (延迟导入)
    │processor.py    │
    └─────────────────┘
           │
           ▼
    ┌─────────────────┐
    │ toolWorker.py   │  (重导出入口)
    └─────────────────┘
```

**关键设计**：
1. `api_client.py` 独立存在，被 `task_logger.py` 和 `ecs_only_processor.py` 导入
2. `task_context.py` 独立存在，被 `ecs_only_processor.py` 和 `ecs_oss_acr_processor.py` 导入
3. `ecs_only_processor.py` 通过**延迟导入**使用 `ecs_oss_acr_processor.py`，避免循环

---

## 八、实施步骤（最小化风险）

### Phase 1: 准备阶段（低风险）

1. 创建 `toolsRefractor/` 目录与 `__init__.py`
2. 备份原文件 `toolWorker.py.bak`

```bash
mkdir -p app/backend/src/workers/toolsRefractor
touch app/backend/src/workers/toolsRefractor/__init__.py
cp app/backend/src/workers/toolWorker.py app/backend/src/workers/toolWorker.py.bak
```

### Phase 2: 按顺序创建模块（中风险）

**严格按以下顺序创建**，确保依赖关系正确：

1. `toolsRefractor/core.py` - 基础配置（无依赖）
2. `toolsRefractor/api_client.py` - API 函数（仅依赖 core）
3. `toolsRefractor/file_manager.py` - 文件管理（仅依赖标准库）
4. `toolsRefractor/task_context.py` - 任务上下文（依赖 core, file_manager）
5. `toolsRefractor/task_runtime.py` - 运行时（仅依赖 core）
6. `toolsRefractor/task_logger.py` - 日志（依赖 core, api_client）
7. `toolsRefractor/utils.py` - 工具函数（依赖 core, task_logger, task_runtime）
8. `toolsRefractor/ecs_oss_acr_processor.py` - ECS+OSS+ACR（依赖多个模块，但不依赖 ecs_only）
9. `toolsRefractor/ecs_only_processor.py` - ECS Only + process_task（延迟导入 ecs_oss_acr）

### Phase 3: 更新主入口（高风险）

1. 更新 `toolWorker.py` 仅做重导出 + `__main__`
2. `worker_manager.py` 无需改动，导入路径保持不变

### Phase 4: 验证（低风险）

```bash
# 1. 测试导入
python -c "from toolWorker import process_task, redis_client, TASK_QUEUE_NAME, set_shared_resource_manager, cleanup_temp_files, TaskLogger"

# 2. 启动Worker测试
cd app && npm run dev:worker

# 3. 验证 worker_manager.py 正常工作
python app/backend/src/workers/worker_manager.py
```

---

## 九、行数验证

### 9.1 预期行数统计

| 文件 | 预期行数 | 是否满足<800行 |
|------|---------|---------------|
| toolWorker.py | ~350 | ✅ |
| toolsRefractor/core.py | ~260 | ✅ |
| toolsRefractor/api_client.py | ~120 | ✅ |
| toolsRefractor/task_logger.py | ~380 | ✅ |
| toolsRefractor/file_manager.py | ~250 | ✅ |
| toolsRefractor/task_context.py | ~60 | ✅ |
| toolsRefractor/task_runtime.py | ~230 | ✅ |
| toolsRefractor/ecs_only_processor.py | ~650 | ✅ |
| toolsRefractor/ecs_oss_acr_processor.py | ~650 | ✅ |
| toolsRefractor/utils.py | ~480 | ✅ |
| toolsRefractor/__init__.py | ~20 | ✅ |
| **总计** | ~3450 | - |

**说明**：总行数略有增加（约10%），主要因为：
1. 各模块需要添加导入语句
2. toolWorker.py 需要完整的重导出代码
3. 每个模块需要 `__all__` 定义

### 9.2 与原方案对比

| 指标 | 方案一 | 方案二(Opus45初版) | 最终方案 |
|------|-------|-------------------|---------|
| 模块数量 | 15 | 7 | 10 |
| 是否解决循环导入 | 未考虑 | 存在风险 | ✅ 完全解决 |
| 是否修改业务逻辑 | 是 | 否 | 否 |
| 是否修改函数签名 | 是 | 否 | 否 |
| 向后兼容性 | 需修改依赖 | 完全兼容 | 完全兼容 |

---

## 十、现有一致性风险（不在本次重构中修复）

以下问题是代码中已存在的问题，重构期间**不新增兼容函数**，以避免改变业务逻辑与接口语义：

1. **`get_database_session` 不存在**：`worker_manager.py` 运行期尝试导入 `get_database_session`，但 `toolWorker.py` 中并不存在该函数

2. **`generateLogReport` 方法名错误**：`process_task_ecs_oss_acr()` 中调用 `task_logger.generateLogReport()`，但 `TaskLogger` 只有 `generate_report()` 方法

---

## 十一、风险评估与应对

### 11.1 风险点

| 风险 | 级别 | 影响 | 应对措施 |
|------|------|------|---------|
| 循环导入 | 已解决 | - | api_client.py + task_context.py + 延迟导入 |
| 全局变量初始化顺序 | 中 | 运行时错误 | core.py 中集中初始化 |
| worker_manager.py 导入失败 | 高 | Worker无法启动 | 完整测试所有导入路径 |

### 11.2 回滚方案

1. **保留备份文件**：重构前备份 `toolWorker.py.bak`
2. **Git版本控制**：每个Phase完成后提交
3. **快速回滚**：如果出现问题，直接恢复备份文件

---

## 十二、总结

本最终方案整合了：
1. **方案一问题分析**：识别出过度设计、TaskLogger拆分错误等问题
2. **GPT52 Codex 修正**：采纳循环导入风险分析和解决方案

**关键改进**：
1. 新增 `api_client.py` 模块 - 彻底消除 TaskLogger ↔ task_processor 循环
2. 新增 `task_context.py` 模块 - 避免 process_task ↔ ecs_oss_acr_processor 循环
3. 使用延迟导入 - 在函数内部按需导入跨模块函数

**核心原则遵守**：
- ✅ 不修改任何函数/方法的内部实现
- ✅ 不修改函数签名
- ✅ 不创建新的抽象类
- ✅ 每个文件 < 800行
- ✅ 通过重导出保持完全向后兼容
- ✅ 消除所有循环导入风险


---

## 十三、补充风险与问题点（新增）

### 13.1 get_database_session 的使用场景与职责

**使用位置**：仅在 `worker_manager.py` 的 Worker 崩溃恢复流程中被调用，用于重新入队任务前的数据库查询与更新。  
（与 ECS Only / ECS+OSS+ACR 模式无关，这是 Worker 管理层的恢复逻辑。）

**说明**：
```python
# worker_manager.py 中的恢复流程（示例）
from toolWorker import get_database_session, Task
session = get_database_session()
# 查询 RUNNING 任务 -> 重置为 PENDING -> 重新入队
```

**应包含的功能**（保持与现有逻辑一致，避免业务变更）：
1. 使用 `DATABASE_URL` 创建 SQLAlchemy engine（可复用连接池策略，但不强制新增）
2. 返回 `Session()` 实例
3. 由调用方负责 `session.close()`

**注意**：当前 `toolWorker.py` 内部并没有该函数，属于既有缺陷，不建议在“仅重构”阶段新增，以免改变接口与逻辑语义。

### 13.2 generateLogReport 方法名错误的逻辑影响与解决建议

**问题逻辑**：
`process_task_ecs_oss_acr()` 内部调用 `task_logger.generateLogReport()`，但 `TaskLogger` 实际方法为 `generate_report()`。  
这会导致 ECS+OSS+ACR 模式日志上传阶段抛出 `AttributeError`，并可能中断后续日志上传流程。

**解决建议（不改变业务逻辑的最小修复方式）**：
1. 将调用点改为 `generate_report()`（最直接）  
2. 或在 `TaskLogger` 中增加一个兼容别名方法 `generateLogReport()`（仅代理到 `generate_report()`），避免改动调用方

**说明**：若当前阶段仅保证 ECS Only 正常工作，ECS+OSS+ACR 可暂不修复，但需显式标注该风险。

### 13.3 进一步风险提示（不改变现有重构方案）

1. **ECS+OSS+ACR 函数依赖可用性**：若已取消注释 `get_sts_credentials_for_task / get_acr_login_info / get_oss_bucket`，仍需确认 Aliyun SDK 依赖与环境变量完整，否则会在 ECS+OSS+ACR 模式触发运行时异常。  
2. **导入路径依赖启动方式**：模块使用 `from toolsRefractor.* import ...`，需确保 `workers/` 在 `sys.path` 中（当前启动方式可满足，但变更运行入口可能引发导入失败）。  
3. **__all__ 覆盖范围**：若存在 `from toolWorker import *` 的外部调用，必须保证重导出清单完整，避免隐藏符号导致运行期失败。


---

**文档版本**: v3.0 (最终版)
**最后更新**: 2025-01-15
**整合来源**:
- `worker_refractor_solution_0115.md` (原方案问题分析)
- `worker_refractor_gpt52codex_0115.md` (循环导入修正)
- `worker_refractor_opus45_0115.md` v2.0 (初版修订)
