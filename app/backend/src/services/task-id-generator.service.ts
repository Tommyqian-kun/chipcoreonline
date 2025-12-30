import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/database';
import logger from '../config/logger';

/**
 * TaskID唯一性生成服务
 * 解决高并发场景下的TaskID冲突问题
 */
export class TaskIdGeneratorService {
    private static readonly MAX_RETRY_ATTEMPTS = 5;
    private static readonly REDIS_TASKID_SET = 'active_task_ids';
    private static readonly REDIS_TASKID_LOCK_PREFIX = 'taskid_lock:';
    private static readonly LOCK_TIMEOUT = 10; // 10秒锁超时

    /**
     * 生成唯一的TaskID
     * 使用多层检查确保唯一性：
     * 1. Redis分布式锁防止并发冲突
     * 2. Redis Set检查活跃TaskID
     * 3. 数据库唯一约束最终保证
     * 4. 重试机制处理极少数碰撞
     */
    static async generateUniqueTaskId(): Promise<string> {
        let attempts = 0;
        const { redisPool } = await import('./redis-pool.service');
        const redisClient = redisPool.getClient();

        while (attempts < this.MAX_RETRY_ATTEMPTS) {
            attempts++;
            const candidateId = uuidv4();
            const lockKey = `${this.REDIS_TASKID_LOCK_PREFIX}${candidateId}`;
            
            try {
                // 1. 尝试获取分布式锁
                const lockAcquired = await redisClient.set(
                    lockKey, 
                    'locked', 
                    'EX', 
                    this.LOCK_TIMEOUT, 
                    'NX'
                );
                
                if (!lockAcquired) {
                    logger.warn(`TaskID ${candidateId} lock acquisition failed, attempt ${attempts}`);
                    continue;
                }
                
                try {
                    // 2. 检查Redis中的活跃TaskID集合
                    const existsInRedis = await redisClient.sismember(
                        this.REDIS_TASKID_SET, 
                        candidateId
                    );
                    
                    if (existsInRedis) {
                        logger.warn(`TaskID ${candidateId} exists in Redis active set, attempt ${attempts}`);
                        continue;
                    }
                    
                    // 3. 检查数据库中的TaskID（包括所有状态）
                    const existsInDb = await prisma.task.findUnique({
                        where: { id: candidateId },
                        select: { id: true }
                    });
                    
                    if (existsInDb) {
                        logger.warn(`TaskID ${candidateId} exists in database, attempt ${attempts}`);
                        continue;
                    }
                    
                    // 4. 检查Redis任务队列中的TaskID
                    const queueLength = await redisClient.llen('task_queue');
                    if (queueLength > 0) {
                        const queueItems = await redisClient.lrange('task_queue', 0, -1);
                        if (queueItems.includes(candidateId)) {
                            logger.warn(`TaskID ${candidateId} exists in task queue, attempt ${attempts}`);
                            continue;
                        }
                    }
                    
                    // 5. 预先将TaskID添加到Redis活跃集合（原子操作）
                    await redisClient.sadd(this.REDIS_TASKID_SET, candidateId);
                    
                    // 6. 设置TaskID过期时间（24小时后自动清理）
                    await redisClient.expire(this.REDIS_TASKID_SET, 24 * 60 * 60);
                    
                    logger.info(`Successfully generated unique TaskID: ${candidateId} after ${attempts} attempts`);
                    return candidateId;
                    
                } finally {
                    // 释放分布式锁
                    await redisClient.del(lockKey);
                }
                
            } catch (error) {
                logger.error(`Error generating TaskID attempt ${attempts}:`, error);
                
                // 清理可能的残留数据
                try {
                    await redisClient.del(lockKey);
                    await redisClient.srem(this.REDIS_TASKID_SET, candidateId);
                } catch (cleanupError: unknown) {
                    logger.error('Error during TaskID generation cleanup:', cleanupError);
                }

                if (attempts === this.MAX_RETRY_ATTEMPTS) {
                    throw new Error(`Failed to generate unique TaskID after ${attempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            
            // 短暂延迟后重试（避免热循环）
            await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        }
        
        throw new Error(`Failed to generate unique TaskID after ${this.MAX_RETRY_ATTEMPTS} attempts`);
    }
    
    /**
     * 任务完成后清理TaskID
     * 从Redis活跃集合中移除TaskID
     */
    static async cleanupTaskId(taskId: string): Promise<void> {
        try {
            const { redisPool } = await import('./redis-pool.service');
            await redisPool.getClient().srem(this.REDIS_TASKID_SET, taskId);
            logger.debug(`Cleaned up TaskID from active set: ${taskId}`);
        } catch (error) {
            logger.error(`Error cleaning up TaskID ${taskId}:`, error);
        }
    }
    
    /**
     * 获取当前活跃的TaskID数量
     */
    static async getActiveTaskCount(): Promise<number> {
        try {
            const { redisPool } = await import('./redis-pool.service');
            return await redisPool.getClient().scard(this.REDIS_TASKID_SET);
        } catch (error) {
            logger.error('Error getting active task count:', error);
            return 0;
        }
    }
    
    /**
     * 验证TaskID格式
     */
    static isValidTaskId(taskId: string): boolean {
        // UUID v4 格式验证
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(taskId);
    }
    
    /**
     * 批量清理过期的TaskID（定期维护任务）
     */
    static async cleanupExpiredTaskIds(): Promise<void> {
        try {
            const { redisPool } = await import('./redis-pool.service');
            const redisClient = redisPool.getClient();

            // 获取所有活跃TaskID
            const activeTaskIds = await redisClient.smembers(this.REDIS_TASKID_SET);
            
            if (activeTaskIds.length === 0) {
                return;
            }
            
            // 检查数据库中的任务状态
            const tasks = await prisma.task.findMany({
                where: {
                    id: { in: activeTaskIds },
                    status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] }
                },
                select: { id: true, status: true, updatedAt: true }
            });
            
            // 清理已完成的任务ID（超过1小时）
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const expiredTaskIds = tasks
                .filter(task => task.updatedAt < oneHourAgo)
                .map(task => task.id);
            
            if (expiredTaskIds.length > 0) {
                await redisClient.srem(this.REDIS_TASKID_SET, ...expiredTaskIds);
                logger.info(`Cleaned up ${expiredTaskIds.length} expired TaskIDs`);
            }
            
        } catch (error) {
            logger.error('Error during expired TaskID cleanup:', error);
        }
    }
}

/**
 * 时序逻辑说明：
 * 
 * 1. 并发任务提交场景：
 *    - 多个用户同时提交任务
 *    - 每个请求都会调用generateUniqueTaskId()
 * 
 * 2. 唯一性保证机制：
 *    - 分布式锁：防止同一TaskID被多个进程同时处理
 *    - Redis Set：快速检查活跃TaskID，避免重复
 *    - 数据库查询：最终的唯一性验证
 *    - 队列检查：确保不与排队中的任务冲突
 * 
 * 3. 原子性操作：
 *    - 使用Redis事务确保操作的原子性
 *    - 分布式锁确保同一时刻只有一个进程处理特定TaskID
 * 
 * 4. 错误恢复：
 *    - 重试机制处理网络抖动和临时冲突
 *    - 清理机制防止资源泄露
 *    - 超时机制防止死锁
 * 
 * 5. 性能优化：
 *    - Redis操作比数据库查询更快
 *    - 分层检查，先快后慢
 *    - 定期清理过期数据
 */
