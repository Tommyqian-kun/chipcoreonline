import os
import json
import time
import logging
import docker
from datetime import datetime, timezone
from .core import (
    redis_client, docker_client, Session, Task,
    TASK_QUEUE_NAME, ECS_TOTAL_CPU, ECS_TOTAL_MEMORY_GB,
    JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    get_deployment_mode
)
from .task_runtime import get_resource_manager

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
                from .ecs_only_processor import process_task
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

__all__ = [
    'worker_loop',  # 废弃，保留向后兼容
    'process_temp_files',
    'get_system_status_info',
    'cleanup_temp_files',
    'check_local_image_exists',
    'clean_dangling_images_for_repository',
    'load_image_from_tar',
]
