import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * 认证API集成测试
 *
 * 测试认证相关的API端点
 * 注意：这些测试需要后端服务运行在测试模式
 */

const BASE_URL = 'http://localhost:8081';
const API_BASE = `${BASE_URL}/api/v1`;

// 测试用户数据
const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'Test123456!',
  username: `testuser_${Date.now()}`,
};

let authToken: string;
let refreshToken: string;
let userId: string;

describe('认证API测试', () => {
  describe('POST /auth/register - 用户注册', () => {
    it('应该成功注册新用户', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send(testUser)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');

      authToken = response.body.token;
      userId = response.body.user.id;
    });

    it('不应该允许重复注册', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send(testUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('应该验证邮箱格式', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'invalid-email',
          password: 'Test123456!',
        });

      expect(response.status).toBe(400);
    });

    it('应该验证密码强度', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'test@example.com',
          password: 'weak',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/login - 用户登录', () => {
    it('应该成功登录', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/login`)
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeTruthy();
      expect(response.body.refreshToken).toBeTruthy();

      authToken = response.body.token;
      refreshToken = response.body.refreshToken;
    });

    it('不应该允许错误密码登录', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/login`)
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('不应该允许不存在的用户登录', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/login`)
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123456!',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /auth/me - 获取当前用户信息', () => {
    it('应该返回当前用户信息', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/auth/me`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('没有token时应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/auth/me`);

      expect(response.status).toBe(401);
    });

    it('无效token时应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/auth/me`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/refresh - 刷新Token', () => {
    it('应该成功刷新token', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/refresh`)
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeTruthy();
      expect(response.body.refreshToken).toBeTruthy();

      authToken = response.body.token;
      refreshToken = response.body.refreshToken;
    });

    it('无效refreshToken时应该返回401', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/refresh`)
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(response.status).toBe(401);
    });
  });
});
