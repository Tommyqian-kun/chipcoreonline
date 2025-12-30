import { Response } from 'express';

/**
 * 统一的API响应格式接口
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * 发送成功响应
 */
export const sendSuccess = <T>(
  res: Response, 
  data?: T, 
  message?: string,
  statusCode: number = 200
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message
  };
  
  res.status(statusCode).json(response);
};

/**
 * 发送分页成功响应
 */
export const sendSuccessWithPagination = <T>(
  res: Response,
  data: T,
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  },
  message?: string,
  statusCode: number = 200
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    pagination
  };
  
  res.status(statusCode).json(response);
};

/**
 * 发送错误响应
 */
export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: any
): void => {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
  
  res.status(statusCode).json(response);
};

/**
 * 发送验证错误响应
 */
export const sendValidationError = (
  res: Response,
  errors: any[],
  message: string = '输入数据验证失败'
): void => {
  sendError(res, 'VALIDATION_ERROR', message, 400, errors);
};

/**
 * 发送未找到错误响应
 */
export const sendNotFound = (
  res: Response,
  message: string = '请求的资源不存在'
): void => {
  sendError(res, 'NOT_FOUND', message, 404);
};

/**
 * 发送未授权错误响应
 */
export const sendUnauthorized = (
  res: Response,
  message: string = '未授权访问'
): void => {
  sendError(res, 'UNAUTHORIZED', message, 401);
};

/**
 * 发送禁止访问错误响应
 */
export const sendForbidden = (
  res: Response,
  message: string = '权限不足'
): void => {
  sendError(res, 'FORBIDDEN', message, 403);
};

/**
 * 发送服务器错误响应
 */
export const sendServerError = (
  res: Response,
  message: string = '服务器内部错误',
  details?: any
): void => {
  sendError(res, 'INTERNAL_ERROR', message, 500, details);
};
