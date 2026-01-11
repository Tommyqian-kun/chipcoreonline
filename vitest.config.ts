import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vitest 配置文件
 * 用于单元测试和集成测试
 */
export default defineConfig({
  plugins: [react()],

  test: {
    // 测试环境
    environment: 'jsdom',

    // 全局配置
    globals: true,

    // 测试超时时间（毫秒）
    testTimeout: 30000,
    hookTimeout: 30000,

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/types/',
        '**/dist/',
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },

    // 测试文件匹配模式
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'app/backend/src/**/*.test.ts',
    ],

    // 排除文件
    exclude: [
      'node_modules/',
      'dist/',
      'tests/e2e/',
    ],

    // 监听模式配置
    watch: true,

    // 显示详细信息
    reporters: ['verbose'],
  },

  // 解析配置
  resolve: {
    alias: {
      // 前端路径别名
      '@': path.resolve(__dirname, './app/frontend/src'),
      '@tests': path.resolve(__dirname, './tests'),
      // 后端路径别名
      '@backend': path.resolve(__dirname, './app/backend/src'),
      // 后端工具路径别名（用于单元测试）
      '@/utils': path.resolve(__dirname, './app/backend/src/utils'),
      '@/services': path.resolve(__dirname, './app/backend/src/services'),
    },
  },
});
