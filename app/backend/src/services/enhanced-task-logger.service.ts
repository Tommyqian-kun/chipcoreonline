import logger from '../config/logger';

/**
 * 增强任务日志系统
 * 提供详细的任务执行过程记录、性能指标和错误信息
 */
export class EnhancedTaskLogger {
  private taskId: string;
  private userId: string;
  private startTime: number;
  private stepTimes: Map<string, number> = new Map();
  private performanceMetrics: Map<string, any> = new Map();

  constructor(taskId: string, userId: string) {
    this.taskId = taskId;
    this.userId = userId;
    this.startTime = Date.now();
    
    this.logInfo('TASK_INIT', 'Enhanced task logger initialized', {
      taskId,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录信息日志
   */
  logInfo(step: string, message: string, data?: any): void {
    this.recordStepTime(step);
    
    logger.info({
      taskId: this.taskId,
      userId: this.userId,
      step,
      message,
      data,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startTime
    }, `[TASK-${this.taskId}] ${step}: ${message}`);
  }

  /**
   * 记录警告日志
   */
  logWarn(step: string, message: string, data?: any): void {
    this.recordStepTime(step);
    
    logger.warn({
      taskId: this.taskId,
      userId: this.userId,
      step,
      message,
      data,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startTime
    }, `[TASK-${this.taskId}] ${step}: ${message}`);
  }

  /**
   * 记录错误日志
   */
  logError(step: string, message: string, error?: Error | any, data?: any): void {
    this.recordStepTime(step);
    
    const errorInfo = error ? {
      name: error.name || 'Unknown',
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: error.code
    } : null;

    logger.error({
      taskId: this.taskId,
      userId: this.userId,
      step,
      message,
      error: errorInfo,
      data,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startTime
    }, `[TASK-${this.taskId}] ${step}: ${message}`);
  }

  /**
   * 记录步骤开始
   */
  logStepStart(step: string, description: string, data?: any): void {
    this.stepTimes.set(step, Date.now());
    
    this.logInfo(`${step}_START`, `Starting: ${description}`, data);
  }

  /**
   * 记录步骤成功完成
   */
  logStepSuccess(step: string, description: string, data?: any): void {
    const stepStartTime = this.stepTimes.get(step);
    const duration = stepStartTime ? Date.now() - stepStartTime : null;
    
    this.logInfo(`${step}_SUCCESS`, `Completed: ${description}`, {
      ...data,
      durationMs: duration
    });
    
    if (duration) {
      this.recordPerformanceMetric(step, duration);
    }
  }

  /**
   * 记录步骤失败
   */
  logStepFailure(step: string, description: string, error?: Error | any, data?: any): void {
    const stepStartTime = this.stepTimes.get(step);
    const duration = stepStartTime ? Date.now() - stepStartTime : null;
    
    this.logError(`${step}_FAILURE`, `Failed: ${description}`, error, {
      ...data,
      durationMs: duration
    });
  }

  /**
   * 记录性能指标
   */
  recordPerformanceMetric(metric: string, value: number, unit: string = 'ms'): void {
    this.performanceMetrics.set(metric, { value, unit, timestamp: Date.now() });
    
    this.logInfo('PERFORMANCE_METRIC', `Performance metric recorded: ${metric}`, {
      metric,
      value,
      unit
    });
  }

  /**
   * 记录资源使用情况
   */
  logResourceUsage(step: string, resources: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkIO?: number;
  }): void {
    this.logInfo(`${step}_RESOURCES`, 'Resource usage recorded', {
      resources,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录文件操作
   */
  logFileOperation(operation: string, filePath: string, details?: {
    size?: number;
    checksum?: string;
    permissions?: string;
  }): void {
    this.logInfo('FILE_OPERATION', `File operation: ${operation}`, {
      operation,
      filePath,
      details
    });
  }

  /**
   * 记录Docker容器操作
   */
  logContainerOperation(operation: string, containerInfo: {
    containerId?: string;
    containerName?: string;
    image?: string;
    status?: string;
    exitCode?: number;
  }): void {
    this.logInfo('CONTAINER_OPERATION', `Container operation: ${operation}`, {
      operation,
      containerInfo
    });
  }

  /**
   * 记录网络操作
   */
  logNetworkOperation(operation: string, details: {
    url?: string;
    method?: string;
    statusCode?: number;
    responseTime?: number;
    dataSize?: number;
  }): void {
    this.logInfo('NETWORK_OPERATION', `Network operation: ${operation}`, {
      operation,
      details
    });
  }

  /**
   * 记录数据库操作
   */
  logDatabaseOperation(operation: string, details: {
    table?: string;
    query?: string;
    affectedRows?: number;
    executionTime?: number;
  }): void {
    this.logInfo('DATABASE_OPERATION', `Database operation: ${operation}`, {
      operation,
      details
    });
  }

  /**
   * 记录任务完成总结
   */
  logTaskCompletion(status: 'SUCCESS' | 'FAILURE', summary?: any): void {
    const totalDuration = Date.now() - this.startTime;
    const performanceData = Object.fromEntries(this.performanceMetrics);
    
    this.logInfo('TASK_COMPLETION', `Task completed with status: ${status}`, {
      status,
      totalDurationMs: totalDuration,
      performanceMetrics: performanceData,
      summary
    });
  }

  /**
   * 获取任务执行摘要
   */
  getExecutionSummary(): {
    taskId: string;
    userId: string;
    totalDurationMs: number;
    stepCount: number;
    performanceMetrics: Record<string, any>;
  } {
    return {
      taskId: this.taskId,
      userId: this.userId,
      totalDurationMs: Date.now() - this.startTime,
      stepCount: this.stepTimes.size,
      performanceMetrics: Object.fromEntries(this.performanceMetrics)
    };
  }

  /**
   * 记录步骤时间
   */
  private recordStepTime(step: string): void {
    if (!this.stepTimes.has(step)) {
      this.stepTimes.set(step, Date.now());
    }
  }

  /**
   * 创建子日志器（用于并行操作）
   */
  createSubLogger(subTaskName: string): EnhancedTaskLogger {
    const subLogger = new EnhancedTaskLogger(`${this.taskId}-${subTaskName}`, this.userId);
    
    this.logInfo('SUB_LOGGER_CREATED', `Created sub-logger for: ${subTaskName}`, {
      subTaskName,
      subTaskId: `${this.taskId}-${subTaskName}`
    });
    
    return subLogger;
  }

  /**
   * 记录用户操作
   */
  logUserAction(action: string, details?: any): void {
    this.logInfo('USER_ACTION', `User action: ${action}`, {
      action,
      details,
      userId: this.userId
    });
  }

  /**
   * 记录系统事件
   */
  logSystemEvent(event: string, details?: any): void {
    this.logInfo('SYSTEM_EVENT', `System event: ${event}`, {
      event,
      details
    });
  }

  /**
   * 记录安全事件
   */
  logSecurityEvent(event: string, details?: any): void {
    this.logWarn('SECURITY_EVENT', `Security event: ${event}`, {
      event,
      details,
      userId: this.userId,
      taskId: this.taskId
    });
  }

  /**
   * 批量记录日志（用于性能优化）
   */
  logBatch(logs: Array<{
    level: 'info' | 'warn' | 'error';
    step: string;
    message: string;
    data?: any;
  }>): void {
    logs.forEach(log => {
      switch (log.level) {
        case 'info':
          this.logInfo(log.step, log.message, log.data);
          break;
        case 'warn':
          this.logWarn(log.step, log.message, log.data);
          break;
        case 'error':
          this.logError(log.step, log.message, undefined, log.data);
          break;
      }
    });
  }
}
