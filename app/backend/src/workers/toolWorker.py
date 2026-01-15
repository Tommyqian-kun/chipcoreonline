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
