import os
import json
import time
import logging
from datetime import datetime, timezone
from .core import Task, Session, OSS_BUCKET_JOB_LOGS
from .api_client import update_task_status_via_api_with_retry

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
            from .ecs_oss_acr_processor import get_oss_bucket
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

__all__ = ['TaskLogger']
