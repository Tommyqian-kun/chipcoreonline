# worker.py
import os
import json
import time
import redis
import docker
import shutil
import logging
import uuid
import threading
import requests
import platform
import functools
from typing import Dict, Any, Optional, List
from sqlalchemy import create_engine, Column, String, Text, DateTime, Enum, JSON, Boolean, Integer
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone
from dotenv import load_dotenv
from container_manager import container_manager, cleanup_container_for_task

# --- Cross-Platform Path Utilities ---
def normalize_docker_path(host_path: str) -> str:
    """
    规范化Docker挂载路径，确保Windows和Linux兼容性
    """
    # 规范化路径分隔符
    normalized = os.path.normpath(host_path)

    # 在Windows上，确保使用正确的路径格式
    if platform.system() == 'Windows':
        # 将反斜杠转换为正斜杠（Docker要求）
        normalized = normalized.replace('\\', '/')

        # 处理Windows驱动器路径 (C: -> /c)
        if len(normalized) >= 2 and normalized[1] == ':':
            drive = normalized[0].lower()
            path_part = normalized[2:] if len(normalized) > 2 else ''
            normalized = f'/{drive}{path_part}'

    return normalized

def prepare_container_volumes(task_id: str, base_jobs_dir: str) -> Dict[str, Dict[str, str]]:
    """
    准备容器挂载卷配置，确保跨平台兼容性
    """
    # 构建宿主机路径
    host_paths = {
        'input': os.path.join(base_jobs_dir, task_id, 'input'),
        'output': os.path.join(base_jobs_dir, task_id, 'output'),
        'logs': os.path.join(base_jobs_dir, task_id, 'logs'),
        'work': os.path.join(base_jobs_dir, task_id, 'work')
    }

    # 规范化路径并创建挂载配置
    volumes = {}
    for mount_type, host_path in host_paths.items():
        # 确保路径存在
        os.makedirs(host_path, exist_ok=True)

        # 规范化路径
        normalized_path = normalize_docker_path(host_path)

        # 设置挂载配置
        container_path = f'/data/{mount_type}'
        mode = 'ro' if mount_type == 'input' else 'rw'

        volumes[normalized_path] = {
            'bind': container_path,
            'mode': mode
        }

    return volumes

# --- Load Environment Variables ---
# Load from backend/.env and .env.local (with .env.local taking precedence)
backend_dir = os.path.join(os.path.dirname(__file__), '..', '..')
env_path = os.path.join(backend_dir, '.env')
env_local_path = os.path.join(backend_dir, '.env.local')

# Load .env first, then .env.local (which will override .env values)
load_dotenv(dotenv_path=env_path)
if os.path.exists(env_local_path):
    load_dotenv(dotenv_path=env_local_path, override=True)
    print(f"[OK] Loaded environment from {env_local_path}")
else:
    print(f"[WARN] .env.local not found at {env_local_path}")

print(f"[OK] Loaded environment from {env_path}")
print(f"[CONFIG] Deployment mode: {os.environ.get('DEPLOYMENT_MODE', 'not set')}")
print(f"[CONFIG] Database URL: {os.environ.get('DATABASE_URL', 'not set')[:50]}...")
print(f"[CONFIG] Redis URL: {os.environ.get('REDIS_URL', 'not set')}")

# --- SDK Imports (conditional based on deployment mode) ---
# Only import Aliyun SDKs if not in ECS Only mode
deployment_mode = os.environ.get('DEPLOYMENT_MODE', 'ecs_only')
if deployment_mode != 'ecs_only':
    try:
        from aliyunsdkcore.client import AcsClient
        from aliyunsdksts.request.v20150401 import AssumeRoleRequest
        from aliyunsdkcr.request.v20170324 import GetAuthorizationTokenRequest
        import oss2
        print("[OK] Aliyun SDKs imported for ECS+OSS+ACR mode")
    except ImportError as e:
        print(f"[WARN] Aliyun SDKs not available: {e}")
        print("   This is expected in ECS Only mode")
else:
    print("[OK] ECS Only mode - Aliyun SDKs not required")

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Deployment Mode Detection ---
def get_deployment_mode():
    """获取部署模式"""
    return os.environ.get('DEPLOYMENT_MODE', 'ecs_only')

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

# 应用重试装饰器创建带重试的API调用函数
update_task_status_via_api_with_retry = retry_on_network_error(max_retries=3, base_delay=1.0)(_update_task_status_via_api_internal)

def is_ecs_only_mode():
    """检查是否为ECS Only模式"""
    return get_deployment_mode() == 'ecs_only'

def is_ecs_oss_acr_mode():
    """检查是否为ECS+OSS+ACR模式"""
    return get_deployment_mode() == 'ecs_oss_acr'

# --- 任务日志记录类 ---
class TaskLogger:
    def __init__(self, task_id, user_id):
        self.task_id = task_id
        self.user_id = user_id
        self.logs = []
        self.start_time = time.time()
        self.step_times = {}
        self.performance_metrics = {}

        # 设置日志文件路径 - 使用专用的任务日志目录
        self.logs_dir = os.environ.get('TASK_LOGS_DIR', os.path.join(os.getcwd(), 'logs'))
        self.task_log_dir = os.path.join(self.logs_dir, task_id)

        # 确保日志目录存在
        try:
            os.makedirs(self.task_log_dir, exist_ok=True)
        except Exception as e:
            logging.error(f"Failed to create log directory {self.task_log_dir}: {e}")

        # 创建日志文件
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        self.log_file_path = os.path.join(self.task_log_dir, f'worker_{timestamp}.log')

        self.log('INFO', 'TASK', 'Enhanced task logger initialized', {
            'taskId': task_id,
            'userId': user_id,
            'startTime': datetime.now(timezone.utc).isoformat(),
            'logFile': self.log_file_path
        })

    def log(self, level, category, message, details=None):
        elapsed_time = time.time() - self.start_time
        entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': level,
            'category': category,
            'message': message,
            'details': details,
            'taskId': self.task_id,
            'userId': self.user_id,
            'elapsedSeconds': round(elapsed_time, 3)
        }
        self.logs.append(entry)

        # 输出到控制台（增强格式）
        log_message = f"[{entry['timestamp']}] [{level}] [TASK-{self.task_id}] [{category}] {message}"
        if details:
            log_message += f" | Details: {json.dumps(details, default=str)}"

        if level == 'ERROR':
            logging.error(log_message)
        elif level == 'WARN':
            logging.warning(log_message)
        else:
            logging.info(log_message)

        # 写入日志文件
        try:
            with open(self.log_file_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, default=str, ensure_ascii=False) + '\n')
        except Exception as e:
            logging.error(f"Failed to write to log file {self.log_file_path}: {e}")

    def log_status_change(self, from_status, to_status, reason=None):
        self.log('INFO', 'TASK', f'Status changed: {from_status} -> {to_status}', {
            'fromStatus': from_status, 'toStatus': to_status, 'reason': reason
        })

    def log_database_operation(self, operation, table, success, details=None):
        level = 'INFO' if success else 'ERROR'
        self.log(level, 'DATABASE', f'{operation} on {table}: {"SUCCESS" if success else "FAILED"}', details)

    def log_oss_operation(self, operation, path, success, details=None):
        level = 'INFO' if success else 'ERROR'
        self.log(level, 'OSS', f'{operation} {path}: {"SUCCESS" if success else "FAILED"}', details)

    def log_docker_operation(self, operation, container_name, success, details=None):
        level = 'INFO' if success else 'ERROR'
        self.log(level, 'DOCKER', f'{operation} {container_name}: {"SUCCESS" if success else "FAILED"}', details)

    def log_error(self, category, message, error):
        self.log('ERROR', category, message, {
            'error': str(error),
            'type': type(error).__name__
        })

    def log_step_start(self, step, description, details=None):
        """记录步骤开始"""
        self.step_times[step] = time.time()
        self.log('INFO', 'STEP', f'Starting: {description}', {
            'step': step,
            'action': 'START',
            **(details or {})
        })

        # 更新数据库进度
        self.update_task_progress(step)

    def log_step_success(self, step, description, details=None):
        """记录步骤成功"""
        duration = None
        if step in self.step_times:
            duration = time.time() - self.step_times[step]
            self.record_performance_metric(step, duration)

        step_details = {
            'step': step,
            'action': 'SUCCESS',
            'durationSeconds': round(duration, 3) if duration else None,
            **(details or {})
        }

        self.log('INFO', 'STEP', f'Completed: {description}', step_details)

    def log_step_failure(self, step, description, error=None, details=None):
        """记录步骤失败"""
        duration = None
        if step in self.step_times:
            duration = time.time() - self.step_times[step]

        error_details = {
            'step': step,
            'action': 'FAILURE',
            'durationSeconds': round(duration, 3) if duration else None,
            **(details or {})
        }

        if error:
            error_details.update({
                'errorType': type(error).__name__,
                'errorMessage': str(error),
                'errorDetails': getattr(error, '__dict__', {})
            })

        self.log('ERROR', 'STEP', f'Failed: {description}', error_details)

    def log_file_operation(self, operation, file_path, success=True, details=None):
        """记录文件操作"""
        level = 'INFO' if success else 'ERROR'
        self.log(level, 'FILE', f'File operation: {operation}', {
            'operation': operation,
            'filePath': file_path,
            'success': success,
            **(details or {})
        })

    def log_container_operation(self, operation, container_info, success=True):
        """记录容器操作"""
        level = 'INFO' if success else 'ERROR'
        self.log(level, 'CONTAINER', f'Container operation: {operation}', {
            'operation': operation,
            'containerInfo': container_info,
            'success': success
        })

    def update_task_progress(self, current_step, shared_session=None):
        """更新任务进度到数据库"""
        try:
            # 步骤到进度的映射 - 与前端保持完全一致
            step_progress_mapping = {
                # Worker处理阶段 (30-50%)
                'WORKER_ASSIGNED': 30,              # a8: Worker获取任务ID
                'CONTAINER_IMAGE_LOADING': 35,      # a9: 工具容器加载
                'JOBS_DIRECTORY_CREATION': 45,      # a10: 创建jobs目录
                'TEMP_TO_JOBS_COPY': 47,           # a10: 复制数据文件
                'CONTAINER_EXECUTION': 50,          # a11: 容器启动执行

                # 执行阶段 (50-90%)
                'RUNNING': 50,                      # a11: 容器启动执行工具命令
                'RESULT_PACKAGING': 85,             # a12: 生成结果并打包
                'GENERATING_RESULTS': 85,           # a12: 生成结果并打包

                # 清理阶段 (90-100%)
                'WORK_DIRECTORY_CLEANUP': 92,       # a13: 清理jobs/{taskId}/work目录
                'CLEANING_WORKSPACE': 92,           # a13: 清理jobs/{taskId}/work目录
                'TEMP_CLEANUP_SCHEDULE': 95,        # a14: 清理temp/{taskId}目录和容器
                'CLEANING_TEMP': 95,                # a14: 清理temp/{taskId}目录
                'COMPLETED': 100,                   # 任务完成
            }

            progress = step_progress_mapping.get(current_step, 0)

            # 使用共享会话或创建新会话
            session = shared_session
            should_close_session = False

            if not session:
                session = self.get_db_session()
                should_close_session = True

            if session:
                task = session.query(Task).filter(Task.id == self.task_id).first()
                if task:
                    task.progress = progress
                    task.currentStep = current_step
                    task.stepStartedAt = datetime.now(timezone.utc)
                    task.updatedAt = datetime.now(timezone.utc)

                    # 立即提交进度更新，确保不被后续事务回滚
                    session.commit()
                    session.flush()  # 确保立即写入数据库

                    self.log('INFO', 'PROGRESS', f'Updated task progress: {progress}%', {
                        'currentStep': current_step,
                        'progress': progress,
                        'taskId': self.task_id
                    })

                    # 通过API发送WebSocket通知给前端（使用带重试的版本）
                    try:
                        update_task_status_via_api_with_retry(self.task_id, task.status, {
                            'progress': progress,
                            'currentStep': current_step
                        })
                    except Exception as api_error:
                        self.log('WARNING', 'PROGRESS', f'Failed to send progress update via API: {str(api_error)}', {
                            'currentStep': current_step,
                            'progress': progress,
                            'taskId': self.task_id
                        })

                if should_close_session:
                    session.close()

        except Exception as e:
            self.log('ERROR', 'PROGRESS', f'Failed to update task progress: {str(e)}', {
                'currentStep': current_step,
                'taskId': self.task_id,
                'error': str(e)
            })

    def get_db_session(self):
        """获取数据库会话"""
        try:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker

            database_url = os.getenv('DATABASE_URL')
            if not database_url:
                return None

            engine = create_engine(database_url)
            Session = sessionmaker(bind=engine)
            return Session()
        except Exception as e:
            self.log('ERROR', 'DATABASE', f'Failed to create database session: {str(e)}')
            return None

    def log_resource_usage(self, step, resources):
        """记录资源使用情况"""
        self.log('INFO', 'RESOURCES', f'Resource usage for {step}', {
            'step': step,
            'resources': resources
        })

    def record_performance_metric(self, metric, value):
        """记录性能指标"""
        self.performance_metrics[metric] = {
            'value': round(value, 3),
            'timestamp': time.time(),
            'unit': 'seconds'
        }

        self.log('INFO', 'PERFORMANCE', f'Performance metric: {metric}', {
            'metric': metric,
            'value': round(value, 3),
            'unit': 'seconds'
        })

    def log_task_completion(self, status, summary=None):
        """记录任务完成总结"""
        total_duration = time.time() - self.start_time

        completion_data = {
            'status': status,
            'totalDurationSeconds': round(total_duration, 3),
            'performanceMetrics': self.performance_metrics,
            'stepCount': len(self.step_times),
            'summary': summary or {}
        }

        self.log('INFO', 'COMPLETION', f'Task completed with status: {status}', completion_data)

    def get_execution_summary(self):
        """获取任务执行摘要"""
        return {
            'taskId': self.task_id,
            'userId': self.user_id,
            'totalDurationSeconds': round(time.time() - self.start_time, 3),
            'stepCount': len(self.step_times),
            'performanceMetrics': self.performance_metrics,
            'logCount': len(self.logs),
            'errorCount': len([log for log in self.logs if log['level'] == 'ERROR']),
            'warningCount': len([log for log in self.logs if log['level'] == 'WARN'])
        }

    def generate_report(self):
        errors = [log for log in self.logs if log['level'] == 'ERROR']
        warnings = [log for log in self.logs if log['level'] == 'WARN']

        report = f"""
Task Execution Log Report
========================
Task ID: {self.task_id}
User ID: {self.user_id}
Generated: {datetime.now(timezone.utc).isoformat()}
Total Log Entries: {len(self.logs)}

Summary:
- Errors: {len(errors)}
- Warnings: {len(warnings)}
- Info: {len([log for log in self.logs if log['level'] == 'INFO'])}

"""

        if errors:
            report += "\nERRORS:\n"
            for i, log in enumerate(errors, 1):
                report += f"{i}. [{log['timestamp']}] {log['message']}\n"
                if log['details']:
                    report += f"   Details: {json.dumps(log['details'], indent=2)}\n"

        if warnings:
            report += "\nWARNINGS:\n"
            for i, log in enumerate(warnings, 1):
                report += f"{i}. [{log['timestamp']}] {log['message']}\n"

        report += "\nDETAILED LOG:\n"
        for log in self.logs:
            report += f"[{log['timestamp']}] [{log['level']}] [{log['category']}] {log['message']}\n"

        return report

    def upload_to_oss(self, sts_ak, sts_sk, sts_token):
        try:
            log_content = self.generate_report()
            json_content = json.dumps({
                'taskId': self.task_id,
                'userId': self.user_id,
                'generatedAt': datetime.now(timezone.utc).isoformat(),
                'logs': self.logs
            }, indent=2)

            log_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_LOGS)

            # 上传文本日志
            readable_log_path = f"{self.user_id}/{self.task_id}/logs/task_execution.log"
            log_bucket.put_object(readable_log_path, log_content)

            # 上传JSON日志
            json_log_path = f"{self.user_id}/{self.task_id}/logs/task_execution.json"
            log_bucket.put_object(json_log_path, json_content)

            self.log('INFO', 'OSS', f'Uploaded logs to OSS: {readable_log_path}')
            return readable_log_path
        except Exception as e:
            self.log_error('OSS', 'Failed to upload logs to OSS', e)
            return None

# --- Configuration ---
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost:5432/mydb')
TASK_QUEUE_NAME = os.getenv('TASK_QUEUE_NAME', 'task_queue')
ECS_TOTAL_CPU = int(os.getenv('ECS_TOTAL_CPU', 8))
ECS_TOTAL_MEMORY_GB = int(os.getenv('ECS_TOTAL_MEMORY_GB', 64))
JOB_CPU_REQUEST = int(os.getenv('JOB_CPU_REQUEST', 2))
JOB_MEMORY_REQUEST_GB = int(os.getenv('JOB_MEMORY_REQUEST_GB', 16))

OSS_REGION = os.getenv('OSS_REGION')
OSS_BUCKET_USER_INPUT = os.getenv('OSS_BUCKET_USER_INPUT')
OSS_BUCKET_JOB_RESULTS = os.getenv('OSS_BUCKET_JOB_RESULTS')
OSS_BUCKET_JOB_LOGS = os.getenv('OSS_BUCKET_JOB_LOGS')

ALIYUN_RAM_ROLE_ARN = os.getenv('ALIYUN_RAM_ROLE_ARN')
ALIYUN_STS_REGION = os.getenv('ALIYUN_STS_REGION')
# Credentials for the worker itself to call STS and other services
ALIYUN_ACCESS_KEY_ID = os.getenv('ALIYUN_ACCESS_KEY_ID')
ALIYUN_ACCESS_KEY_SECRET = os.getenv('ALIYUN_ACCESS_KEY_SECRET')
ACR_REGION = os.getenv('ACR_REGION', os.getenv('OSS_REGION')) # Default ACR region to OSS region

# --- Redis连接池管理 ---
class RedisConnectionPool:
    """Redis连接池管理器"""

    def __init__(self, redis_url: str, max_connections: int = 10):
        self.redis_url = redis_url
        self.max_connections = max_connections
        self._pool = None
        self._client = None

    def get_pool(self):
        """获取Redis连接池"""
        if self._pool is None:
            self._pool = redis.ConnectionPool.from_url(
                self.redis_url,
                max_connections=self.max_connections,
                retry_on_timeout=True,
                socket_keepalive=True,
                socket_keepalive_options={},
                health_check_interval=30
            )
        return self._pool

    def get_client(self):
        """获取Redis客户端"""
        if self._client is None:
            self._client = redis.Redis(
                connection_pool=self.get_pool(),
                decode_responses=False
            )
        return self._client

    def close(self):
        """关闭连接池"""
        if self._client:
            self._client.close()
            self._client = None
        if self._pool:
            self._pool.disconnect()
            self._pool = None

# 全局Redis连接池实例
_redis_pool = RedisConnectionPool(REDIS_URL)

def get_redis_client():
    """获取Redis客户端实例"""
    return _redis_pool.get_client()

# --- Clients Initialization ---
try:
    # 使用连接池初始化Redis客户端
    redis_client = get_redis_client()
    docker_client = docker.from_env()

    # Only initialize Aliyun client if not in ECS Only mode
    if deployment_mode != 'ecs_only':
        core_client = AcsClient(ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_STS_REGION)
        logging.info("Redis (with connection pool), Docker, and Aliyun clients initialized successfully.")
    else:
        core_client = None
        logging.info("Redis (with connection pool) and Docker clients initialized successfully (ECS Only mode).")
except Exception as e:
    logging.critical(f"Failed to initialize clients: {e}")
    exit(1)

# --- Database Model Setup (SQLAlchemy) ---
Base = declarative_base()
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

class Task(Base):
    __tablename__ = 'Task'
    id = Column(String, primary_key=True)
    status = Column(Enum('DRAFT', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT', name='TaskStatus'), nullable=False)
    createdAt = Column('createdAt', DateTime, default=lambda: datetime.now(timezone.utc))
    startedAt = Column('startedAt', DateTime)
    containerStartedAt = Column('containerStartedAt', DateTime)  # 容器真正开始执行的时间
    finishedAt = Column('finishedAt', DateTime)
    inputFile = Column('inputFile', String)
    outputFile = Column('outputFile', String)
    logFile = Column('logFile', String)
    deploymentMode = Column('deploymentMode', String, default='ecs_only')  # 新增部署模式字段
    localStoragePath = Column('localStoragePath', String)  # 新增本地存储路径字段
    parameters = Column(JSON)
    errorMessage = Column('errorMessage', Text)
    workerId = Column('workerId', String)
    retryCount = Column('retryCount', Integer, default=0)  # 当前重试次数
    maxRetries = Column('maxRetries', Integer, default=3)  # 最大重试次数
    originalTaskId = Column('originalTaskId', String)  # 原始任务ID（重试任务）
    ecsInstanceId = Column('ecsInstanceId', String)
    userId = Column('userId', String, nullable=False)
    toolId = Column('toolId', String, nullable=False)
    progress = Column('progress', Integer, default=0)  # 任务进度百分比 (0-100)
    currentStep = Column('currentStep', String)  # 当前执行步骤
    stepStartedAt = Column('stepStartedAt', DateTime)  # 当前步骤开始时间
    downloadTimeRemaining = Column('downloadTimeRemaining', Integer)  # ECS Only模式下载倒计时（秒）
    updatedAt = Column('updatedAt', DateTime)  # 最后更新时间

class Tool(Base):
    __tablename__ = 'Tool'
    id = Column('id', String, primary_key=True)
    name = Column('name', String, nullable=False)
    description = Column('description', String, nullable=False)
    toolType = Column('toolType', String, nullable=False)
    inputSchema = Column('inputSchema', JSON, nullable=False)
    dockerImage = Column('dockerImage', String, nullable=False)
    version = Column('version', String, nullable=False)
    configTemplate = Column('configTemplate', JSON, nullable=True)
    isPublic = Column('isPublic', Boolean, nullable=False, default=True)
    createdAt = Column('createdAt', DateTime, nullable=False)
    updatedAt = Column('updatedAt', DateTime, nullable=False)

# --- 统一任务初始化函数 ---

def initialize_task_context(task, task_logger, session):
    """统一的任务初始化，避免重复代码"""
    # 获取任务参数
    params = task.parameters or {}

    # 兼容前端的modName和后端的moduleName
    module_name = params.get('moduleName') or params.get('modName')
    if not module_name:
        # 使用任务ID的前8位作为默认模块名
        module_name = f'module_{task.id[:8]}'
        task_logger.log('WARNING', 'INIT', f'No module name provided, using default: {module_name}')

    # 从数据库获取工具类型
    tool_info = session.query(Tool).filter_by(id=task.toolId).first()
    if tool_info and hasattr(tool_info, 'toolType'):
        tool_type = tool_info.toolType
        task_logger.log('INFO', 'INIT', f'Tool type from database: {tool_type}')
    else:
        # 默认值使用'sdcgen'，单页面和多页面都使用sdcgen
        tool_type = params.get('toolType', 'sdcgen')
        task_logger.log('WARNING', 'INIT', f'Tool type from params: {tool_type}')

    task_logger.log('INFO', 'INIT', f'Using tool type: {tool_type}')

    # 初始化ECS本地文件管理器
    file_manager = EcsLocalFileManager(task.id, task.userId)

    # 验证工具类型是否支持
    if not file_manager.is_tool_type_supported(tool_type):
        raise Exception(f"Tool type '{tool_type}' is not supported")

    # 获取工具信息
    tool = session.query(Tool).filter_by(id=task.toolId).first()
    if not tool:
        raise Exception(f"Tool {task.toolId} not found")

    task_logger.log('INFO', 'INIT', f'Task context initialized for tool type: {tool_type}')

    return module_name, tool_type, file_manager, tool, params

# --- ECS本地文件管理类 ---
class EcsLocalFileManager:
    def __init__(self, task_id, user_id):
        self.task_id = task_id
        self.user_id = user_id
        self.base_path = os.environ.get('ECS_JOBS_DIR', '/data/chipcore/jobs')
        self.task_dir = os.path.join(self.base_path, task_id)

        # 支持的工具类型配置（可扩展）
        # 支持数据库中的工具类型：'sdc', 'upf' 以及兼容的 'sdcgen', 'upfgen'
        self.supported_tool_types = {
            'sdc': {
                'directories': ['inputs', 'outputs', 'logs', 'rpts', 'json', 'intg'],
                'env_vars': {
                    'SDC_MODE': 'generate',
                    'SDC_VERSION': '1.0',
                    'JOB_INPUT_DIR': '/data/input',
                    'JOB_OUTPUT_DIR': '/data/output',
                    'JOB_LOG_DIR': '/data/logs'
                }
            },
            'sdcgen': {
                'directories': ['inputs', 'outputs', 'logs', 'rpts', 'json', 'intg'],
                'env_vars': {
                    'SDC_MODE': 'generate',
                    'SDC_VERSION': '1.0',
                    'JOB_INPUT_DIR': '/data/input',
                    'JOB_OUTPUT_DIR': '/data/output',
                    'JOB_LOG_DIR': '/data/logs'
                }
            },
            'upf': {
                'directories': ['inputs', 'outputs', 'logs', 'rpts', 'json', 'intg'],
                'env_vars': {
                    'UPF_MODE': 'generate',
                    'UPF_VERSION': '1.0',
                    'JOB_INPUT_DIR': '/data/input',
                    'JOB_OUTPUT_DIR': '/data/output',
                    'JOB_LOG_DIR': '/data/logs'
                }
            },
            'upfgen': {
                'directories': ['inputs', 'outputs', 'logs', 'rpts', 'json', 'intg'],
                'env_vars': {
                    'UPF_MODE': 'generate',
                    'UPF_VERSION': '1.0',
                    'JOB_INPUT_DIR': '/data/input',
                    'JOB_OUTPUT_DIR': '/data/output',
                    'JOB_LOG_DIR': '/data/logs'
                }
            },
            'clkgen': {
                'directories': ['inputs', 'outputs', 'logs', 'rpts'],
                'env_vars': {'CLKGEN_MODE': 'generate', 'CLKGEN_VERSION': '1.0'}
            },
            'memgen': {
                'directories': ['inputs', 'outputs', 'logs'],
                'env_vars': {'MEMORY_MODE': 'generate', 'MEMORY_VERSION': '1.0'}
            }
        }

    def get_input_dir(self):
        return os.path.join(self.task_dir, 'input')

    def get_output_dir(self):
        return os.path.join(self.task_dir, 'output')

    def get_log_dir(self):
        return os.path.join(self.task_dir, 'logs')

    def get_work_dir(self):
        return os.path.join(self.task_dir, 'work')

    def get_tool_work_dir(self, module_name, tool_type):
        """获取工具工作目录，直接使用工具类型名称作为目录名称"""
        return os.path.join(self.task_dir, 'work', module_name, tool_type)

    def is_tool_type_supported(self, tool_type):
        """检查工具类型是否支持"""
        return tool_type in self.supported_tool_types

    def get_tool_config(self, tool_type):
        """获取工具类型配置"""
        return self.supported_tool_types.get(tool_type, {})

    def create_directories(self, module_name, tool_type):
        """创建任务目录结构，支持动态工具类型"""
        if not self.is_tool_type_supported(tool_type):
            raise Exception(f"Tool type '{tool_type}' is not supported")

        # 基础目录
        dirs = [
            self.get_input_dir(),
            self.get_output_dir(),
            self.get_log_dir(),
            self.get_work_dir(),
            self.get_tool_work_dir(module_name, tool_type)
        ]

        # 工具特定目录
        tool_config = self.get_tool_config(tool_type)
        tool_work_dir = self.get_tool_work_dir(module_name, tool_type)

        for sub_dir in tool_config.get('directories', ['inputs', 'outputs', 'logs']):
            dirs.append(os.path.join(tool_work_dir, sub_dir))

        for dir_path in dirs:
            os.makedirs(dir_path, exist_ok=True)
            # 设置目录权限为777，确保容器内用户可以写入
            os.chmod(dir_path, 0o777)

    def get_tool_environment_variables(self, tool_type):
        """获取工具特定的环境变量"""
        tool_config = self.get_tool_config(tool_type)
        return tool_config.get('env_vars', {})

    def package_results(self, tool_name, module_name, tool_type):
        """打包结果文件，文件名格式：result_{taskid}_{tool_type}_{timestamp}.zip"""
        import zipfile
        import shutil
        from datetime import datetime

        output_dir = self.get_output_dir()
        # 使用正确的文件名格式：result_{taskid}_{tool_type}_{timestamp}.zip
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        result_zip_name = f"result_{self.task_id}_{tool_type}_{timestamp}.zip"
        result_zip_path = os.path.join(output_dir, result_zip_name)

        # 计算打包前的work目录大小（用于日志记录）
        work_dir = self.get_work_dir()
        work_dir_size = 0
        if os.path.exists(work_dir):
            for root, dirs, files in os.walk(work_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        work_dir_size += os.path.getsize(file_path)
                    except OSError:
                        pass  # 忽略无法访问的文件

        with zipfile.ZipFile(result_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # 添加工具工作目录下的所有文件
            tool_work_dir = self.get_tool_work_dir(module_name, tool_type)
            if os.path.exists(tool_work_dir):
                for root, dirs, files in os.walk(tool_work_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, tool_work_dir)
                        zipf.write(file_path, f'{module_name}/{tool_type}/{arcname}')

            # 添加任务级别的日志文件
            log_dir = self.get_log_dir()
            if os.path.exists(log_dir):
                for root, dirs, files in os.walk(log_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, log_dir)
                        zipf.write(file_path, f'logs/{arcname}')

        # 获取结果压缩文件大小
        result_zip_size = os.path.getsize(result_zip_path)

        # ECS Only模式：立即清理work目录以节省空间
        # 只保留output目录中的结果压缩文件
        if os.path.exists(work_dir):
            try:
                shutil.rmtree(work_dir)
                logging.info(f"Task {self.task_id}: Cleaned up work directory ({work_dir_size / 1024 / 1024:.2f} MB freed), result zip: {result_zip_size / 1024 / 1024:.2f} MB")
            except Exception as e:
                logging.warning(f"Task {self.task_id}: Failed to cleanup work directory: {e}")

        # 清理log目录（日志已经打包到结果文件中）
        if os.path.exists(log_dir):
            try:
                shutil.rmtree(log_dir)
                logging.info(f"Task {self.task_id}: Cleaned up log directory")
            except Exception as e:
                logging.warning(f"Task {self.task_id}: Failed to cleanup log directory: {e}")

        return result_zip_name

    def update_metadata(self, updates):
        """更新任务元数据"""
        metadata_path = os.path.join(self.task_dir, 'metadata.json')

        metadata = {}
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)

        metadata.update(updates)
        metadata['updatedAt'] = datetime.now(timezone.utc).isoformat()

        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

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

# --- Aliyun Helper Functions ---
# def get_sts_credentials_for_task(task_id, user_id):
#     """
#     Assumes a RAM role to get temporary, scoped-down credentials for OSS operations.
#     Implements principle of least privilege with strict resource access control.
#     Only used in ECS+OSS+ACR mode.
#     """
#     if deployment_mode == 'ecs_only':
#         raise Exception("STS credentials not available in ECS Only mode")

#     if not core_client:
#         raise Exception("Aliyun client not initialized")
#     policy = {
#         "Statement": [
#             {
#                 "Action": ["oss:GetObject"],
#                 "Effect": "Allow",
#                 "Resource": [f"acs:oss:*:*:{OSS_BUCKET_USER_INPUT}/{user_id}/{task_id}/*"],
#                 "Condition": {
#                     "StringEquals": {
#                         "oss:x-oss-request-id": f"task-{task_id}"
#                     }
#                 }
#             },
#             {
#                 "Action": ["oss:PutObject"],
#                 "Effect": "Allow",
#                 "Resource": [
#                     f"acs:oss:*:*:{OSS_BUCKET_JOB_RESULTS}/{user_id}/{task_id}/*",
#                     f"acs:oss:*:*:{OSS_BUCKET_JOB_LOGS}/{user_id}/{task_id}/*"
#                 ],
#                 "Condition": {
#                     "StringEquals": {
#                         "oss:x-oss-request-id": f"task-{task_id}"
#                     }
#                 }
#             },
#             {
#                 "Action": ["oss:ListBucket"],
#                 "Effect": "Deny",
#                 "Resource": "*"
#             }
#         ],
#         "Version": "1"
#     }
#     request = AssumeRoleRequest.AssumeRoleRequest()
#     request.set_RoleArn(ALIYUN_RAM_ROLE_ARN)
#     request.set_RoleSessionName(f"tool-session-{task_id}")
#     request.set_Policy(json.dumps(policy))
#     request.set_DurationSeconds(1800)  # 30 minutes validity - reduced for security

#     try:
#         response = core_client.do_action_with_exception(request)
#         creds = json.loads(response)['Credentials']

#         # Log STS credential issuance for security audit
#         logging.info(f"STS credentials issued for task {task_id}, user {user_id}, expires at {creds['Expiration']}")

#         return creds['AccessKeyId'], creds['AccessKeySecret'], creds['SecurityToken']
#     except Exception as e:
#         logging.error(f"Failed to assume role for OSS task {task_id}: {e}")
#         # Log security event for monitoring
#         logging.warning(f"Security Alert: STS credential request failed for task {task_id}, user {user_id}")
#         raise

# def get_acr_login_info():
#     """
#     Gets a temporary authorization token for logging into Aliyun Container Registry (ACR).
#     Only used in ECS+OSS+ACR mode.
#     """
#     if deployment_mode == 'ecs_only':
#         raise Exception("ACR login not available in ECS Only mode")

#     request = GetAuthorizationTokenRequest.GetAuthorizationTokenRequest()
#     request.set_accept_format('json')
#     try:
#         # The client for ACR must be initialized for the specific ACR region
#         acr_client = AcsClient(ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ACR_REGION)
#         response = acr_client.do_action_with_exception(request)
#         data = json.loads(response)
#         return data['authorizationToken'], data['tempUserName']
#     except Exception as e:
#         logging.error(f"Failed to get ACR authorization token: {e}")
#         raise

# def get_oss_bucket(access_key_id, access_key_secret, security_token, bucket_name):
#     """Initializes an OSS2 Bucket object with STS credentials. Only used in ECS+OSS+ACR mode."""
#     if deployment_mode == 'ecs_only':
#         raise Exception("OSS bucket not available in ECS Only mode")

#     auth = oss2.StsAuth(access_key_id, access_key_secret, security_token)
#     endpoint = f'http://{OSS_REGION}.aliyuncs.com'
#     return oss2.Bucket(auth, endpoint, bucket_name)

# --- Main Worker Logic ---
def process_task(task_id):
    """处理单个任务 - 支持双部署模式，包含完善的错误处理和资源清理"""
    session = Session()
    task = None
    task_logger = None
    cleanup_manager = ResourceCleanupManager()

    try:
        logging.info(f"Processing task: {task_id}")
        task = session.query(Task).filter_by(id=task_id).first()
        if not task:
            logging.error(f"Task {task_id} not found in DB.")
            return

        # 初始化任务日志记录器
        task_logger = TaskLogger(task_id, task.userId)
        task_logger.log_database_operation('SELECT', 'Task', True, {'taskId': task_id})
        task_logger.log('INFO', 'TASK', f'Starting task processing', {
            'toolId': task.toolId,
            'status': task.status,
            'parameters': task.parameters,
            'deploymentMode': task.deploymentMode or get_deployment_mode()
        })

        # 注意：此时还不创建jobs目录，等到容器真正启动后再创建
        # 更新任务状态为运行中
        task.status = 'RUNNING'
        task.startedAt = datetime.now(timezone.utc)
        session.commit()

        # 通过API发送RUNNING状态通知给前端（使用带重试的版本）
        try:
            update_task_status_via_api_with_retry(task_id, 'RUNNING', {
                'startedAt': task.startedAt.isoformat(),
                'progress': 10,
                'currentStep': 'STARTING_EXECUTION'
            })
            logging.info(f"Sent RUNNING status notification for task {task_id}")
        except Exception as api_error:
            logging.error(f"Failed to send RUNNING status notification: {api_error}")

        # 设置任务超时时间（默认30分钟）
        timeout_seconds = int(os.getenv('TASK_TIMEOUT_SECONDS', 1800))

        # 添加基础清理任务
        cleanup_manager.add_cleanup_task(
            lambda: setattr(task, 'status', 'FAILED') if task and task.status == 'RUNNING' else None
        )

        # 根据部署模式选择不同的处理逻辑
        deployment_mode = task.deploymentMode or get_deployment_mode()

        def task_execution():
            if deployment_mode == 'ecs_only':
                return process_task_ecs_only(task, task_logger, session)
            else:
                return process_task_ecs_oss_acr(task, task_logger, session)

        # 使用超时和清理机制执行任务
        success = execute_with_timeout_and_cleanup(
            task_execution,
            timeout_seconds,
            cleanup_manager
        )

        if success:
            task.status = 'COMPLETED'
            task.finishedAt = datetime.now(timezone.utc)
            logging.info(f"Task {task_id} completed successfully")
            # 通过API更新状态，确保前端能收到状态更新，包含完整的进度信息（使用带重试的版本）
            try:
                update_task_status_via_api_with_retry(task_id, 'COMPLETED', {
                    'finishedAt': task.finishedAt.isoformat(),
                    'progress': 100,
                    'currentStep': 'COMPLETED'
                })
            except Exception as api_error:
                logging.error(f"Failed to update task status via API: {api_error}")
        else:
            task.status = 'FAILED'
            task.finishedAt = datetime.now(timezone.utc)
            # 保留currentStep和progress，显示失败时的实际执行进度
            logging.error(f"Task {task_id} failed")
            # 通过API更新状态，确保前端能收到状态更新（使用带重试的版本）
            try:
                update_task_status_via_api_with_retry(task_id, 'FAILED', {
                    'finishedAt': task.finishedAt.isoformat(),
                    'errorMessage': 'Task execution failed',
                    'currentStep': task.currentStep,  # 保留失败时的执行步骤
                    'progress': task.progress  # 保留失败时的进度
                })
            except Exception as api_error:
                logging.error(f"Failed to update task status via API: {api_error}")

    except TaskTimeoutError as e:
        error_msg = f"Task timed out: {str(e)}"
        logging.error(f"Task {task_id} timed out: {str(e)}")
        if task:
            task.status = 'FAILED'
            task.errorMessage = error_msg
            task.finishedAt = datetime.now(timezone.utc)
            # 保留currentStep和progress，显示超时时的实际执行进度
            # 通过API更新数据库状态，确保前端能收到状态更新（使用带重试的版本）
            try:
                update_task_status_via_api_with_retry(task_id, 'FAILED', {
                    'errorMessage': error_msg,
                    'finishedAt': task.finishedAt.isoformat(),
                    'currentStep': task.currentStep,  # 保留超时时的执行步骤
                    'progress': task.progress  # 保留超时时的进度
                })
            except Exception as api_error:
                logging.error(f"Failed to update task status via API: {api_error}")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error processing task {task_id}: {error_msg}", exc_info=True)
        if task:
            task.status = 'FAILED'
            task.errorMessage = error_msg
            task.finishedAt = datetime.now(timezone.utc)
            # 保留currentStep和progress，显示异常时的实际执行进度
            # 通过API更新数据库状态，确保前端能收到状态更新（使用带重试的版本）
            try:
                update_task_status_via_api_with_retry(task_id, 'FAILED', {
                    'errorMessage': error_msg,
                    'finishedAt': task.finishedAt.isoformat(),
                    'currentStep': task.currentStep,  # 保留异常时的执行步骤
                    'progress': task.progress  # 保留异常时的进度
                })
            except Exception as api_error:
                logging.error(f"Failed to update task status via API: {api_error}")
    finally:
        # 确保数据库会话关闭和状态更新
        try:
            if task and session:
                session.commit()
        except Exception as db_error:
            logging.error(f"Database commit failed for task {task_id}: {db_error}")
        finally:
            if session:
                session.close()

            # 执行清理任务
            try:
                cleanup_manager.execute_cleanup()
            except Exception as cleanup_error:
                logging.error(f"Final cleanup failed for task {task_id}: {cleanup_error}")

def process_task_ecs_only(task, task_logger, session):
    """ECS Only模式任务处理 - 延迟目录创建版本"""
    try:
        # 设置任务开始进度
        task_logger.update_task_progress('WORKER_ASSIGNED', session)

        # 使用统一的任务初始化
        context = initialize_task_context(task, task_logger, session)
        module_name, tool_type, file_manager, tool, params = context

        # 步骤9：工具容器加载
        task_logger.log_step_start('CONTAINER_IMAGE_LOADING', 'Loading Docker container image')
        task_logger.update_task_progress('CONTAINER_IMAGE_LOADING', session)
        image_name = tool.dockerImage
        if not check_local_image_exists(image_name):
            task_logger.log('INFO', 'IMAGE', f'Docker image {image_name} not found locally, attempting to load from tar file')

            # 尝试从本地tar文件加载镜像
            if not load_image_from_tar(image_name, task_logger):
                task_logger.log_step_failure('CONTAINER_IMAGE_LOADING', 'Failed to load image from tar file')
                raise Exception(f"Docker image {image_name} not found locally and failed to load from tar file")
            task_logger.log_step_success('CONTAINER_IMAGE_LOADING', 'Docker image loaded from tar file', {
                'imageName': image_name,
                'loadMethod': 'tar_file'
            })
        else:
            task_logger.log_step_success('CONTAINER_IMAGE_LOADING', 'Docker image found locally', {
                'imageName': image_name,
                'loadMethod': 'local_cache'
            })

        task_logger.log('INFO', 'CONTAINER', f'Using local image: {image_name}')

        # 步骤10：创建jobs/{taskId}目录，复制数据到jobs/{taskId}/input和jobs/{taskId}/work/{modName}/sdcgen/inputs
        task_logger.log_step_start('JOBS_DIRECTORY_CREATION', 'Creating jobs directory structure after image verification')
        task_logger.update_task_progress('JOBS_DIRECTORY_CREATION', session)
        file_manager.create_directories(module_name, tool_type)
        task_logger.log_step_success('JOBS_DIRECTORY_CREATION', 'Jobs directory structure created', {
            'jobsPath': f'jobs/{task.id}',
            'moduleName': module_name,
            'toolType': tool_type,
            'subdirectories': ['input', 'output', 'logs', 'work']
        })

        # 处理temp目录中的文件（复制到工作目录）
        task_logger.log_step_start('TEMP_TO_JOBS_COPY', 'Copying files from temp to jobs directories')
        task_logger.update_task_progress('TEMP_TO_JOBS_COPY', session)
        process_temp_files(task, task_logger, file_manager)
        task_logger.log_step_success('TEMP_TO_JOBS_COPY', 'Files copied from temp to jobs directories', {
            'sourceDir': f'temp/{task.id}',
            'targetDirs': [f'jobs/{task.id}/input', f'jobs/{task.id}/work/{module_name}/{tool_type}/inputs']
        })

        # 准备容器环境 - 使用唯一容器名称生成器
        task_logger.update_task_progress('CONTAINER_EXECUTION', session)
        container_name = generate_unique_container_name(task.id)

        # 设置容器挂载目录 - 跨平台路径处理
        ecs_jobs_dir = os.environ.get('ECS_JOBS_DIR', os.path.join(os.getcwd(), 'jobs'))
        volumes = prepare_container_volumes(task.id, ecs_jobs_dir)

        # 记录挂载配置用于调试
        task_logger.log('INFO', 'MOUNT', f'Container volumes prepared for platform: {platform.system()}', {
            'platform': platform.system(),
            'volumes': {str(k): v for k, v in volumes.items()},
            'base_jobs_dir': ecs_jobs_dir
        })

        # 设置环境变量
        env_vars = {
            'TASK_ID': task.id,
            'USER_ID': task.userId,
            'TOOL_ID': task.toolId,
            'DEPLOYMENT_MODE': 'ecs_only',
            'MODULE_NAME': module_name,
            'TOOL_TYPE': tool_type
        }

        # 添加工具特定的环境变量
        tool_env_vars = file_manager.get_tool_environment_variables(tool_type)
        env_vars.update(tool_env_vars)

        # 添加用户权限信息到环境变量
        user_permission_type = params.get('userPermissionType', 'free')
        # 转换为工具期望的格式：free -> fre, pro/professional -> pro
        if user_permission_type == 'free':
            tool_permission_type = 'fre'
        elif user_permission_type in ['pro', 'professional']:
            tool_permission_type = 'pro'
        else:
            tool_permission_type = 'fre'  # 默认为免费用户
        env_vars['USER_PERMISSION_TYPE'] = tool_permission_type
        task_logger.log('INFO', 'PERMISSION', f'User permission type: {user_permission_type} -> Tool format: {tool_permission_type}')

        # 添加任务参数到环境变量
        if params:
            for key, value in params.items():
                env_vars[f'PARAM_{key.upper()}'] = str(value)

        # 添加所有工具都需要的基础环境变量
        env_vars['JOB_INPUT_DIR'] = '/data/input'
        env_vars['JOB_OUTPUT_DIR'] = '/data/output'
        env_vars['JOB_LOG_DIR'] = '/data/logs'

        # 为工具添加特定的环境变量（匹配entrypoint脚本要求）
        if tool_type in ['sdc', 'sdcgen']:
            env_vars['SDC_MOD_NAME'] = module_name
            env_vars['SDC_IS_FLAT'] = str(params.get('isFlat', False)).lower()
            task_logger.log('INFO', 'ENV', f'SDC tool environment configured: tool_type={tool_type}')
        elif tool_type in ['upf', 'upfgen']:
            env_vars['UPF_MOD_NAME'] = module_name
            env_vars['UPF_IS_FLAT'] = str(params.get('isFlat', False)).lower()
            task_logger.log('INFO', 'ENV', f'UPF tool environment configured: tool_type={tool_type}')
        else:
            # 对于未知工具类型，使用通用配置
            env_vars['TOOL_MOD_NAME'] = module_name
            env_vars['TOOL_IS_FLAT'] = str(params.get('isFlat', False)).lower()
            task_logger.log('WARNING', 'ENV', f'Unknown tool type, using generic configuration: tool_type={tool_type}')

        # # 设置环境变量
        # env_vars = {
        #     'TASK_ID': task.id,
        #     'USER_ID': task.userId,
        #     'TOOL_ID': task.toolId,
        #     'DEPLOYMENT_MODE': 'ecs_only',
        #     'MODULE_NAME': module_name,
        #     'TOOL_TYPE': tool_type
        # }

        # # 添加工具特定的环境变量
        # tool_env_vars = file_manager.get_tool_environment_variables(tool_type)
        # env_vars.update(tool_env_vars)

        # # 添加用户权限信息到环境变量
        # user_permission_type = params.get('userPermissionType', 'free')
        # # 转换为工具期望的格式：free -> fre, pro/professional -> pro
        # if user_permission_type == 'free':
        #     tool_permission_type = 'fre'
        # elif user_permission_type in ['pro', 'professional']:
        #     tool_permission_type = 'pro'
        # else:
        #     tool_permission_type = 'fre'  # 默认为免费用户
        # env_vars['USER_PERMISSION_TYPE'] = tool_permission_type
        # task_logger.log('INFO', 'PERMISSION', f'User permission type: {user_permission_type} -> Tool format: {tool_permission_type}')

        # # 添加任务参数到环境变量
        # if params:
        #     for key, value in params.items():
        #         env_vars[f'PARAM_{key.upper()}'] = str(value)

        # # 添加所有工具都需要的基础环境变量
        # env_vars['JOB_INPUT_DIR'] = '/data/input'
        # env_vars['JOB_OUTPUT_DIR'] = '/data/output'
        # env_vars['JOB_LOG_DIR'] = '/data/logs'

        # # 为工具添加特定的环境变量（匹配entrypoint脚本要求）
        # if tool_type in ['sdc', 'sdcgen']:
        #     env_vars['SDC_MOD_NAME'] = module_name
        #     env_vars['SDC_IS_FLAT'] = str(params.get('isFlat', False)).lower()
        #     task_logger.log('INFO', 'ENV', f'SDC tool environment configured: tool_type={tool_type}')
        # elif tool_type in ['upf', 'upfgen']:
        #     env_vars['UPF_MOD_NAME'] = module_name
        #     env_vars['UPF_IS_FLAT'] = str(params.get('isFlat', False)).lower()
        #     task_logger.log('INFO', 'ENV', f'UPF tool environment configured: tool_type={tool_type}')
        # else:
        #     # 对于未知工具类型，使用通用配置
        #     env_vars['TOOL_MOD_NAME'] = module_name
        #     env_vars['TOOL_IS_FLAT'] = str(params.get('isFlat', False)).lower()
        #     task_logger.log('WARNING', 'ENV', f'Unknown tool type, using generic configuration: tool_type={tool_type}')

        # 步骤11：容器启动执行工具命令
        task_logger.log_step_start('CONTAINER_EXECUTION', 'Starting Docker container execution')

        # 创建容器专用日志文件
        container_log_file = os.path.join(file_manager.get_log_dir(), 'container_execution.log')

        def log_container_info(message, details=None):
            """记录容器相关信息到专用日志文件"""
            timestamp = datetime.now(timezone.utc).isoformat()
            log_entry = f"[{timestamp}] {message}"
            if details:
                log_entry += f" | Details: {details}"
            log_entry += "\n"

            # 写入容器专用日志
            with open(container_log_file, 'a', encoding='utf-8') as f:
                f.write(log_entry)

            # 同时记录到主日志
            task_logger.log('INFO', 'CONTAINER', message, details)

        # 记录容器配置信息
        log_container_info('=== Container Execution Start ===')
        log_container_info(f'Container Name: {container_name}')
        log_container_info(f'Docker Image: {image_name}')
        log_container_info(f'Task ID: {task.id}')
        log_container_info(f'Tool Type: {tool_type}')
        log_container_info(f'Module Name: {module_name}')

        # 记录环境变量
        log_container_info('Environment Variables:', dict(env_vars))

        # 记录挂载点
        mount_info = {}
        for host_path, container_config in volumes.items():
            mount_info[host_path] = f"{container_config['bind']} ({container_config['mode']})"
        log_container_info('Volume Mounts:', mount_info)

        # 记录容器资源限制
        resource_info = {
            'CPU': f"{float(JOB_CPU_REQUEST) * 1e9} nano_cpus",
            'Memory': f"{JOB_MEMORY_REQUEST_GB}GB",
            'Network': 'none',
            'Security': 'no-new-privileges'
        }
        log_container_info('Resource Limits:', resource_info)

        # 更新容器执行开始时间（这是3分钟超时计算的正确起点）
        task.containerStartedAt = datetime.now(timezone.utc)
        session.commit()
        log_container_info(f'Container execution started at: {task.containerStartedAt}')

        # 记录容器创建前的目录状态和路径验证
        log_container_info('=== Pre-Container Directory Status ===')
        log_container_info(f'Platform: {platform.system()} {platform.release()}')
        log_container_info(f'Python version: {platform.python_version()}')

        # 记录路径规范化结果
        log_container_info('=== Path Normalization Results ===')
        for mount_type in ['input', 'output', 'logs', 'work']:
            original_path = os.path.join(ecs_jobs_dir, task.id, mount_type)
            normalized_path = normalize_docker_path(original_path)
            log_container_info(f'{mount_type.upper()}:')
            log_container_info(f'  Original: {original_path}')
            log_container_info(f'  Normalized: {normalized_path}')
            log_container_info(f'  Container: /data/{mount_type}')

            # 检查目录是否存在
            if os.path.exists(original_path):
                try:
                    files = os.listdir(original_path)
                    log_container_info(f'  Files: {len(files)} items', files[:5])

                    # 特别检查input目录的关键文件
                    if mount_type == 'input':
                        required_files = ['hier.yaml', 'vlog.v', 'dcont.xlsx']
                        for req_file in required_files:
                            file_path = os.path.join(original_path, req_file)
                            if os.path.exists(file_path):
                                size = os.path.getsize(file_path)
                                log_container_info(f'    ✅ {req_file}: {size} bytes')
                            else:
                                log_container_info(f'    ❌ {req_file}: NOT FOUND')

                except Exception as e:
                    log_container_info(f'  Error reading directory: {str(e)}')
            else:
                log_container_info(f'  ❌ Directory does not exist')

        # 记录实际的Docker挂载配置
        log_container_info('=== Docker Volume Mounts ===')
        for host_path, container_config in volumes.items():
            log_container_info(f'  -v {host_path}:{container_config["bind"]}:{container_config["mode"]}')

        # 使用容器管理器创建容器
        log_container_info('Creating Docker container...')

        # 添加容器创建前的详细调试信息
        task_logger.log('INFO', 'DEBUG', 'Container creation parameters', {
            'taskId': task.id,
            'imageName': image_name,
            'command': ["run"],
            'environmentVarsCount': len(env_vars),
            'volumesCount': len(volumes),
            'cpuLimit': f"{JOB_CPU_REQUEST} cores",
            'memoryLimit': f"{JOB_MEMORY_REQUEST_GB}GB",
            'securityConfig': {
                'networkMode': 'none',
                'readOnly': True,
                'capDrop': ['ALL'],
                'noNewPrivileges': True
            }
        })

        try:
            # 添加详细的调试信息
            task_logger.log('INFO', 'DEBUG', 'About to create container', {
                'taskId': task.id,
                'imageName': image_name,
                'volumesCount': len(volumes),
                'envVarsCount': len(env_vars)
            })

            container = container_manager.create_container(
                task.id,
                image_name,
                command=["run"],  # 传递"run"参数让entrypoint脚本执行工具
                environment=env_vars,
                volumes=volumes,
                nano_cpus=int(float(JOB_CPU_REQUEST) * 1e9),
                mem_limit=f"{JOB_MEMORY_REQUEST_GB}g",
                network_mode='none',
                cap_drop=['ALL'],
                read_only=True,  # 保持安全性：只读文件系统
                tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},
                security_opt=['no-new-privileges:true']
            )
            log_container_info(f'Container created successfully: {container.id[:12]}')

            # 记录容器创建成功的详细信息
            task_logger.log('INFO', 'DEBUG', 'Container created successfully', {
                'taskId': task.id,
                'containerId': container.id[:12],
                'containerName': container.name,
                'containerStatus': container.status
            })

        except Exception as e:
            log_container_info(f'Container creation failed: {str(e)}')

            # 记录容器创建失败的详细错误信息
            task_logger.log('ERROR', 'DEBUG', 'Container creation failed', {
                'taskId': task.id,
                'errorType': type(e).__name__,
                'errorMessage': str(e),
                'imageName': image_name,
                'dockerClientAvailable': docker_client is not None
            })
            raise

        # 等待容器完成（带3分钟超时检查）
        container_timeout_minutes = int(os.getenv('CONTAINER_EXECUTION_TIMEOUT_MINUTES', 3))
        container_timeout_seconds = container_timeout_minutes * 60

        task_logger.log('INFO', 'TIMING', f'Container timeout set to {container_timeout_minutes} minutes ({container_timeout_seconds} seconds)')

        try:
            # 使用超时等待容器完成
            log_container_info('Starting container execution...')
            result = container.wait(timeout=container_timeout_seconds)
            exit_code = result['StatusCode']
            logs = container.logs().decode('utf-8')

            # 计算实际执行时间
            current_time = datetime.now(timezone.utc)
            container_start_time = task.containerStartedAt
            if container_start_time.tzinfo is None:
                container_start_time = container_start_time.replace(tzinfo=timezone.utc)
            execution_time = (current_time - container_start_time).total_seconds()
            log_container_info(f'Container completed in {execution_time:.2f} seconds (limit: {container_timeout_seconds} seconds)')
            log_container_info(f'Container exit code: {exit_code}')

            # 记录容器日志到专用文件
            log_container_info('=== Container Output Logs ===')
            if logs:
                log_container_info('Container logs:', logs)
            else:
                log_container_info('No container logs available')

            # 记录容器执行后的目录状态
            log_container_info('=== Post-Container Directory Status ===')
            for host_path, container_config in volumes.items():
                if os.path.exists(host_path):
                    try:
                        files = os.listdir(host_path)
                        log_container_info(f'Host Directory {host_path}: {len(files)} files', files[:10])
                    except Exception as e:
                        log_container_info(f'Host Directory {host_path}: Error reading - {str(e)}')
                else:
                    log_container_info(f'Host Directory {host_path}: Does not exist')

        except Exception as timeout_error:
            # 容器执行超时（3分钟）
            current_time = datetime.now(timezone.utc)
            container_start_time = task.containerStartedAt
            if container_start_time.tzinfo is None:
                container_start_time = container_start_time.replace(tzinfo=timezone.utc)
            execution_time = (current_time - container_start_time).total_seconds()
            log_container_info(f'=== Container Execution Timeout ===')
            log_container_info(f'Timeout after {execution_time:.2f} seconds (limit: {container_timeout_seconds} seconds)')
            log_container_info(f'Timeout error: {str(timeout_error)}')

            # 尝试获取容器日志
            try:
                timeout_logs = container.logs().decode('utf-8')
                if timeout_logs:
                    log_container_info('Container logs before timeout:', timeout_logs)
                else:
                    log_container_info('No container logs available before timeout')
            except Exception as log_error:
                log_container_info(f'Failed to get container logs: {str(log_error)}')

            # 强制停止容器
            try:
                log_container_info('Stopping container due to timeout...')
                container.stop(timeout=10)
                container.remove(force=True)
                log_container_info('Container stopped and removed successfully')
            except Exception as cleanup_error:
                log_container_info(f'Failed to cleanup timeout container: {str(cleanup_error)}')

            # 更新数据库状态为EXECUTION_TIMEOUT
            task = session.query(Task).filter(Task.id == task.id).first()
            if task:
                task.status = 'EXECUTION_TIMEOUT'
                task.finishedAt = datetime.now(timezone.utc)
                task.errorMessage = f"Container execution timeout after {execution_time:.0f} seconds (limit {container_timeout_seconds} seconds)"
                session.commit()
                session.flush()
                task_logger.log('INFO', 'DATABASE', f'Updated task status to EXECUTION_TIMEOUT', {
                    'status': 'EXECUTION_TIMEOUT',
                    'executionTime': f'{execution_time:.2f}s',
                    'timeoutLimit': f'{container_timeout_seconds}s',
                    'finishedAt': task.finishedAt.isoformat()
                })

            # 清理所有资源（jobs和temp目录）
            cleanup_container_for_task(task.id, "execution_timeout")
            cleanup_temp_files(task.id, task_logger, "execution_timeout")

            # 清理jobs目录
            if os.path.exists(file_manager.task_dir):
                import shutil
                shutil.rmtree(file_manager.task_dir)
                task_logger.log('INFO', 'CLEANUP', f'Jobs directory cleaned due to timeout: {file_manager.task_dir}')

            return False

        logs = container.logs().decode('utf-8')

        # 记录容器日志到标准位置（保持兼容性）
        log_file = os.path.join(file_manager.get_log_dir(), 'container.log')
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write(logs)

        # ECS Only模式：同时保存到项目根目录的logs/<taskid>/目录
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
        project_logs_dir = os.path.join(project_root, 'logs', task.id)
        os.makedirs(project_logs_dir, exist_ok=True)

        # 保存container.log（容器输出日志）
        project_log_file = os.path.join(project_logs_dir, 'container.log')
        with open(project_log_file, 'w', encoding='utf-8') as f:
            f.write(logs)

        # 同时保存container_execution.log（容器执行详细日志）
        container_execution_src = os.path.join(file_manager.get_log_dir(), 'container_execution.log')
        if os.path.exists(container_execution_src):
            import shutil
            container_execution_dst = os.path.join(project_logs_dir, 'container_execution.log')
            shutil.copy2(container_execution_src, container_execution_dst)
            log_container_info(f'Container execution log also saved to project: {container_execution_dst}')

        # 同时保存execution.log（工具执行日志）
        execution_log_src = os.path.join(file_manager.get_log_dir(), 'execution.log')
        if os.path.exists(execution_log_src):
            import shutil
            execution_log_dst = os.path.join(project_logs_dir, 'execution.log')
            shutil.copy2(execution_log_src, execution_log_dst)
            log_container_info(f'Execution log also saved to project: {execution_log_dst}')

        log_container_info(f'Container logs saved to: {log_file}')
        log_container_info(f'Container logs also saved to project: {project_log_file}')

        if exit_code == 0:
            # 步骤12：检查容器生成的结果文件
            task_logger.log_step_start('RESULT_PACKAGING', 'Checking container generated results')
            task_logger.update_task_progress('RESULT_PACKAGING', session)

            output_dir = file_manager.get_output_dir()

            # 检查容器是否生成了正确格式的zip文件 (result_{taskid}_{tool_type}_{timestamp}.zip)
            import glob
            container_zip_pattern = os.path.join(output_dir, f"result_{task.id}_{tool_type}_*.zip")
            container_zip_files = glob.glob(container_zip_pattern)

            if container_zip_files:
                # 使用容器生成的zip文件
                result_zip = os.path.basename(container_zip_files[0])
                task_logger.log_step_success('RESULT_PACKAGING', 'Using container generated result file', {
                    'resultFile': result_zip,
                    'outputPath': f'jobs/{task.id}/output',
                    'exitCode': exit_code,
                    'source': 'container_generated'
                })
            else:
                # 回退到Worker重新打包（兼容旧版本容器）
                # 获取工具名称用于文件名生成
                tool_name = tool.name if tool else tool_type
                result_zip = file_manager.package_results(tool_name, module_name, tool_type)
                task_logger.log_step_success('RESULT_PACKAGING', 'Results packaged by worker', {
                    'resultFile': result_zip,
                    'outputPath': f'jobs/{task.id}/output',
                    'exitCode': exit_code,
                    'source': 'worker_packaged'
                })

            # 步骤13：立即清理jobs/{taskId}/work目录
            task_logger.log_step_start('WORK_DIRECTORY_CLEANUP', 'Cleaning work directory after packaging')
            task_logger.update_task_progress('WORK_DIRECTORY_CLEANUP', session)
            work_dir = file_manager.get_work_dir()
            if os.path.exists(work_dir):
                import shutil
                shutil.rmtree(work_dir)
                task_logger.log_step_success('WORK_DIRECTORY_CLEANUP', 'Work directory cleaned successfully', {
                    'workDir': work_dir,
                    'reason': 'results_packaged'
                })
            else:
                task_logger.log_step_success('WORK_DIRECTORY_CLEANUP', 'Work directory already clean', {
                    'workDir': work_dir
                })

            # 更新任务元数据
            file_manager.update_metadata({
                'completedAt': datetime.now(timezone.utc).isoformat(),
                'resultFile': result_zip,
                'exitCode': exit_code
            })

            # 步骤14：2分钟下载期后清理temp/{taskId}目录（标记为待清理）
            task_logger.log_step_start('TEMP_CLEANUP_SCHEDULE', 'Scheduling temp directory cleanup')
            cleanup_temp_files(task.id, task_logger, "task_completed")
            task_logger.log_step_success('TEMP_CLEANUP_SCHEDULE', 'Temp directory cleanup scheduled', {
                'tempDir': f'temp/{task.id}',
                'cleanupReason': 'task_completed',
                'downloadPeriod': '2_minutes'
            })

            # 清理容器（任务正常完成）
            cleanup_container_for_task(task.id, "task_completed")

            # 设置任务完成进度和输出文件
            task_logger.update_task_progress('COMPLETED', session)

            # 更新数据库中的输出文件名和下载状态
            # 注意：不重新设置finishedAt，使用主流程中已设置的时间
            # 注意：不设置downloadTimeRemaining，由后端API基于finishedAt动态计算
            task = session.query(Task).filter(Task.id == task.id).first()
            if task:
                task.outputFile = result_zip
                # 不重新设置finishedAt和status，保持主流程中的设置
                task.downloadStatus = 'AVAILABLE'  # 设置下载状态为可用
                # 不再硬编码downloadTimeRemaining，后端API会基于finishedAt动态计算
                session.commit()
                session.flush()
                task_logger.log('INFO', 'DATABASE', f'Updated task output file and download status', {
                    'outputFile': result_zip,
                    'downloadStatus': 'AVAILABLE',
                    'finishedAt': task.finishedAt.isoformat() if task.finishedAt else 'Not set'
                })

                # 通过API发送任务完成通知（使用带重试的版本）
                # 注意：不再传递downloadTimeRemaining，后端API会基于finishedAt动态计算
                try:
                    finished_at_value = task.finishedAt.isoformat() if task.finishedAt else datetime.now(timezone.utc).isoformat()
                    update_task_status_via_api_with_retry(task.id, 'COMPLETED', {
                        'outputFile': result_zip,
                        'downloadStatus': 'AVAILABLE',
                        'finishedAt': finished_at_value,
                        'progress': 100,
                        'currentStep': 'COMPLETED'
                    })
                except Exception as api_error:
                    task_logger.log('ERROR', 'API', f'Failed to send completion notification: {str(api_error)}')

            log_container_info('=== Container Execution Completed Successfully ===')
            return True
        else:
            log_container_info(f'=== Container Execution Failed ===')
            log_container_info(f'Container failed with exit code {exit_code}')
            task_logger.log('ERROR', 'CONTAINER', f'Container failed with exit code {exit_code}')

            # 更新数据库状态为FAILED
            task = session.query(Task).filter(Task.id == task.id).first()
            if task:
                task.status = 'FAILED'
                task.finishedAt = datetime.now(timezone.utc)
                task.errorMessage = f"Container execution failed with exit code {exit_code}"
                session.commit()
                session.flush()
                task_logger.log('INFO', 'DATABASE', f'Updated task status to FAILED', {
                    'status': 'FAILED',
                    'exitCode': exit_code,
                    'finishedAt': task.finishedAt.isoformat()
                })

            # 清理容器（任务失败）
            cleanup_container_for_task(task.id, "task_failed")

            # 清理temp文件（任务失败）
            cleanup_temp_files(task.id, task_logger, "task_failed")

            # 清理work目录（任务失败）- 避免保留无效的临时数据
            work_dir = file_manager.get_work_dir()
            if os.path.exists(work_dir):
                try:
                    import shutil
                    shutil.rmtree(work_dir)
                    task_logger.log('INFO', 'CLEANUP', f'Cleaned up work directory after task failure', {
                        'workDir': work_dir
                    })
                except Exception as work_cleanup_error:
                    task_logger.log('WARNING', 'CLEANUP', f'Failed to cleanup work directory after task failure: {str(work_cleanup_error)}')

            return False

    except Exception as e:
        task_logger.log('ERROR', 'PROCESS', f'ECS only processing failed: {str(e)}')
        # 任务失败时清理temp目录和容器
        try:
            cleanup_temp_files(task.id, task_logger, "task_failed")
            cleanup_container_for_task(task.id, "task_exception")
        except Exception as cleanup_error:
            task_logger.log('ERROR', 'CLEANUP', f'Failed to cleanup temp files: {str(cleanup_error)}')
        return False

# def process_task_ecs_oss_acr(task, task_logger, session):
#     """ECS + OSS + ACR模式任务处理"""
#     try:
#         # 使用统一的任务初始化
#         context = initialize_task_context(task, task_logger, session)
#         module_name, tool_type, file_manager, tool, params = context

#         # 使用统一的临时目录管理 - 使用TEMP_UPLOAD_DIR而不是TEMP_JOBS_DIR
#         temp_upload_dir = os.environ.get('TEMP_UPLOAD_DIR', '/tmp/logiccore_temp')
#         local_base = os.path.join(temp_upload_dir, task.id)

#         task_logger.log('INFO', 'PROCESS', f'Starting ECS+OSS+ACR mode processing for tool type: {tool_type}')

#         # --- 智能Docker镜像管理 ---
#         image_name = tool.dockerImage
#         logging.info(f"Checking Docker image: {image_name}")

#         # 检查本地是否已有镜像
#         try:
#             local_image = docker_client.images.get(image_name)
#             logging.info(f"Found local image: {image_name} (ID: {local_image.id[:12]})")

#             # 检查镜像是否需要更新（可选：检查镜像创建时间）
#             image_age_hours = (datetime.now(timezone.utc) - datetime.fromisoformat(local_image.attrs['Created'].replace('Z', '+00:00'))).total_seconds() / 3600

#             if image_age_hours > 24:  # 镜像超过24小时，检查更新
#                 logging.info(f"Local image is {image_age_hours:.1f} hours old, checking for updates...")
#                 should_pull = True
#             else:
#                 logging.info(f"Using cached local image (age: {image_age_hours:.1f} hours)")
#                 should_pull = False

#         except docker.errors.ImageNotFound:
#             logging.info(f"Local image not found, will pull from ACR")
#             should_pull = True

#         # 从ACR拉取镜像（如果需要）
#         if should_pull:
#             try:
#                 logging.info("Getting ACR credentials...")
#                 acr_token, acr_username = get_acr_login_info()
#                 registry_url = image_name.split('/')[0]

#                 logging.info(f"Pulling image {image_name} from ACR registry {registry_url}...")
#                 docker_client.images.pull(
#                     repository=image_name,
#                     auth_config={'username': acr_username, 'password': acr_token}
#                 )
#                 logging.info(f"Successfully pulled image: {image_name}")

#                 # 清理旧镜像（保留最新的2个版本）
#                 try:
#                     all_images = docker_client.images.list(name=image_name.split(':')[0])
#                     if len(all_images) > 2:
#                         for old_image in all_images[2:]:
#                             docker_client.images.remove(old_image.id, force=True)
#                             logging.info(f"Removed old image: {old_image.id[:12]}")
#                 except Exception as cleanup_error:
#                     logging.warning(f"Failed to cleanup old images: {cleanup_error}")

#             except Exception as pull_error:
#                 logging.error(f"Failed to pull image {image_name}: {pull_error}")
#                 # 如果拉取失败但有本地镜像，继续使用本地镜像
#                 try:
#                     docker_client.images.get(image_name)
#                     logging.warning(f"Using existing local image due to pull failure")
#                 except docker.errors.ImageNotFound:
#                     raise Exception(f"No local image available and pull failed: {pull_error}")

#         # 更新任务状态
#         task.status = 'RUNNING'
#         task.startedAt = datetime.now(timezone.utc)
#         task.workerId = os.getenv('WORKER_ID', 'worker-01')
#         task.ecsInstanceId = os.getenv('ECS_INSTANCE_ID', 'ecs-single-instance')
#         session.commit()

#         # 设置容器环境变量（与ECS Only模式保持一致）
#         env_vars = {
#             'TASK_ID': task.id,
#             'USER_ID': task.userId,
#             'TOOL_ID': task.toolId,
#             'DEPLOYMENT_MODE': 'ecs_oss_acr',
#             'MODULE_NAME': module_name,
#             'TOOL_TYPE': tool_type
#         }

#         # 添加工具特定的环境变量
#         tool_env_vars = file_manager.get_tool_environment_variables(tool_type)
#         env_vars.update(tool_env_vars)

#         # 添加用户权限信息到环境变量
#         user_permission_type = params.get('userPermissionType', 'free')
#         # 转换为工具期望的格式：free -> fre, pro/professional -> pro
#         if user_permission_type == 'free':
#             tool_permission_type = 'fre'
#         elif user_permission_type in ['pro', 'professional']:
#             tool_permission_type = 'pro'
#         else:
#             tool_permission_type = 'fre'  # 默认为免费用户
#         env_vars['USER_PERMISSION_TYPE'] = tool_permission_type

#         # 添加任务参数到环境变量
#         if params:
#             for key, value in params.items():
#                 env_vars[f'PARAM_{key.upper()}'] = str(value)

#         # 获取STS临时凭证用于OSS访问
#         sts_ak, sts_sk, sts_token = get_sts_credentials_for_task(task.id, task.userId)
#         task_logger.log('INFO', 'STS', 'STS credentials obtained for OSS access')

#         # 创建本地工作目录
#         local_input_dir = os.path.join(local_base, 'inputs')
#         local_output_dir = os.path.join(local_base, 'outputs')
#         local_log_dir = os.path.join(local_base, 'logs')

#         for d in [local_input_dir, local_output_dir, local_log_dir]:
#             os.makedirs(d, exist_ok=True)

#         # 处理多文件输入（特别是SDC工具的三个文件）
#         input_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_USER_INPUT)

#         # 下载主文件（向后兼容）
#         if task.inputOssPath:
#             local_input_filepath = os.path.join(local_input_dir, os.path.basename(task.inputOssPath))
#             input_bucket.get_object_to_file(task.inputOssPath, local_input_filepath)
#             logging.info(f"Downloaded main input file: {task.inputOssPath}")

#         # 从数据库参数中获取输入文件信息并下载
#         if 'inputFilesList' in task.parameters and task.parameters['inputFilesList']:
#             logging.info(f"Downloading {len(task.parameters['inputFilesList'])} input files...")
#             for file_path in task.parameters['inputFilesList']:
#                 local_filepath = os.path.join(local_input_dir, os.path.basename(file_path))
#                 try:
#                     input_bucket.get_object_to_file(file_path, local_filepath)
#                     logging.info(f"Downloaded input file: {file_path} -> {local_filepath}")
#                 except Exception as e:
#                     logging.error(f"Failed to download input file {file_path}: {e}")
#                     raise Exception(f"Failed to download required input file: {os.path.basename(file_path)}")
#         else:
#             logging.warning("No input files found in task parameters")

#         # --- 智能Docker镜像管理 ---
#         image_name = tool.dockerImage
#         logging.info(f"Checking Docker image: {image_name}")

#         # 检查本地是否已有镜像
#         try:
#             local_image = docker_client.images.get(image_name)
#             logging.info(f"Found local image: {image_name} (ID: {local_image.id[:12]})")

#             # 检查镜像是否需要更新（可选：检查镜像创建时间）
#             image_age_hours = (datetime.now(timezone.utc) - datetime.fromisoformat(local_image.attrs['Created'].replace('Z', '+00:00'))).total_seconds() / 3600

#             if image_age_hours > 24:  # 镜像超过24小时，检查更新
#                 logging.info(f"Local image is {image_age_hours:.1f} hours old, checking for updates...")
#                 should_pull = True
#             else:
#                 logging.info(f"Using cached local image (age: {image_age_hours:.1f} hours)")
#                 should_pull = False

#         except docker.errors.ImageNotFound:
#             logging.info(f"Local image not found, will pull from ACR")
#             should_pull = True

#         # 从ACR拉取镜像（如果需要）
#         if should_pull:
#             try:
#                 logging.info("Getting ACR credentials...")
#                 acr_token, acr_username = get_acr_login_info()
#                 registry_url = image_name.split('/')[0]

#                 logging.info(f"Pulling image {image_name} from ACR registry {registry_url}...")
#                 docker_client.images.pull(
#                     repository=image_name,
#                     auth_config={'username': acr_username, 'password': acr_token}
#                 )
#                 logging.info(f"Successfully pulled image: {image_name}")

#                 # 清理旧镜像（保留最新的2个版本）
#                 try:
#                     all_images = docker_client.images.list(name=image_name.split(':')[0])
#                     if len(all_images) > 2:
#                         for old_image in all_images[2:]:
#                             docker_client.images.remove(old_image.id, force=True)
#                             logging.info(f"Removed old image: {old_image.id[:12]}")
#                 except Exception as cleanup_error:
#                     logging.warning(f"Failed to cleanup old images: {cleanup_error}")

#             except Exception as pull_error:
#                 logging.error(f"Failed to pull image {image_name}: {pull_error}")
#                 raise Exception(f"Failed to pull required Docker image: {image_name}")

#         # 准备容器环境 - 使用唯一容器名称生成器
#         container_name = generate_unique_container_name(task.id)
#         volumes = {
#             local_input_dir: {'bind': '/data/input', 'mode': 'ro'},
#             local_output_dir: {'bind': '/data/output', 'mode': 'rw'},
#             local_log_dir: {'bind': '/data/logs', 'mode': 'rw'}
#         }

#         # 执行Docker容器
#         logging.info(f"Starting container {container_name} with image {image_name}")
#         task_logger.log('INFO', 'CONTAINER', f'Starting container {container_name}')

#         try:
#             container = docker_client.containers.run(
#                 tool.dockerImage,
#                 detach=True,
#                 name=container_name,
#                 environment=env_vars,
#                 volumes=volumes,
#                 remove=True,
#                 nano_cpus=int(float(JOB_CPU_REQUEST) * 1e9),
#                 mem_limit=f"{JOB_MEMORY_REQUEST_GB}g",
#                 network_mode='none',  # Disable networking for security
#                 cap_drop=['ALL'],  # Drop all Linux capabilities
#                 read_only=True,  # 保持安全性：只读文件系统
#                 tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},  # Secure temporary filesystem
#                 security_opt=['no-new-privileges:true']  # Prevent privilege escalation
#             )
#             # 等待容器完成并获取结果
#             result = container.wait()
#             exit_code = result['StatusCode']
#             logs = container.logs().decode('utf-8')
#             logging.info(f"Container {container_name} finished with exit code {exit_code}")

#             # 处理执行结果
#             if exit_code == 0:
#                 logging.info(f"Task {task.id} completed successfully")
#                 task.status = 'COMPLETED'

#                 # 上传输出文件到OSS（使用数据库中配置的输出目录）
#                 output_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_RESULTS)
#                 output_files = os.listdir(local_output_dir)

#                 # 从数据库参数获取输出目录路径
#                 output_directory = task.parameters.get('outputDirectory', f"{task.userId}/{task.id}/outputs")

#                 uploaded_files = []
#                 if output_files:
#                     for output_file in output_files:
#                         local_file_path = os.path.join(local_output_dir, output_file)
#                         oss_file_path = f"{output_directory}/{output_file}"
#                         try:
#                             output_bucket.put_object_from_file(oss_file_path, local_file_path)
#                             uploaded_files.append(oss_file_path)
#                             logging.info(f"Uploaded output file: {oss_file_path}")
#                         except Exception as upload_error:
#                             logging.error(f"Failed to upload output file {output_file}: {upload_error}")

#                     if uploaded_files:
#                         # 设置主输出文件（优先选择zip文件）
#                         main_output = next((f for f in uploaded_files if f.endswith('.zip')), uploaded_files[0])
#                         task.outputFile = main_output
#                         logging.info(f"Task output available at: {main_output}")
#                     else:
#                         logging.error("Failed to upload any output files")
#                 else:
#                     logging.warning(f"No output files found for task {task.id} in {local_output_dir}")
#             else:
#                 logging.error(f"Task {task.id} failed with exit code {exit_code}")
#                 task.status = 'FAILED'
#                 task.errorMessage = logs[-2000:] if logs else f"Container exited with code {exit_code}"

#         except Exception as container_error:
#             logging.error(f"Container execution error for task {task.id}: {container_error}")
#             task.status = 'FAILED'
#             task.errorMessage = f"Container execution failed: {str(container_error)}"

#         # 上传日志到OSS
#         try:
#             log_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_LOGS)
#             log_directory = task.parameters.get('logDirectory', f"{task.userId}/{task.id}/logs")

#             # 上传容器日志
#             if logs:
#                 container_log_path = f"{log_directory}/container.log"
#                 log_bucket.put_object(container_log_path, logs.encode('utf-8'))
#                 logging.info(f"Uploaded container log to: {container_log_path}")

#             # 上传任务执行日志
#             task_log_content = task_logger.generateLogReport()
#             task_log_path = f"{log_directory}/task_execution.json"
#             log_bucket.put_object(task_log_path, task_log_content.encode('utf-8'))
#             task.logFile = task_log_path
#             logging.info(f"Uploaded task log to: {task_log_path}")

#         except Exception as log_upload_error:
#             logging.error(f"Failed to upload logs for task {task.id}: {log_upload_error}")

#         # 清理临时文件
#         try:
#             import shutil
#             shutil.rmtree(local_base)
#             logging.info(f"Cleaned up temporary directory: {local_base}")
#         except Exception as cleanup_error:
#             logging.warning(f"Failed to cleanup temporary directory {local_base}: {cleanup_error}")

#         # 设置任务状态为运行中
#         task.status = 'RUNNING'
#         task.startedAt = datetime.now(timezone.utc)
#         task.workerId = os.getenv('WORKER_ID', 'worker-01')
#         task.ecsInstanceId = os.getenv('ECS_INSTANCE_ID', 'ecs-single-instance')
#         session.commit()

#         # 获取STS凭证
#         sts_ak, sts_sk, sts_token = get_sts_credentials_for_task(task.id, task.userId)

#         container_name = generate_unique_container_name(task.id)
#         local_input_dir = os.path.join(local_base, "input")
#         local_output_dir = os.path.join(local_base, "output")
#         local_log_dir = os.path.join(local_base, "logs")
#         local_work_dir = os.path.join(local_base, "work")  # SDC工具工作目录
#         for d in [local_input_dir, local_output_dir, local_log_dir, local_work_dir]:
#             os.makedirs(d, exist_ok=True)

#         # 处理多文件输入（特别是SDC工具的三个文件）
#         input_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_USER_INPUT)

#         # 下载主文件（向后兼容）
#         if task.inputOssPath:
#             local_input_filepath = os.path.join(local_input_dir, os.path.basename(task.inputOssPath))
#             input_bucket.get_object_to_file(task.inputOssPath, local_input_filepath)
#             logging.info(f"Downloaded main input file: {task.inputOssPath}")

#         # 从数据库参数中获取输入文件信息并下载
#         if 'inputFilesList' in task.parameters and task.parameters['inputFilesList']:
#             logging.info(f"Downloading {len(task.parameters['inputFilesList'])} input files...")
#             for file_path in task.parameters['inputFilesList']:
#                 local_filepath = os.path.join(local_input_dir, os.path.basename(file_path))
#                 try:
#                     input_bucket.get_object_to_file(file_path, local_filepath)
#                     logging.info(f"Downloaded input file: {file_path} -> {local_filepath}")
#                 except Exception as e:
#                     logging.error(f"Failed to download input file {file_path}: {e}")
#                     raise Exception(f"Failed to download required input file: {os.path.basename(file_path)}")
#         else:
#             logging.warning("No input files found in task parameters")
        
#         # 基础环境变量
#         env_vars = {
#             'OSS_ACCESS_KEY_ID': sts_ak, 'OSS_ACCESS_KEY_SECRET': sts_sk, 'OSS_SECURITY_TOKEN': sts_token,
#             'OSS_REGION': OSS_REGION, 'TASK_ID': task.id, 'USER_ID': task.userId,
#             'JOB_PARAMETERS': json.dumps(task.parameters),
#             'JOB_INPUT_DIR': '/data/input', 'JOB_OUTPUT_DIR': '/data/output', 'JOB_LOG_DIR': '/data/logs',
#             'OSS_BUCKET_OUTPUT': OSS_BUCKET_JOB_RESULTS, 'OSS_BUCKET_LOGS': OSS_BUCKET_JOB_LOGS
#         }

#         # 添加用户权限信息到环境变量
#         user_permission_type = task.parameters.get('userPermissionType', 'free')
#         # 转换为工具期望的格式：free -> fre, pro/professional -> pro
#         if user_permission_type == 'free':
#             tool_permission_type = 'fre'
#         elif user_permission_type in ['pro', 'professional']:
#             tool_permission_type = 'pro'
#         else:
#             tool_permission_type = 'fre'  # 默认为免费用户
#         env_vars['USER_PERMISSION_TYPE'] = tool_permission_type
#         logging.info(f"User permission type for task {task.id}: {user_permission_type} -> Tool format: {tool_permission_type}")

#         # SDC工具特定的环境变量
#         if tool.id == 'sdc-generator':
#             sdc_params = task.parameters
#             env_vars.update({
#                 'SDC_MOD_NAME': sdc_params.get('modName', 'default_module'),
#                 'SDC_IS_FLAT': 'true' if sdc_params.get('isFlat', False) else 'false',
#                 'SDC_HIER_FILE': '/data/input/hier.yaml',
#                 'SDC_VLOG_FILE': '/data/input/vlog.v',
#                 'SDC_DCONT_FILE': '/data/input/dcont.xlsx',
#                 'SDC_WORK_DIR': '/data/work',
#                 'SDC_OUTPUT_ZIP': '/data/output/sdc_results.zip'
#             })
#             logging.info(f"SDC tool parameters: modName={sdc_params.get('modName')}, isFlat={sdc_params.get('isFlat')}")

#         # UPF工具特定的环境变量
#         elif tool.id == 'upf-generator':
#             upf_params = task.parameters
#             env_vars.update({
#                 'UPF_MOD_NAME': upf_params.get('modName', 'default_module'),
#                 'UPF_VERSION': upf_params.get('version', '2.0'),
#                 'UPF_IS_FLAT': 'true' if upf_params.get('isFlat', False) else 'false',
#                 'UPF_HIER_FILE': '/data/input/hier.yaml',
#                 'UPF_PVLOG_FILE': '/data/input/pvlog.v',
#                 'UPF_POBJ_FILE': '/data/input/pobj.tcl',
#                 'UPF_PCONT_FILE': '/data/input/pcont.xlsx',
#                 'UPF_WORK_DIR': '/data/work',
#                 'UPF_OUTPUT_ZIP': '/data/output/upf_result.zip'
#             })
#             logging.info(f"UPF tool parameters: modName={upf_params.get('modName')}, version={upf_params.get('version')}, isFlat={upf_params.get('isFlat')}")
#         volumes = {
#             local_input_dir: {'bind': '/data/input', 'mode': 'ro'},
#             local_output_dir: {'bind': '/data/output', 'mode': 'rw'},
#             local_log_dir: {'bind': '/data/logs', 'mode': 'rw'},
#             local_work_dir: {'bind': '/data/work', 'mode': 'rw'},  # SDC工具工作目录
#         }

#         logging.info(f"Starting container {container_name} with image {tool.dockerImage}...")
        
#         # Log container security configuration for audit
#         logging.info(f"Container security: network_mode=none, cap_drop=ALL, memory_limit={JOB_MEMORY_REQUEST_GB}g, cpu_limit={JOB_CPU_REQUEST}")

#         try:
#             container = docker_client.containers.run(
#                 tool.dockerImage,
#                 detach=True,
#                 name=container_name,
#                 environment=env_vars,
#                 volumes=volumes,
#                 remove=True,
#                 nano_cpus=int(float(JOB_CPU_REQUEST) * 1e9),
#                 mem_limit=f"{JOB_MEMORY_REQUEST_GB}g",
#                 network_mode='none',  # Disable networking for security
#                 cap_drop=['ALL'],  # Drop all Linux capabilities
#                 read_only=True,  # 保持安全性：只读文件系统
#                 tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},  # Secure temporary filesystem
#                 security_opt=['no-new-privileges:true']  # Prevent privilege escalation
#             )
#             # 等待容器完成并获取结果
#             result = container.wait()
#             exit_code = result['StatusCode']
#             logs = container.logs().decode('utf-8')
#             logging.info(f"Container {container_name} finished with exit code {exit_code}")

#             # 处理执行结果
#             if exit_code == 0:
#                 logging.info(f"Task {task.id} completed successfully")
#                 task.status = 'COMPLETED'

#                 # 上传输出文件到OSS（使用数据库中配置的输出目录）
#                 output_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_RESULTS)
#                 output_files = os.listdir(local_output_dir)

#                 # 从数据库参数获取输出目录路径
#                 output_directory = task.parameters.get('outputDirectory', f"{task.userId}/{task.id}/outputs")

#                 if output_files:
#                     # 上传所有输出文件到正确的OSS路径
#                     uploaded_files = []
#                     for output_file in output_files:
#                         oss_object_name = f"{output_directory}/{output_file}"
#                         local_file_path = os.path.join(local_output_dir, output_file)
#                         try:
#                             output_bucket.put_object_from_file(oss_object_name, local_file_path)
#                             uploaded_files.append(oss_object_name)
#                             logging.info(f"Uploaded output file: {oss_object_name}")
#                         except Exception as e:
#                             logging.error(f"Failed to upload output file {output_file}: {e}")

#                     if uploaded_files:
#                         # 设置主输出文件（优先选择zip文件）
#                         main_output = next((f for f in uploaded_files if f.endswith('.zip')), uploaded_files[0])
#                         task.outputOssPath = main_output
#                         logging.info(f"Task output available at: {main_output}")
#                     else:
#                         logging.error("Failed to upload any output files")
#                 else:
#                     logging.warning(f"No output files found for task {task.id} in {local_output_dir}")
#             else:
#                 logging.error(f"Task {task.id} failed with exit code {exit_code}")
#                 task.status = 'FAILED'
#                 task.errorMessage = logs[-2000:] if logs else f"Container exited with code {exit_code}"

#         except Exception as container_error:
#             logging.error(f"Container execution error for task {task.id}: {container_error}")
#             task.status = 'FAILED'
#             task.errorMessage = f"Container execution failed: {str(container_error)}"

#         # 上传日志文件到OSS
#         log_file_name = f"execution_{task.id}.log"
#         local_log_filepath = os.path.join(local_log_dir, log_file_name)

#         # 创建详细的执行日志
#         detailed_log = f"""
# Task Execution Log
# ==================
# Task ID: {task.id}
# User ID: {task.userId}
# Tool ID: {tool.id}
# Started At: {task.startedAt}
# Finished At: {datetime.now(timezone.utc)}
# Exit Code: {exit_code if 'exit_code' in locals() else 'N/A'}
# Status: {task.status}

# Container Logs:
# ===============
# {logs if 'logs' in locals() else 'No logs available'}

# Environment Variables:
# =====================
# {json.dumps(env_vars, indent=2)}

# Input Files:
# ============
# {json.dumps(task.parameters.get('inputFiles', []), indent=2)}
# """

#         with open(local_log_filepath, 'w') as f:
#             f.write(detailed_log)

#         # 上传日志到OSS
#         try:
#             log_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_LOGS)
#             oss_log_object_name = f"{task.userId}/{task.id}/logs/{log_file_name}"
#             log_bucket.put_object_from_file(oss_log_object_name, local_log_filepath)
#             task.logOssPath = oss_log_object_name
#             logging.info(f"Uploaded log file: {oss_log_object_name}")
#         except Exception as log_error:
#             logging.error(f"Failed to upload log file: {log_error}")
#             # 不因为日志上传失败而影响任务状态

#         task.finishedAt = datetime.now(timezone.utc)
#         session.commit()
#         logging.info(f"Task {task.id} finished with status: {task.status}")
#     except Exception as e:
#         logging.error(f"Error processing task {task_id}: {e}", exc_info=True)
#         if task and session.is_active:
#             task.status = 'FAILED'
#             task.errorMessage = str(e)
#             task.finishedAt = datetime.now(timezone.utc)
#             session.commit()
#     finally:
#         # 清理数据库会话
#         if session.is_active:
#             session.close()

#         # 清理临时目录
#         if os.path.exists(local_base):
#             try:
#                 # 计算临时目录大小
#                 total_size = 0
#                 for dirpath, dirnames, filenames in os.walk(local_base):
#                     for filename in filenames:
#                         filepath = os.path.join(dirpath, filename)
#                         total_size += os.path.getsize(filepath)

#                 shutil.rmtree(local_base)
#                 logging.info(f"Cleaned up temporary directory: {local_base} (freed {total_size / 1024 / 1024:.2f} MB)")
#             except Exception as cleanup_error:
#                 logging.error(f"Failed to cleanup temporary directory {local_base}: {cleanup_error}")
#         else:
#             logging.debug(f"Temporary directory {local_base} does not exist, no cleanup needed")

#         task_logger.log('INFO', 'PROCESS', f'ECS+OSS+ACR processing completed for tool type: {tool_type}')
#         return task.status == 'COMPLETED'

def worker_loop():
    """
    Main loop to poll Redis and process tasks.
    注意：此函数现在已被废弃，由WorkerManager统一管理
    保留此函数仅为向后兼容性
    """
    logging.warning("worker_loop() is deprecated. Use WorkerManager instead.")

    # 获取资源管理器
    rm = get_resource_manager()

    while True:
        try:
            logging.info("Worker waiting for new task...")

            # 检查资源可用性
            if hasattr(rm, 'get_resource_status'):
                # 使用SharedResourceManager
                status = rm.get_resource_status()
                if (status['cpu_used'] >= status['cpu_total'] or
                    status['memory_used_gb'] >= status['memory_total_gb']):
                    logging.warning("Not enough resources to pick a new task. Waiting...")
                    time.sleep(10)
                    continue
            else:
                # 使用旧的资源管理器
                if rm['cpu_used'] >= ECS_TOTAL_CPU or rm['memory_used_gb'] >= ECS_TOTAL_MEMORY_GB:
                    logging.warning("Not enough resources to pick a new task. Waiting...")
                    time.sleep(10)
                    continue

            # 步骤8：Worker获取任务ID
            _, task_id_bytes = redis_client.blpop(TASK_QUEUE_NAME, timeout=0)
            task_id = task_id_bytes.decode('utf-8')

            # 记录Worker获取任务
            logging.info(f"Worker {os.getpid()} picked up task {task_id}")

            # 尝试分配资源
            if hasattr(rm, 'try_allocate_resources'):
                # 使用SharedResourceManager
                if not rm.try_allocate_resources(task_id):
                    logging.info(f"Not enough resources for task {task_id}. Re-queueing.")
                    redis_client.lpush(TASK_QUEUE_NAME, task_id)
                    time.sleep(5)
                    continue
            else:
                # 使用旧的资源管理器
                if rm['cpu_used'] + JOB_CPU_REQUEST > ECS_TOTAL_CPU or rm['memory_used_gb'] + JOB_MEMORY_REQUEST_GB > ECS_TOTAL_MEMORY_GB:
                    logging.info(f"Not enough resources for task {task_id}. Re-queueing.")
                    redis_client.lpush(TASK_QUEUE_NAME, task_id)
                    time.sleep(5)
                    continue

                rm['cpu_used'] += JOB_CPU_REQUEST
                rm['memory_used_gb'] += JOB_MEMORY_REQUEST_GB
                logging.info(f"Resources allocated for task {task_id}. Used CPU: {rm['cpu_used']}/{ECS_TOTAL_CPU}, Used Mem: {rm['memory_used_gb']}/{ECS_TOTAL_MEMORY_GB}GB.")

            try:
                process_task(task_id)
            finally:
                # 释放资源
                if hasattr(rm, 'release_resources'):
                    # 使用SharedResourceManager
                    rm.release_resources(task_id)
                else:
                    # 使用旧的资源管理器
                    rm['cpu_used'] -= JOB_CPU_REQUEST
                    rm['memory_used_gb'] -= JOB_MEMORY_REQUEST_GB
                    logging.info(f"Resources released for task {task_id}. Used CPU: {rm['cpu_used']}, Used Mem: {rm['memory_used_gb']}GB.")

        except Exception as e:
            logging.critical(f"An unexpected error occurred in worker loop: {e}", exc_info=True)
            time.sleep(10)

def process_temp_files(task, task_logger, file_manager):
    """从temp目录复制文件到工作目录"""
    try:
        import shutil

        task_id = task.id
        # 使用环境变量配置的temp目录
        temp_upload_dir = os.environ.get('TEMP_UPLOAD_DIR', os.path.join(os.getcwd(), 'temp'))
        temp_dir = os.path.join(temp_upload_dir, task_id)

        # 检查temp目录是否存在
        if not os.path.exists(temp_dir):
            task_logger.log('INFO', 'FILES', f'No temp directory found at {temp_dir}, no input files to process')
            return

        # 获取temp目录中的文件列表
        temp_files = os.listdir(temp_dir)
        if not temp_files:
            task_logger.log('INFO', 'FILES', 'No files found in temp directory')
            return

        task_logger.log('INFO', 'FILES', f'Processing {len(temp_files)} files from temp directory: {temp_files}')

        # 从任务参数中获取ModName和工具类型
        mod_name = task.parameters.get('modName', 'default_module')
        tool_type = task.parameters.get('toolType', 'sdcgen')

        # 判断是否为多页面交互模式
        # 多页面交互任务通过特殊的API路径提交，会在参数中包含特殊标识
        is_multi_page = task.parameters.get('isMultiPage', False) or task.parameters.get('pageMethod') == 'multi'
        task_logger.log('INFO', 'FILES', f'Task mode: {"Multi-page" if is_multi_page else "Single-page"} interaction')

        # 确保目标目录存在
        input_dir = file_manager.get_input_dir()

        # 使用统一的工具工作目录方法构建正确的work目录路径
        try:
            tool_work_dir = file_manager.get_tool_work_dir(mod_name, tool_type)
            work_inputs_dir = os.path.join(tool_work_dir, 'inputs')

            # 多页面交互模式需要额外的json目录
            work_json_dir = None
            if is_multi_page:
                work_json_dir = os.path.join(tool_work_dir, 'json')
                task_logger.log('INFO', 'FILES', f'Creating target directories: input={input_dir}, work_inputs={work_inputs_dir}, work_json={work_json_dir}')
            else:
                task_logger.log('INFO', 'FILES', f'Creating target directories: input={input_dir}, work_inputs={work_inputs_dir}')
        except Exception as e:
            task_logger.log('ERROR', 'FILES', f'Failed to get tool work directory: {str(e)}')
            raise e

        try:
            os.makedirs(input_dir, exist_ok=True)
            task_logger.log('INFO', 'FILES', f'Input directory created/verified: {input_dir}')
        except Exception as e:
            task_logger.log('ERROR', 'FILES', f'Failed to create input directory {input_dir}: {str(e)}')
            raise e

        try:
            os.makedirs(work_inputs_dir, exist_ok=True)
            task_logger.log('INFO', 'FILES', f'Work inputs directory created/verified: {work_inputs_dir}')
        except Exception as e:
            task_logger.log('ERROR', 'FILES', f'Failed to create work inputs directory {work_inputs_dir}: {str(e)}')
            raise e

        # 多页面交互模式创建json目录
        if is_multi_page and work_json_dir:
            try:
                os.makedirs(work_json_dir, exist_ok=True)
                task_logger.log('INFO', 'FILES', f'Work json directory created/verified: {work_json_dir}')
            except Exception as e:
                task_logger.log('ERROR', 'FILES', f'Failed to create work json directory {work_json_dir}: {str(e)}')
                raise e

        if is_multi_page:
            task_logger.log('INFO', 'FILES', f'Target directories ready: input={input_dir}, work_inputs={work_inputs_dir}, work_json={work_json_dir}')
        else:
            task_logger.log('INFO', 'FILES', f'Target directories ready: input={input_dir}, work_inputs={work_inputs_dir}')

        # 复制文件到目标目录 - 根据交互模式区分处理逻辑
        successful_copies = 0
        failed_copies = 0

        # 定义多页面交互模式下需要特殊处理的文件
        if tool_type == 'upfgen':
            main_files = ['hier.yaml', 'pvlog.v', 'pobj.tcl', 'pcell.yaml', 'pcont.xlsx']  # UPF主要文件
        if tool_type == 'sdcgen':
            main_files = ['hier.yaml', 'vlog.v', 'dcont.xlsx']  # SDC主要文件

        for filename in temp_files:
            temp_file_path = os.path.join(temp_dir, filename)
            task_logger.log('INFO', 'FILES', f'Processing file: {filename} from {temp_file_path}')

            if not os.path.isfile(temp_file_path):
                task_logger.log('WARNING', 'FILES', f'Skipping non-file item: {filename}')
                continue

            try:
                # 验证源文件
                file_size = os.path.getsize(temp_file_path)
                task_logger.log('INFO', 'FILES', f'Source file {filename} size: {file_size} bytes')

                # 根据交互模式和文件类型决定复制策略
                if is_multi_page:
                    # 多页面交互模式：区分文件类型
                    if filename in main_files:
                        # 主要文件：复制到input和work/inputs目录
                        task_logger.log('INFO', 'FILES', f'Multi-page mode: copying main file {filename} to input and work/inputs')

                        # 复制到input目录
                        input_file_path = os.path.join(input_dir, filename)
                        task_logger.log('INFO', 'FILES', f'Copying {filename} to input directory: {input_file_path}')
                        shutil.copy2(temp_file_path, input_file_path)

                        # 验证input目录复制结果
                        if os.path.exists(input_file_path):
                            input_file_size = os.path.getsize(input_file_path)
                            task_logger.log('INFO', 'FILES', f'Successfully copied {filename} to input directory ({input_file_size} bytes)')
                        else:
                            raise Exception(f'File {filename} not found in input directory after copy')

                        # 复制到work/ModName/sdcgen/inputs目录
                        work_input_file_path = os.path.join(work_inputs_dir, filename)
                        task_logger.log('INFO', 'FILES', f'Copying {filename} to work inputs directory: {work_input_file_path}')
                        shutil.copy2(temp_file_path, work_input_file_path)

                        # 验证work inputs目录复制结果
                        if os.path.exists(work_input_file_path):
                            work_file_size = os.path.getsize(work_input_file_path)
                            task_logger.log('INFO', 'FILES', f'Successfully copied {filename} to work inputs directory ({work_file_size} bytes)')
                        else:
                            raise Exception(f'File {filename} not found in work inputs directory after copy')

                        task_logger.log('INFO', 'FILES', f'Main file {filename} successfully copied to input and work/inputs directories ({file_size} bytes)')

                    elif filename.endswith('.json') and work_json_dir:
                        # JSON文件：复制到work/json目录
                        task_logger.log('INFO', 'FILES', f'Multi-page mode: copying JSON file {filename} to work/json')

                        work_json_file_path = os.path.join(work_json_dir, filename)
                        task_logger.log('INFO', 'FILES', f'Copying {filename} to work json directory: {work_json_file_path}')
                        shutil.copy2(temp_file_path, work_json_file_path)

                        # 设置JSON文件权限为666，确保容器内的sdcuser(uid=999)可以覆盖
                        # 在Linux/WSL2下，文件权限严格控制，容器用户无法写入644权限的文件
                        os.chmod(work_json_file_path, 0o666)
                        task_logger.log('INFO', 'FILES', f'Set permissions 666 for {filename} (container user can overwrite)')

                        # 验证work json目录复制结果
                        if os.path.exists(work_json_file_path):
                            json_file_size = os.path.getsize(work_json_file_path)
                            task_logger.log('INFO', 'FILES', f'Successfully copied {filename} to work json directory ({json_file_size} bytes)')
                        else:
                            raise Exception(f'File {filename} not found in work json directory after copy')

                        task_logger.log('INFO', 'FILES', f'JSON file {filename} successfully copied to work/json directory ({file_size} bytes)')

                    else:
                        # 其他文件：跳过
                        task_logger.log('INFO', 'FILES', f'Multi-page mode: skipping file {filename} (not in main files or JSON)')
                        continue

                else:
                    # 单页面交互模式：复制所有文件到input和work/inputs目录（保持原有逻辑）
                    task_logger.log('INFO', 'FILES', f'Single-page mode: copying all files {filename} to input and work/inputs')

                    # 复制到input目录
                    input_file_path = os.path.join(input_dir, filename)
                    task_logger.log('INFO', 'FILES', f'Copying {filename} to input directory: {input_file_path}')
                    shutil.copy2(temp_file_path, input_file_path)

                    # 验证input目录复制结果
                    if os.path.exists(input_file_path):
                        input_file_size = os.path.getsize(input_file_path)
                        task_logger.log('INFO', 'FILES', f'Successfully copied {filename} to input directory ({input_file_size} bytes)')
                    else:
                        raise Exception(f'File {filename} not found in input directory after copy')

                    # 复制到work/ModName/sdcgen/inputs目录
                    work_input_file_path = os.path.join(work_inputs_dir, filename)
                    task_logger.log('INFO', 'FILES', f'Copying {filename} to work inputs directory: {work_input_file_path}')
                    shutil.copy2(temp_file_path, work_input_file_path)

                    # 验证work inputs目录复制结果
                    if os.path.exists(work_input_file_path):
                        work_file_size = os.path.getsize(work_input_file_path)
                        task_logger.log('INFO', 'FILES', f'Successfully copied {filename} to work inputs directory ({work_file_size} bytes)')
                    else:
                        raise Exception(f'File {filename} not found in work inputs directory after copy')

                    task_logger.log('INFO', 'FILES', f'File {filename} successfully copied to both target directories ({file_size} bytes)')

                successful_copies += 1

            except Exception as file_error:
                failed_copies += 1
                error_msg = f'Failed to copy file {filename}: {str(file_error)}'
                task_logger.log('ERROR', 'FILES', error_msg)
                # 不抛出异常，继续处理其他文件
                continue

        # 总结复制结果
        total_files = len([f for f in temp_files if os.path.isfile(os.path.join(temp_dir, f))])
        task_logger.log('INFO', 'FILES', f'File copy summary: {successful_copies}/{total_files} files copied successfully, {failed_copies} failed')

        if successful_copies == 0:
            raise Exception('No files were successfully copied from temp directory')
        elif failed_copies > 0:
            task_logger.log('WARNING', 'FILES', f'{failed_copies} files failed to copy, but continuing with {successful_copies} successful copies')

        task_logger.log('INFO', 'FILES', f'Successfully processed temp files: {successful_copies} copied, {failed_copies} failed')

    except Exception as e:
        task_logger.log('ERROR', 'FILES', f'Failed to process temp files: {str(e)}')
        raise e

def get_system_status_info():
    """获取系统状态信息，包括Redis队列、Worker状态等"""
    try:
        import psutil
        import time

        status_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'worker_pid': os.getpid(),
            'system_info': {}
        }

        # Redis队列状态
        try:
            queue_length = redis_client.llen(TASK_QUEUE_NAME)
            active_tasks_count = redis_client.scard('active_task_ids') if redis_client.exists('active_task_ids') else 0
            status_info['redis_queue'] = {
                'queue_length': queue_length,
                'active_tasks_count': active_tasks_count,
                'queue_name': TASK_QUEUE_NAME
            }
        except Exception as e:
            status_info['redis_queue'] = {'error': str(e)}

        # 系统资源状态
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            status_info['system_info'] = {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_gb': round(memory.available / (1024**3), 2),
                'memory_total_gb': round(memory.total / (1024**3), 2)
            }
        except Exception as e:
            status_info['system_info'] = {'error': str(e)}

        # Docker容器状态
        try:
            import docker
            docker_client = docker.from_env()
            containers = docker_client.containers.list()
            running_containers = [c.name for c in containers if c.status == 'running']
            status_info['docker_info'] = {
                'running_containers_count': len(running_containers),
                'running_containers': running_containers[:5]  # 只显示前5个
            }
        except Exception as e:
            status_info['docker_info'] = {'error': str(e)}

        return status_info

    except Exception as e:
        return {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'worker_pid': os.getpid(),
            'error': f'Failed to collect system status: {str(e)}'
        }

def cleanup_temp_files(task_id, task_logger, cleanup_reason="unknown", retry_count=0, max_retries=3):
    """
    精确的temp目录清理逻辑

    清理条件：
    1. 任务正常执行完，有zip压缩数据生成，并等待2分钟限时下载后清除
    2. 在Redis里排队等待超时，目前是35分钟，也必须清除
    3. 针对Worker进程崩溃异常退出、容器意外中止和任务执行超时3分钟的未完成任务，
       在进行三次重复执行的机制后仍然没有结果输出，也必须清除
    """
    try:
        import shutil
        import glob

        # 使用环境变量配置的temp目录
        temp_upload_dir = os.environ.get('TEMP_UPLOAD_DIR', os.path.join(os.getcwd(), 'temp'))
        temp_dir = os.path.join(temp_upload_dir, task_id)

        # 检查是否满足清理条件
        should_cleanup = False
        cleanup_detail = ""

        if cleanup_reason == "task_completed":
            # 条件1: 任务正常执行完，有zip压缩数据生成，并等待2分钟限时下载后清除
            ecs_jobs_dir = os.environ.get('ECS_JOBS_DIR', os.path.join(os.getcwd(), 'jobs'))
            output_dir = os.path.join(ecs_jobs_dir, task_id, 'output')
            zip_files = glob.glob(os.path.join(output_dir, '*.zip'))

            if zip_files:
                # 检查是否已过2分钟下载期
                session = Session()
                try:
                    task = session.query(Task).filter_by(id=task_id).first()
                    if task and task.finishedAt:
                        from datetime import datetime, timezone
                        time_since_completion = datetime.now(timezone.utc) - task.finishedAt
                        if time_since_completion.total_seconds() > 2 * 60:  # 2分钟
                            should_cleanup = True
                            cleanup_detail = f"Task completed with output files, 2-minute download period expired"
                        else:
                            cleanup_detail = f"Task completed with output files, still in 2-minute download period"
                    else:
                        cleanup_detail = "Task completed but no finish time recorded, keeping temp files"
                finally:
                    session.close()
            else:
                cleanup_detail = "Task completed but no output zip files found, keeping temp files"

        elif cleanup_reason == "queue_timeout":
            # 条件2: 在Redis里排队等待超时，目前是35分钟，也必须清除
            should_cleanup = True
            cleanup_detail = "Redis queue timeout (35 minutes), cleaning up temp files"

        elif cleanup_reason == "max_retries_exceeded":
            # 条件3: 三次重试机制后仍然没有结果输出，必须清除
            if retry_count >= max_retries:
                should_cleanup = True
                cleanup_detail = f"Maximum retry attempts exceeded ({retry_count}/{max_retries}), cleaning up temp files"
            else:
                cleanup_detail = f"Task failed but still has retry opportunities ({retry_count}/{max_retries}), keeping temp files"

        elif cleanup_reason == "task_failed":
            # 检查是否是可重试的失败
            session = Session()
            try:
                task = session.query(Task).filter_by(id=task_id).first()
                current_retry_count = task.retryCount if task else 0
                current_max_retries = task.maxRetries if task else 3

                if current_retry_count >= current_max_retries:
                    should_cleanup = True
                    cleanup_detail = f"Task failed after maximum retries ({current_retry_count}/{current_max_retries}), cleaning up temp files"
                else:
                    cleanup_detail = f"Task failed but can be retried ({current_retry_count}/{current_max_retries}), keeping temp files"
            finally:
                session.close()

        if should_cleanup and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            task_logger.log('INFO', 'CLEANUP', f'Cleaned up temp directory: {temp_dir}. Reason: {cleanup_detail}')
        elif os.path.exists(temp_dir):
            task_logger.log('INFO', 'CLEANUP', f'Temp directory preserved: {temp_dir}. Reason: {cleanup_detail}')
        else:
            task_logger.log('INFO', 'CLEANUP', f'Temp directory not found: {temp_dir}')

    except Exception as e:
        task_logger.log('ERROR', 'CLEANUP', f'Failed to cleanup temp directory: {str(e)}')

def check_local_image_exists(image_name):
    """检查本地Docker镜像是否存在，并自动清理悬空镜像"""
    try:
        # 检查目标镜像是否存在
        target_image = docker_client.images.get(image_name)

        # 如果镜像存在，检查并清理悬空镜像
        clean_dangling_images_for_repository(image_name)

        return True
    except docker.errors.ImageNotFound:
        return False

def clean_dangling_images_for_repository(image_name):
    """清理指定仓库的悬空镜像"""
    try:
        # 提取仓库名称（去掉标签）
        repository = image_name.split(':')[0] if ':' in image_name else image_name

        # 获取所有镜像
        all_images = docker_client.images.list()

        # 查找悬空镜像（没有标签的镜像）
        dangling_images = []
        for image in all_images:
            # 检查是否为悬空镜像
            if not image.tags:
                # 检查是否与目标仓库相关（通过镜像历史或大小判断）
                try:
                    # 获取镜像详细信息
                    image_info = docker_client.api.inspect_image(image.id)

                    # 检查镜像大小是否相似（容差10MB）
                    target_image = docker_client.images.get(image_name)
                    target_size = target_image.attrs['Size']
                    dangling_size = image_info['Size']

                    # 如果大小相似，认为是同一仓库的悬空镜像
                    size_diff = abs(target_size - dangling_size)
                    if size_diff < 10 * 1024 * 1024:  # 10MB容差
                        dangling_images.append(image)

                except Exception as e:
                    # 忽略检查错误，继续处理其他镜像
                    continue

        # 清理悬空镜像
        cleaned_count = 0
        for dangling_image in dangling_images:
            try:
                docker_client.images.remove(dangling_image.id, force=True)
                logging.info(f"Cleaned dangling image: {dangling_image.id[:12]} for repository {repository}")
                cleaned_count += 1
            except Exception as e:
                logging.warning(f"Failed to remove dangling image {dangling_image.id[:12]}: {str(e)}")

        if cleaned_count > 0:
            logging.info(f"Successfully cleaned {cleaned_count} dangling images for repository {repository}")

    except Exception as e:
        logging.warning(f"Failed to clean dangling images for {image_name}: {str(e)}")
        # 不抛出异常，避免影响主要的镜像检查流程

def load_image_from_tar(image_name, task_logger):
    """从tar文件加载Docker镜像"""
    try:
        # 获取ECS Docker目录
        ecs_docker_dir = os.environ.get('ECS_DOCKER_DIR', os.path.join(os.getcwd(), 'docker'))

        # 根据镜像名称确定tar文件路径
        if 'sdc-generator' in image_name:
            tar_file_path = os.path.join(ecs_docker_dir, 'images', 'sdc', 'logiccore_sdc-generator_latest.tar')
        elif 'upf-generator' in image_name:
            tar_file_path = os.path.join(ecs_docker_dir, 'images', 'upf', 'logiccore_upf-generator_latest.tar')
        else:
            task_logger.log('ERROR', 'IMAGE', f'Unknown image type for {image_name}')
            return False

        # 检查tar文件是否存在
        if not os.path.exists(tar_file_path):
            task_logger.log('ERROR', 'IMAGE', f'Image tar file not found: {tar_file_path}')
            return False

        task_logger.log('INFO', 'IMAGE', f'Loading image from tar file: {tar_file_path}')

        # 加载镜像
        with open(tar_file_path, 'rb') as tar_file:
            docker_client.images.load(tar_file)

        # 验证镜像是否成功加载
        if check_local_image_exists(image_name):
            task_logger.log('INFO', 'IMAGE', f'Successfully loaded image: {image_name}')
            return True
        else:
            task_logger.log('ERROR', 'IMAGE', f'Failed to load image: {image_name}')
            return False

    except Exception as e:
        task_logger.log('ERROR', 'IMAGE', f'Error loading image from tar: {str(e)}')
        return False

if __name__ == '__main__':
    logging.info("Starting Python Task Worker...")

    # 孤儿容器清理计数器（每10次空闲循环执行一次，约5分钟）
    orphan_cleanup_counter = 0
    ORPHAN_CLEANUP_INTERVAL = 10

    # 简单的Worker循环，直接监听Redis队列
    while True:
        try:
            logging.info("Waiting for tasks...")

            # 阻塞式获取任务
            logging.info(f"Waiting for tasks from queue: {TASK_QUEUE_NAME}")
            result = redis_client.blpop(TASK_QUEUE_NAME, timeout=30)

            if result:
                queue_name, task_id_bytes = result
                task_id = task_id_bytes.decode('utf-8')

                # 记录任务获取的详细信息
                remaining_queue_length = redis_client.llen(TASK_QUEUE_NAME)
                logging.info(f"✅ Picked up task: {task_id}, remaining in queue: {remaining_queue_length}")

                # 添加Redis队列状态调试信息
                active_tasks = redis_client.scard('active_task_ids') if redis_client.exists('active_task_ids') else 0
                logging.info(f"📊 Queue status - Active tasks: {active_tasks}, Queue length: {remaining_queue_length}")

                # 处理任务
                try:
                    process_task(task_id)
                    logging.info(f"Task {task_id} completed successfully")
                except Exception as e:
                    logging.error(f"Error processing task {task_id}: {e}", exc_info=True)
            else:
                # 没有任务时，检查是否需要执行孤儿容器清理
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