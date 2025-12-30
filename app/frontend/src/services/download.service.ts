import api from './api';

export interface DownloadInfo {
  deploymentMode: string;
  taskStatus: string;
  fileExists?: boolean;
  fileSize?: number;
  filename?: string;
  downloadUrl?: string;
  downloadTimeRemaining?: number;
  isDownloadExpired?: boolean;
}

/**
 * 获取任务下载信息
 */
export const getTaskDownloadInfo = async (taskId: string): Promise<DownloadInfo> => {
  const response = await api.get(`/ecs-files/${taskId}/download-info`);
  return response.data;
};

/**
 * 下载任务结果
 */
export const downloadTaskResult = async (taskId: string): Promise<Blob> => {
  // 修复：使用正确的API路径
  const response = await api.get(`/tasks/${taskId}/download?type=result`, {
    responseType: 'blob'
  });
  
  // 创建下载链接
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  
  // 获取文件名 - 修复：正确解析Content-Disposition头
  const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
  let filename = `result_${taskId}_result.zip`; // 默认文件名（现在Content-Disposition头可以正确访问）

  console.log('🔍 download.service.ts 响应头:', {
    allHeaders: response.headers,
    contentDisposition: contentDisposition
  });

  if (contentDisposition) {
    // 支持多种Content-Disposition格式的解析
    let extractedFilename = null;

    // 方法1: 标准格式 filename="xxx"
    let match = contentDisposition.match(/filename="([^"]+)"/);
    if (match) {
      extractedFilename = match[1];
    } else {
      // 方法2: 无引号格式 filename=xxx
      match = contentDisposition.match(/filename=([^;,\s]+)/);
      if (match) {
        extractedFilename = match[1];
      }
    }

    if (extractedFilename) {
      filename = extractedFilename;
      console.log('✅ download.service.ts 成功提取文件名:', filename);
    } else {
      console.log('❌ download.service.ts 无法提取文件名，使用默认值');
    }
  } else {
    console.log('❌ download.service.ts 没有Content-Disposition头');
  }

  console.log('📁 download.service.ts 最终使用的文件名:', filename);
  
  // 触发下载
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  
  return blob;
};

/**
 * 下载任务日志
 */
export const downloadTaskLog = async (taskId: string): Promise<Blob> => {
  const response = await api.get(`/tasks/${taskId}/download/log`, {
    responseType: 'blob'
  });
  
  // 创建下载链接
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  
  // 获取文件名
  const contentDisposition = response.headers['content-disposition'];
  let filename = `task_${taskId}_log.zip`;
  
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }
  
  // 触发下载
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  
  return blob;
};

/**
 * 更新任务下载状态
 */
export const updateTaskDownloadStatus = async (taskId: string, status: 'DOWNLOADED' | 'EXPIRED'): Promise<void> => {
  await api.patch(`/tasks/${taskId}/download-status`, { status });
};

/**
 * 检查下载权限
 */
export const checkDownloadPermission = async (taskId: string): Promise<{
  canDownload: boolean;
  reason?: string;
  timeRemaining?: number;
}> => {
  try {
    const response = await api.get(`/tasks/${taskId}/download-permission`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 403) {
      return {
        canDownload: false,
        reason: error.response.data.message || 'Download not allowed'
      };
    }
    throw error;
  }
};

/**
 * 获取下载历史
 */
export const getDownloadHistory = async (params?: {
  page?: number;
  limit?: number;
}): Promise<{
  data: Array<{
    taskId: string;
    toolName: string;
    downloadedAt: string;
    fileSize: number;
    filename: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> => {
  const response = await api.get('/downloads/history', { params });
  return response.data;
};

/**
 * 批量下载任务结果
 */
export const downloadMultipleTasks = async (taskIds: string[]): Promise<Blob> => {
  const response = await api.post('/downloads/batch', 
    { taskIds },
    { responseType: 'blob' }
  );
  
  // 创建下载链接
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  
  // 获取文件名 - 修复：正确解析Content-Disposition头
  const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
  let filename = `batch_download_${Date.now()}.zip`;

  if (contentDisposition) {
    // 支持多种Content-Disposition格式的解析
    let extractedFilename = null;

    // 方法1: 标准格式 filename="xxx"
    let match = contentDisposition.match(/filename="([^"]+)"/);
    if (match) {
      extractedFilename = match[1];
    } else {
      // 方法2: 无引号格式 filename=xxx
      match = contentDisposition.match(/filename=([^;,\s]+)/);
      if (match) {
        extractedFilename = match[1];
      }
    }

    if (extractedFilename) {
      filename = extractedFilename;
    }
  }
  
  // 触发下载
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  
  return blob;
};

/**
 * 预览下载文件信息
 */
export const previewDownloadFile = async (taskId: string): Promise<{
  filename: string;
  fileSize: number;
  contentType: string;
  lastModified: string;
  downloadUrl: string;
}> => {
  const response = await api.get(`/tasks/${taskId}/download-preview`);
  return response.data;
};

/**
 * 获取下载统计信息
 */
export const getDownloadStats = async (): Promise<{
  totalDownloads: number;
  totalSize: number;
  recentDownloads: number;
  storageUsed: number;
  storageLimit: number;
}> => {
  const response = await api.get('/downloads/stats');
  return response.data;
};
