import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

const BASE_URL = 'http://localhost:8080';
const API_BASE = `${BASE_URL}/api/v1`;

let authToken: string;

describe('错误场景 - API通用测试', () => {
  beforeAll(async () => {
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

  describe('认证错误', () => {
    it('未提供token应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('无效的token应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('格式错误的Authorization头应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks`)
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
    });
  });

  describe('参数验证错误', () => {
    it('缺少必需参数应该返回400', async () => {
      if (!authToken) return;

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('无效的邮箱格式应该返回400', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'invalid-email',
          password: 'Test123456!',
        });

      expect(response.status).toBe(400);
    });

    it('弱密码应该返回400', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'test@example.com',
          password: '123',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('资源不存在错误', () => {
    it('查询不存在的任务应该返回404', async () => {
      if (!authToken) return;

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks/non-existent-task-id`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('错误响应格式验证', () => {
    it('错误响应应该包含success和message字段', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/tasks`)
        .set('Authorization', 'Bearer invalid-token');

      if (response.status !== 200) {
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
        expect(response.body.success).toBe(false);
      }
    });
  });
});
