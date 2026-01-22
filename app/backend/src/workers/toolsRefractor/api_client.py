import os
import time
import json
import logging
import functools
import requests
from datetime import datetime, timezone
from .core import redis_client

STATUS_SYNC_PENDING_SET = 'task_status_sync_pending'
STATUS_SYNC_PAYLOAD_HASH = 'task_status_sync_payload'

def retry_on_network_error(max_retries=3, base_delay=1.0):
    """
    重试装饰器：在网络错误或超时时重试API调用

    Args:
        max_retries: 最大重试次数（默认3次）
        base_delay: 基础延迟秒数（使用指数退避：1s, 2s, 4s）
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except requests.exceptions.RequestException as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logging.warning(f"API call failed (attempt {attempt + 1}/{max_retries}): {str(e)}. Retrying in {delay}s...")
                        time.sleep(delay)
                    else:
                        logging.error(f"API call failed after {max_retries} attempts: {str(e)}")
                except Exception as e:
                    # 非网络相关的错误不重试，直接抛出
                    raise e

            # 所有重试都失败，抛出最后的异常
            raise last_exception
        return wrapper
    return decorator

def update_task_status_via_api(task_id, status, additional_data=None):
    """通过内部API更新任务状态，确保WebSocket通知和前端状态同步"""
    try:
        # 强制要求环境变量，不使用默认值
        internal_api_key = os.environ.get('INTERNAL_API_KEY')
        if not internal_api_key:
            raise ValueError("INTERNAL_API_KEY environment variable is required for secure operation")

        api_base = os.environ.get('API_BASE_URL', 'http://localhost:8080')
        url = f"{api_base}/api/v1/tasks/internal/{task_id}/status"

        payload = {
            'status': status,
            'updatedAt': datetime.now(timezone.utc).isoformat()
        }

        if additional_data:
            payload.update(additional_data)

        # 使用强制的内部API密钥进行认证
        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': internal_api_key
        }

        response = requests.put(url, json=payload, headers=headers, timeout=10)

        if response.status_code == 200:
            logging.info(f"Successfully updated task {task_id} status to {status} via API")
        else:
            logging.error(f"Failed to update task {task_id} status via API: {response.status_code} {response.text}")

    except ValueError as ve:
        # 专门处理环境变量缺失错误
        logging.error(f"Configuration error: {str(ve)}")
        raise
    except Exception as e:
        logging.error(f"Error updating task {task_id} status via API: {str(e)}")
        # 如果API调用失败，至少记录到日志中
        logging.error(f"Task {task_id} status should be: {status}, additional_data: {additional_data}")

def _update_task_status_via_api_internal(task_id, status, additional_data=None):
    """
    内部API调用函数，会抛出异常以支持重试机制

    这个函数与update_task_status_via_api的区别：
    - 不捕获异常，让装饰器处理重试
    - 只用于update_task_status_via_api_with_retry内部
    """
    # 强制要求环境变量
    internal_api_key = os.environ.get('INTERNAL_API_KEY')
    if not internal_api_key:
        raise ValueError("INTERNAL_API_KEY environment variable is required for secure operation")

    api_base = os.environ.get('API_BASE_URL', 'http://localhost:8080')
    url = f"{api_base}/api/v1/tasks/internal/{task_id}/status"

    payload = {
        'status': status,
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }

    if additional_data:
        payload.update(additional_data)

    headers = {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': internal_api_key
    }

    response = requests.put(url, json=payload, headers=headers, timeout=10)

    if response.status_code == 200:
        logging.info(f"Successfully updated task {task_id} status to {status} via API (with retry)")
    else:
        # 对于非200状态码，抛出异常以触发重试
        raise requests.exceptions.HTTPError(f"API returned status {response.status_code}: {response.text}")

def _enqueue_status_sync(task_id, status, additional_data=None):
    """API更新失败时，将任务状态写入Redis等待后端补偿推送"""
    try:
        payload = {'status': status}
        if additional_data:
            payload.update(additional_data)
        redis_client.sadd(STATUS_SYNC_PENDING_SET, task_id)
        redis_client.hset(STATUS_SYNC_PAYLOAD_HASH, task_id, json.dumps(payload))
        logging.warning(f"Queued task status sync for {task_id} (status={status})")
    except Exception as e:
        logging.error(f"Failed to enqueue task status sync for {task_id}: {str(e)}")

# 应用重试装饰器创建带重试的API调用函数
_update_task_status_via_api_with_retry = retry_on_network_error(max_retries=3, base_delay=1.0)(_update_task_status_via_api_internal)

def update_task_status_via_api_with_retry(task_id, status, additional_data=None):
    """带重试的API更新，失败时写入补偿队列"""
    try:
        return _update_task_status_via_api_with_retry(task_id, status, additional_data)
    except Exception as e:
        logging.error(f"Failed to update task {task_id} status via API after retries: {str(e)}")
        _enqueue_status_sync(task_id, status, additional_data)
        raise

__all__ = [
    'retry_on_network_error',
    'update_task_status_via_api',
    '_update_task_status_via_api_internal',
    'update_task_status_via_api_with_retry',
]
