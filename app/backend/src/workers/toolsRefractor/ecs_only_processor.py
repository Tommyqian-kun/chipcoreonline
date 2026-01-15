import os
import json
import time
import logging
import platform
from datetime import datetime, timezone
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
                # 延迟导入避免循环依赖
                from .ecs_oss_acr_processor import process_task_ecs_oss_acr
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
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))))
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

__all__ = [
    'process_task',
    'process_task_ecs_only',
]
