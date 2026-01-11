import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * API测试辅助函数
 * 提供常用的API请求和认证功能
 */

// 测试配置
const TEST_CONFIG = {
  baseURL: 'http://localhost:8080',
  apiBase: 'http://localhost:8080/api/v1',
  // 测试用户凭证
  testUser: {
    email: 'test@example.com',
    password: 'Test123456!',
  },
  adminUser: {
    email: 'admin@logiccore.local',
    password: 'Admin123456!',
  },
};

/**
 * 用户登录并获取Token
 */
export async function loginUser(
  request: APIRequestContext,
  email: string = TEST_CONFIG.testUser.email,
  password: string = TEST_CONFIG.testUser.password
): Promise<{ token: string; refreshToken: string; userId: string }> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`登录失败: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    refreshToken: data.refreshToken,
    userId: data.user.id,
  };
}

/**
 * 用户注册
 */
export async function registerUser(
  request: APIRequestContext,
  email: string,
  password: string,
  username?: string
): Promise<{ token: string; userId: string }> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/auth/register`, {
    data: {
      email,
      password,
      username: username || email.split('@')[0],
    },
  });

  if (!response.ok()) {
    throw new Error(`注册失败: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    userId: data.user.id,
  };
}

/**
 * 创建认证请求头
 */
export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * 创建任务
 */
export async function createTask(
  request: APIRequestContext,
  token: string,
  toolType: string,
  taskData: any
): Promise<any> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/tasks/create`, {
    headers: createAuthHeaders(token),
    data: {
      toolType,
      ...taskData,
    },
  });

  if (!response.ok()) {
    throw new Error(`创建任务失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * 获取任务详情
 */
export async function getTask(
  request: APIRequestContext,
  token: string,
  taskId: string
): Promise<any> {
  const response = await request.get(`${TEST_CONFIG.apiBase}/tasks/${taskId}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok()) {
    throw new Error(`获取任务失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * 提交任务
 */
export async function submitTask(
  request: APIRequestContext,
  token: string,
  taskId: string
): Promise<any> {
  const response = await request.post(
    `${TEST_CONFIG.apiBase}/tasks/${taskId}/submit`,
    {
      headers: createAuthHeaders(token),
    }
  );

  if (!response.ok()) {
    throw new Error(`提交任务失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * 等待任务完成
 */
export async function waitForTaskCompletion(
  request: APIRequestContext,
  token: string,
  taskId: string,
  timeout: number = 180000, // 3分钟
  interval: number = 2000 // 2秒检查一次
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const task = await getTask(request, token, taskId);

    if (
      task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'timeout'
    ) {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`任务超时: ${taskId}`);
}

/**
 * SDC工具初始化
 */
export async function initializeSdcTask(
  request: APIRequestContext,
  token: string,
  modName: string,
  isFlat: boolean,
  hierYamlContent: string,
  vlogContent: string
): Promise<{ taskId: string }> {
  const formData = new FormData();
  formData.append('modName', modName);
  formData.append('isFlat', isFlat.toString());
  formData.append('hierYamlFile', new Blob([hierYamlContent], { type: 'text/yaml' }), 'hier.yaml');
  formData.append('vlogFile', new Blob([vlogContent], { type: 'text/plain' }), 'vlog.v');

  const response = await request.post(`${TEST_CONFIG.apiBase}/sdc-thrpages/initialize`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    multipart: {
      modName,
      isFlat: isFlat.toString(),
      hierYamlFile: {
        name: 'hier.yaml',
        mimeType: 'text/yaml',
        buffer: Buffer.from(hierYamlContent),
      },
      vlogFile: {
        name: 'vlog.v',
        mimeType: 'text/plain',
        buffer: Buffer.from(vlogContent),
      },
    },
  });

  if (!response.ok()) {
    throw new Error(`SDC初始化失败: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return { taskId: data.taskId };
}

/**
 * SDC工具保存数据 (DataSav)
 */
export async function sdcDataSav(
  request: APIRequestContext,
  token: string,
  taskId: string,
  dirtySheetData: any[]
): Promise<any> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/sdc-thrpages/data-sav`, {
    headers: createAuthHeaders(token),
    data: {
      taskId,
      dirtySheetData,
    },
  });

  if (!response.ok()) {
    throw new Error(`SDC DataSav失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * SDC工具数据检查 (DataChk)
 */
export async function sdcDataChk(
  request: APIRequestContext,
  token: string,
  taskId: string
): Promise<any> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/sdc-thrpages/data-chk`, {
    headers: createAuthHeaders(token),
    data: { taskId },
  });

  if (!response.ok()) {
    throw new Error(`SDC DataChk失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * UPF工具初始化
 */
export async function initializeUpfTask(
  request: APIRequestContext,
  token: string,
  modName: string,
  files: {
    hierYaml: string;
    pvlog: string;
    pobj: string;
    pcell: string;
  }
): Promise<{ taskId: string }> {
  const response = await request.post(`${TEST_CONFIG.apiBase}/upf-thrpages/initialize`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    multipart: {
      modName,
      hierYamlFile: {
        name: 'hier.yaml',
        mimeType: 'text/yaml',
        buffer: Buffer.from(files.hierYaml),
      },
      pvlogFile: {
        name: 'pvlog.v',
        mimeType: 'text/plain',
        buffer: Buffer.from(files.pvlog),
      },
      pobjFile: {
        name: 'pobj.tcl',
        mimeType: 'text/plain',
        buffer: Buffer.from(files.pobj),
      },
      pcellFile: {
        name: 'pcell.yaml',
        mimeType: 'text/yaml',
        buffer: Buffer.from(files.pcell),
      },
    },
  });

  if (!response.ok()) {
    throw new Error(`UPF初始化失败: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return { taskId: data.taskId };
}

/**
 * 上传文件辅助函数
 */
export async function uploadFile(
  request: APIRequestContext,
  token: string,
  taskId: string,
  fieldName: string,
  fileName: string,
  fileContent: string | Buffer
): Promise<any> {
  const response = await request.post(
    `${TEST_CONFIG.apiBase}/tasks/${taskId}/upload`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      multipart: {
        [fieldName]: {
          name: fileName,
          mimeType: 'application/octet-stream',
          buffer: Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent),
        },
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`文件上传失败: ${response.status()} ${await response.text()}`);
  }

  return await response.json();
}

/**
 * 下载任务结果
 */
export async function downloadTaskResult(
  request: APIRequestContext,
  token: string,
  taskId: string
): Promise<Buffer> {
  const response = await request.get(`${TEST_CONFIG.apiBase}/tasks/${taskId}/download`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok()) {
    throw new Error(`下载结果失败: ${response.status()} ${await response.text()}`);
  }

  const buffer = await response.body();
  return buffer;
}

/**
 * 清理测试数据
 */
export async function cleanupTestData(
  request: APIRequestContext,
  token: string,
  taskIds: string[]
): Promise<void> {
  for (const taskId of taskIds) {
    try {
      await request.delete(`${TEST_CONFIG.apiBase}/tasks/${taskId}`, {
        headers: createAuthHeaders(token),
      });
    } catch (error) {
      console.warn(`清理任务失败: ${taskId}`, error);
    }
  }
}

export { TEST_CONFIG };
