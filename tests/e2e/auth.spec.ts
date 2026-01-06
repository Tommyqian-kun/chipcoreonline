import { test, expect } from '@playwright/test';
import { login } from './helpers/browser';

/**
 * 用户认证E2E测试
 */
test.describe('用户认证流程', () => {
  test.beforeEach(async ({ page }) => {
    // 每个测试前都访问登录页面
    await page.goto('/login');
  });

  test('用户登录 - 正常流程', async ({ page }) => {
    // 填写登录表单
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'Test123456!');

    // 提交登录
    await page.click('button[type="submit"]');

    // 验证跳转到首页
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });

    // 验证用户菜单显示
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('用户登录 - 错误密码', async ({ page }) => {
    // 填写登录表单（错误密码）
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'WrongPassword123!');

    // 提交登录
    await page.click('button[type="submit"]');

    // 验证错误提示
    await expect(page.locator('text=邮箱或密码错误')).toBeVisible();
  });

  test('用户登录 - 不存在的用户', async ({ page }) => {
    // 填写登录表单（不存在的用户）
    await page.fill('[name="email"]', 'nonexistent@example.com');
    await page.fill('[name="password"]', 'Test123456!');

    // 提交登录
    await page.click('button[type="submit"]');

    // 验证错误提示
    await expect(page.locator('text=用户不存在')).toBeVisible();
  });

  test('用户登录 - 表单验证', async ({ page }) => {
    // 不填写任何信息，直接提交
    await page.click('button[type="submit"]');

    // 验证表单验证错误
    await expect(page.locator('text=请输入邮箱')).toBeVisible();
    await expect(page.locator('text=请输入密码')).toBeVisible();
  });

  test('用户登录 - 无效邮箱格式', async ({ page }) => {
    // 填写无效邮箱
    await page.fill('[name="email"]', 'invalid-email');
    await page.fill('[name="password"]', 'Test123456!');

    // 验证邮箱格式验证
    const emailInput = page.locator('[name="email"]');
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('用户登出', async ({ page }) => {
    // 先登录
    await login(page);

    // 点击用户菜单
    await page.click('[data-testid="user-menu"]');

    // 点击登出按钮
    await page.click('button:has-text("登出")');

    // 验证跳转到登录页
    await expect(page).toHaveURL(/\/login/);
  });

  test('自动登录 - 使用JWT token', async ({ page }) => {
    // 先登录获取token
    await login(page);

    // 保存localStorage中的token
    const token = await page.evaluate(() => {
      return localStorage.getItem('token');
    });

    expect(token).toBeTruthy();

    // 刷新页面（应该自动登录）
    await page.reload();

    // 验证仍在首页（没有跳转到登录页）
    await expect(page).toHaveURL(/\/$/);

    // 验证用户菜单仍然显示
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });
});
