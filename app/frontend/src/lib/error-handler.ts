import { AxiosError } from 'axios';

// 简单的toast实现，可以后续替换为更完善的toast组件
const toast = {
  error: (message: string) => {
    console.error('Toast Error:', message);
    // 可以在这里集成实际的toast组件
    alert(message); // 临时使用alert，生产环境应该使用更好的UI组件
  },
  success: (message: string) => {
    console.log('Toast Success:', message);
    // 可以在这里集成实际的toast组件
  },
  info: (message: string) => {
    console.info('Toast Info:', message);
    // 可以在这里集成实际的toast组件
  },
  warning: (message: string) => {
    console.warn('Toast Warning:', message);
    // 可以在这里集成实际的toast组件
  }
};

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
  details?: any;
}

export class ErrorHandler {
  /**
   * 处理API错误
   * @param error - Axios错误对象
   * @param customMessage - 自定义错误消息
   */
  static handleApiError(error: AxiosError, customMessage?: string): void {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as ApiError;
      
      // 如果有自定义消息，优先使用
      if (customMessage) {
        toast.error(customMessage);
        return;
      }
      
      // 根据状态码处理
      switch (status) {
        case 400:
          toast.error(data?.message || '请求参数错误');
          break;
        case 401:
          toast.error('登录已过期，请重新登录');
          break;
        case 403:
          toast.error('权限不足');
          break;
        case 404:
          toast.error('资源不存在');
          break;
        case 422:
          toast.error(data?.message || '数据验证失败');
          break;
        case 429:
          toast.error('请求过于频繁，请稍后再试');
          break;
        case 500:
          toast.error('服务器内部错误');
          break;
        default:
          toast.error(data?.message || '请求失败');
      }
    } else if (error.request) {
      toast.error(customMessage || '网络连接失败');
    } else {
      toast.error(customMessage || '请求发生错误');
    }
  }

  /**
   * 处理表单验证错误
   * @param error - Axios错误对象
   * @returns 表单字段错误映射
   */
  static handleFormErrors(error: AxiosError): Record<string, string> {
    const errors: Record<string, string> = {};
    
    if (error.response?.status === 422) {
      const data = error.response.data as any;
      
      // 处理Zod验证错误格式
      if (data.issues && Array.isArray(data.issues)) {
        data.issues.forEach((issue: any) => {
          if (issue.path && issue.path.length > 0) {
            errors[issue.path[0]] = issue.message;
          }
        });
      }
      
      // 处理其他格式的验证错误
      if (data.errors && typeof data.errors === 'object') {
        Object.assign(errors, data.errors);
      }
    }
    
    return errors;
  }

  /**
   * 显示成功消息
   * @param message - 成功消息
   */
  static showSuccess(message: string): void {
    toast.success(message);
  }

  /**
   * 显示信息消息
   * @param message - 信息消息
   */
  static showInfo(message: string): void {
    toast.info(message);
  }

  /**
   * 显示警告消息
   * @param message - 警告消息
   */
  static showWarning(message: string): void {
    toast.warning(message);
  }
} 