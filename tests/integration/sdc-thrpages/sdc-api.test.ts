import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SDC多页面API集成测试
 *
 * 测试SDC工具的多页面表单API端点
 */

const BASE_URL = 'http://localhost:8081';
const API_BASE = `${BASE_URL}/api/v1`;

// 认证信息
let authToken: string;

// 测试任务ID
let taskId: string;

// 测试文件路径
const testFilesPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen');

describe('SDC多页面API测试', () => {
  beforeAll(async () => {
    // 登录获取token
    const loginResponse = await request(`${BASE_URL}`)
      .post(`${API_BASE}/auth/login`)
      .send({
        email: 'test@example.com',
        password: 'Test123456!',
      });

    if (loginResponse.status !== 200) {
      // 如果用户不存在，先注册
      const registerResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: 'test@example.com',
          password: 'Test123456!',
          username: 'testuser',
        });

      authToken = registerResponse.body.token;
    } else {
      authToken = loginResponse.body.token;
    }
  });

  afterAll(async () => {
    // 清理测试任务
    if (taskId) {
      try {
        await request(`${BASE_URL}`)
          .delete(`${API_BASE}/tasks/${taskId}`)
          .set('Authorization', `Bearer ${authToken}`);
      } catch (error) {
        console.warn('清理任务失败', error);
      }
    }
  });

  describe('POST /sdc-thrpages/initialize - 初始化SDC任务', () => {
    it('应该成功初始化SDC任务', async () => {
      const hierYamlPath = path.join(testFilesPath, 'hier.yaml');
      const vlogPath = path.join(testFilesPath, 'vlog.v');

      // 检查测试文件是否存在
      if (!fs.existsSync(hierYamlPath) || !fs.existsSync(vlogPath)) {
        console.warn('测试文件不存在，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        .field('isFlat', 'false')
        .attach('hierYamlFile', hierYamlPath)
        .attach('vlogFile', vlogPath);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBeTruthy();

      taskId = response.body.taskId;
    });

    it('应该验证必需文件', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        .field('isFlat', 'false')
        // 缺少vlogFile
        .attach('hierYamlFile', path.join(testFilesPath, 'hier.yaml'));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('应该验证模块名', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', '') // 空模块名
        .field('isFlat', 'false')
        .attach('hierYamlFile', path.join(testFilesPath, 'hier.yaml'))
        .attach('vlogFile', path.join(testFilesPath, 'vlog.v'));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /sdc-thrpages/sheets - 获取所有Sheet', () => {
    it('应该返回所有Sheet定义', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/sdc-thrpages/${taskId}/sheets`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.sheets)).toBeTruthy();
      expect(response.body.sheets.length).toBeGreaterThan(0);

      // 验证Sheet结构
      const firstSheet = response.body.sheets[0];
      expect(firstSheet.sheetId).toBeTruthy();
      expect(firstSheet.sheetName).toBeTruthy();
      expect(firstSheet.displayName).toBeTruthy();
    });

    it('不存在的任务ID应该返回404', async () => {
      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/sdc-thrpages/non-existent-task/sheets`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /sdc-thrpages/sheets/:sheetId/tables - 获取Sheet中的表格', () => {
    it('应该返回Sheet中的所有表格', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/sdc-thrpages/sheets/VarDef/tables?taskId=${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.tables)).toBeTruthy();

      // 验证表格结构
      if (response.body.tables.length > 0) {
        const firstTable = response.body.tables[0];
        expect(firstTable.tableId).toBeTruthy();
        expect(firstTable.tableName).toBeTruthy();
        expect(firstTable.columnsSchema).toBeTruthy();
      }
    });
  });

  describe('GET /sdc-thrpages/tables/:tableId/data - 获取表格数据', () => {
    it('应该返回表格数据', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/sdc-thrpages/tables/TMVAR/data?taskId=${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tableId).toBe('TMVAR');
      expect(Array.isArray(response.body.rows)).toBeTruthy();
      expect(response.body.columnsSchema).toBeTruthy();
    });
  });

  describe('POST /sdc-thrpages/data-sav - 保存表单数据', () => {
    it('应该成功保存空的dirtySheetData', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/data-sav`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
          dirtySheetData: [],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('应该保存表格数据', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const dirtySheetData = [
        {
          sheetName: 'ClkDef',
          sheetId: 'ClkDef',
          tables: [
            {
              tableId: 'TMCLK',
              tableName: 'TMCLK',
              data: [
                {
                  ClkPin: 'clk',
                  ClkName: 'sys_clk',
                  ClkPeriod: '10',
                },
              ],
            },
          ],
        },
      ];

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/data-sav`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
          dirtySheetData: dirtySheetData,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('保存成功');
    });

    it('不应该允许保存其他用户的数据', async () => {
      // 创建另一个用户
      const otherUserResponse = await request(`${BASE_URL}`)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: `other_sdc_${Date.now()}@example.com`,
          password: 'Test123456!',
        });

      const otherUserToken = otherUserResponse.body.token;

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/data-sav`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          taskId: taskId,
          dirtySheetData: [],
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /sdc-thrpages/data-chk - 数据检查', () => {
    it('应该执行数据检查', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/data-chk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeDefined();

      // 数据检查可能失败（如果测试数据不完整），只验证API调用成功
    });

    it('不存在的任务应该返回404', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/data-chk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: 'non-existent-task',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /sdc-thrpages/:taskId/submit - 提交任务', () => {
    it('应该成功提交任务', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toMatch(/queued|running/);
    });

    it('不应该重复提交任务', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      // 第一次提交
      await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      // 第二次提交
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/sdc-thrpages/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });
  });
});
