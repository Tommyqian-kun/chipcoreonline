#!/usr/bin/env python3
"""
Worker主入口文件
负责初始化和启动Worker循环，同时作为模块接口导出所有公共符号
"""

# === 从子模块重导出所有公共符号 ===
import os
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

    # 处理中的队列与时间戳
    PROCESSING_QUEUE_NAME = f"{TASK_QUEUE_NAME}_processing"
    PROCESSING_HASH_KEY = f"{TASK_QUEUE_NAME}_processing_ts"
    PROCESSING_STALE_SECONDS = int(os.getenv('TASK_PROCESSING_STALE_SECONDS', '1800'))

    def requeue_stale_processing_tasks():
        """将处理队列中超时未完成的任务回补到主队列"""
        try:
            now_ts = int(time.time())
            processing_entries = redis_client.hgetall(PROCESSING_HASH_KEY) or {}
            if not processing_entries:
                return

            for task_id_bytes, ts_bytes in processing_entries.items():
                try:
                    task_id = task_id_bytes.decode('utf-8')
                    started_ts = int(ts_bytes.decode('utf-8'))
                    if now_ts - started_ts >= PROCESSING_STALE_SECONDS:
                        # 仅在任务仍可执行时回补，避免重复执行已完成任务
                        try:
                            session = Session()
                            task = session.query(Task).filter_by(id=task_id).first()
                            if not task:
                                redis_client.hdel(PROCESSING_HASH_KEY, task_id)
                                continue
                            if task.status not in ('PENDING', 'RUNNING'):
                                redis_client.hdel(PROCESSING_HASH_KEY, task_id)
                                continue
                        except Exception as status_error:
                            logging.error(f"Failed to validate task status before requeue: {status_error}")
                            continue
                        finally:
                            try:
                                session.close()
                            except Exception:
                                pass
                        # 超时任务回补到主队列
                        redis_client.lrem(PROCESSING_QUEUE_NAME, 0, task_id)
                        redis_client.rpush(TASK_QUEUE_NAME, task_id)
                        redis_client.hdel(PROCESSING_HASH_KEY, task_id)
                        logging.warning(f"Re-queued stale task from processing: {task_id}")
                except Exception as inner_error:
                    logging.error(f"Failed to requeue stale task entry: {inner_error}")
        except Exception as error:
            logging.error(f"Failed to requeue stale processing tasks: {error}")

    # 孤儿容器清理计数器（每10次空闲循环执行一次，约5分钟）
    orphan_cleanup_counter = 0
    ORPHAN_CLEANUP_INTERVAL = 10

    # 启动时尝试回补处理中的任务
    requeue_stale_processing_tasks()

    # 简单的Worker循环，直接监听Redis队列
    while True:
        try:
            # 资源检查（避免超额并发）
            rm = get_resource_manager()
            if hasattr(rm, 'get_resource_status'):
                status = rm.get_resource_status()
                if (status['cpu_used'] >= status['cpu_total'] or
                    status['memory_used_gb'] >= status['memory_total_gb']):
                    logging.warning("Not enough resources to pick a new task. Waiting...")
                    time.sleep(5)
                    continue
            else:
                if rm['cpu_used'] >= ECS_TOTAL_CPU or rm['memory_used_gb'] >= ECS_TOTAL_MEMORY_GB:
                    logging.warning("Not enough resources to pick a new task. Waiting...")
                    time.sleep(5)
                    continue

            logging.info("Waiting for tasks...")
            logging.info(f"Waiting for tasks from queue: {TASK_QUEUE_NAME}")
            task_id_bytes = redis_client.brpoplpush(TASK_QUEUE_NAME, PROCESSING_QUEUE_NAME, timeout=30)

            if task_id_bytes:
                task_id = task_id_bytes.decode('utf-8')
                redis_client.hset(PROCESSING_HASH_KEY, task_id, int(time.time()))

                remaining_queue_length = redis_client.llen(TASK_QUEUE_NAME)
                logging.info(f"Picked up task: {task_id}, remaining in queue: {remaining_queue_length}")

                active_tasks = redis_client.scard('active_task_ids') if redis_client.exists('active_task_ids') else 0
                logging.info(f"Queue status - Active tasks: {active_tasks}, Queue length: {remaining_queue_length}")

                try:
                    process_task(task_id)
                    logging.info(f"Task {task_id} completed successfully")
                except Exception as e:
                    logging.error(f"Error processing task {task_id}: {e}", exc_info=True)
                finally:
                    # 任务处理完成后从处理队列与活跃集合中移除
                    redis_client.lrem(PROCESSING_QUEUE_NAME, 0, task_id)
                    redis_client.hdel(PROCESSING_HASH_KEY, task_id)
                    redis_client.srem('active_task_ids', task_id)
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

                    # 顺带回补超时的处理中任务
                    requeue_stale_processing_tasks()

                logging.info("No tasks in queue, continuing to wait...")

        except KeyboardInterrupt:
            logging.info("Worker stopped by user")
            break
        except Exception as e:
            logging.error(f"Worker error: {e}", exc_info=True)
            time.sleep(5)
