import bcrypt from 'bcrypt';
import { prisma } from './database';
import { Role } from '@prisma/client';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * 创建默认管理员账户
 * 用户名: admin@logiccore.com
 * 密码: 123 (首次登录后应强制修改)
 */
export const createDefaultAdmin = async () => {
  const adminEmail = 'admin@logiccore.com';
  const defaultPassword = '123';

  try {
    // 检查管理员是否已存在
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (existingAdmin) {
      console.log('Default admin already exists:', adminEmail);
      return existingAdmin;
    }

    // 哈希密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    // 创建管理员用户
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'System Administrator',
        role: Role.ADMIN,
        isVerified: true, // 管理员账户默认已验证
      }
    });

    console.log('Default admin created successfully:', adminEmail);
    console.log('Default password:', defaultPassword);
    console.log('⚠️  Please change the default password after first login!');

    return admin;
  } catch (error) {
    console.error('Error creating default admin:', error);
    throw error;
  }
};

/**
 * 种子脚本主函数
 */
export const seedAdmin = async () => {
  console.log('🌱 Seeding admin user...');
  
  try {
    await createDefaultAdmin();
    console.log('✅ Admin seeding completed successfully');
  } catch (error) {
    console.error('❌ Admin seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// 如果直接运行此脚本 (ES modules 兼容)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  seedAdmin();
} 