import { Page, Locator, expect } from '@playwright/test';

/**
 * 浏览器测试辅助函数
 * 提供常用的页面操作和验证功能
 */

/**
 * 等待页面加载完成
 */
export async function waitForPageLoad(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * 填写表单字段
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const element = page.locator(selector).first();
  await element.waitFor({ state: 'visible', timeout: options.timeout || 10000 });
  await element.fill(value);
}

/**
 * 选择下拉选项
 */
export async function selectDropdownOption(
  page: Page,
  triggerSelector: string,
  optionText: string
): Promise<void> {
  // 点击下拉触发器
  await page.click(triggerSelector);

  // 等待选项可见
  const option = page.locator(`[role="option"]:has-text("${optionText}")`).first();
  await option.waitFor({ state: 'visible' });

  // 点击选项
  await option.click();
}

/**
 * 上传文件
 */
export async function uploadFile(
  page: Page,
  fileInputSelector: string,
  filePath: string
): Promise<void> {
  const fileInput = page.locator(fileInputSelector);
  await fileInput.setInputFiles(filePath);
}

/**
 * 等待通知/Toast消息
 */
export async function waitForToast(
  page: Page,
  message: string | RegExp,
  options: { timeout?: number } = {}
): Promise<Locator> {
  const timeout = options.timeout || 10000;
  const toast = page.locator(
    message instanceof RegExp
      ? `.toast:has-text匹配(${message.source})`
      : `.toast:has-text("${message}")`
  );

  await toast.waitFor({ state: 'visible', timeout });
  return toast;
}

/**
 * 等待API请求完成（通过网络活动）
 */
export async function waitForApiCall(
  page: Page,
  urlPattern: string | RegExp,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 30000;

  // 等待匹配的网络请求
  await page.waitForResponse(
    (response) =>
      typeof urlPattern === 'string'
        ? response.url().includes(urlPattern)
        : urlPattern.test(response.url()),
    { timeout }
  );
}

/**
 * 等待任务状态变化
 */
export async function waitForTaskStatus(
  page: Page,
  taskId: string,
  expectedStatus: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 180000; // 默认3分钟
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const statusElement = page.locator(`[data-task-id="${taskId}"] [data-status]`);

    if (await statusElement.count() > 0) {
      const currentStatus = await statusElement.getAttribute('data-status');
      if (currentStatus === expectedStatus) {
        return;
      }
    }

    await page.waitForTimeout(1000); // 每秒检查一次
  }

  throw new Error(`任务状态未在${timeout}ms内变为${expectedStatus}`);
}

/**
 * 截图并保存（用于调试）
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  fullPage: boolean = true
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${name}-${timestamp}.png`;

  await page.screenshot({
    path: `tests/e2e/screenshots/${filename}`,
    fullPage,
  });
}

/**
 * 获取页面控制台日志
 */
export async function getConsoleLogs(page: Page): Promise<any[]> {
  const logs: any[] = [];

  page.on('console', (msg) => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });

  return logs;
}

/**
 * 验证响应状态码
 */
export async function expectResponse(
  page: Page,
  urlPattern: string | RegExp,
  expectedStatus: number
): Promise<void> {
  const response = await page.waitForResponse(
    (response) =>
      typeof urlPattern === 'string'
        ? response.url().includes(urlPattern)
        : urlPattern.test(response.url())
  );

  expect(response.status()).toBe(expectedStatus);
}

/**
 * 登录操作（完整流程）
 */
export async function login(
  page: Page,
  email: string = 'test@example.com',
  password: string = 'Test123456!'
): Promise<void> {
  await page.goto('/login');

  await fillFormField(page, '[name="email"]', email);
  await fillFormField(page, '[name="password"]', password);

  await page.click('button[type="submit"]');

  // 等待跳转到首页
  await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
}

/**
 * 导航到SDC工具页面
 */
export async function navigateToSdcTool(page: Page): Promise<void> {
  await page.goto('/tools/sdc-generator');
  await expect(page.locator('h1:has-text("SDC生成器")')).toBeVisible();
}

/**
 * 导航到UPF工具页面
 */
export async function navigateToUpfTool(page: Page): Promise<void> {
  await page.goto('/tools/upf-generator');
  await expect(page.locator('h1:has-text("UPF生成器")')).toBeVisible();
}

/**
 * SDC工具初始化流程
 */
export async function initializeSdcTool(
  page: Page,
  options: {
    modName: string;
    isFlat: boolean;
    hierYamlPath: string;
    vlogPath: string;
  }
): Promise<string> {
  // 填写模块名
  await fillFormField(page, '[name="modName"]', options.modName);

  // 选择是否扁平
  if (options.isFlat) {
    await page.check('[name="isFlat"]');
  } else {
    await page.uncheck('[name="isFlat"]');
  }

  // 上传文件
  await uploadFile(page, '[name="hierYamlFile"]', options.hierYamlPath);
  await uploadFile(page, '[name="vlogFile"]', options.vlogPath);

  // 点击保存并下一步
  await page.click('button:has-text("保存并下一步")');

  // 等待跳转到数据页面，提取taskId
  await expect(page).toHaveURL(/\/tools\/sdc-generator\/([a-f0-9-]+)\/VarDef/, {
    timeout: 30000,
  });

  const url = page.url();
  const match = url.match(/([a-f0-9-]+)\/VarDef/);

  if (!match) {
    throw new Error('无法从URL中提取taskId');
  }

  return match[1];
}

/**
 * UPF工具初始化流程
 */
export async function initializeUpfTool(
  page: Page,
  options: {
    modName: string;
    hierYamlPath: string;
    pvlogPath: string;
    pobjPath: string;
    pcellPath: string;
  }
): Promise<string> {
  // 填写模块名
  await fillFormField(page, '[name="modName"]', options.modName);

  // 上传文件
  await uploadFile(page, '[name="hierYamlFile"]', options.hierYamlPath);
  await uploadFile(page, '[name="pvlogFile"]', options.pvlogPath);
  await uploadFile(page, '[name="pobjFile"]', options.pobjPath);
  await uploadFile(page, '[name="pcellFile"]', options.pcellPath);

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

/**
 * 点击DataSav按钮并验证
 */
export async function clickDataSav(page: Page): Promise<void> {
  const dataSavButton = page.locator('button:has-text("DataSav")');

  // 等待按钮可见
  await dataSavButton.waitFor({ state: 'visible', timeout: 10000 });

  // 检查是否禁用
  const isDisabled = await dataSavButton.isDisabled();

  if (!isDisabled) {
    await dataSavButton.click();
    await waitForToast(page, /保存|成功/i);
  }
}

/**
 * 点击DataChk按钮并验证
 */
export async function clickDataChk(page: Page): Promise<void> {
  const dataChkButton = page.locator('button:has-text("DataChk")');

  await dataChkButton.waitFor({ state: 'visible', timeout: 10000 });
  await dataChkButton.click();

  // 等待检查完成提示
  await waitForToast(page, /检查|通过/i, { timeout: 60000 });
}

/**
 * 提交任务并验证
 */
export async function submitTask(page: Page): Promise<void> {
  const submitButton = page.locator('button:has-text("提交任务")');

  await submitButton.waitFor({ state: 'visible', timeout: 10000 });
  await submitButton.click();

  // 等待状态变为RUNNING
  await expect(page.locator('text=RUNNING')).toBeVisible({ timeout: 30000 });
}

/**
 * 等待任务完成
 */
export async function waitForTaskComplete(page: Page): Promise<void> {
  await expect(page.locator('text=COMPLETED')).toBeVisible({ timeout: 180000 });
}

/**
 * 清理会话（登出）
 */
export async function logout(page: Page): Promise<void> {
  await page.click('[data-testid="user-menu"]');
  await page.click('button:has-text("登出")');
  await expect(page).toHaveURL(/\/login/);
}
