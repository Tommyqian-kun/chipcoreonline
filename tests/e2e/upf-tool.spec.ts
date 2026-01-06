import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import { injectUpfTestData } from './helpers/data';
import { login } from './helpers/browser';
import path from 'path';

/**
 * UPF工具端到端测试
 *
 * 测试流程与SDC工具类似：
 * 1. 用户登录
 * 2. 导航到UPF工具
 * 3. 初始化任务（上传4个文件）
 * 4. API注入测试数据
 * 5. DataSav保存数据
 * 6. DataChk数据检查
 * 7. 提交任务
 * 8. 等待任务完成
 * 9. 下载结果
 */
test.describe('UPF工具完整流程', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await login(page);
  });

  /**
   * UPF工具初始化流程
   */
  async function initializeUpfTool(
    page: Page,
    options: {
      modName: string;
      hierYamlPath: string;
      pvlogPath: string;
      pobjPath: string;
      pcellPath: string;
    }
  ): Promise<string> {
    await page.goto('/tools/upf-generator');

    // 填写模块名
    await page.fill('[name="modName"]', options.modName);

    // 上传4个文件
    await page.setInputFiles('[name="hierYamlFile"]', options.hierYamlPath);
    await page.setInputFiles('[name="pvlogFile"]', options.pvlogPath);
    await page.setInputFiles('[name="pobjFile"]', options.pobjPath);
    await page.setInputFiles('[name="pcellFile"]', options.pcellPath);

    // 点击保存并下一步
    await page.click('button:has-text("保存并下一步")');

    // 等待跳转到数据页面，提取taskId
    await expect(page).toHaveURL(/\/tools\/upf-generator\/([a-f0-9-]+)\/VarDef/, {
      timeout: 30000,
    });

    const url = page.url();
    const match = url.match(/([a-f0-9-]+)\/VarDef/);

    if (!match) {
      throw new Error('无法从URL中提取taskId');
    }

    return match[1];
  }

  test('完整工作流 - 使用预填充Excel数据', async ({ page }) => {
    // ========== 第二步：导航并初始化任务 ==========
    await page.goto('/tools/upf-generator');

    // 准备测试文件路径
    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'hier.yaml');
    const pvlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pvlog.v');
    const pobjPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pobj.tcl');
    const pcellPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pcell.yaml');

    // 初始化UPF工具
    const taskId = await initializeUpfTool(page, {
      modName: 'test_module',
      hierYamlPath: hierYamlPath,
      pvlogPath: pvlogPath,
      pobjPath: pobjPath,
      pcellPath: pcellPath,
    });

    console.log(`✅ UPF任务初始化成功，taskId: ${taskId}`);

    // ========== 第三步：API注入测试数据 ==========
    const excelPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pcont.xlsx');

    const apiRequest = await request.newContext({
      baseURL: 'http://localhost:8080',
    });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    apiRequest.setExtraHTTPHeaders({
      Authorization: `Bearer ${token}`,
    });

    console.log(`📋 注入UPF测试数据...`);
    await injectUpfTestData(apiRequest, taskId, excelPath);

    await page.reload({ waitUntil: 'networkidle' });
    console.log(`✅ UPF测试数据已注入并加载`);

    // ========== 第四步：验证数据展示 ==========
    await expect(page.locator('text=VarDef')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=PDomain')).toBeVisible();
    await expect(page.locator('text=PStrategy')).toBeVisible();
    await expect(page.locator('text=PMode')).toBeVisible();

    // ========== 第五步：DataSav ==========
    const dataSavButton = page.locator('button:has-text("DataSav")');
    const isDisabled = await dataSavButton.isDisabled();

    if (!isDisabled) {
      await dataSavButton.click();
      await expect(page.locator('text=/保存|成功/i')).toBeVisible({ timeout: 5000 });
    }

    // ========== 第六步：DataChk ==========
    console.log(`🔍 执行UPF DataChk数据检查...`);
    await page.click('button:has-text("DataChk")');
    await expect(page.locator('text=检查通过')).toBeVisible({ timeout: 60000 });
    console.log(`✅ UPF DataChk检查通过`);

    // ========== 第七步：Submit ==========
    console.log(`📤 提交UPF任务...`);
    await page.click('button:has-text("提交任务")');
    await expect(page.locator('text=RUNNING')).toBeVisible({ timeout: 30000 });
    console.log(`✅ UPF任务已提交，正在执行`);

    // ========== 第八步：等待完成 ==========
    await expect(page.locator('text=COMPLETED')).toBeVisible({ timeout: 180000 });
    console.log(`✅ UPF任务执行完成`);

    // ========== 第九步：下载结果 ==========
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("下载结果")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.zip');
    console.log(`✅ UPF结果下载成功: ${download.suggestedFilename()}`);

    await apiRequest.dispose();
  });

  test('初始化任务 - 验证4个文件上传', async ({ page }) => {
    await page.goto('/tools/upf-generator');

    // 填写模块名
    await page.fill('[name="modName"]', 'test_module');

    // 准备测试文件路径
    const hierYamlPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'hier.yaml');
    const pvlogPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pvlog.v');
    const pobjPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pobj.tcl');
    const pcellPath = path.join(process.cwd(), 'test_data', 'upload_data', 'upfgen', 'pcell.yaml');

    // 上传文件
    await page.setInputFiles('[name="hierYamlFile"]', hierYamlPath);
    await page.setInputFiles('[name="pvlogFile"]', pvlogPath);
    await page.setInputFiles('[name="pobjFile"]', pobjPath);
    await page.setInputFiles('[name="pcellFile"]', pcellPath);

    // 验证文件名显示
    await expect(page.locator('text=hier.yaml')).toBeVisible();
    await expect(page.locator('text=pvlog.v')).toBeVisible();
    await expect(page.locator('text=pobj.tcl')).toBeVisible();
    await expect(page.locator('text=pcell.yaml')).toBeVisible();

    // 点击保存并下一步
    await page.click('button:has-text("保存并下一步")');

    // 验证成功跳转
    await expect(page).toHaveURL(/\/tools\/upf-generator\/[a-f0-9-]+\/VarDef/);
  });
});
