import api from './api';

export interface Task {
  id: string;
  status: 'DRAFT' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'QUEUE_TIMEOUT' | 'EXECUTION_TIMEOUT';
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  deploymentMode?: string;
  outputFile?: string;
  localStoragePath?: string;
  downloadStatus?: 'NOT_DOWNLOADED' | 'AVAILABLE' | 'DOWNLOADED' | 'EXPIRED' | 'NO_RESULT';
  timeoutType?: 'NONE' | 'QUEUE_TIMEOUT' | 'EXECUTION_TIMEOUT';
  errorMessage?: string;
  queuedAt?: string;
  startedAt?: string;
  progress?: number; // 任务进度百分比 (0-100)
  currentStep?: string; // 当前执行步骤
  stepStartedAt?: string; // 当前步骤开始时间
  parameters?: any; // 任务参数，包含多页面标识等信息
  tool: {
    name: string;
    description?: string;
  };

  // 计算字段
  executionStatus: string;
  hasResult: boolean;
  downloadTimeRemaining?: number; // 秒
  duration: number; // 秒
}

export interface TaskHistoryResponse {
  data: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 获取用户任务历史
export const getUserTasks = async (params?: {
  page?: number;
  limit?: number;
}): Promise<TaskHistoryResponse> => {
  const response = await api.get('/tasks', { params });
  return response.data;
};

// 获取任务状态
export const getTaskStatus = async (taskId: string) => {
  const response = await api.get(`/tasks/${taskId}/status`);
  return response.data;
};

// 获取任务详情
export const getTaskById = async (taskId: string) => {
  const response = await api.get(`/tasks/${taskId}`);
  return response.data;
};

// 获取下载链接
export const getDownloadUrl = async (taskId: string, type: 'result' | 'log') => {
  const response = await api.get(`/tasks/${taskId}/download_url`, {
    params: { type }
  });
  return response.data;
};

// 提交任务
export const submitTask = async (formData: FormData) => {
  const response = await api.post('/tasks', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};
