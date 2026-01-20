import os
import platform
import json
import logging
from datetime import datetime, timezone
from typing import Dict

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

        # 默认保持原有777权限，避免容器用户写入失败
        strict_permissions = os.getenv('ECS_STRICT_PERMISSIONS', 'false').lower() == 'true'
        dir_mode = 0o775 if strict_permissions else 0o777

        for dir_path in dirs:
            os.makedirs(dir_path, exist_ok=True)
            # 默认使用更小权限，必要时可通过ECS_ALLOW_WORLD_WRITE放开
            os.chmod(dir_path, dir_mode)

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

__all__ = [
    'normalize_docker_path',
    'prepare_container_volumes',
    'EcsLocalFileManager'
]
