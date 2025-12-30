// 环境配置管理
export const ENV_CONFIG = {
  // API配置
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  
  // 应用配置
  APP_NAME: import.meta.env.VITE_APP_NAME || 'ChipCore',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  
  // 开发配置
  IS_DEVELOPMENT: import.meta.env.DEV,
  IS_PRODUCTION: import.meta.env.PROD,
  
  // 调试配置
  ENABLE_DEBUG: import.meta.env.VITE_ENABLE_DEBUG === 'true' || import.meta.env.DEV,
} as const;

// 调试函数
export const debugLog = (...args: any[]) => {
  if (ENV_CONFIG.ENABLE_DEBUG) {
    console.log('[ChipCore Debug]', ...args);
  }
};

// 环境检查函数
export const checkEnvironment = () => {
  debugLog('Environment Configuration:', {
    API_BASE_URL: ENV_CONFIG.API_BASE_URL,
    APP_NAME: ENV_CONFIG.APP_NAME,
    IS_DEVELOPMENT: ENV_CONFIG.IS_DEVELOPMENT,
    IS_PRODUCTION: ENV_CONFIG.IS_PRODUCTION,
  });
}; 