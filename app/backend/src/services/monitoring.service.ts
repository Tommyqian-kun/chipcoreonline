import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import logger from '../config/logger';
import { prisma } from '../utils/database';

/**
 * 系统监控服务
 * 提供性能监控、健康检查和告警功能
 */
export class MonitoringService {
  private redis: Redis;
  private metrics: Map<string, any> = new Map();
  private alertThresholds = {
    responseTime: 5000, // 5秒
    errorRate: 0.05, // 5%
    memoryUsage: 0.9, // 90%
    cpuUsage: 0.9, // 90%
    queueLength: 100, // 队列长度
    dbConnections: 15 // 数据库连接数
  };

  constructor(redis: Redis) {
    this.redis = redis;
    this.initializeMetrics();
    this.startPeriodicHealthCheck();
  }

  /**
   * 初始化监控指标
   */
  private initializeMetrics(): void {
    this.metrics.set('requests_total', 0);
    this.metrics.set('requests_errors', 0);
    this.metrics.set('response_times', []);
    this.metrics.set('active_connections', 0);
    this.metrics.set('last_health_check', new Date());
  }

  /**
   * HTTP请求监控中间件
   */
  public requestMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);

    // 增加请求计数
    this.incrementMetric('requests_total');
    this.incrementMetric('active_connections');

    // 记录请求信息
    logger.info({
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id
    }, 'Request started');

    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.decrementMetric('active_connections');

      // 记录响应时间
      this.recordResponseTime(duration);

      // 记录错误
      if (res.statusCode >= 400) {
        this.incrementMetric('requests_errors');
      }

      // 记录慢请求
      if (duration > this.alertThresholds.responseTime) {
        logger.warn({
          requestId,
          method: req.method,
          url: req.url,
          duration,
          statusCode: res.statusCode,
          userId: req.user?.id
        }, 'Slow request detected');

        this.triggerAlert('slow_request', {
          method: req.method,
          url: req.url,
          duration,
          threshold: this.alertThresholds.responseTime
        });
      }

      // 记录请求完成
      logger.info({
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userId: req.user?.id
      }, 'Request completed');
    });

    next();
  };

  /**
   * 记录响应时间
   */
  private recordResponseTime(duration: number): void {
    const responseTimes = this.metrics.get('response_times') || [];
    responseTimes.push(duration);

    // 只保留最近1000个响应时间
    if (responseTimes.length > 1000) {
      responseTimes.shift();
    }

    this.metrics.set('response_times', responseTimes);
  }

  /**
   * 增加指标计数
   */
  private incrementMetric(key: string): void {
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);
  }

  /**
   * 减少指标计数
   */
  private decrementMetric(key: string): void {
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, Math.max(0, current - 1));
  }

  /**
   * 获取系统健康状态
   */
  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, any>;
    metrics: Record<string, any>;
    timestamp: string;
  }> {
    const checks: Record<string, any> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    try {
      // 数据库健康检查
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbDuration = Date.now() - dbStart;
      
      checks.database = {
        status: dbDuration < 1000 ? 'healthy' : 'degraded',
        responseTime: dbDuration,
        timestamp: new Date().toISOString()
      };

      if (dbDuration >= 1000) overallStatus = 'degraded';
      if (dbDuration >= 5000) overallStatus = 'unhealthy';

    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
      overallStatus = 'unhealthy';
    }

    try {
      // Redis健康检查
      const redisStart = Date.now();
      await this.redis.ping();
      const redisDuration = Date.now() - redisStart;

      checks.redis = {
        status: redisDuration < 500 ? 'healthy' : 'degraded',
        responseTime: redisDuration,
        timestamp: new Date().toISOString()
      };

      if (redisDuration >= 500 && overallStatus === 'healthy') overallStatus = 'degraded';
      if (redisDuration >= 2000) overallStatus = 'unhealthy';

    } catch (error) {
      checks.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
      overallStatus = 'unhealthy';
    }

    // 系统资源检查
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

    checks.memory = {
      status: memoryUsagePercent < 0.8 ? 'healthy' : memoryUsagePercent < 0.9 ? 'degraded' : 'unhealthy',
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      usagePercent: Math.round(memoryUsagePercent * 100),
      timestamp: new Date().toISOString()
    };

    if (memoryUsagePercent >= 0.8 && overallStatus === 'healthy') overallStatus = 'degraded';
    if (memoryUsagePercent >= 0.9) overallStatus = 'unhealthy';

    // 队列长度检查
    try {
      const queueLength = await this.redis.llen('task_queue');
      checks.taskQueue = {
        status: queueLength < 50 ? 'healthy' : queueLength < 100 ? 'degraded' : 'unhealthy',
        length: queueLength,
        timestamp: new Date().toISOString()
      };

      if (queueLength >= 50 && overallStatus === 'healthy') overallStatus = 'degraded';
      if (queueLength >= 100) overallStatus = 'unhealthy';

    } catch (error) {
      checks.taskQueue = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
      overallStatus = 'unhealthy';
    }

    // 计算错误率
    const totalRequests = this.metrics.get('requests_total') || 0;
    const totalErrors = this.metrics.get('requests_errors') || 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    checks.errorRate = {
      status: errorRate < 0.01 ? 'healthy' : errorRate < 0.05 ? 'degraded' : 'unhealthy',
      rate: Math.round(errorRate * 100 * 100) / 100, // 保留2位小数
      totalRequests,
      totalErrors,
      timestamp: new Date().toISOString()
    };

    if (errorRate >= 0.01 && overallStatus === 'healthy') overallStatus = 'degraded';
    if (errorRate >= 0.05) overallStatus = 'unhealthy';

    // 计算平均响应时间
    const responseTimes = this.metrics.get('response_times') || [];
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length 
      : 0;

    const metrics = {
      totalRequests,
      totalErrors,
      errorRate: Math.round(errorRate * 100 * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      activeConnections: this.metrics.get('active_connections') || 0,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      uptime: process.uptime()
    };

    return {
      status: overallStatus,
      checks,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 触发告警
   */
  private async triggerAlert(type: string, data: any): Promise<void> {
    const alert = {
      type,
      data,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type)
    };

    // 记录告警日志
    logger.warn(alert, `Alert triggered: ${type}`);

    // 存储告警到Redis（可以被外部系统消费）
    try {
      await this.redis.lpush('system_alerts', JSON.stringify(alert));
      await this.redis.ltrim('system_alerts', 0, 999); // 只保留最近1000个告警
    } catch (error) {
      logger.error({ error }, 'Failed to store alert');
    }

    // 这里可以集成外部告警系统，如邮件、短信、Slack等
    // await this.sendExternalAlert(alert);
  }

  /**
   * 获取告警严重程度
   */
  private getAlertSeverity(type: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      slow_request: 'medium',
      high_error_rate: 'high',
      database_error: 'critical',
      redis_error: 'high',
      memory_high: 'high',
      queue_full: 'medium'
    };

    return severityMap[type] || 'low';
  }

  /**
   * 定期健康检查
   */
  private startPeriodicHealthCheck(): void {
    setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        this.metrics.set('last_health_check', new Date());

        // 如果系统不健康，触发告警
        if (health.status === 'unhealthy') {
          await this.triggerAlert('system_unhealthy', {
            status: health.status,
            failedChecks: Object.entries(health.checks)
              .filter(([_, check]) => check.status === 'unhealthy')
              .map(([name, _]) => name)
          });
        }

        logger.info({
          status: health.status,
          metrics: health.metrics
        }, 'Periodic health check completed');

      } catch (error) {
        logger.error({ error }, 'Health check failed');
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 获取系统指标
   */
  public getMetrics(): Record<string, any> {
    const responseTimes = this.metrics.get('response_times') || [];
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length 
      : 0;

    return {
      requests_total: this.metrics.get('requests_total') || 0,
      requests_errors: this.metrics.get('requests_errors') || 0,
      active_connections: this.metrics.get('active_connections') || 0,
      avg_response_time: Math.round(avgResponseTime),
      last_health_check: this.metrics.get('last_health_check'),
      uptime: process.uptime(),
      memory_usage: process.memoryUsage()
    };
  }
}

// 单例实例
let monitoringService: MonitoringService | null = null;

export const initializeMonitoring = (redis: Redis): MonitoringService => {
  if (!monitoringService) {
    monitoringService = new MonitoringService(redis);
    logger.info('Monitoring service initialized');
  }
  return monitoringService;
};

export const getMonitoringService = (): MonitoringService | null => {
  return monitoringService;
};
