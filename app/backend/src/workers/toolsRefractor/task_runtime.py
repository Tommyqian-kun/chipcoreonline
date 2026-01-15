import os
import time
import uuid
import logging
import threading

# --- Resource Management ---
# 注意：资源管理现在由SharedResourceManager统一处理
# 这里保留兼容性接口，但实际资源管理由WorkerManager控制
_legacy_resource_manager = {'cpu_used': 0, 'memory_used_gb': 0}

# 全局变量用于存储SharedResourceManager实例
_shared_resource_manager = None

def set_shared_resource_manager(resource_manager):
    """设置共享资源管理器实例"""
    global _shared_resource_manager
    _shared_resource_manager = resource_manager

def get_resource_manager():
    """获取当前的资源管理器"""
    if _shared_resource_manager is not None:
        return _shared_resource_manager
    else:
        # 兼容性：如果没有设置SharedResourceManager，使用旧的全局变量
        logging.warning("Using legacy resource manager - this should only happen in standalone mode")
        return _legacy_resource_manager

# --- 容器名称管理 ---
_container_name_lock = threading.Lock()
_used_container_names = set()

def generate_unique_container_name(task_id: str, worker_id: int = None) -> str:
    """
    生成唯一的容器名称

    Args:
        task_id: 任务ID
        worker_id: Worker ID（可选）

    Returns:
        唯一的容器名称
    """
    with _container_name_lock:
        # 基础名称
        base_name = f"tool-{task_id}"

        # 添加时间戳和UUID确保唯一性
        timestamp = int(time.time() * 1000)  # 毫秒级时间戳
        unique_id = str(uuid.uuid4())[:8]  # 8位UUID

        if worker_id is not None:
            container_name = f"{base_name}-w{worker_id}-{timestamp}-{unique_id}"
        else:
            container_name = f"{base_name}-{timestamp}-{unique_id}"

        # 确保名称唯一性
        counter = 0
        original_name = container_name
        while container_name in _used_container_names:
            counter += 1
            container_name = f"{original_name}-{counter}"

        # 记录已使用的名称
        _used_container_names.add(container_name)

        # 清理旧的名称记录（保留最近1000个）
        if len(_used_container_names) > 1000:
            # 移除最旧的500个名称
            old_names = list(_used_container_names)[:500]
            for name in old_names:
                _used_container_names.discard(name)

        logging.debug(f"Generated unique container name: {container_name}")
        return container_name

def release_container_name(container_name: str):
    """释放容器名称"""
    with _container_name_lock:
        _used_container_names.discard(container_name)
        logging.debug(f"Released container name: {container_name}")

# --- 错误处理和超时管理 ---
class TaskTimeoutError(Exception):
    """任务超时异常"""
    pass

class ResourceCleanupManager:
    """资源清理管理器"""

    def __init__(self):
        self.cleanup_tasks = []
        self.lock = threading.Lock()

    def add_cleanup_task(self, cleanup_func, *args, **kwargs):
        """添加清理任务"""
        with self.lock:
            self.cleanup_tasks.append((cleanup_func, args, kwargs))

    def execute_cleanup(self):
        """执行所有清理任务"""
        with self.lock:
            for cleanup_func, args, kwargs in reversed(self.cleanup_tasks):
                try:
                    cleanup_func(*args, **kwargs)
                    logging.debug(f"Cleanup task executed: {cleanup_func.__name__}")
                except Exception as e:
                    logging.error(f"Cleanup task failed: {cleanup_func.__name__}: {e}")
            self.cleanup_tasks.clear()

def execute_with_timeout_and_cleanup(func, timeout_seconds: int, cleanup_manager: ResourceCleanupManager, *args, **kwargs):
    """
    执行函数并在超时或异常时进行资源清理
    Windows兼容版本：使用threading.Timer代替signal.SIGALRM

    Args:
        func: 要执行的函数
        timeout_seconds: 超时时间（秒）
        cleanup_manager: 资源清理管理器
        *args, **kwargs: 函数参数

    Returns:
        函数执行结果

    Raises:
        TaskTimeoutError: 任务超时
        Exception: 其他异常
    """
    import threading
    import time

    result = None
    exception = None
    completed = threading.Event()

    def target():
        nonlocal result, exception
        try:
            result = func(*args, **kwargs)
        except Exception as e:
            exception = e
        finally:
            completed.set()

    # 启动执行线程
    thread = threading.Thread(target=target)
    thread.daemon = True
    thread.start()

    try:
        # 等待完成或超时
        if completed.wait(timeout_seconds):
            # 任务完成
            if exception:
                logging.error(f"Task execution failed: {exception}")
                raise exception
            return result
        else:
            # 任务超时
            logging.error(f"Task execution timed out after {timeout_seconds} seconds")
            raise TaskTimeoutError(f"Task execution timed out after {timeout_seconds} seconds")
    finally:
        # 执行清理任务
        try:
            cleanup_manager.execute_cleanup()
        except Exception as cleanup_error:
            logging.error(f"Resource cleanup failed: {cleanup_error}")

def safe_container_operation(operation_name: str, operation_func, *args, **kwargs):
    """
    安全执行容器操作，确保异常时的资源清理

    Args:
        operation_name: 操作名称
        operation_func: 操作函数
        *args, **kwargs: 函数参数

    Returns:
        操作结果
    """
    try:
        logging.info(f"Starting container operation: {operation_name}")
        result = operation_func(*args, **kwargs)
        logging.info(f"Container operation completed: {operation_name}")
        return result
    except Exception as e:
        logging.error(f"Container operation failed: {operation_name}: {e}")
        raise

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
