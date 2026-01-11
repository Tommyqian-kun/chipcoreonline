import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright 配置文件
 * 用于端到端测试 (E2E Testing)
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',

  // 完全并行运行测试
  fullyParallel: false, // SDC/UPF工具任务测试需要串行运行

  // 在CI环境中失败
  forbidOnly: !!process.env.CI,

  // 在CI环境中重试
  retries: process.env.CI ? 2 : 0,

  // 并发worker数
  workers: 1, // 限制为1个worker，避免并发问题

  // 测试超时时间（毫秒）
  timeout: 5 * 60 * 1000, // 5分钟，SDC/UPF工具执行需要较长时间

  // 期望超时时间
  expect: {
    timeout: 30 * 1000, // 30秒
  },

  // 失败时截图
  use: {
    // 基础URL
    baseURL: 'http://localhost:3000',

    // 追踪失败测试（重试时）
    trace: 'retain-on-failure',

    // 截图配置
    screenshot: 'only-on-failure',

    // 视频配置
    video: 'retain-on-failure',

    // 浏览器选项
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // 超时配置
    actionTimeout: 15 * 1000, // 15秒
    navigationTimeout: 30 * 1000, // 30秒
  },

  // 项目配置 - 支持多种浏览器
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 使用系统安装的Chrome
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
    // 使用系统安装的Microsoft Edge
    {
      name: 'edge',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
      },
    },
    // 使用系统安装的Firefox
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        channel: 'firefox',
      },
    },
  ],

  // 测试运行前启动开发服务器
  webServer: {
    command: 'cd app && npm run dev',
    url: 'http://localhost:3000',
    timeout: 120 * 1000, // 2分钟
    reuseExistingServer: !process.env.CI,
  },

  // 输出目录
  outputDir: 'tests/e2e/test-results',

  // 报告器
  reporter: [
    ['html', { outputFolder: 'tests/e2e/playwright-report' }],
    ['list'],
    ['junit', { outputFile: 'tests/e2e/test-results/junit.xml' }],
  ],
});
