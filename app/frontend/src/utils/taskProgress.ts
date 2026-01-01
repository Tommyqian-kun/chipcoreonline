/**
 * 任务进度映射工具
 * 基于14步执行流程的统一进度计算
 */

// 标准14步执行流程的进度映射
export const TASK_PROGRESS_MAPPING = {
  // 提交阶段 (0-20%)
  'VALIDATING': 5,           // a1-a2: 提交任务开始、权限验证
  'QUEUE_CHECKING': 10,      // a3: 检查Redis队列上限
  'CREATING_RECORD': 15,     // a4: 建立任务ID数据库数据
  'CREATING_TEMP': 18,       // a5: 建立temp/{taskId}目录
  'UPLOADING_FILES': 20,     // a6: 保存上传数据到temp/{taskId}目录
  
  // 队列阶段 (20-30%)
  'QUEUED': 25,              // a7: 任务入队
  'PENDING': 25,             // 等待Worker获取
  
  // Worker处理阶段 (30-50%)
  'WORKER_ASSIGNED': 30,           // a8: Worker获取任务ID
  'CONTAINER_IMAGE_LOADING': 35,   // a9: 工具容器加载
  'JOBS_DIRECTORY_CREATION': 45,   // a10: 创建jobs目录
  'TEMP_TO_JOBS_COPY': 47,        // a10: 复制数据文件
  'CONTAINER_EXECUTION': 50,       // a11: 容器启动执行

  // 执行阶段 (50-90%)
  'RUNNING': 50,                   // a11: 容器启动执行工具命令 (兼容前端状态)
  'RESULT_PACKAGING': 85,          // a12: 生成结果并打包
  'GENERATING_RESULTS': 85,        // a12: 生成结果并打包 (兼容前端状态)

  // 清理阶段 (90-100%)
  'WORK_DIRECTORY_CLEANUP': 92,    // a13: 清理jobs/{taskId}/work目录
  'CLEANING_WORKSPACE': 92,        // a13: 清理jobs/{taskId}/work目录 (兼容前端状态)
  'TEMP_CLEANUP_SCHEDULE': 95,     // a14: 清理temp/{taskId}目录和容器
  'CLEANING_TEMP': 95,             // a14: 清理temp/{taskId}目录 (兼容前端状态)
  'COMPLETED': 100,                // 完成
  
  // 异常状态
  'FAILED': 0,
  'CANCELLED': 0,
  'TIMEOUT': 0,
  'QUEUE_TIMEOUT': 0,
  'EXECUTION_TIMEOUT': 0,
  
  // 前端状态映射
  'IDLE': 0,
  'SUBMITTING': 15,
  'POLLING': 30
} as const;

// 获取任务进度
export const getTaskProgress = (status: string, currentStep?: string | null): number => {
  // 优先使用currentStep显示实际执行进度
  if (currentStep && TASK_PROGRESS_MAPPING[currentStep as keyof typeof TASK_PROGRESS_MAPPING]) {
    return TASK_PROGRESS_MAPPING[currentStep as keyof typeof TASK_PROGRESS_MAPPING];
  }

  // 对于失败状态，如果没有currentStep，返回0（表示任务在开始前失败）
  // 如果有currentStep，上面已经返回了实际进度
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT') {
    return 0; // 只有在没有currentStep时才返回0
  }

  return TASK_PROGRESS_MAPPING[status as keyof typeof TASK_PROGRESS_MAPPING] || 0;
};

// 获取进度描述
export const getProgressDescription = (status: string, currentStep?: string | null): string => {
  const progressDescriptions = {
    'VALIDATING': '验证任务参数和用户权限',
    'QUEUE_CHECKING': '检查队列容量',
    'CREATING_RECORD': '创建任务记录',
    'CREATING_TEMP': '准备临时工作空间',
    'UPLOADING_FILES': '上传输入文件',
    'QUEUED': '任务已入队，等待执行',
    'PENDING': '任务已入队，等待执行',
    'WORKER_ASSIGNED': 'Worker已分配，准备执行',
    'CONTAINER_IMAGE_LOADING': '加载工具容器镜像',
    'JOBS_DIRECTORY_CREATION': '创建jobs目录结构',
    'TEMP_TO_JOBS_COPY': '复制数据文件到工作目录',
    'CONTAINER_EXECUTION': '启动容器执行工具命令',
    'RUNNING': '正在执行工具命令',
    'RESULT_PACKAGING': '生成结果文件并打包',
    'GENERATING_RESULTS': '生成结果文件',
    'WORK_DIRECTORY_CLEANUP': '清理工作目录',
    'CLEANING_WORKSPACE': '清理工作目录',
    'TEMP_CLEANUP_SCHEDULE': '清理临时文件和容器',
    'CLEANING_TEMP': '清理临时文件',
    'COMPLETED': '任务执行完成',
    'FAILED': '任务执行失败',
    'CANCELLED': '任务已取消',
    'TIMEOUT': '任务执行超时',
    'QUEUE_TIMEOUT': '队列等待超时',
    'EXECUTION_TIMEOUT': '执行超时',
    'IDLE': '等待提交',
    'SUBMITTING': '正在提交任务',
    'POLLING': '正在查询任务状态'
  } as const;
  
  return progressDescriptions[currentStep as keyof typeof progressDescriptions] || 
         progressDescriptions[status as keyof typeof progressDescriptions] || 
         '处理中...';
};

// 判断任务是否完成
export const isTaskCompleted = (status: string): boolean => {
  return ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT'].includes(status);
};

// 判断任务是否正在执行
export const isTaskRunning = (status: string): boolean => {
  return ['PENDING', 'RUNNING', 'POLLING', 'SUBMITTING', 'QUEUED'].includes(status);
};
