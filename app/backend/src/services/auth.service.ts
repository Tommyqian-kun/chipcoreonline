import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendVerificationEmail, sendPasswordResetEmail, sendVerificationCodeEmail } from './email.service';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database'; // Import shared prisma instance
import { JwtBlacklistService } from './jwt-blacklist.service';

// 生成6位数字验证码
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const registerUser = async (email: string, password: string) => {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
    },
  });

  // 为新用户自动创建Free订阅（不需要Order）
  try {
    const freePlan = await prisma.plan.findFirst({
      where: { name: 'Free' }
    });

    if (freePlan) {
      // Free用户订阅永久有效（10年后过期）
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 10);

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          // orderId: null, // Free用户不需要订单
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: endDate,
        }
      });
    }
  } catch (subscriptionError) {
    console.error('Failed to create free subscription for user:', subscriptionError);
    // 不抛出错误，因为用户已经创建成功，订阅可以后续补充
  }

  // 生成6位验证码
  const verificationCode = generateVerificationCode();
  const verificationCodeKey = `verification_code:${user.email}`;

  // 将验证码存入 Redis，有效期2分钟
  const { redisPool } = await import('./redis-pool.service');
  await redisPool.getClient().set(verificationCodeKey, verificationCode, 'EX', 60 * 2);

  // 发送验证码邮件
  await sendVerificationCodeEmail(user.email, verificationCode);

  return user;
};

export const verifyEmail = async (token: string): Promise<boolean> => {
  const verificationTokenKey = `verification:${token}`;
  const { redisPool } = await import('./redis-pool.service');

  const userId = await redisPool.getClient().get(verificationTokenKey);

  if (!userId) {
    // 令牌无效或已过期
    return false;
  }

  // 更新用户状态
  await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
  });

  // 删除已使用的令牌
  await redisPool.getClient().del(verificationTokenKey);

  return true;
};

// 验证邮箱验证码
export const verifyEmailCode = async (email: string, code: string): Promise<boolean> => {
  const verificationCodeKey = `verification_code:${email}`;
  const { redisPool } = await import('./redis-pool.service');

  const storedCode = await redisPool.getClient().get(verificationCodeKey);

  if (!storedCode || storedCode !== code) {
    // 验证码无效或已过期
    return false;
  }

  // 查找用户并更新验证状态
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return false;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true },
  });

  // 删除已使用的验证码
  await redisPool.getClient().del(verificationCodeKey);

  return true;
};

// 重新发送验证码
export const resendVerificationCode = async (email: string): Promise<boolean> => {
  // 检查用户是否存在
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return false;
  }

  // 如果用户已验证，不需要重发
  if (user.isVerified) {
    return false;
  }

  // 生成新的验证码
  const verificationCode = generateVerificationCode();
  const verificationCodeKey = `verification_code:${email}`;

  // 将验证码存入 Redis，有效期2分钟
  const { redisPool } = await import('./redis-pool.service');
  await redisPool.getClient().set(verificationCodeKey, verificationCode, 'EX', 60 * 2);

  // 发送验证码邮件
  await sendVerificationCodeEmail(email, verificationCode);

  return true;
};

export const loginUser = async (email: string, password: string): Promise<{ token: string; user: { id: string, email: string, name: string | null, avatar: string | null, isVerified: boolean, role: string, createdAt: string } } | null> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      isVerified: true,
      name: true,
      avatar: true,
      role: true,
      createdAt: true,
    }
  });

  if (!user) {
    // 为了安全，不明确指出是邮箱还是密码错误
    return null;
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    return null;
  }

  if (!user.isVerified) {
    // 抛出特定错误，以便控制器可以识别并给出相应提示
    throw new Error('EmailNotVerified');
  }

  // 生成 JWT
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET not defined in .env file');
    throw new Error('ServerConfigurationError');
  }

  // 包含用户角色信息在JWT中，并添加签发时间
  const token = jwt.sign(
    { 
      id: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000) // 添加签发时间
    },
    jwtSecret,
    { expiresIn: '7d' } // Default to 7 days, controller can decide shorter
  );

  const { password: userPassword, ...userWithoutPassword } = user;

  return { token, user: userWithoutPassword };
};

export const resendVerificationEmail = async (email: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // 即使邮箱不存在，我们也返回成功，以防止用户名枚举攻击
    return true;
  }

  if (user.isVerified) {
    // 用户已验证，无需操作
    return true;
  }

  // 生成新的验证令牌
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenKey = `verification:${verificationToken}`;
  
  const { redisPool } = await import('./redis-pool.service');
  await redisPool.getClient().set(verificationTokenKey, user.id, 'EX', 60 * 60 * 24);

  // 发送验证邮件
  await sendVerificationEmail(user.email, verificationToken);
  
  return true;
};

export const requestPasswordReset = async (email: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isVerified) {
    // 邮箱不存在或未验证，为防止枚举攻击，静默失败
    return true;
  }

  // 生成重置令牌
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenKey = `password-reset:${resetToken}`;
  
  const { redisPool } = await import('./redis-pool.service');
  await redisPool.getClient().set(resetTokenKey, user.id, 'EX', 60 * 60);

  // 发送密码重置邮件
  await sendPasswordResetEmail(user.email, resetToken);
  
  return true;
};

export const resetPassword = async (token: string, newPassword: string): Promise<boolean> => {
  const resetTokenKey = `password-reset:${token}`;
  const { redisPool } = await import('./redis-pool.service');

  const userId = await redisPool.getClient().get(resetTokenKey);

  if (!userId) {
    return false; // Token not found or expired
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Update user's password
  await prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash },
  });

  // Delete the used token
  await redisPool.getClient().del(resetTokenKey);

  // 将用户的所有JWT令牌加入黑名单（密码重置后旧令牌应失效）
  await JwtBlacklistService.blacklistAllUserTokens(userId, 'password_reset');

  return true;
};

/**
 * 用户登出 - 将当前JWT令牌添加到黑名单
 * @param token JWT令牌
 */
export const logoutUser = async (token: string): Promise<void> => {
  await JwtBlacklistService.addToBlacklist(token, 'logout');
}; 