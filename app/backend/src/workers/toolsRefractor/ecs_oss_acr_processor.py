import os
import json
import logging
import shutil
import docker
from datetime import datetime, timezone
from .core import (
    docker_client, core_client, Session, Task, Tool,
    OSS_REGION, OSS_BUCKET_USER_INPUT, OSS_BUCKET_JOB_RESULTS, OSS_BUCKET_JOB_LOGS,
    ALIYUN_RAM_ROLE_ARN, JOB_CPU_REQUEST, JOB_MEMORY_REQUEST_GB,
    deployment_mode, ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET,
    ALIYUN_STS_REGION, ACR_REGION, AcsClient, AssumeRoleRequest,
    GetAuthorizationTokenRequest, oss2
)
from .file_manager import EcsLocalFileManager
from .task_context import initialize_task_context
from .task_runtime import generate_unique_container_name

# --- Aliyun Helper Functions ---
def get_sts_credentials_for_task(task_id, user_id):
    """
    Assumes a RAM role to get temporary, scoped-down credentials for OSS operations.
    Implements principle of least privilege with strict resource access control.
    Only used in ECS+OSS+ACR mode.
    """
    if deployment_mode == 'ecs_only':
        raise Exception("STS credentials not available in ECS Only mode")

    if not core_client:
        raise Exception("Aliyun client not initialized")
    policy = {
        "Statement": [
            {
                "Action": ["oss:GetObject"],
                "Effect": "Allow",
                "Resource": [f"acs:oss:*:*:{OSS_BUCKET_USER_INPUT}/{user_id}/{task_id}/*"],
                "Condition": {
                    "StringEquals": {
                        "oss:x-oss-request-id": f"task-{task_id}"
                    }
                }
            },
            {
                "Action": ["oss:PutObject"],
                "Effect": "Allow",
                "Resource": [
                    f"acs:oss:*:*:{OSS_BUCKET_JOB_RESULTS}/{user_id}/{task_id}/*",
                    f"acs:oss:*:*:{OSS_BUCKET_JOB_LOGS}/{user_id}/{task_id}/*"
                ],
                "Condition": {
                    "StringEquals": {
                        "oss:x-oss-request-id": f"task-{task_id}"
                    }
                }
            },
            {
                "Action": ["oss:ListBucket"],
                "Effect": "Deny",
                "Resource": "*"
            }
        ],
        "Version": "1"
    }
    request = AssumeRoleRequest.AssumeRoleRequest()
    request.set_RoleArn(ALIYUN_RAM_ROLE_ARN)
    request.set_RoleSessionName(f"tool-session-{task_id}")
    request.set_Policy(json.dumps(policy))
    request.set_DurationSeconds(1800)  # 30 minutes validity - reduced for security

    try:
        response = core_client.do_action_with_exception(request)
        creds = json.loads(response)['Credentials']

        # Log STS credential issuance for security audit
        logging.info(f"STS credentials issued for task {task_id}, user {user_id}, expires at {creds['Expiration']}")

        return creds['AccessKeyId'], creds['AccessKeySecret'], creds['SecurityToken']
    except Exception as e:
        logging.error(f"Failed to assume role for OSS task {task_id}: {e}")
        # Log security event for monitoring
        logging.warning(f"Security Alert: STS credential request failed for task {task_id}, user {user_id}")
        raise

def get_acr_login_info():
    """
    Gets a temporary authorization token for logging into Aliyun Container Registry (ACR).
    Only used in ECS+OSS+ACR mode.
    """
    if deployment_mode == 'ecs_only':
        raise Exception("ACR login not available in ECS Only mode")

    request = GetAuthorizationTokenRequest.GetAuthorizationTokenRequest()
    request.set_accept_format('json')
    try:
        # The client for ACR must be initialized for the specific ACR region
        acr_client = AcsClient(ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ACR_REGION)
        response = acr_client.do_action_with_exception(request)
        data = json.loads(response)
        return data['authorizationToken'], data['tempUserName']
    except Exception as e:
        logging.error(f"Failed to get ACR authorization token: {e}")
        raise

def get_oss_bucket(access_key_id, access_key_secret, security_token, bucket_name):
    """Initializes an OSS2 Bucket object with STS credentials. Only used in ECS+OSS+ACR mode."""
    if deployment_mode == 'ecs_only':
        raise Exception("OSS bucket not available in ECS Only mode")

    auth = oss2.StsAuth(access_key_id, access_key_secret, security_token)
    endpoint = f'http://{OSS_REGION}.aliyuncs.com'
    return oss2.Bucket(auth, endpoint, bucket_name)

def process_task_ecs_oss_acr(task, task_logger, session):
    """ECS + OSS + ACR模式任务处理"""
    try:
        # 使用统一的任务初始化
        context = initialize_task_context(task, task_logger, session)
        module_name, tool_type, file_manager, tool, params = context

        # 使用统一的临时目录管理 - 使用TEMP_UPLOAD_DIR而不是TEMP_JOBS_DIR
        temp_upload_dir = os.environ.get('TEMP_UPLOAD_DIR', '/tmp/logiccore_temp')
        local_base = os.path.join(temp_upload_dir, task.id)

        task_logger.log('INFO', 'PROCESS', f'Starting ECS+OSS+ACR mode processing for tool type: {tool_type}')

        # --- 智能Docker镜像管理 ---
        image_name = tool.dockerImage
        logging.info(f"Checking Docker image: {image_name}")

        # 检查本地是否已有镜像
        try:
            local_image = docker_client.images.get(image_name)
            logging.info(f"Found local image: {image_name} (ID: {local_image.id[:12]})")

            # 检查镜像是否需要更新（可选：检查镜像创建时间）
            image_age_hours = (datetime.now(timezone.utc) - datetime.fromisoformat(local_image.attrs['Created'].replace('Z', '+00:00'))).total_seconds() / 3600

            if image_age_hours > 24:  # 镜像超过24小时，检查更新
                logging.info(f"Local image is {image_age_hours:.1f} hours old, checking for updates...")
                should_pull = True
            else:
                logging.info(f"Using cached local image (age: {image_age_hours:.1f} hours)")
                should_pull = False

        except docker.errors.ImageNotFound:
            logging.info(f"Local image not found, will pull from ACR")
            should_pull = True

        # 从ACR拉取镜像（如果需要）
        if should_pull:
            try:
                logging.info("Getting ACR credentials...")
                acr_token, acr_username = get_acr_login_info()
                registry_url = image_name.split('/')[0]

                logging.info(f"Pulling image {image_name} from ACR registry {registry_url}...")
                docker_client.images.pull(
                    repository=image_name,
                    auth_config={'username': acr_username, 'password': acr_token}
                )
                logging.info(f"Successfully pulled image: {image_name}")

                # 清理旧镜像（保留最新的2个版本）
                try:
                    all_images = docker_client.images.list(name=image_name.split(':')[0])
                    if len(all_images) > 2:
                        for old_image in all_images[2:]:
                            docker_client.images.remove(old_image.id, force=True)
                            logging.info(f"Removed old image: {old_image.id[:12]}")
                except Exception as cleanup_error:
                    logging.warning(f"Failed to cleanup old images: {cleanup_error}")

            except Exception as pull_error:
                logging.error(f"Failed to pull image {image_name}: {pull_error}")
                # 如果拉取失败但有本地镜像，继续使用本地镜像
                try:
                    docker_client.images.get(image_name)
                    logging.warning(f"Using existing local image due to pull failure")
                except docker.errors.ImageNotFound:
                    raise Exception(f"No local image available and pull failed: {pull_error}")

        # 更新任务状态
        task.status = 'RUNNING'
        task.startedAt = datetime.now(timezone.utc)
        task.workerId = os.getenv('WORKER_ID', 'worker-01')
        task.ecsInstanceId = os.getenv('ECS_INSTANCE_ID', 'ecs-single-instance')
        session.commit()

        # 设置容器环境变量（与ECS Only模式保持一致）
        env_vars = {
            'TASK_ID': task.id,
            'USER_ID': task.userId,
            'TOOL_ID': task.toolId,
            'DEPLOYMENT_MODE': 'ecs_oss_acr',
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

        # 添加任务参数到环境变量
        if params:
            for key, value in params.items():
                env_vars[f'PARAM_{key.upper()}'] = str(value)

        # 获取STS临时凭证用于OSS访问
        sts_ak, sts_sk, sts_token = get_sts_credentials_for_task(task.id, task.userId)
        task_logger.log('INFO', 'STS', 'STS credentials obtained for OSS access')

        # 创建本地工作目录
        local_input_dir = os.path.join(local_base, 'inputs')
        local_output_dir = os.path.join(local_base, 'outputs')
        local_log_dir = os.path.join(local_base, 'logs')

        for d in [local_input_dir, local_output_dir, local_log_dir]:
            os.makedirs(d, exist_ok=True)

        # 处理多文件输入（特别是SDC工具的三个文件）
        input_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_USER_INPUT)

        # 下载主文件（向后兼容）
        if task.inputOssPath:
            local_input_filepath = os.path.join(local_input_dir, os.path.basename(task.inputOssPath))
            input_bucket.get_object_to_file(task.inputOssPath, local_input_filepath)
            logging.info(f"Downloaded main input file: {task.inputOssPath}")

        # 从数据库参数中获取输入文件信息并下载
        if 'inputFilesList' in task.parameters and task.parameters['inputFilesList']:
            logging.info(f"Downloading {len(task.parameters['inputFilesList'])} input files...")
            for file_path in task.parameters['inputFilesList']:
                local_filepath = os.path.join(local_input_dir, os.path.basename(file_path))
                try:
                    input_bucket.get_object_to_file(file_path, local_filepath)
                    logging.info(f"Downloaded input file: {file_path} -> {local_filepath}")
                except Exception as e:
                    logging.error(f"Failed to download input file {file_path}: {e}")
                    raise Exception(f"Failed to download required input file: {os.path.basename(file_path)}")
        else:
            logging.warning("No input files found in task parameters")

        # --- 智能Docker镜像管理 ---
        image_name = tool.dockerImage
        logging.info(f"Checking Docker image: {image_name}")

        # 检查本地是否已有镜像
        try:
            local_image = docker_client.images.get(image_name)
            logging.info(f"Found local image: {image_name} (ID: {local_image.id[:12]})")

            # 检查镜像是否需要更新（可选：检查镜像创建时间）
            image_age_hours = (datetime.now(timezone.utc) - datetime.fromisoformat(local_image.attrs['Created'].replace('Z', '+00:00'))).total_seconds() / 3600

            if image_age_hours > 24:  # 镜像超过24小时，检查更新
                logging.info(f"Local image is {image_age_hours:.1f} hours old, checking for updates...")
                should_pull = True
            else:
                logging.info(f"Using cached local image (age: {image_age_hours:.1f} hours)")
                should_pull = False

        except docker.errors.ImageNotFound:
            logging.info(f"Local image not found, will pull from ACR")
            should_pull = True

        # 从ACR拉取镜像（如果需要）
        if should_pull:
            try:
                logging.info("Getting ACR credentials...")
                acr_token, acr_username = get_acr_login_info()
                registry_url = image_name.split('/')[0]

                logging.info(f"Pulling image {image_name} from ACR registry {registry_url}...")
                docker_client.images.pull(
                    repository=image_name,
                    auth_config={'username': acr_username, 'password': acr_token}
                )
                logging.info(f"Successfully pulled image: {image_name}")

                # 清理旧镜像（保留最新的2个版本）
                try:
                    all_images = docker_client.images.list(name=image_name.split(':')[0])
                    if len(all_images) > 2:
                        for old_image in all_images[2:]:
                            docker_client.images.remove(old_image.id, force=True)
                            logging.info(f"Removed old image: {old_image.id[:12]}")
                except Exception as cleanup_error:
                    logging.warning(f"Failed to cleanup old images: {cleanup_error}")

            except Exception as pull_error:
                logging.error(f"Failed to pull image {image_name}: {pull_error}")
                raise Exception(f"Failed to pull required Docker image: {image_name}")

        # 准备容器环境 - 使用唯一容器名称生成器
        container_name = generate_unique_container_name(task.id)
        volumes = {
            local_input_dir: {'bind': '/data/input', 'mode': 'ro'},
            local_output_dir: {'bind': '/data/output', 'mode': 'rw'},
            local_log_dir: {'bind': '/data/logs', 'mode': 'rw'}
        }

        # 执行Docker容器
        logging.info(f"Starting container {container_name} with image {image_name}")
        task_logger.log('INFO', 'CONTAINER', f'Starting container {container_name}')

        try:
            container = docker_client.containers.run(
                tool.dockerImage,
                detach=True,
                name=container_name,
                environment=env_vars,
                volumes=volumes,
                remove=True,
                nano_cpus=int(float(JOB_CPU_REQUEST) * 1e9),
                mem_limit=f"{JOB_MEMORY_REQUEST_GB}g",
                network_mode='none',  # Disable networking for security
                cap_drop=['ALL'],  # Drop all Linux capabilities
                read_only=True,  # 保持安全性：只读文件系统
                tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},  # Secure temporary filesystem
                security_opt=['no-new-privileges:true']  # Prevent privilege escalation
            )
            # 等待容器完成并获取结果
            result = container.wait()
            exit_code = result['StatusCode']
            logs = container.logs().decode('utf-8')
            logging.info(f"Container {container_name} finished with exit code {exit_code}")

            # 处理执行结果
            if exit_code == 0:
                logging.info(f"Task {task.id} completed successfully")
                task.status = 'COMPLETED'

                # 上传输出文件到OSS（使用数据库中配置的输出目录）
                output_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_RESULTS)
                output_files = os.listdir(local_output_dir)

                # 从数据库参数获取输出目录路径
                output_directory = task.parameters.get('outputDirectory', f"{task.userId}/{task.id}/outputs")

                uploaded_files = []
                if output_files:
                    for output_file in output_files:
                        local_file_path = os.path.join(local_output_dir, output_file)
                        oss_file_path = f"{output_directory}/{output_file}"
                        try:
                            output_bucket.put_object_from_file(oss_file_path, local_file_path)
                            uploaded_files.append(oss_file_path)
                            logging.info(f"Uploaded output file: {oss_file_path}")
                        except Exception as upload_error:
                            logging.error(f"Failed to upload output file {output_file}: {upload_error}")

                    if uploaded_files:
                        # 设置主输出文件（优先选择zip文件）
                        main_output = next((f for f in uploaded_files if f.endswith('.zip')), uploaded_files[0])
                        task.outputFile = main_output
                        logging.info(f"Task output available at: {main_output}")
                    else:
                        logging.error("Failed to upload any output files")
                else:
                    logging.warning(f"No output files found for task {task.id} in {local_output_dir}")
            else:
                logging.error(f"Task {task.id} failed with exit code {exit_code}")
                task.status = 'FAILED'
                task.errorMessage = logs[-2000:] if logs else f"Container exited with code {exit_code}"

        except Exception as container_error:
            logging.error(f"Container execution error for task {task.id}: {container_error}")
            task.status = 'FAILED'
            task.errorMessage = f"Container execution failed: {str(container_error)}"

        # 上传日志到OSS
        try:
            log_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_LOGS)
            log_directory = task.parameters.get('logDirectory', f"{task.userId}/{task.id}/logs")

            # 上传容器日志
            if logs:
                container_log_path = f"{log_directory}/container.log"
                log_bucket.put_object(container_log_path, logs.encode('utf-8'))
                logging.info(f"Uploaded container log to: {container_log_path}")

            # 上传任务执行日志
            task_log_content = task_logger.generateLogReport()
            task_log_path = f"{log_directory}/task_execution.json"
            log_bucket.put_object(task_log_path, task_log_content.encode('utf-8'))
            task.logFile = task_log_path
            logging.info(f"Uploaded task log to: {task_log_path}")

        except Exception as log_upload_error:
            logging.error(f"Failed to upload logs for task {task.id}: {log_upload_error}")

        # 清理临时文件
        try:
            import shutil
            shutil.rmtree(local_base)
            logging.info(f"Cleaned up temporary directory: {local_base}")
        except Exception as cleanup_error:
            logging.warning(f"Failed to cleanup temporary directory {local_base}: {cleanup_error}")

        # 设置任务状态为运行中
        task.status = 'RUNNING'
        task.startedAt = datetime.now(timezone.utc)
        task.workerId = os.getenv('WORKER_ID', 'worker-01')
        task.ecsInstanceId = os.getenv('ECS_INSTANCE_ID', 'ecs-single-instance')
        session.commit()

        # 获取STS凭证
        sts_ak, sts_sk, sts_token = get_sts_credentials_for_task(task.id, task.userId)

        container_name = generate_unique_container_name(task.id)
        local_input_dir = os.path.join(local_base, "input")
        local_output_dir = os.path.join(local_base, "output")
        local_log_dir = os.path.join(local_base, "logs")
        local_work_dir = os.path.join(local_base, "work")  # SDC工具工作目录
        for d in [local_input_dir, local_output_dir, local_log_dir, local_work_dir]:
            os.makedirs(d, exist_ok=True)

        # 处理多文件输入（特别是SDC工具的三个文件）
        input_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_USER_INPUT)

        # 下载主文件（向后兼容）
        if task.inputOssPath:
            local_input_filepath = os.path.join(local_input_dir, os.path.basename(task.inputOssPath))
            input_bucket.get_object_to_file(task.inputOssPath, local_input_filepath)
            logging.info(f"Downloaded main input file: {task.inputOssPath}")

        # 从数据库参数中获取输入文件信息并下载
        if 'inputFilesList' in task.parameters and task.parameters['inputFilesList']:
            logging.info(f"Downloading {len(task.parameters['inputFilesList'])} input files...")
            for file_path in task.parameters['inputFilesList']:
                local_filepath = os.path.join(local_input_dir, os.path.basename(file_path))
                try:
                    input_bucket.get_object_to_file(file_path, local_filepath)
                    logging.info(f"Downloaded input file: {file_path} -> {local_filepath}")
                except Exception as e:
                    logging.error(f"Failed to download input file {file_path}: {e}")
                    raise Exception(f"Failed to download required input file: {os.path.basename(file_path)}")
        else:
            logging.warning("No input files found in task parameters")
        
        # 基础环境变量
        env_vars = {
            'OSS_ACCESS_KEY_ID': sts_ak, 'OSS_ACCESS_KEY_SECRET': sts_sk, 'OSS_SECURITY_TOKEN': sts_token,
            'OSS_REGION': OSS_REGION, 'TASK_ID': task.id, 'USER_ID': task.userId,
            'JOB_PARAMETERS': json.dumps(task.parameters),
            'JOB_INPUT_DIR': '/data/input', 'JOB_OUTPUT_DIR': '/data/output', 'JOB_LOG_DIR': '/data/logs',
            'OSS_BUCKET_OUTPUT': OSS_BUCKET_JOB_RESULTS, 'OSS_BUCKET_LOGS': OSS_BUCKET_JOB_LOGS
        }

        # 添加用户权限信息到环境变量
        user_permission_type = task.parameters.get('userPermissionType', 'free')
        # 转换为工具期望的格式：free -> fre, pro/professional -> pro
        if user_permission_type == 'free':
            tool_permission_type = 'fre'
        elif user_permission_type in ['pro', 'professional']:
            tool_permission_type = 'pro'
        else:
            tool_permission_type = 'fre'  # 默认为免费用户
        env_vars['USER_PERMISSION_TYPE'] = tool_permission_type
        logging.info(f"User permission type for task {task.id}: {user_permission_type} -> Tool format: {tool_permission_type}")

        # SDC工具特定的环境变量
        if tool.id == 'sdc-generator':
            sdc_params = task.parameters
            env_vars.update({
                'SDC_MOD_NAME': sdc_params.get('modName', 'default_module'),
                'SDC_IS_FLAT': 'true' if sdc_params.get('isFlat', False) else 'false',
                'SDC_HIER_FILE': '/data/input/hier.yaml',
                'SDC_VLOG_FILE': '/data/input/vlog.v',
                'SDC_DCONT_FILE': '/data/input/dcont.xlsx',
                'SDC_WORK_DIR': '/data/work',
                'SDC_OUTPUT_ZIP': '/data/output/sdc_results.zip'
            })
            logging.info(f"SDC tool parameters: modName={sdc_params.get('modName')}, isFlat={sdc_params.get('isFlat')}")

        # UPF工具特定的环境变量
        elif tool.id == 'upf-generator':
            upf_params = task.parameters
            env_vars.update({
                'UPF_MOD_NAME': upf_params.get('modName', 'default_module'),
                'UPF_VERSION': upf_params.get('version', '2.0'),
                'UPF_IS_FLAT': 'true' if upf_params.get('isFlat', False) else 'false',
                'UPF_HIER_FILE': '/data/input/hier.yaml',
                'UPF_PVLOG_FILE': '/data/input/pvlog.v',
                'UPF_POBJ_FILE': '/data/input/pobj.tcl',
                'UPF_PCONT_FILE': '/data/input/pcont.xlsx',
                'UPF_WORK_DIR': '/data/work',
                'UPF_OUTPUT_ZIP': '/data/output/upf_result.zip'
            })
            logging.info(f"UPF tool parameters: modName={upf_params.get('modName')}, version={upf_params.get('version')}, isFlat={upf_params.get('isFlat')}")

        volumes = {
            local_input_dir: {'bind': '/data/input', 'mode': 'ro'},
            local_output_dir: {'bind': '/data/output', 'mode': 'rw'},
            local_log_dir: {'bind': '/data/logs', 'mode': 'rw'},
            local_work_dir: {'bind': '/data/work', 'mode': 'rw'},  # SDC工具工作目录
        }

        logging.info(f"Starting container {container_name} with image {tool.dockerImage}...")
        
        # Log container security configuration for audit
        logging.info(f"Container security: network_mode=none, cap_drop=ALL, memory_limit={JOB_MEMORY_REQUEST_GB}g, cpu_limit={JOB_CPU_REQUEST}")

        try:
            container = docker_client.containers.run(
                tool.dockerImage,
                detach=True,
                name=container_name,
                environment=env_vars,
                volumes=volumes,
                remove=True,
                nano_cpus=int(float(JOB_CPU_REQUEST) * 1e9),
                mem_limit=f"{JOB_MEMORY_REQUEST_GB}g",
                network_mode='none',  # Disable networking for security
                cap_drop=['ALL'],  # Drop all Linux capabilities
                read_only=True,  # 保持安全性：只读文件系统
                tmpfs={'/tmp': 'rw,noexec,nosuid,size=100m'},  # Secure temporary filesystem
                security_opt=['no-new-privileges:true']  # Prevent privilege escalation
            )
            # 等待容器完成并获取结果
            result = container.wait()
            exit_code = result['StatusCode']
            logs = container.logs().decode('utf-8')
            logging.info(f"Container {container_name} finished with exit code {exit_code}")

            # 处理执行结果
            if exit_code == 0:
                logging.info(f"Task {task.id} completed successfully")
                task.status = 'COMPLETED'

                # 上传输出文件到OSS（使用数据库中配置的输出目录）
                output_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_RESULTS)
                output_files = os.listdir(local_output_dir)

                # 从数据库参数获取输出目录路径
                output_directory = task.parameters.get('outputDirectory', f"{task.userId}/{task.id}/outputs")

                if output_files:
                    # 上传所有输出文件到正确的OSS路径
                    uploaded_files = []
                    for output_file in output_files:
                        oss_object_name = f"{output_directory}/{output_file}"
                        local_file_path = os.path.join(local_output_dir, output_file)
                        try:
                            output_bucket.put_object_from_file(oss_object_name, local_file_path)
                            uploaded_files.append(oss_object_name)
                            logging.info(f"Uploaded output file: {oss_object_name}")
                        except Exception as e:
                            logging.error(f"Failed to upload output file {output_file}: {e}")

                    if uploaded_files:
                        # 设置主输出文件（优先选择zip文件）
                        main_output = next((f for f in uploaded_files if f.endswith('.zip')), uploaded_files[0])
                        task.outputOssPath = main_output
                        logging.info(f"Task output available at: {main_output}")
                    else:
                        logging.error("Failed to upload any output files")
                else:
                    logging.warning(f"No output files found for task {task.id} in {local_output_dir}")
            else:
                logging.error(f"Task {task.id} failed with exit code {exit_code}")
                task.status = 'FAILED'
                task.errorMessage = logs[-2000:] if logs else f"Container exited with code {exit_code}"

        except Exception as container_error:
            logging.error(f"Container execution error for task {task.id}: {container_error}")
            task.status = 'FAILED'
            task.errorMessage = f"Container execution failed: {str(container_error)}"

        # 上传日志文件到OSS
        log_file_name = f"execution_{task.id}.log"
        local_log_filepath = os.path.join(local_log_dir, log_file_name)

        # 创建详细的执行日志
        detailed_log = f"""
Task Execution Log
==================
Task ID: {task.id}
User ID: {task.userId}
Tool ID: {tool.id}
Started At: {task.startedAt}
Finished At: {datetime.now(timezone.utc)}
Exit Code: {exit_code if 'exit_code' in locals() else 'N/A'}
Status: {task.status}

Container Logs:
===============
{logs if 'logs' in locals() else 'No logs available'}

Environment Variables:
=====================
{json.dumps(env_vars, indent=2)}

Input Files:
============
{json.dumps(task.parameters.get('inputFiles', []), indent=2)}
"""

        with open(local_log_filepath, 'w') as f:
            f.write(detailed_log)

        # 上传日志到OSS
        try:
            log_bucket = get_oss_bucket(sts_ak, sts_sk, sts_token, OSS_BUCKET_JOB_LOGS)
            oss_log_object_name = f"{task.userId}/{task.id}/logs/{log_file_name}"
            log_bucket.put_object_from_file(oss_log_object_name, local_log_filepath)
            task.logOssPath = oss_log_object_name
            logging.info(f"Uploaded log file: {oss_log_object_name}")
        except Exception as log_error:
            logging.error(f"Failed to upload log file: {log_error}")
            # 不因为日志上传失败而影响任务状态

        task.finishedAt = datetime.now(timezone.utc)
        session.commit()
        logging.info(f"Task {task.id} finished with status: {task.status}")
    except Exception as e:
        logging.error(f"Error processing task {task_id}: {e}", exc_info=True)
        if task and session.is_active:
            task.status = 'FAILED'
            task.errorMessage = str(e)
            task.finishedAt = datetime.now(timezone.utc)
            session.commit()
    finally:
        # 清理数据库会话
        if session.is_active:
            session.close()

        # 清理临时目录
        if os.path.exists(local_base):
            try:
                # 计算临时目录大小
                total_size = 0
                for dirpath, dirnames, filenames in os.walk(local_base):
                    for filename in filenames:
                        filepath = os.path.join(dirpath, filename)
                        total_size += os.path.getsize(filepath)

                shutil.rmtree(local_base)
                logging.info(f"Cleaned up temporary directory: {local_base} (freed {total_size / 1024 / 1024:.2f} MB)")
            except Exception as cleanup_error:
                logging.error(f"Failed to cleanup temporary directory {local_base}: {cleanup_error}")
        else:
            logging.debug(f"Temporary directory {local_base} does not exist, no cleanup needed")

        task_logger.log('INFO', 'PROCESS', f'ECS+OSS+ACR processing completed for tool type: {tool_type}')
        return task.status == 'COMPLETED'

__all__ = [
    'process_task_ecs_oss_acr',
    # 以下函数当前已注释，保持注释状态
    # 'get_sts_credentials_for_task',
    # 'get_acr_login_info',
    # 'get_oss_bucket',
]
