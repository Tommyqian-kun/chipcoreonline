import pino from 'pino';

/**
 * 结构化日志配置
 * 使用pino提供高性能的结构化日志记录
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
    service: 'logiccore-backend',
  },
});

export default logger;

/**
 * 创建子日志器，用于特定模块
 * @param module 模块名称
 * @returns 子日志器实例
 */
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

/**
 * 请求日志中间件
 */
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  req.requestId = requestId;
  req.logger = logger.child({ requestId });
  
  req.logger.info({
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  }, 'Request started');
  
  const originalSend = res.send;
  res.send = function(data: any) {
    const duration = Date.now() - start;
    req.logger.info({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
    }, 'Request completed');
    
    return originalSend.call(this, data);
  };
  
  next();
}; 