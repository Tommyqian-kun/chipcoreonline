import logger from '../config/logger';

/**
 * 任务队列管理服务
 * 实现高并发场景下的任务队列控制和资源管理
 */
export class TaskQueueService {
  private redisPool: any;

  // 系统资源配置 - 可通过环境变量配置
  private readonly MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS || '16'); // ECS最大并发处理能力
  private readonly MAX_QUEUE_LENGTH = parseInt(process.env.MAX_QUEUE_LENGTH || '48'); // 队列最大长度（并发能力的3倍）
  private readonly TASK_QUEUE_KEY = 'task_queue';
  private readonly USER_TASKS_PREFIX = 'user_tasks:';
  private readonly QUEUE_STATS_KEY = 'queue_stats';

  constructor() {
    // 使用Redis连接池
    this.initializeRedisPool();
  }

  private async initializeRedisPool() {
    const { redisPool } = await import('./redis-pool.service');
    this.redisPool = redisPool;
  }

  private async getRedisClient() {
    if (!this.redisPool) {
      await this.initializeRedisPool();
    }
    return this.redisPool.getClient();
  }

  /**
   * 检查队列状态和用户任务限制
   * @param userId 用户ID
   * @returns 队列状态检查结果
   */
  async checkQueueStatus(userId: string): Promise<{
    canSubmit: boolean;
    message?: string;
    queuePosition?: number;
    estimatedWait?: string;
    code?: string;
  }> {
    try {
      const redis = await this.getRedisClient();

      // 1. 检查全局队列长度
      const queueLength = await redis.llen(this.TASK_QUEUE_KEY);
      
      if (queueLength >= this.MAX_QUEUE_LENGTH) {
        const estimatedWaitMinutes = Math.ceil((queueLength - this.MAX_CONCURRENT_TASKS) / this.MAX_CONCURRENT_TASKS * 3);
        
        logger.warn({
          queueLength,
          maxQueueLength: this.MAX_QUEUE_LENGTH,
          userId
        }, 'Queue length exceeded, rejecting task submission');

        return {
          canSubmit: false,
          message: '当前在线用户使用过多，请等待5分钟后重试',
          queuePosition: queueLength,
          estimatedWait: `约${estimatedWaitMinutes}分钟`,
          code: 'QUEUE_FULL'
        };
      }

      // 2. 检查用户当前任务数（这里只是队列检查，具体用户限制在subscription中间件处理）
      const userTasksKey = `${this.USER_TASKS_PREFIX}${userId}`;
      const userTaskCount = await redis.llen(userTasksKey);

      // 3. 计算预估等待时间
      const estimatedWaitMinutes = Math.max(0, Math.ceil(queueLength / this.MAX_CONCURRENT_TASKS * 3));

      logger.info({
        queueLength,
        userTaskCount,
        userId,
        estimatedWaitMinutes
      }, 'Queue status check passed');

      return {
        canSubmit: true,
        queuePosition: queueLength + 1,
        estimatedWait: estimatedWaitMinutes > 0 ? `约${estimatedWaitMinutes}分钟` : '立即开始'
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Error checking queue status');

      return {
        canSubmit: false,
        message: '系统繁忙，请稍后重试',
        code: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * 将任务添加到队列
   * @param taskData 任务数据
   * @returns 添加结果
   */
  async addTaskToQueue(taskData: {
    taskId: string;
    userId: string;
    toolId: string;
    parameters: any;
    inputFiles?: any[];
  }): Promise<{
    success: boolean;
    queuePosition?: number;
    estimatedWait?: string;
    message?: string;
  }> {
    try {
      // 1. 再次检查队列状态（防止并发情况下的竞态条件）
      const queueStatus = await this.checkQueueStatus(taskData.userId);
      if (!queueStatus.canSubmit) {
        return {
          success: false,
          message: queueStatus.message
        };
      }

      // 2. 准备任务负载
      const taskPayload = {
        taskId: taskData.taskId,
        userId: taskData.userId,
        toolId: taskData.toolId,
        parameters: taskData.parameters,
        inputFiles: taskData.inputFiles || [],
        createdAt: new Date().toISOString(),
        queuedAt: new Date().toISOString()
      };

      // 3. 使用Redis事务确保原子性操作
      const redis = await this.getRedisClient();
      const multi = redis.multi();

      // 添加到全局任务队列
      multi.lpush(this.TASK_QUEUE_KEY, JSON.stringify(taskPayload));

      // 添加到用户任务列表
      const userTasksKey = `${this.USER_TASKS_PREFIX}${taskData.userId}`;
      multi.lpush(userTasksKey, taskData.taskId);

      // 设置用户任务过期时间（24小时）
      multi.expire(userTasksKey, 24 * 60 * 60);

      // 更新队列统计信息
      multi.hincrby(this.QUEUE_STATS_KEY, 'total_submitted', 1);
      multi.hincrby(this.QUEUE_STATS_KEY, `user_${taskData.userId}_submitted`, 1);

      await multi.exec();

      const currentQueueLength = await redis.llen(this.TASK_QUEUE_KEY);
      const estimatedWaitMinutes = Math.max(0, Math.ceil((currentQueueLength - 1) / this.MAX_CONCURRENT_TASKS * 3));

      logger.info({
        taskId: taskData.taskId,
        userId: taskData.userId,
        toolId: taskData.toolId,
        queuePosition: currentQueueLength,
        estimatedWaitMinutes
      }, 'Task added to queue successfully');

      return {
        success: true,
        queuePosition: currentQueueLength,
        estimatedWait: estimatedWaitMinutes > 0 ? `约${estimatedWaitMinutes}分钟` : '立即开始'
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskData
      }, 'Error adding task to queue');

      return {
        success: false,
        message: '任务提交失败，请稍后重试'
      };
    }
  }

  /**
   * 从队列中移除用户任务（任务完成或失败时调用）
   * @param userId 用户ID
   * @param taskId 任务ID
   */
  async removeUserTask(userId: string, taskId: string): Promise<void> {
    try {
      const redis = await this.getRedisClient();
      const userTasksKey = `${this.USER_TASKS_PREFIX}${userId}`;
      await redis.lrem(userTasksKey, 0, taskId);

      // 更新统计信息
      await redis.hincrby(this.QUEUE_STATS_KEY, 'total_completed', 1);
      
      logger.info({
        userId,
        taskId
      }, 'User task removed from queue');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        taskId
      }, 'Error removing user task from queue');
    }
  }

  /**
   * 获取队列统计信息
   * @returns 队列统计数据
   */
  async getQueueStats(): Promise<{
    queueLength: number;
    maxQueueLength: number;
    maxConcurrentTasks: number;
    utilizationRate: number;
    estimatedWait: string;
  }> {
    try {
      const redis = await this.getRedisClient();
      const queueLength = await redis.llen(this.TASK_QUEUE_KEY);
      const utilizationRate = Math.min(100, (queueLength / this.MAX_CONCURRENT_TASKS) * 100);
      const estimatedWaitMinutes = Math.max(0, Math.ceil(queueLength / this.MAX_CONCURRENT_TASKS * 3));

      return {
        queueLength,
        maxQueueLength: this.MAX_QUEUE_LENGTH,
        maxConcurrentTasks: this.MAX_CONCURRENT_TASKS,
        utilizationRate: Math.round(utilizationRate),
        estimatedWait: estimatedWaitMinutes > 0 ? `约${estimatedWaitMinutes}分钟` : '立即开始'
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error getting queue stats');

      return {
        queueLength: 0,
        maxQueueLength: this.MAX_QUEUE_LENGTH,
        maxConcurrentTasks: this.MAX_CONCURRENT_TASKS,
        utilizationRate: 0,
        estimatedWait: '未知'
      };
    }
  }

  /**
   * 清理过期的用户任务记录
   */
  async cleanupExpiredUserTasks(): Promise<void> {
    try {
      const redis = await this.getRedisClient();

      // 这个方法可以通过定时任务调用，清理过期的用户任务记录
      const pattern = `${this.USER_TASKS_PREFIX}*`;
      const keys = await redis.keys(pattern);

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // 没有设置过期时间的key，设置24小时过期
          await redis.expire(key, 24 * 60 * 60);
        }
      }

      logger.info({
        keysProcessed: keys.length
      }, 'User task cleanup completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error during user task cleanup');
    }
  }
}
