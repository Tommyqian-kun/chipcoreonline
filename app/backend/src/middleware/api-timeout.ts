import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

/**
 * 扩展的Request类型，包含AbortSignal
 */
interface AbortableRequest extends Request {
  signal?: AbortSignal;
}

/**
 * API请求超时配置
 * 根据请求类型设置不同的超时时间
 */
const API_TIMEOUT_CONFIG = {
  // 默认超时：30秒（适用于大多数查询请求）
  DEFAULT: 30000,

  // 工具执行相关请求：5分钟（文件上传、任务提交等）
  TOOL_EXECUTION: 300000,

  // 文件上传相关请求：5分钟
  FILE_UPLOAD: 300000,

  // 文件下载相关请求：5分钟
  FILE_DOWNLOAD: 300000,

  // 认证相关请求：10秒
  AUTH: 10000,

  // 支付相关请求：30秒
  PAYMENT: 30000,

  // 管理员操作：60秒
  ADMIN: 60000,
};

/**
 * 根据请求路径确定超时类型
 */
function getTimeoutType(path: string): keyof typeof API_TIMEOUT_CONFIG {
  // 工具执行相关路径
  if (path.includes('/sdc-thrpages/initialize') ||
      path.includes('/upf-thrpages/initialize') ||
      path.includes('/tasks/submit')) {
    return 'TOOL_EXECUTION';
  }

  // 文件上传路径
  if (path.includes('/initialize')) {
    return 'FILE_UPLOAD';
  }

  // 文件下载路径
  if (path.includes('/download')) {
    return 'FILE_DOWNLOAD';
  }

  // 认证路径
  if (path.startsWith('/api/v1/auth/')) {
    return 'AUTH';
  }

  // 支付路径
  if (path.startsWith('/api/v1/payment/')) {
    return 'PAYMENT';
  }

  // 管理员路径
  if (path.startsWith('/api/v1/admin/')) {
    return 'ADMIN';
  }

  // 默认超时
  return 'DEFAULT';
}

/**
 * API超时中间件（使用AbortController真正中断操作）
 *
 * 功能：
 * 1. 为不同类型的请求设置不同的超时时间
 * 2. 超时后使用AbortController中断所有异步操作
 * 3. 记录超时事件用于监控和调试
 *
 * 技术实现：
 * - 使用AbortController.timeout()创建带超时的signal
 * - 将signal附加到request对象，传递给后续中间件和控制器
 * - 数据库查询、fetch等操作需要支持signal参数才能被中断
 *
 * 使用场景：
 * - 在index.ts中全局应用
 * - 对特定路由组应用不同超时
 */
export const apiTimeoutMiddleware = (
  req: AbortableRequest,
  res: Response,
  next: NextFunction
): void => {
  const path = req.path;
  const timeoutType = getTimeoutType(path);
  const timeoutMs = API_TIMEOUT_CONFIG[timeoutType];

  // 创建AbortController，用于中断所有依赖此signal的异步操作
  const controller = new AbortController();

  // 设置超时自动中断
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      // 中断所有使用此signal的异步操作
      controller.abort();

      logger.warn({
        path,
        method: req.method,
        timeoutType,
        timeoutMs,
        ip: req.ip
      }, 'API request timeout - operation cancelled');

      // 发送504响应
      res.status(504).json({
        success: false,
        error: 'Gateway Timeout',
        message: `请求处理超时（${timeoutMs}ms），操作已取消`,
        timeoutType
      });
    }
  }, timeoutMs);

  // 将signal附加到request，供后续中间件和控制器使用
  req.signal = controller.signal;

  // 清理定时器
  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);

  next();
};

/**
 * 创建特定超时的中间件工厂函数
 *
 * 用于特定路由需要覆盖全局超时配置的场景
 *
 * @example
 * router.post('/long-operation', specificTimeoutMiddleware(600000), handler);
 */
export const specificTimeoutMiddleware = (timeoutMs: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn({
          path: req.path,
          method: req.method,
          timeoutMs,
          ip: req.ip
        }, 'API request timeout (specific)');

        res.status(504).json({
          success: false,
          error: 'Gateway Timeout',
          message: `Request timeout after ${timeoutMs}ms`
        });
      }
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timeoutId));
    res.on('close', () => clearTimeout(timeoutId));

    next();
  };
};

/**
 * 获取超时配置信息（用于调试）
 */
export function getTimeoutConfig(): typeof API_TIMEOUT_CONFIG {
  return { ...API_TIMEOUT_CONFIG };
}

/**
 * 获取特定路径的超时配置
 */
export function getPathTimeout(path: string): number {
  const timeoutType = getTimeoutType(path);
  return API_TIMEOUT_CONFIG[timeoutType];
}
