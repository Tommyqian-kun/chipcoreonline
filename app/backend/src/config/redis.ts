/**
 * @deprecated 请使用 src/services/redis-pool.service.ts 中的 redisPool
 * 此文件仅为向后兼容保留，将在未来版本中移除
 *
 * 迁移指南：
 * 旧代码：import redisClient from '../config/redis';
 * 新代码：import { redisPool } from '../services/redis-pool.service';
 *         const redis = redisPool.getClient();
 */
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = new Redis(process.env.REDIS_URL as string);

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export default redisClient; 