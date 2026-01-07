import { redisPool } from './redis-pool.service';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60; // 15分钟

export class LoginProtectionService {
  private readonly MAX_ATTEMPTS = MAX_LOGIN_ATTEMPTS;
  private readonly LOCK_DURATION_SECONDS = LOCK_DURATION;

  /**
   * 检查登录尝试次数，返回是否允许登录
   */
  async checkLoginAttempts(email: string): Promise<{ allowed: boolean; remainingAttempts?: number; lockTimeRemaining?: number }> {
    const redis = redisPool.getClient();
    const key = `login_attempts:${email}`;

    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, this.LOCK_DURATION_SECONDS);
    }

    if (attempts > this.MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      return { allowed: false, lockTimeRemaining: ttl };
    }

    return {
      allowed: true,
      remainingAttempts: this.MAX_ATTEMPTS - attempts
    };
  }

  /**
   * 重置登录尝试次数（登录成功时调用）
   */
  async resetLoginAttempts(email: string): Promise<void> {
    const redis = redisPool.getClient();
    await redis.del(`login_attempts:${email}`);
  }

  /**
   * 获取锁定剩余时间（秒）
   */
  async getLockTimeRemaining(email: string): Promise<number> {
    const redis = redisPool.getClient();
    return await redis.ttl(`login_attempts:${email}`);
  }
}

export const loginProtection = new LoginProtectionService();
