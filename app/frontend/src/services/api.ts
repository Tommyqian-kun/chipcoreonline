// API 基础配置和通用请求函数

import axios, { AxiosError, AxiosRequestConfig } from 'axios';

// 扩展AxiosRequestConfig类型以支持自定义错误处理配置
declare module 'axios' {
  interface AxiosRequestConfig {
    skipGlobal401Handler?: boolean;
  }
}

// A simple toast implementation, can be replaced with a more complete toast component later
const toast = {
  error: (message: string) => {
    console.error('API Error:', message);
    // You can integrate an actual toast component here
    alert(message); // Using alert temporarily, a better UI component should be used in production
  }
};

// 确保baseURL构建正确
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const BASE_URL = `${API_BASE}/api/v1`;

// 调试信息（仅在开发环境）
if (import.meta.env.DEV) {
  console.log('🔧 API配置:', {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    API_BASE,
    BASE_URL
  });
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 10000, // 10秒超时
});

// Request interceptor
api.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    // 动态设置Content-Type
    if (config.data instanceof FormData) {
      // 对于FormData，让浏览器自动设置Content-Type（包含boundary）
      delete config.headers?.['Content-Type'];
    } else {
      // 对于其他数据类型，设置为application/json
      config.headers = {
        ...config.headers,
        'Content-Type': 'application/json'
      };
    }

    // 调试URL构建（仅在开发环境）
    if (import.meta.env.DEV && config.url) {
      const fullURL = `${config.baseURL}${config.url}`;
      console.log('🌐 API请求:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullURL,
        timestamp: new Date().toISOString()
      });

      // 检查URL是否异常
      if (fullURL.includes(':1') || fullURL.includes('/8080/api')) {
        console.error('🚨 检测到异常URL:', fullURL);
        console.error('🔍 配置详情:', {
          url: config.url,
          baseURL: config.baseURL,
          method: config.method,
          headers: config.headers,
          params: config.params,
          data: config.data
        });
        console.error('🔍 调用栈:', new Error().stack);
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Unified error handling
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      // Check if global 401 handling needs to be skipped
      if (status === 401 && error.config?.skipGlobal401Handler) {
        return Promise.reject(error); // Reject directly, to be handled by the catch block at the request call site
      }

      switch (status) {
        case 401:
          // Authentication failure, clear local auth state and redirect to login page
          toast.error('登录已过期，请重新登录');
          // The logic to clear auth state will be handled in AuthContext
          if (window.location.pathname !== '/auth/login') {
            window.location.href = '/auth/login';
          }
          break;

        case 403:
          toast.error('权限不足，无法访问该资源');
          break;

        case 404:
          // 在开发环境中显示更详细的错误信息
          if (import.meta.env.DEV) {
            console.error('🚨 API 404 错误:', {
              url: error.config?.url,
              status: status,
              data: data,
              message: data?.message || '请求的资源不存在'
            });
            toast.error(`请求的资源不存在: ${error.config?.url || 'unknown'}`);
          } else {
            toast.error('请求的资源不存在');
          }
          break;
          
        case 422:
          // Form validation error
          const message = data?.message || '数据验证失败';
          toast.error(message);
          break;
          
        case 429:
          toast.error('请求过于频繁，请稍后再试');
          break;
          
        case 500:
        case 502:
        case 503:
        case 504:
          toast.error('服务器错误，请稍后再试');
          break;
          
        default:
          toast.error(data?.message || '请求失败，请稍后再试');
      }
    } else if (error.request) {
      // Network error
      toast.error('网络连接失败，请检查网络设置');
    } else {
      // Other errors
      toast.error('请求发生错误，请稍后再试');
    }
    
    return Promise.reject(error);
  }
);

export default api;