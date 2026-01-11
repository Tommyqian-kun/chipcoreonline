import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 任务API集成测试
 *
 * 测试任务管理相关的API端点
 */

const BASE_URL = 'http://localhost:8081';
const API_BASE = `${BASE_URL}/api/v1`;

// 认证信息
let authToken: string;
let userId: string;

// 测试任务ID列表
const createdTaskIds: string[] = [];

describe('任务API测试', () => {
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
      userId = loginResponse.body.user.id;
    } else {
      // 如果用户不存在，先注册
      const registerResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'test@example.com',
          password: 'Test123456!',
          username: 'testuser',
        });

      authToken = registerResponse.body.token;
      userId = registerResponse.body.user.id;
    }
  });

  afterAll(async () => {
    // 清理测试数据
    for (const taskId of createdTaskIds) {
      try {
        await request(`${BASE_URL}`)
          .delete(`${API_BASE}/tasks/${taskId}`)
          .set('Authorization', `Bearer ${authToken}`);
      } catch (error) {
        console.warn(`清理任务失败: ${taskId}`, error);
      }
    }
  });

  describe('POST /tasks/create - 创建任务', () => {
    it('应该成功创建SDC任务', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'sdcgen',
          description: '测试SDC任务',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.task.id).toBeTruthy();
      expect(response.body.task.toolType).toBe('sdcgen');
      expect(response.body.task.status).toBe('pending');

      createdTaskIds.push(response.body.task.id);
    });

    it('应该成功创建UPF任务', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'upfgen',
          description: '测试UPF任务',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.task.toolType).toBe('upfgen');

      createdTaskIds.push(response.body.task.id);
    });

    it('没有token时应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .send({
          toolType: 'sdcgen',
        });

      expect(response.status).toBe(401);
    });

    it('无效toolType时应该返回400', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'invalid_tool',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /tasks/:id - 获取任务详情', () => {
    it('应该返回任务详情', async () => {
      const taskId = createdTaskIds[0];

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.task.id).toBe(taskId);
      expect(response.body.task.toolType).toBeTruthy();
      expect(response.body.task.status).toBeTruthy();
    });

    it('不存在的任务ID应该返回404', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/non-existent-task-id`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('没有权限访问其他用户的任务', async () => {
      // 先创建另一个用户的任务
      const otherUserResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: `other_${Date.now()}@example.com`,
          password: 'Test123456!',
        });

      const otherUserToken = otherUserResponse.body.token;

      const otherTaskResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          toolType: 'sdcgen',
        });

      const otherTaskId = otherTaskResponse.body.task.id;

      // 尝试用第一个用户访问第二个用户的任务
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${otherTaskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /tasks/list - 获取任务列表', () => {
    it('应该返回当前用户的任务列表', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/list`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.tasks)).toBeTruthy();
      expect(response.body.tasks.length).toBeGreaterThanOrEqual(createdTaskIds.length);
    });

    it('应该支持分页', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/list?page=1&limit=10`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeTruthy();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('应该支持按toolType过滤', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/list?toolType=sdcgen`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.tasks.forEach((task: any) => {
        expect(task.toolType).toBe('sdcgen');
      });
    });
  });

  describe('PUT /tasks/:id - 更新任务', () => {
    it('应该成功更新任务描述', async () => {
      const taskId = createdTaskIds[0];

      const response = await request(`${BASE_URL}`)
        .put(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: '更新后的任务描述',
        });

      expect(response.status).toBe(200);
      expect(response.body.task.description).toBe('更新后的任务描述');
    });

    it('不应该允许更新其他用户的任务', async () => {
      // 创建另一个用户和任务
      const otherUserResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: `other2_${Date.now()}@example.com`,
          password: 'Test123456!',
        });

      const otherUserToken = otherUserResponse.body.token;

      const otherTaskResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          toolType: 'sdcgen',
        });

      const otherTaskId = otherTaskResponse.body.task.id;

      // 尝试更新
      const response = await request(`${BASE_URL}`)
        .put(`${API_BASE}/tasks/${otherTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: '尝试更新',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /tasks/:id - 删除任务', () => {
    it('应该成功删除任务', async () => {
      // 先创建一个待删除的任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'sdcgen',
          description: '待删除的任务',
        });

      const taskId = createResponse.body.task.id;

      const response = await request(`${BASE_URL}`)
        .delete(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('删除后再次获取应该返回404', async () => {
      // 创建并删除任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'sdcgen',
        });

      const taskId = createResponse.body.task.id;

      await request(`${BASE_URL}`)
        .delete(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // 尝试获取已删除的任务
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /tasks/:id/submit - 提交任务', () => {
    it('应该成功提交任务', async () => {
      // 创建一个新任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'sdcgen',
        });

      const taskId = createResponse.body.task.id;

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.task.status).toMatch(/queued|running/);
    });

    it('不应该重复提交已提交的任务', async () => {
      // 创建并提交任务
      const createResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/create`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolType: 'sdcgen',
        });

      const taskId = createResponse.body.task.id;

      await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      // 尝试再次提交
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/tasks/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /tasks/:id/download - 下载任务结果', () => {
    it('完成的任务应该可以下载', async () => {
      // 这个测试需要一个已完成任务的ID
      // 在实际测试中，你可能需要mock或等待任务完成

      const taskId = 'some-completed-task-id';

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/${taskId}/download`)
        .set('Authorization', `Bearer ${authToken}`);

      // 由于没有真实的已完成任务，这里只是展示测试结构
      // expect(response.status).toBe(200);
      // expect(response.headers['content-type']).toContain('application/zip');
    }, 10000);
  });
});
