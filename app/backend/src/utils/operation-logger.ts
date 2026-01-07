/**
 * 操作日志记录器 - 支持高并发和作用域内console拦截
 * 使用AsyncLocalStorage实现安全的并行日志记录
 */

import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

// 异步本地存储，用于在异步调用链中存储当前logger
const asyncLocalStorage = new AsyncLocalStorage<OperationLogger>();

/**
 * 操作日志记录器类 - 每个任务创建独立实例
 */
export class OperationLogger {
  private logFilePath: string;
  private taskId: string;
  private operation: 'datachk' | 'submission';
  private completed: boolean = false;
  // 保存原始console方法
  private originalConsole: { log: any; error: any; warn: any; info: any } | null = null;

  constructor(taskId: string, operation: 'datachk' | 'submission') {
    this.taskId = taskId;
    this.operation = operation;

    // 计算项目根目录：从 app/backend 往上两级到 LogicCore
    const projectRoot = path.join(process.cwd(), '..', '..');
    const logsDir = path.join(projectRoot, 'logs', taskId);

    // 确保日志目录存在 - 设置权限为750（所有者读写执行，组读执行，其他无权限）
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true, mode: 0o750 });
    }
    // 如果目录已存在，也需要设置权限
    try {
      fs.chmodSync(logsDir, 0o750);
    } catch (error) {
      console.error(`⚠️ 无法设置日志目录权限 ${logsDir}:`, error);
    }

    this.logFilePath = path.join(logsDir, `${operation}.log`);

    // 初始化日志文件
    this.initializeLogFile();
  }

  /**
   * 初始化日志文件
   */
  private initializeLogFile(): void {
    const timestamp = new Date().toISOString();
    const header = [
      `=== ${this.operation.toUpperCase()}操作日志 ===`,
      `任务ID: ${this.taskId}`,
      `开始时间: ${timestamp}`,
      `==========================================\n`
    ].join('\n');

    fs.writeFileSync(this.logFilePath, header);
  }

  /**
   * 写入内容到日志文件
   */
  private writeToFile(message: string): void {
    if (this.completed) {
      // 如果已完成，只输出到控制台
      console.log(message);
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      // 如果日志写入失败，至少输出到控制台
      console.error('❌ 写入操作日志失败:', error);
    }
  }

  /**
   * 记录日志消息（同时输出到文件和控制台）
   */
  log(message: string): void {
    // 添加任务ID前缀输出到控制台
    console.log(`[${this.taskId}:${this.operation}] ${message}`);
    // 写入文件
    this.writeToFile(message);
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: any): void {
    let logMessage = `❌ ERROR: ${message}`;

    if (error) {
      if (error instanceof Error) {
        logMessage += `\n错误详情: ${error.message}`;
        if (error.stack) {
          logMessage += `\n堆栈跟踪: ${error.stack}`;
        }
      } else {
        logMessage += `\n错误详情: ${JSON.stringify(error)}`;
      }
    }

    // 输出到控制台（带任务ID前缀）
    console.error(`[${this.taskId}:${this.operation}] ${logMessage}`);
    // 写入文件
    this.writeToFile(logMessage);
  }

  /**
   * 记录成功日志
   */
  success(message: string): void {
    this.log(`✅ ${message}`);
  }

  /**
   * 记录警告日志
   */
  warn(message: string): void {
    this.log(`⚠️ ${message}`);
  }

  /**
   * 记录信息日志
   */
  info(message: string): void {
    this.log(`ℹ️ ${message}`);
  }

  /**
   * 记录步骤开始
   */
  stepStart(step: string, description: string): void {
    this.log(`🚀 [${step}] ${description}`);
  }

  /**
   * 记录步骤完成
   */
  stepComplete(step: string, description: string): void {
    this.log(`✅ [${step}] ${description}`);
  }

  /**
   * 记录步骤失败
   */
  stepFailed(step: string, description: string, error?: any): void {
    this.error(`[${step}] ${description}`, error);
  }

  /**
   * 完成日志记录
   */
  complete(success: boolean, message: string): void {
    if (this.completed) {
      return; // 防止重复调用
    }

    this.completed = true;

    const timestamp = new Date().toISOString();
    const status = success ? '成功' : '失败';
    const icon = success ? '🎉' : '❌';

    const footer = [
      `\n==========================================`,
      `${icon} ${this.operation.toUpperCase()}操作${status}`,
      `结束时间: ${timestamp}`,
      `结果: ${message}`,
      `==========================================`
    ].join('\n');

    // 写入最终结果
    fs.appendFileSync(this.logFilePath, footer);

    // 输出最终结果到终端（带任务ID前缀）
    console.log(`[${this.taskId}:${this.operation}] ${icon} ${this.operation.toUpperCase()}操作${status}: ${message}`);
  }

  /**
   * 获取日志文件路径
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 获取任务ID
   */
  getTaskId(): string {
    return this.taskId;
  }

  /**
   * 获取操作类型
   */
  getOperation(): string {
    return this.operation;
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
      this.originalConsole!.log(`[${logger.taskId}:${logger.operation}]`, ...args);

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
      this.originalConsole!.error(`[${logger.taskId}:${logger.operation}]`, ...args);

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
      this.originalConsole!.warn(`[${logger.taskId}:${logger.operation}]`, ...args);

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
      this.originalConsole!.info(`[${logger.taskId}:${logger.operation}]`, ...args);

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
   * 获取当前异步上下文中的OperationLogger
   */
  static getCurrentLogger(): OperationLogger | undefined {
    return asyncLocalStorage.getStore();
  }
}

/**
 * 创建操作日志记录器的便捷函数
 */
export function createOperationLogger(taskId: string, operation: 'datachk' | 'submission'): OperationLogger {
  return new OperationLogger(taskId, operation);
}
