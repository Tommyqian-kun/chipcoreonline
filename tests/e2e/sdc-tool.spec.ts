import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import { injectSdcTestData } from './helpers/data';
import { login, initializeSdcTool, clickDataSav, clickDataChk, submitTask, waitForTaskComplete } from './helpers/browser';
import path from 'path';

/**
 * SDC工具端到端测试
 *
 * 测试流程：
 * 1. 用户登录
 * 2. 导航到SDC工具
 * 3. 初始化任务（上传hier.yaml和vlog.v）
 * 4. API注入测试数据（从预填充的Excel）
 * 5. DataSav保存数据
 * 6. DataChk数据检查
 * 7. 提交任务
 * 8. 等待任务完成
 * 9. 下载结果
 */
test.describe('SDC工具完整流程', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await login(page);
  });

  test('完整工作流 - 使用预填充Excel数据', async ({ page, context }) => {
    // ========== 第二步：导航并初始化任务 ==========
    await page.goto('/tools/sdc-generator');

    // 准备测试文件路径
    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'hier.yaml');
    const vlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'vlog.v');

    // 初始化SDC工具
    const taskId = await initializeSdcTool(page, {
      modName: 'test_module',
      isFlat: false,
      hierYamlPath: hierYamlPath,
      vlogPath: vlogPath,
    });

    console.log(`✅ 任务初始化成功，taskId: ${taskId}`);

    // ========== 第三步：API注入测试数据 ⭐ 关键 ==========
    // 从test_data/upload_data/sdcgen/dcont.xlsx读取预填充的测试数据
    // 并通过DataSav API注入到数据库
    const excelPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'dcont.xlsx');

    // 使用API request context注入数据
    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    // 获取当前用户的token
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // 设置认证头
    apiRequest.setExtraHTTPHeaders({
      Authorization: `Bearer ${token}`,
    });

    console.log(`📋 注入测试数据...`);
    await injectSdcTestData(apiRequest, taskId, excelPath);

    // 刷新页面，前端从数据库重新加载数据
    await page.reload({ waitUntil: 'networkidle' });
    console.log(`✅ 测试数据已注入并加载`);

    // ========== 第四步：验证数据展示 ==========
    await expect(page.locator('text=VarDef')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=ClkDef')).toBeVisible();
    await expect(page.locator('text=IODly')).toBeVisible();
    await expect(page.locator('text=Exp')).toBeVisible();

    // ========== 第五步：DataSav - 保存数据 ⭐ 必须执行 ==========
    await clickDataSav(page);

    // ========== 第六步：DataChk - 数据检查 ⭐ 检查必须通过 ==========
    console.log(`🔍 执行DataChk数据检查...`);
    await clickDataChk(page);
    console.log(`✅ DataChk检查通过`);

    // ========== 第七步：Submit - 提交任务 ==========
    console.log(`📤 提交任务...`);
    await submitTask(page);
    console.log(`✅ 任务已提交，正在执行`);

    // ========== 第八步：等待任务完成 ==========
    console.log(`⏳ 等待任务完成...`);
    await waitForTaskComplete(page);
    console.log(`✅ 任务执行完成`);

    // ========== 第九步：下载结果 ==========
    console.log(`📥 下载结果...`);
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("下载结果")');
    const download = await downloadPromise;

    // 验证下载文件
    expect(download.suggestedFilename()).toContain('.zip');
    console.log(`✅ 结果下载成功: ${download.suggestedFilename()}`);

    await apiRequest.dispose();
  });

  test('初始化任务 - 文件验证', async ({ page }) => {
    await page.goto('/tools/sdc-generator');

    // 准备测试文件路径
    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'hier.yaml');
    const vlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'vlog.v');

    // 填写模块名
    await page.fill('[name="modName"]', 'test_module');
    await page.uncheck('[name="isFlat"]');

    // 上传文件
    await page.setInputFiles('[name="hierYamlFile"]', hierYamlPath);
    await page.setInputFiles('[name="vlogFile"]', vlogPath);

    // 验证文件名显示
    await expect(page.locator('text=hier.yaml')).toBeVisible();
    await expect(page.locator('text=vlog.v')).toBeVisible();

    // 点击保存并下一步
    await page.click('button:has-text("保存并下一步")');

    // 验证成功跳转
    await expect(page).toHaveURL(/\/tools\/sdc-generator\/[a-f0-9-]+\/VarDef/);
  });

  test('数据编辑 - 添加和删除行', async ({ page }) => {
    await page.goto('/tools/sdc-generator');

    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'hier.yaml');
    const vlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'vlog.v');

    const taskId = await initializeSdcTool(page, {
      modName: 'test_module',
      isFlat: false,
      hierYamlPath: hierYamlPath,
      vlogPath: vlogPath,
    });

    // 等待表格加载
    await expect(page.locator('text=VarDef')).toBeVisible({ timeout: 15000 });

    // 切换到ClkDef页面
    await page.click('text=ClkDef');

    // 点击"添加行"按钮
    await page.click('button:has-text("添加行")');

    // 验证新行已添加
    await expect(page.locator('[data-testid="table-row"]')).toHaveCount(await page.locator('[data-testid="table-row"]').count() + 1);

    // 填写新行数据
    const newRow = page.locator('[data-testid="table-row"]').last();
    await newRow.locator('[data-field="ClkPin"]').fill('test_clk');
    await newRow.locator('[data-field="ClkName"]').fill('test_clk_name');
    await newRow.locator('[data-field="ClkPeriod"]').fill('10');

    // 保存数据
    await clickDataSav(page);

    // 删除新添加的行
    await newRow.locator('button:has-text("删除")').click();

    // 再次保存
    await clickDataSav(page);
  });
});

/**
 * SDC工具API测试
 * 使用API直接测试，不涉及浏览器交互
 */
test.describe('SDC工具API测试', () => {
  let authToken: string;
  let taskId: string;

  test.beforeAll(async ({ browser }) => {
    // 创建API请求context并登录
    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    const response = await apiRequest.post('/api/v1/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'Test123456!',
      },
    });

    const data = await response.json();
    authToken = data.token;

    await apiRequest.dispose();
  });

  test('POST /initialize - 初始化SDC任务', async ({}) => {
    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'hier.yaml');
    const vlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'sdcgen', 'vlog.v');

    const formData = new FormData();
    formData.append('modName', 'test_module');
    formData.append('isFlat', 'false');

    // 读取文件内容
    const hierYamlContent = require('fs').readFileSync(hierYamlPath);
    const vlogContent = require('fs').readFileSync(vlogPath);

    formData.append('hierYamlFile', new Blob([hierYamlContent], { type: 'text/yaml' }), 'hier.yaml');
    formData.append('vlogFile', new Blob([vlogContent], { type: 'text/plain' }), 'vlog.v');

    const response = await apiRequest.post('/api/v1/sdc-thrpages/initialize', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        modName: 'test_module',
        isFlat: 'false',
        hierYamlFile: {
          name: 'hier.yaml',
          mimeType: 'text/yaml',
          buffer: hierYamlContent,
        },
        vlogFile: {
          name: 'vlog.v',
          mimeType: 'text/plain',
          buffer: vlogContent,
        },
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.taskId).toBeTruthy();
    expect(data.success).toBe(true);

    taskId = data.taskId;

    await apiRequest.dispose();
  });

  test('POST /data-sav - 保存表单数据', async ({}) => {
    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    const response = await apiRequest.post('/api/v1/sdc-thrpages/data-sav', {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        taskId: taskId,
        dirtySheetData: [],
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);

    await apiRequest.dispose();
  });

  test('GET /sheets - 获取所有Sheet', async ({}) => {
    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    const response = await apiRequest.get(`/api/v1/sdc-thrpages/sheets?taskId=${taskId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(Array.isArray(data.sheets)).toBeTruthy();
    expect(data.sheets.length).toBeGreaterThan(0);

    await apiRequest.dispose();
  });
});
