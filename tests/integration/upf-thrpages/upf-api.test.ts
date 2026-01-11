import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UPF多页面API集成测试
 *
 * 测试UPF工具的多页面表单API端点
 */

const BASE_URL = 'http://localhost:8081';
const API_BASE = `${BASE_URL}/api/v1`;

// 认证信息
let authToken: string;

// 测试任务ID
let taskId: string;

// 测试文件路径
const testFilesPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen');

describe('UPF多页面API测试', () => {
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

  describe('POST /upf-thrpages/initialize - 初始化UPF任务', () => {
    it('应该成功初始化UPF任务', async () => {
      const hierYamlPath = path.join(testFilesPath, 'hier.yaml');
      const pvlogPath = path.join(testFilesPath, 'pvlog.v');
      const pobjPath = path.join(testFilesPath, 'pobj.tcl');
      const pcellPath = path.join(testFilesPath, 'pcell.yaml');

      // 检查测试文件是否存在
      if (!fs.existsSync(hierYamlPath) ||
          !fs.existsSync(pvlogPath) ||
          !fs.existsSync(pobjPath) ||
          !fs.existsSync(pcellPath)) {
        console.warn('UPF测试文件不存在，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/upf-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        .attach('hierYamlFile', hierYamlPath)
        .attach('pvlogFile', pvlogPath)
        .attach('pobjFile', pobjPath)
        .attach('pcellFile', pcellPath);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBeTruthy();

      taskId = response.body.taskId;
    });

    it('应该验证所有4个必需文件', async () => {
      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/upf-thrpages/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('modName', 'test_module')
        // 只上传2个文件，缺少2个
        .attach('hierYamlFile', path.join(testFilesPath, 'hier.yaml'))
        .attach('pvlogFile', path.join(testFilesPath, 'pvlog.v'));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /upf-thrpages/sheets - 获取所有Sheet', () => {
    it('应该返回UPF的所有Sheet定义', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/upf-thrpages/${taskId}/sheets`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.sheets)).toBeTruthy();

      // UPF应该有4个Sheet: VarDef, PDomain, PStrategy, PMode
      expect(response.body.sheets.length).toBeGreaterThanOrEqual(4);
    });

    it('Sheet应该包含正确的名称', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/upf-thrpages/${taskId}/sheets`)
        .set('Authorization', `Bearer ${authToken}`);

      const sheetNames = response.body.sheets.map((s: any) => s.sheetName);
      expect(sheetNames).toContain('VarDef');
      expect(sheetNames).toContain('PDomain');
      expect(sheetNames).toContain('PStrategy');
      expect(sheetNames).toContain('PMode');
    });
  });

  describe('GET /upf-thrpages/sheets/:sheetId/tables - 获取Sheet中的表格', () => {
    it('VarDef Sheet应该包含PMVAR和PMCELL表格', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/upf-thrpages/sheets/VarDef/tables?taskId=${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const tableNames = response.body.tables.map((t: any) => t.tableName);
      expect(tableNames).toContain('PMVAR');
      expect(tableNames).toContain('PMCELL');
    });

    it('PDomain Sheet应该包含PMDOMAIN、PMNETWORK和PMBOUNDARY表格', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .get(`${API_BASE}/upf-thrpages/sheets/PDomain/tables?taskId=${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const tableNames = response.body.tables.map((t: any) => t.tableName);
      expect(tableNames).toContain('PMDOMAIN');
      expect(tableNames).toContain('PMNETWORK');
      expect(tableNames).toContain('PMBOUNDARY');
    });
  });

  describe('POST /upf-thrpages/data-sav - 保存表单数据', () => {
    it('应该成功保存UPF表格数据', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const dirtySheetData = [
        {
          sheetName: 'VarDef',
          sheetId: 'VarDef',
          tables: [
            {
              tableId: 'PMVAR',
              tableName: 'PMVAR',
              data: [
                {
                  HD_MOD_NAME: 'test_module',
                  HD_VAR_NAME: 'test_var',
                  HD_VAR_TYPE: 'supply',
                },
              ],
            },
          ],
        },
      ];

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/upf-thrpages/data-sav`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
          dirtySheetData: dirtySheetData,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /upf-thrpages/data-chk - 数据检查', () => {
    it('应该执行UPF数据检查', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/upf-thrpages/data-chk`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskId: taskId,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeDefined();
    });
  });

  describe('POST /upf-thrpages/:taskId/submit - 提交任务', () => {
    it('应该成功提交UPF任务', async () => {
      if (!taskId) {
        console.warn('没有可用的taskId，跳过测试');
        return;
      }

      const response = await request(`${BASE_URL}`)
        .post(`${API_BASE}/upf-thrpages/${taskId}/submit`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toMatch(/queued|running/);
    });
  });
});
