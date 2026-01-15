from .core import Tool, Session
from .file_manager import EcsLocalFileManager

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

__all__ = ['initialize_task_context']
