import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.connect().catch(console.error);

interface RateLimitOptions {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
  message?: string; // 超限时的错误消息
}

export const createRateLimit = (options: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate_limit:${req.ip}:${req.path}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    try {
      // 清理过期的请求记录
      await redis.zRemRangeByScore(key, 0, windowStart);
      
      // 获取当前窗口内的请求数
      const requestCount = await redis.zCard(key);
      
      if (requestCount >= options.maxRequests) {
        return res.status(429).json({
          message: options.message || '请求过于频繁，请稍后再试'
        });
      }
      
      // 记录当前请求
      await redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
      await redis.expire(key, Math.ceil(options.windowMs / 1000));
      
      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      // 如果 Redis 出错，允许请求通过
      next();
    }
  };
};