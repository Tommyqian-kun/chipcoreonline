import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 测试环境初始化脚本
 *
 * 功能：
 * 1. 创建测试数据库连接
 * 2. 清理测试数据
 * 3. 运行数据库迁移
 * 4. 准备测试数据
 */

const prisma = new PrismaClient();

/**
 * 清理测试数据
 */
export async function cleanupTestData() {
  console.log('🧹 清理测试数据...');

  // 删除所有测试任务
  await prisma.task.deleteMany({});

  // 删除测试用户（保留admin）
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: 'test',
      },
    },
  });

  // 删除测试相关的Sheet和Field
  await prisma.field.deleteMany({});
  await prisma.sheet.deleteMany({});

  console.log('✅ 测试数据清理完成');
}

/**
 * 创建测试用户
 */
export async function createTestUser(userData: {
  email: string;
  password: string;
  username?: string;
}) {
  const bcrypt = await import('bcrypt');
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  const user = await prisma.user.create({
    data: {
      email: userData.email,
      password: hashedPassword,
      username: userData.username || userData.email.split('@')[0],
      subscriptionLevel: 'FREE',
    },
  });

  console.log(`✅ 创建测试用户: ${user.email}`);
  return user;
}

/**
 * 创建测试任务
 */
export async function createTestTask(taskData: {
  userId: string;
  toolType: string;
  description?: string;
}) {
  const task = await prisma.task.create({
    data: {
      userId: taskData.userId,
      toolType: taskData.toolType,
      description: taskData.description || '自动化测试任务',
      status: 'pending',
    },
  });

  console.log(`✅ 创建测试任务: ${task.id}`);
  return task;
}

/**
 * 初始化测试环境
 */
export async function setupTestEnv() {
  console.log('🚀 初始化测试环境...');

  // 检查数据库连接
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    throw error;
  }

  // 清理测试数据
  await cleanupTestData();

  // 创建默认测试用户
  const testUser = await createTestUser({
    email: 'test@example.com',
    password: 'Test123456!',
    username: 'testuser',
  });

  console.log('✅ 测试环境初始化完成');
  return { testUser };
}

/**
 * 清理并关闭测试环境
 */
export async function teardownTestEnv() {
  console.log('🧹 清理测试环境...');

  // 清理测试数据
  await cleanupTestData();

  // 关闭数据库连接
  await prisma.$disconnect();

  console.log('✅ 测试环境清理完成');
}

/**
 * 创建临时测试目录
 */
export function createTestDirectories() {
  const testDirs = [
    path.join(process.cwd(), 'tests', 'e2e', 'screenshots'),
    path.join(process.cwd(), 'tests', 'e2e', 'test-results'),
    path.join(process.cwd(), 'tests', 'e2e', 'playwright-report'),
    path.join(process.cwd(), 'coverage'),
  ];

  testDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ 创建测试目录: ${dir}`);
    }
  });
}

/**
 * 复制测试数据文件到fixtures目录
 */
export function copyTestDataToFixtures() {
  const sourceDirs = [
    { source: 'sdcgen', target: 'sdc' },
    { source: 'upfgen', target: 'upf' },
  ];

  const basePath = path.join(process.cwd(), 'test_data', 'upload_data');
  const fixturesPath = path.join(process.cwd(), 'tests', 'e2e', 'fixtures');

  sourceDirs.forEach(({ source, target }) => {
    const sourcePath = path.join(basePath, source);
    const targetPath = path.join(fixturesPath, target);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // 复制所有文件
    const files = fs.readdirSync(sourcePath);
    files.forEach((file) => {
      const srcFile = path.join(sourcePath, file);
      const destFile = path.join(targetPath, file);

      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, destFile);
        console.log(`✅ 复制测试文件: ${file} -> fixtures/${target}/`);
      }
    });
  });
}

/**
 * 检查测试环境是否就绪
 */
export async function checkTestEnvReady(): Promise<boolean> {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`;

    // 检查测试用户是否存在
    const testUser = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
    });

    if (!testUser) {
      console.warn('⚠️ 测试用户不存在，请运行 setupTestEnv()');
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ 测试环境检查失败:', error);
    return false;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  (async () => {
    try {
      await setupTestEnv();
      createTestDirectories();
      copyTestDataToFixtures();
      process.exit(0);
    } catch (error) {
      console.error('初始化失败:', error);
      process.exit(1);
    }
  })();
}

export { prisma };
