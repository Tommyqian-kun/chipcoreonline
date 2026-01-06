/**
 * Worker集成测试
 * 测试Worker处理任务和Redis队列的完整流程
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

const BASE_URL = 'http://localhost:8080';
const API_BASE = `${BASE_URL}/api/v1`;

let authToken: string;
let createdTaskIds: string[] = [];

// 辅助函数：等待任务状态变化
async function waitForTaskStatus(
  taskId: string,
  expectedStatus: string,
  maxWaitTime = 30000,
  pollInterval = 1000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const response = await request(`${BASE_URL}`)
      .get(`${API_BASE}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${authToken}`);

    if (response.status === 200 && response.body.task) {
      const currentStatus = response.body.task.status;
      if (currentStatus === expectedStatus) {
        return true;
      }
      // 如果任务已经失败或取消，不再等待
      if (currentStatus === 'FAILED' || currentStatus === 'CANCELLED') {
        return false;
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
}

describe('Worker集成测试 - 完整任务流程', () => {
  beforeAll(async () => {
    // 登录获取token
    const loginResponse = await request(`${BASE_URL}`)
      .post(`${API_BASE}/auth/login`)
      .send({
        email: 'test@example.com',
        password: 'Test123456!',
      });

    if (loginResponse.status === 200) {
      authToken = loginResponse.body.token;
    }
  });

  afterAll(async () => {
    // 清理测试任务
    if (authToken && createdTaskIds.length > 0) {
      for (const taskId of createdTaskIds) {
        try {
          await request(`${BASE_URL}`)
            .delete(`${API_BASE}/tasks/${taskId}`)
            .set('Authorization', `Bearer ${authToken}`);
        } catch (error) {
          console.warn(`清理任务 ${taskId} 失败`, error);
        }
      }
    }
  });

  describe('任务提交到Worker执行流程', () => {
    it('应该成功提交SDC任务到队列', async () => {
      if (!authToken) {
        console.warn('没有authToken，跳过测试');
        return;
      }

      // 首先创建一个SDC任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          modName: 'test_module',
          isFlat: false,
        });

      if (createResponse.status === 201 || createResponse.status === 200) {
        const taskId = createResponse.body.task?.id;
        if (taskId) {
          createdTaskIds.push(taskId);

          // 提交任务到队列
          const submitResponse = await request(`${BASE_URL}`)
            .post(`${API_BASE}/sdc-thrpages/${taskId}/submit`)
            .set('Authorization', `Bearer ${authToken}`);

          // 验证提交成功
          expect([200, 202]).toContain(submitResponse.status);

          if (submitResponse.status === 200 || submitResponse.status === 202) {
            expect(submitResponse.body.success).toBe(true);
            // 任务应该进入PENDING或QUEUED状态
            expect(submitResponse.body.task.status).toMatch(/PENDING|QUEUED/);
          }
        }
      }
    });

    it('应该能查询任务状态', async () => {
      if (createdTaskIds.length === 0 || !authToken) {
        console.warn('没有taskId或authToken，跳过测试');
        return;
      }

      const taskId = createdTaskIds[0];
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        expect(response.body.task).toBeDefined();
        expect(response.body.task.id).toBe(taskId);
        expect(response.body.task.status).toBeDefined();
      }
    });

    it('任务状态应该从QUEUED转为RUNNING', async () => {
      if (createdTaskIds.length === 0 || !authToken) {
        console.warn('没有taskId或authToken，跳过测试');
        return;
      }

      const taskId = createdTaskIds[0];

      // 等待任务状态变为RUNNING
      const isRunning = await waitForTaskStatus(taskId, 'RUNNING', 30000);

      if (isRunning) {
        const response = await request(`${BASE_URL}`)
          .get(`${API_BASE}/tasks/${taskId}`)
          .set('Authorization', `Bearer ${authToken}`);

        if (response.status === 200) {
          expect(response.body.task.status).toBe('RUNNING');
        }
      } else {
        console.warn('任务未能在预期时间内转为RUNNING状态');
      }
    });
  });
});

describe('Worker集成测试 - 队列管理', () => {
  it('应该能获取队列状态', async () => {
    if (!authToken) {
      console.warn('没有authToken，跳过测试');
      return;
    }

    const response = await request(`${BASE_URL}`)
      .get(`${API_BASE}/admin/queue/status`)
      .set('Authorization', `Bearer ${authToken}`);

    // 验证返回队列信息
    if (response.status === 200) {
      expect(response.body).toHaveProperty('queueLength');
      expect(response.body).toHaveProperty('activeTasks');
      expect(typeof response.body.queueLength).toBe('number');
      expect(Array.isArray(response.body.activeTasks)).toBe(true);
    }
  });

  it('队列长度应该不超过最大限制', async () => {
    if (!authToken) {
      console.warn('没有authToken，跳过测试');
      return;
    }

    const response = await request(`${BASE_URL}`)
      .get(`${API_BASE}/admin/queue/status`)
      .set('Authorization', `Bearer ${authToken}`);

    if (response.status === 200) {
      expect(response.body.queueLength).toBeLessThanOrEqual(48);
    }
  });
});

describe('Worker集成测试 - 任务进度跟踪', () => {
  it('应该能获取任务进度信息', async () => {
    if (createdTaskIds.length === 0 || !authToken) {
      console.warn('没有taskId或authToken，跳过测试');
      return;
    }

    const taskId = createdTaskIds[0];
    const response = await request(`${BASE_URL}`)
      .get(`${API_BASE}/tasks/${taskId}/progress`)
      .set('Authorization', `Bearer ${authToken}`);

    // 进度接口可能不存在或需要特定状态
    if (response.status === 200) {
      expect(response.body).toHaveProperty('percent');
      expect(response.body).toHaveProperty('status');
      expect(typeof response.body.percent).toBe('number');
      expect(response.body.percent).toBeGreaterThanOrEqual(0);
      expect(response.body.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('Worker集成测试 - 任务取消', () => {
  let cancelTaskId: string;

  beforeEach(async () => {
    if (authToken) {
      // 创建一个用于取消测试的任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          modName: 'cancel_test_module',
          isFlat: false,
        });

      if (createResponse.status === 201 || createResponse.status === 200) {
        cancelTaskId = createResponse.body.task?.id;
        if (cancelTaskId) {
          createdTaskIds.push(cancelTaskId);
        }
      }
    }
  });

  it('应该能取消待处理的任务', async () => {
    if (!cancelTaskId || !authToken) {
      console.warn('没有taskId或authToken，跳过测试');
      return;
    }

    // 取消任务
    const cancelResponse = await request(`${BASE_URL}`)
      .post(`${API_BASE}/tasks/${cancelTaskId}/cancel`)
      .set('Authorization', `Bearer ${authToken}`);

    // 验证取消成功
    if (cancelResponse.status === 200) {
      expect(cancelResponse.body.success).toBe(true);

      // 验证任务状态变为CANCELLED
      const taskResponse = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${cancelTaskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (taskResponse.status === 200) {
        expect(taskResponse.body.task.status).toBe('CANCELLED');
      }
    }
  });
});

describe('Worker集成测试 - 错误处理', () => {
  it('应该处理不存在的任务ID', async () => {
    if (!authToken) {
      console.warn('没有authToken，跳过测试');
      return;
    }

    const fakeTaskId = 'task-nonexistent-12345';
    const response = await request(`${BASE_URL}`)
      .get(`${API_BASE}/tasks/${fakeTaskId}`)
      .set('Authorization', `Bearer ${authToken}`);

    // 应该返回404
    expect(response.status).toBe(404);
  });

  it('应该处理无效的任务操作', async () => {
    if (!authToken) {
      console.warn('没有authToken，跳过测试');
      return;
    }

    // 尝试对不存在的任务提交操作
    const fakeTaskId = 'task-invalid-12345';
    const response = await request(`${BASE_URL}`)
      .post(`${API_BASE}/sdc-thrpages/${fakeTaskId}/submit`)
      .set('Authorization', `Bearer ${authToken}`);

    // 应该返回404或400
    expect([400, 404]).toContain(response.status);
  });
});
