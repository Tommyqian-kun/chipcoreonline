import jwt from 'jsonwebtoken';

/**
 * JWT黑名单服务
 * 用于管理被撤销的JWT令牌，确保登出和密码重置后的安全性
 */
export class JwtBlacklistService {
  private static readonly BLACKLIST_PREFIX = 'jwt_blacklist:';
  
  /**
   * 将JWT令牌添加到黑名单
   * @param token JWT令牌
   * @param reason 添加到黑名单的原因
   */
  static async addToBlacklist(token: string, reason: string = 'logout'): Promise<void> {
    try {
      // 解析JWT获取过期时间
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        console.warn('Invalid JWT token provided to blacklist');
        return;
      }

      // 计算令牌剩余有效时间
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;
      
      if (expiresIn <= 0) {
        // 令牌已过期，无需添加到黑名单
        return;
      }

      // 将令牌添加到Redis黑名单，设置过期时间
      const { redisPool } = await import('./redis-pool.service');
      const key = `${this.BLACKLIST_PREFIX}${token}`;
      await redisPool.getClient().setex(key, expiresIn, JSON.stringify({
        reason,
        blacklistedAt: new Date().toISOString(),
        originalExp: decoded.exp,
        userId: decoded.id
      }));

      console.log(`JWT token added to blacklist: reason=${reason}, userId=${decoded.id}`);
    } catch (error) {
      console.error('Error adding JWT to blacklist:', error);
      throw new Error('Failed to blacklist JWT token');
    }
  }

  /**
   * 检查JWT令牌是否在黑名单中
   * @param token JWT令牌
   * @returns 是否在黑名单中
   */
  static async isBlacklisted(token: string): Promise<boolean> {
    try {
      const { redisPool } = await import('./redis-pool.service');
      const key = `${this.BLACKLIST_PREFIX}${token}`;
      const result = await redisPool.getClient().get(key);
      return result !== null;
    } catch (error) {
      console.error('Error checking JWT blacklist:', error);
      // 在错误情况下，为了安全起见，认为令牌可能有问题
      return true;
    }
  }

  /**
   * 获取黑名单令牌的详细信息
   * @param token JWT令牌
   * @returns 黑名单信息或null
   */
  static async getBlacklistInfo(token: string): Promise<any | null> {
    try {
      const { redisPool } = await import('./redis-pool.service');
      const key = `${this.BLACKLIST_PREFIX}${token}`;
      const result = await redisPool.getClient().get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error('Error getting blacklist info:', error);
      return null;
    }
  }

  /**
   * 将用户的所有JWT令牌添加到黑名单（用于密码重置等场景）
   * @param userId 用户ID
   * @param reason 添加到黑名单的原因
   */
  static async blacklistAllUserTokens(userId: string, reason: string = 'password_reset'): Promise<void> {
    try {
      // 这是一个标记，表示该用户在某个时间点之前的所有令牌都无效
      const key = `${this.BLACKLIST_PREFIX}user:${userId}`;
      const invalidationTime = Math.floor(Date.now() / 1000);
      
      // 设置较长的过期时间（7天），确保覆盖所有可能的JWT有效期
      const { redisPool } = await import('./redis-pool.service');
      await redisPool.getClient().setex(key, 7 * 24 * 60 * 60, JSON.stringify({
        reason,
        invalidationTime,
        blacklistedAt: new Date().toISOString()
      }));

      console.log(`All JWT tokens for user ${userId} invalidated: reason=${reason}`);
    } catch (error) {
      console.error('Error blacklisting all user tokens:', error);
      throw new Error('Failed to blacklist user tokens');
    }
  }

  /**
   * 检查用户的令牌是否因为全局失效而无效
   * @param userId 用户ID
   * @param tokenIssuedAt 令牌签发时间（Unix时间戳）
   * @returns 是否无效
   */
  static async isUserTokenInvalidated(userId: string, tokenIssuedAt: number): Promise<boolean> {
    try {
      const { redisPool } = await import('./redis-pool.service');
      const key = `${this.BLACKLIST_PREFIX}user:${userId}`;
      const result = await redisPool.getClient().get(key);
      
      if (!result) {
        return false;
      }

      const invalidationInfo = JSON.parse(result);
      return tokenIssuedAt < invalidationInfo.invalidationTime;
    } catch (error) {
      console.error('Error checking user token invalidation:', error);
      // 在错误情况下，为了安全起见，认为令牌可能有问题
      return true;
    }
  }

  /**
   * 清理过期的黑名单条目（可选的维护方法）
   */
  static async cleanupExpiredEntries(): Promise<void> {
    try {
      const { redisPool } = await import('./redis-pool.service');
      const redisClient = redisPool.getClient();

      // Redis会自动清理过期的键，这个方法主要用于手动清理或统计
      const pattern = `${this.BLACKLIST_PREFIX}*`;
      const keys = await redisClient.keys(pattern);

      let cleanedCount = 0;
      for (const key of keys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) {
          // 没有过期时间的键，可能是旧数据
          await redisClient.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired blacklist entries`);
      }
    } catch (error) {
      console.error('Error cleaning up blacklist entries:', error);
    }
  }
} 