#!/usr/bin/env python3
"""
Worker Manager - 多进程Worker架构管理器
负责启动、监控和管理多个Worker进程
"""

import os
import sys
import time
import signal
import logging
import multiprocessing
import subprocess
import threading
import json
import redis
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv

# 添加项目路径
sys.path.append(str(Path(__file__).parent.parent.parent))

# 加载环境变量
backend_dir = os.path.join(os.path.dirname(__file__), '..', '..')
env_path = os.path.join(backend_dir, '.env')
env_local_path = os.path.join(backend_dir, '.env.local')

load_dotenv(dotenv_path=env_path)
if os.path.exists(env_local_path):
    load_dotenv(dotenv_path=env_local_path, override=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('WorkerManager')


def worker_main_loop_static(worker_id: int):
    """静态Worker主循环函数 - 避免序列化问题"""
    try:
        # 在子进程中重新创建所有必要的对象
        resource_manager = SharedResourceManager()
        worker = TaskWorker(worker_id, resource_manager)
        worker.run()
    except Exception as e:
        logger.error(f"Worker {worker_id} crashed: {e}", exc_info=True)


class QueueTimeoutCleaner:
    """队列超时清理器"""

    def __init__(self, redis_client, timeout_seconds=3600):  # 默认1小时超时
        self.redis_client = redis_client
        self.timeout_seconds = timeout_seconds
        self.running = False
        self.cleanup_thread = None

    def start(self):
        """启动清理线程"""
        if not self.running:
            self.running = True
            self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
            self.cleanup_thread.start()
            logger.info("Queue timeout cleaner started")

    def stop(self):
        """停止清理线程"""
        self.running = False
        if self.cleanup_thread:
            self.cleanup_thread.join(timeout=5)
            logger.info("Queue timeout cleaner stopped")

    def _cleanup_loop(self):
        """清理循环"""
        while self.running:
            try:
                self._cleanup_expired_tasks()
                time.sleep(60)  # 每分钟检查一次
            except Exception as e:
                logger.error(f"Queue cleanup error: {str(e)}")
                time.sleep(60)

    def _cleanup_expired_tasks(self):
        """清理过期任务"""
        try:
            from toolWorker import cleanup_temp_files, TaskLogger

            # 获取队列中的所有任务
            queue_name = os.getenv('REDIS_QUEUE_NAME', 'task_queue')
            queue_length = self.redis_client.llen(queue_name)

            if queue_length == 0:
                return

            current_time = time.time()
            expired_tasks = []

            # 检查队列中的任务
            for i in range(queue_length):
                task_data = self.redis_client.lindex(queue_name, i)
                if task_data:
                    try:
                        # 尝试解析JSON格式（新格式）
                        task_info = json.loads(task_data)
                        task_id = task_info.get('id')
                        created_at = task_info.get('created_at', current_time)

                        # 检查是否超时
                        if current_time - created_at > self.timeout_seconds:
                            expired_tasks.append((i, task_id, task_info))

                    except json.JSONDecodeError:
                        # 处理任务ID字符串格式（当前格式）
                        task_id = task_data.strip()
                        if task_id:
                            # 从数据库获取任务创建时间
                            try:
                                from sqlalchemy import create_engine, text
                                from datetime import datetime

                                database_url = os.getenv('DATABASE_URL')
                                engine = create_engine(database_url)

                                with engine.connect() as conn:
                                    result = conn.execute(
                                        text("SELECT \"createdAt\" FROM \"Task\" WHERE id = :task_id"),
                                        {"task_id": task_id}
                                    ).fetchone()

                                    if result:
                                        created_at_db = result[0]
                                        created_at_timestamp = created_at_db.timestamp()

                                        # 检查是否超时
                                        if current_time - created_at_timestamp > self.timeout_seconds:
                                            expired_tasks.append((i, task_id, task_data))
                                    else:
                                        # 任务不存在，标记为过期
                                        logger.warning(f"Task {task_id} not found in database, marking for cleanup")
                                        expired_tasks.append((i, task_id, task_data))

                            except Exception as db_error:
                                logger.error(f"Failed to check task {task_id} in database: {db_error}")
                        else:
                            logger.warning(f"Empty task data in queue at index {i}")

            # 清理过期任务
            for index, task_id, task_data in reversed(expired_tasks):  # 从后往前删除
                try:
                    # 从队列中移除（使用原始数据格式）
                    if isinstance(task_data, str) and not task_data.startswith('{'):
                        # 任务ID字符串格式
                        self.redis_client.lrem(queue_name, 1, task_data)
                    else:
                        # JSON格式
                        self.redis_client.lrem(queue_name, 1, json.dumps(task_data))

                    # 清理temp文件
                    task_logger = TaskLogger(task_id, 'queue_cleanup')
                    cleanup_temp_files(task_id, task_logger, "queue_timeout")

                    logger.info(f"Cleaned up expired task from queue: {task_id}")

                except Exception as e:
                    logger.error(f"Failed to cleanup expired task {task_id}: {str(e)}")

        except Exception as e:
            logger.error(f"Queue cleanup failed: {str(e)}")


class IndependentResourceManager:
    """独立资源管理器 - 每个Worker进程独立管理资源"""

    def __init__(self):
        self.max_cpu = int(os.getenv('ECS_TOTAL_CPU', 8))
        self.max_memory_gb = int(os.getenv('ECS_TOTAL_MEMORY_GB', 64))
        self.cpu_per_task = int(os.getenv('JOB_CPU_REQUEST', 1))
        self.memory_per_task_gb = int(os.getenv('JOB_MEMORY_REQUEST_GB', 4))

        # 使用Redis作为状态存储，避免共享内存
        import redis
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', 6379))
        redis_db = int(os.getenv('REDIS_DB', 0))
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db, decode_responses=True)

        # 资源状态键
        self.resource_key = 'worker:resources'

        # 初始化Redis中的资源状态 - 每次启动都重置，确保状态正确
        self.redis_client.hset(self.resource_key, mapping={
            'cpu_used': 0,
            'memory_used_gb': 0,
            'active_tasks_count': 0
        })

        # 清理可能存在的活跃任务集合
        active_tasks_key = f'{self.resource_key}:active_tasks'
        if self.redis_client.exists(active_tasks_key):
            self.redis_client.delete(active_tasks_key)
            logger.info("Cleaned up existing active tasks set")

        logger.info(f"Initialized IndependentResourceManager: {self.max_cpu} CPU, {self.max_memory_gb}GB RAM")

        # 验证资源状态
        current_resources = self.redis_client.hgetall(self.resource_key)
        logger.info(f"Resource status after initialization: "
                   f"CPU {current_resources.get('cpu_used', 0)}/{self.max_cpu}, "
                   f"Memory {current_resources.get('memory_used_gb', 0)}/{self.max_memory_gb}GB, "
                   f"Active tasks: {current_resources.get('active_tasks_count', 0)}")
    
    def try_allocate_resources(self, task_id: str) -> bool:
        """尝试分配资源 - 使用Redis原子操作"""
        try:
            # 使用Redis事务确保原子性
            with self.redis_client.pipeline() as pipe:
                while True:
                    try:
                        # 监视资源键
                        pipe.watch(self.resource_key)

                        # 获取当前资源使用情况
                        current_resources = pipe.hgetall(self.resource_key)
                        cpu_used = int(current_resources.get('cpu_used', 0))
                        memory_used = int(current_resources.get('memory_used_gb', 0))

                        # 检查是否有足够资源
                        if (cpu_used + self.cpu_per_task <= self.max_cpu and
                            memory_used + self.memory_per_task_gb <= self.max_memory_gb):

                            # 开始事务
                            pipe.multi()
                            pipe.hset(self.resource_key, 'cpu_used', cpu_used + self.cpu_per_task)
                            pipe.hset(self.resource_key, 'memory_used_gb', memory_used + self.memory_per_task_gb)
                            pipe.hincrby(self.resource_key, 'active_tasks_count', 1)
                            pipe.sadd(f'{self.resource_key}:active_tasks', task_id)
                            pipe.execute()

                            logger.info(f"Resources allocated for task {task_id}: "
                                       f"CPU {cpu_used + self.cpu_per_task}/{self.max_cpu}, "
                                       f"Memory {memory_used + self.memory_per_task_gb}/{self.max_memory_gb}GB")
                            return True
                        else:
                            return False

                    except redis.WatchError:
                        # 重试
                        continue
                    break

        except Exception as e:
            logger.error(f"Error allocating resources for task {task_id}: {e}")
            return False
    
    def release_resources(self, task_id: str):
        """释放资源 - 使用Redis原子操作"""
        try:
            # 检查任务是否在活跃列表中
            if self.redis_client.sismember(f'{self.resource_key}:active_tasks', task_id):
                # 先获取当前资源使用情况
                current_resources = self.redis_client.hgetall(self.resource_key)
                current_cpu = int(current_resources.get('cpu_used', 0))
                current_memory = int(current_resources.get('memory_used_gb', 0))

                # 计算释放后的资源使用量
                new_cpu = max(0, current_cpu - self.cpu_per_task)
                new_memory = max(0, current_memory - self.memory_per_task_gb)

                # 使用事务更新资源状态
                with self.redis_client.pipeline() as pipe:
                    pipe.hset(self.resource_key, 'cpu_used', new_cpu)
                    pipe.hset(self.resource_key, 'memory_used_gb', new_memory)
                    pipe.hincrby(self.resource_key, 'active_tasks_count', -1)
                    pipe.srem(f'{self.resource_key}:active_tasks', task_id)
                    pipe.execute()

                # 获取更新后的状态用于日志
                current_resources = self.redis_client.hgetall(self.resource_key)
                logger.info(f"Resources released for task {task_id}: "
                           f"CPU {current_resources.get('cpu_used', 0)}/{self.max_cpu}, "
                           f"Memory {current_resources.get('memory_used_gb', 0)}/{self.max_memory_gb}GB")
        except Exception as e:
            logger.error(f"Error releasing resources for task {task_id}: {e}")

    def get_resource_status(self) -> Dict[str, Any]:
        """获取资源状态 - 从Redis读取"""
        try:
            current_resources = self.redis_client.hgetall(self.resource_key)
            active_tasks = self.redis_client.smembers(f'{self.resource_key}:active_tasks')

            return {
                'cpu_used': int(current_resources.get('cpu_used', 0)),
                'cpu_total': self.max_cpu,
                'memory_used_gb': int(current_resources.get('memory_used_gb', 0)),
                'memory_total_gb': self.max_memory_gb,
                'active_tasks_count': len(active_tasks),
                'active_tasks': list(active_tasks)
            }
        except Exception as e:
            logger.error(f"Error getting resource status: {e}")
            return {
                'cpu_used': 0,
                'cpu_total': self.max_cpu,
                'memory_used_gb': 0,
                'memory_total_gb': self.max_memory_gb,
                'active_tasks_count': 0,
                'active_tasks': []
            }


class TaskWorker:
    """单个Worker进程"""
    
    def __init__(self, worker_id: int, resource_manager: IndependentResourceManager):
        self.worker_id = worker_id
        self.resource_manager = resource_manager
        self.logger = logging.getLogger(f'Worker-{worker_id}')
        self.running = True

        # 导入Worker逻辑并设置共享资源管理器
        from toolWorker import process_task, redis_client, TASK_QUEUE_NAME, set_shared_resource_manager
        self.process_task = process_task
        self.redis_client = redis_client
        self.task_queue_name = TASK_QUEUE_NAME

        # 设置共享资源管理器到toolWorker模块
        set_shared_resource_manager(resource_manager)

        self.logger.info(f"Worker {worker_id} initialized with shared resource manager")
    
    def run(self):
        """Worker主循环"""
        self.logger.info(f"Worker {self.worker_id} started")
        
        while self.running:
            try:
                # 检查资源可用性
                if not self._has_available_resources():
                    time.sleep(10)
                    continue
                
                # 从队列获取任务
                task_id = self._get_next_task()
                if not task_id:
                    continue
                
                # 尝试分配资源
                if not self.resource_manager.try_allocate_resources(task_id):
                    # 资源不足，重新入队
                    self.redis_client.lpush(self.task_queue_name, task_id)
                    time.sleep(5)
                    continue
                
                # 处理任务
                try:
                    self.logger.info(f"Processing task {task_id}")
                    self.process_task(task_id)
                    self.logger.info(f"Task {task_id} completed")
                except Exception as e:
                    self.logger.error(f"Error processing task {task_id}: {e}", exc_info=True)
                finally:
                    # 释放资源
                    self.resource_manager.release_resources(task_id)
                    
            except KeyboardInterrupt:
                self.logger.info(f"Worker {self.worker_id} received shutdown signal")
                break
            except Exception as e:
                self.logger.error(f"Unexpected error in worker {self.worker_id}: {e}", exc_info=True)
                time.sleep(10)
        
        self.logger.info(f"Worker {self.worker_id} stopped")
    
    def _has_available_resources(self) -> bool:
        """检查是否有可用资源"""
        status = self.resource_manager.get_resource_status()
        cpu_per_task = int(os.getenv('JOB_CPU_REQUEST', 1))
        memory_per_task = int(os.getenv('JOB_MEMORY_REQUEST_GB', 4))
        
        return (status['cpu_used'] + cpu_per_task <= status['cpu_total'] and
                status['memory_used_gb'] + memory_per_task <= status['memory_total_gb'])
    
    def _get_next_task(self) -> str:
        """从队列获取下一个任务"""
        try:
            result = self.redis_client.blpop(self.task_queue_name, timeout=30)
            if result:
                _, task_id_bytes = result
                return task_id_bytes.decode('utf-8')
        except Exception as e:
            self.logger.error(f"Error getting task from queue: {e}")
        return None
    
    def stop(self):
        """停止Worker"""
        self.running = False


class WorkerManager:
    """Worker管理器主进程"""
    
    def __init__(self):
        self.worker_count = int(os.getenv('WORKER_COUNT', 4))
        self.workers: List[multiprocessing.Process] = []
        self.resource_manager = IndependentResourceManager()
        self.running = True

        # 初始化Redis连接用于队列清理
        import redis
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', 6379))
        redis_db = int(os.getenv('REDIS_DB', 0))
        self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db, decode_responses=True)

        # 初始化队列超时清理器
        timeout_hours = int(os.getenv('QUEUE_TIMEOUT_HOURS', 1))
        self.queue_cleaner = QueueTimeoutCleaner(self.redis_client, timeout_hours * 3600)

        # 设置信号处理（跨平台兼容）
        try:
            signal.signal(signal.SIGINT, self._signal_handler)
            if hasattr(signal, 'SIGTERM'):  # Windows可能不支持SIGTERM
                signal.signal(signal.SIGTERM, self._signal_handler)
        except (AttributeError, OSError) as e:
            logger.warning(f"Signal handling setup failed (platform limitation): {e}")
            # 在Windows上，某些信号可能不可用，但程序仍可正常运行

        logger.info(f"WorkerManager initialized with {self.worker_count} workers")

        # 启动资源状态监控
        self._start_resource_monitor()
    
    def start_workers(self):
        """启动所有Worker进程"""
        logger.info(f"Starting {self.worker_count} worker processes")

        # 启动队列清理器
        self.queue_cleaner.start()

        for i in range(self.worker_count):
            # 使用独立的Python进程启动worker，完全避免序列化问题
            import subprocess
            import sys

            worker_script = os.path.join(os.path.dirname(__file__), 'worker_process.py')

            # Windows特定配置：隐藏控制台窗口
            startupinfo = None
            if sys.platform == 'win32':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE

            # 使用Python 3.11以获得最新的Docker客户端支持
            python_executable = '/usr/bin/python3.11' if os.path.exists('/usr/bin/python3.11') else sys.executable
            worker_process = subprocess.Popen([
                python_executable, worker_script, str(i)
            ], cwd=os.path.dirname(__file__), startupinfo=startupinfo)

            self.workers.append(worker_process)
            logger.info(f"Started worker process {i} with PID {worker_process.pid}")

        logger.info("All worker processes started")

        # 启动监控线程
        self._start_monitoring()

    def _start_monitoring(self):
        """启动监控线程"""
        import threading

        def monitor_loop():
            """监控循环"""
            logger.info("Starting worker monitoring thread")
            while self.running:
                self._check_workers()
                time.sleep(30)  # 每30秒检查一次
            logger.info("Worker monitoring thread stopped")

        monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        monitor_thread.start()
        logger.info("Worker monitoring thread started")

    def _check_workers(self):
        """检查Worker状态"""
        try:
            for i, worker in enumerate(self.workers):
                # 检查subprocess是否还在运行（poll()返回None表示还在运行）
                if worker.poll() is not None:
                    logger.error(f"Worker {i} (PID {worker.pid}) died, restarting...")

                    # 检查并恢复该Worker正在处理的任务
                    self._recover_worker_tasks(i)

                    # 重启Worker
                    import subprocess
                    import sys
                    worker_script = os.path.join(os.path.dirname(__file__), 'worker_process.py')

                    # Windows特定配置：隐藏控制台窗口
                    startupinfo = None
                    if sys.platform == 'win32':
                        startupinfo = subprocess.STARTUPINFO()
                        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                        startupinfo.wShowWindow = subprocess.SW_HIDE

                    new_worker = subprocess.Popen([
                        sys.executable, worker_script, str(i)
                    ], cwd=os.path.dirname(__file__), startupinfo=startupinfo)

                    self.workers[i] = new_worker
                    logger.info(f"Restarted worker {i} with new PID {new_worker.pid}")

            # 记录资源状态
            status = self.resource_manager.get_resource_status()
            logger.debug(f"Resource status: {status}")

        except Exception as e:
            logger.error(f"Error in worker monitoring: {e}", exc_info=True)

    def _recover_worker_tasks(self, worker_id: int):
        """恢复Worker进程死亡时正在处理的任务"""
        try:
            # 获取该Worker分配的任务 - 从Redis获取
            resource_status = self.resource_manager.get_resource_status()
            active_tasks = resource_status.get('active_tasks', [])

            if not active_tasks:
                logger.info(f"No active tasks to recover for worker {worker_id}")
                return

            # 导入数据库相关模块
            from toolWorker import get_database_session, Task

            session = get_database_session()
            try:
                # 查找状态为RUNNING的任务
                running_tasks = session.query(Task).filter(
                    Task.status == 'RUNNING',
                    Task.id.in_(active_tasks)
                ).all()

                for task in running_tasks:
                    logger.warning(f"Recovering task {task.id} from dead worker {worker_id}")

                    # 将任务状态重置为PENDING并重新入队
                    task.status = 'PENDING'
                    task.errorMessage = f"Task recovered from worker {worker_id} failure"

                    # 重新入队
                    from toolWorker import redis_client, TASK_QUEUE_NAME
                    redis_client.lpush(TASK_QUEUE_NAME, task.id)

                    logger.info(f"Task {task.id} has been reset to PENDING and re-queued")

                session.commit()

                # 清理该Worker的资源分配记录
                for task_id in active_tasks:
                    # 检查任务是否仍在活跃列表中
                    if self.resource_manager.redis_client.sismember(f'{self.resource_manager.resource_key}:active_tasks', task_id):
                        self.resource_manager.release_resources(task_id)
                        logger.info(f"Released resources for recovered task {task_id}")

            finally:
                session.close()

        except Exception as e:
            logger.error(f"Error recovering tasks for worker {worker_id}: {e}", exc_info=True)
    
    def shutdown(self):
        """关闭所有Worker进程"""
        logger.info("Shutting down worker manager")
        self.running = False

        # 停止队列清理器
        self.queue_cleaner.stop()

        for i, worker in enumerate(self.workers):
            # 检查subprocess是否还在运行
            if worker.poll() is None:
                logger.info(f"Terminating worker {i} (PID {worker.pid})")
                worker.terminate()
                try:
                    worker.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    logger.warning(f"Force killing worker {i} (PID {worker.pid})")
                    worker.kill()
                    worker.wait()

        logger.info("All workers shut down")
    
    def _signal_handler(self, signum, frame):
        """处理终止信号（跨平台兼容）"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.shutdown()
        sys.exit(0)
    
    def get_status(self) -> Dict[str, Any]:
        """获取管理器状态"""
        alive_workers = sum(1 for w in self.workers if w.poll() is None)
        resource_status = self.resource_manager.get_resource_status()
        
        return {
            'worker_count': self.worker_count,
            'alive_workers': alive_workers,
            'resource_status': resource_status,
            'is_running': self.running
        }

    def _start_resource_monitor(self):
        """启动资源状态监控线程"""
        import threading
        import time

        def monitor_resources():
            while True:
                try:
                    time.sleep(300)  # 每5分钟检查一次
                    self._check_and_fix_resource_leaks()
                except Exception as e:
                    logger.error(f"Resource monitor error: {e}")

        monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        monitor_thread.start()
        logger.info("Resource monitor started")

    def _check_and_fix_resource_leaks(self):
        """检查并修复资源泄漏"""
        try:
            current_resources = self.resource_manager.redis_client.hgetall(self.resource_manager.resource_key)
            active_tasks_count = int(current_resources.get('active_tasks_count', 0))

            # 获取实际的活跃任务数量
            actual_active_tasks = self.resource_manager.redis_client.scard(f'{self.resource_manager.resource_key}:active_tasks')

            if active_tasks_count != actual_active_tasks:
                logger.warning(f"Resource leak detected: recorded={active_tasks_count}, actual={actual_active_tasks}")

                # 修复资源状态
                expected_cpu = actual_active_tasks * self.resource_manager.cpu_per_task
                expected_memory = actual_active_tasks * self.resource_manager.memory_per_task_gb

                self.resource_manager.redis_client.hset(self.resource_manager.resource_key, mapping={
                    'cpu_used': expected_cpu,
                    'memory_used_gb': expected_memory,
                    'active_tasks_count': actual_active_tasks
                })

                logger.info(f"Resource leak fixed: CPU={expected_cpu}, Memory={expected_memory}GB, Tasks={actual_active_tasks}")

        except Exception as e:
            logger.error(f"Error checking resource leaks: {e}")


def main():
    """主函数"""
    logger.info("Starting Worker Manager")
    
    try:
        manager = WorkerManager()
        manager.start_workers()

        # 保持主线程运行
        import signal
        import time

        def signal_handler(signum, frame):
            logger.info("Received shutdown signal")
            manager.shutdown()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        # 主线程保持运行
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        logger.info("Worker Manager stopped")


class FaultToleranceManager:
    """容错处理机制"""

    def __init__(self, worker_id: int):
        self.worker_id = worker_id
        self.max_retries = 3
        self.retry_delay = 60  # 秒
        self.logger = logging.getLogger(f'FaultTolerance-{worker_id}')

    def handle_worker_crash(self, task_id: str, error: Exception):
        """处理Worker崩溃"""
        self.logger.error(f"Worker {self.worker_id} crashed while processing task {task_id}: {error}")

        try:
            # 1. 清理容器
            self._cleanup_task_container(task_id)

            # 2. 清理任务目录
            self._cleanup_task_directory(task_id)

            # 3. 更新任务状态
            self._update_task_status_failed(task_id, str(error))

        except Exception as cleanup_error:
            self.logger.error(f"Failed to cleanup after crash: {cleanup_error}")

    def _cleanup_task_container(self, task_id: str):
        """清理任务容器"""
        try:
            # 使用容器管理器清理容器
            from container_manager import cleanup_container_for_task
            success = cleanup_container_for_task(task_id, "worker_crash")
            if success:
                self.logger.info(f"Container cleaned up for task {task_id} due to worker crash")
            else:
                self.logger.warning(f"Failed to cleanup container for task {task_id}")
        except Exception as e:
            self.logger.error(f"Failed to cleanup container for task {task_id}: {e}")

    def _cleanup_task_directory(self, task_id: str):
        """清理任务目录"""
        try:
            import shutil
            task_dir = f"/tmp/jobs/{task_id}"
            if os.path.exists(task_dir):
                shutil.rmtree(task_dir)
                self.logger.info(f"Cleaned up task directory {task_dir}")
        except Exception as e:
            self.logger.error(f"Failed to cleanup task directory: {e}")

    def _update_task_status_failed(self, task_id: str, error_message: str):
        """更新任务状态为失败"""
        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker

            # 这里需要导入Task模型
            # 注意：任务已进入容器执行，需要计入使用次数

            self.logger.info(f"Updated task {task_id} status to FAILED")
        except Exception as e:
            self.logger.error(f"Failed to update task status: {e}")


class HealthCheckService:
    """健康检查服务"""

    def __init__(self):
        self.check_interval = int(os.getenv('HEALTH_CHECK_INTERVAL_MINUTES', 5)) * 60
        self.logger = logging.getLogger('HealthCheck')
        self.running = False

    def start_health_check(self):
        """启动健康检查"""
        self.running = True
        self.logger.info("Starting health check service")

        while self.running:
            try:
                self._check_system_health()
                self._check_worker_health()
                self._check_resource_usage()
                time.sleep(self.check_interval)
            except Exception as e:
                self.logger.error(f"Health check error: {e}")
                time.sleep(60)  # 出错时等待1分钟

    def stop_health_check(self):
        """停止健康检查"""
        self.running = False
        self.logger.info("Stopped health check service")

    def _check_system_health(self):
        """检查系统健康状态"""
        try:
            # 检查磁盘空间
            import shutil
            disk_usage = shutil.disk_usage("/tmp")
            free_space_gb = disk_usage.free / (1024**3)

            if free_space_gb < 5:  # 少于5GB
                self.logger.warning(f"Low disk space: {free_space_gb:.2f}GB remaining")

            # 检查内存使用
            try:
                import psutil
                memory = psutil.virtual_memory()
                if memory.percent > 90:
                    self.logger.warning(f"High memory usage: {memory.percent}%")
            except ImportError:
                self.logger.debug("psutil not available for memory monitoring")

        except Exception as e:
            self.logger.error(f"System health check failed: {e}")

    def _check_worker_health(self):
        """检查Worker健康状态"""
        # 这个方法可以检查Worker进程状态
        self.logger.debug("Worker health check completed")

    def _check_resource_usage(self):
        """检查资源使用情况"""
        # 这个方法可以检查CPU和内存使用情况
        self.logger.debug("Resource usage check completed")


if __name__ == '__main__':
    main()
