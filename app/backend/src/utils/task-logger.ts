/**
 * 任务级别的日志工具 - 重构版
 * 使用类实例变量替代全局变量，支持高并发场景
 * 添加作用域内console拦截功能
 */

import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { AsyncLocalStorage } from 'async_hooks';

// 异步本地存储，用于在异步调用链中存储当前logger
const asyncLocalStorage = new AsyncLocalStorage<TaskLogger>();

/**
 * TaskLogger 类 - 每个任务创建独立实例
 */
export class TaskLogger {
  private logFilePath: string;
  private taskId: string;
  private toolType: string;
  private initialized: boolean = false;
  // 保存原始console方法
  private originalConsole: { log: any; error: any; warn: any; info: any } | null = null;

  constructor(taskId: string, toolType: string = 'UPF') {
    this.taskId = taskId;
    this.toolType = toolType;

    // 计算项目根目录：需要往上两级 (backend -> app -> LogicCore)
    const projectRoot = path.join(process.cwd(), '..', '..');
    const logsDir = path.join(projectRoot, 'logs', taskId);
    this.logFilePath = path.join(logsDir, 'initial.log');

    // 确保日志目录存在 - 设置权限为777以确保容器内用户可写入
    try {
      fs.mkdirSync(logsDir, { recursive: true, mode: 0o777 });
      // 如果目录已存在，也需要设置权限
      try {
        fs.chmodSync(logsDir, 0o777);
      } catch (error) {
        console.error('⚠️ 无法设置日志目录权限:', error);
      }
    } catch (error) {
      console.error('❌ 创建日志目录失败:', error);
    }
  }

  /**
   * 初始化日志文件
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log(`📁 [TASK-LOGGER-${this.taskId}] 初始化任务日志`);
      console.log(`📄 [TASK-LOGGER-${this.taskId}] 日志文件路径: ${this.logFilePath}`);

      // 使用同步方式创建和写入初始日志，避免异步竞争条件
      fs.writeFileSync(this.logFilePath, '');
      console.log(`✅ [TASK-LOGGER-${this.taskId}] 日志文件创建成功`);

      // 写入初始日志内容
      const toolName = this.toolType.toUpperCase();
      const initialLogs = [
        `=== ${toolName}工具初始化日志 ===`,
        `任务ID: ${this.taskId}`,
        `开始时间: ${new Date().toISOString()}`,
        `==========================================\n`
      ];

      for (const log of initialLogs) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}\n`;
        fs.appendFileSync(this.logFilePath, logEntry);
        console.log(`[${this.taskId}] ${log}`);
      }

      this.initialized = true;
    } catch (error) {
      console.error(`❌ [TASK-LOGGER-${this.taskId}] 初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 写入日志到任务文件和控制台
   */
  log(message: string): void {
    // 输出到控制台（添加任务ID前缀）
    console.log(`[${this.taskId}] ${message}`);

    // 写入到文件
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      console.error(`❌ [TASK-LOGGER-${this.taskId}] 写入日志失败:`, error);
    }
  }

  /**
   * 写入错误日志到任务文件和控制台
   */
  logError(message: string, error?: any): void {
    const errorMessage = error ? `${message}: ${error.message || error}` : message;

    // 输出到控制台（添加任务ID前缀）
    console.error(`[${this.taskId}] ${errorMessage}`);

    // 写入到文件
    try {
      const timestamp = new Date().toISOString();
      let logEntry = `[${timestamp}] ERROR: ${errorMessage}\n`;
      if (error && error.stack) {
        logEntry += `[${timestamp}] STACK: ${error.stack}\n`;
      }
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (writeError) {
      console.error(`❌ [TASK-LOGGER-${this.taskId}] 写入错误日志失败:`, writeError);
    }
  }

  /**
   * 获取任务ID
   */
  getTaskId(): string {
    return this.taskId;
  }

  /**
   * 获取日志文件路径
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 清理日志状态（任务完成时调用）
   */
  cleanup(): void {
    if (this.initialized) {
      this.log('=== 初始化日志结束 ===');
      this.initialized = false;
    }
  }

  /**
   * 拦截console输出，将所有console输出重定向到日志文件
   * 使用AsyncLocalStorage确保并行安全
   */
  private interceptConsole(): void {
    // 保存原始console方法
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console)
    };

    const logger = this;

    // 替换console方法，将输出写入日志文件
    console.log = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');

      // 输出到控制台（带任务标识）
      this.originalConsole!.log(`[${logger.taskId}:INIT]`, ...args);

      // 写入日志文件（带CONSOLE前缀）
      logger.writeToFile(`[CONSOLE] ${message}`);
    };

    console.error = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');

      // 输出到控制台（带任务标识）
      this.originalConsole!.error(`[${logger.taskId}:INIT]`, ...args);

      // 写入日志文件
      logger.writeToFile(`[CONSOLE] ${message}`);
    };

    console.warn = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');

      // 输出到控制台（带任务标识）
      this.originalConsole!.warn(`[${logger.taskId}:INIT]`, ...args);

      // 写入日志文件
      logger.writeToFile(`[CONSOLE] ${message}`);
    };

    console.info = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');

      // 输出到控制台（带任务标识）
      this.originalConsole!.info(`[${logger.taskId}:INIT]`, ...args);

      // 写入日志文件
      logger.writeToFile(`[CONSOLE] ${message}`);
    };
  }

  /**
   * 恢复原始console方法
   */
  private restoreConsole(): void {
    if (this.originalConsole) {
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      console.info = this.originalConsole.info;
      this.originalConsole = null;
    }
  }

  /**
   * 写入内容到日志文件（内部方法）
   */
  private writeToFile(message: string): void {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      // 如果日志写入失败，至少输出到控制台
      console.error('❌ 写入任务日志失败:', error);
    }
  }

  /**
   * 在指定作用域内拦截console输出
   * 使用AsyncLocalStorage确保异步调用链中的拦截器一致性
   *
   * @param callback 要执行的回调函数
   * @returns 回调函数的返回值
   */
  async runWithInterceptedConsole<T>(callback: () => Promise<T>): Promise<T> {
    // 设置当前logger到AsyncLocalStorage
    return asyncLocalStorage.run(this, async () => {
      // 拦截console
      this.interceptConsole();

      try {
        // 执行回调
        return await callback();
      } finally {
        // 恢复console（即使发生异常也要恢复）
        this.restoreConsole();
      }
    });
  }

  /**
   * 同步版本的runWithInterceptedConsole
   */
  runWithInterceptedConsoleSync<T>(callback: () => T): T {
    // 设置当前logger到AsyncLocalStorage
    return asyncLocalStorage.run(this, () => {
      // 拦截console
      this.interceptConsole();

      try {
        // 执行回调
        return callback();
      } finally {
        // 恢复console（即使发生异常也要恢复）
        this.restoreConsole();
      }
    });
  }

  /**
   * 获取当前异步上下文中的TaskLogger
   */
  static getCurrentLogger(): TaskLogger | undefined {
    return asyncLocalStorage.getStore();
  }
}

/**
 * 全局日志器实例映射（用于兼容旧代码）
 * ⚠️ 不推荐使用，推荐直接创建 TaskLogger 实例
 */
const activeLoggers: Map<string, TaskLogger> = new Map();

/**
 * 初始化任务日志文件（兼容旧代码的函数）
 * @deprecated 推荐直接使用 new TaskLogger(taskId, toolType)
 */
export async function initializeTaskLogger(taskId: string, toolType: string = 'UPF'): Promise<TaskLogger> {
  const logger = new TaskLogger(taskId, toolType);
  await logger.initialize();

  // 存储到全局映射中（用于兼容）
  activeLoggers.set(taskId, logger);

  return logger;
}

/**
 * 写入日志到任务文件（兼容旧代码的函数）
 * @deprecated 推荐使用 TaskLogger 实例的 log() 方法
 */
export function logToTaskFile(taskId: string, message: string): void {
  const logger = activeLoggers.get(taskId);
  if (logger) {
    logger.log(message);
  } else {
    // 如果找不到logger，输出到控制台并添加警告
    console.warn(`⚠️ [TASK-LOGGER] 未找到任务 ${taskId} 的日志器，消息输出到控制台: ${message}`);
  }
}

/**
 * 写入错误日志到任务文件（兼容旧代码的函数）
 * @deprecated 推荐使用 TaskLogger 实例的 logError() 方法
 */
export function logErrorToTaskFile(taskId: string, message: string, error?: any): void {
  const logger = activeLoggers.get(taskId);
  if (logger) {
    logger.logError(message, error);
  } else {
    console.error(`❌ [TASK-LOGGER] 未找到任务 ${taskId} 的日志器:`, message, error);
  }
}

/**
 * 获取任务日志器
 */
export function getTaskLogger(taskId: string): TaskLogger | undefined {
  return activeLoggers.get(taskId);
}

/**
 * 清理任务日志器（任务完成时调用）
 */
export function cleanupTaskLogger(taskId: string): void {
  const logger = activeLoggers.get(taskId);
  if (logger) {
    logger.cleanup();
    activeLoggers.delete(taskId);
  }
}

/**
 * 检查任务日志器是否已初始化（兼容旧代码）
 * @deprecated 推荐使用 logger.isInitialized()
 */
export function isLoggerInitialized(taskId: string): boolean {
  const logger = activeLoggers.get(taskId);
  return logger ? logger.isInitialized() : false;
}

/**
 * 获取当前任务ID（兼容旧代码）
 * @deprecated 不推荐使用，因为多任务场景下没有"当前"任务的概念
 */
export function getCurrentTaskId(): string | null {
  // 返回最后活跃的任务ID（不推荐使用）
  if (activeLoggers.size === 0) {
    return null;
  }
  // 返回最后一个添加的任务ID
  const keys = Array.from(activeLoggers.keys());
  return keys[keys.length - 1] || null;
}
