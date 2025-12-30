import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../config/logger';
import redisClient from '../config/redis';

// 获取当前文件的目录路径 (ES模块方式)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkerStatus {
  isRunning: boolean;
  processId?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  errorCount: number;
}

class WorkerService {
  private workerProcess: ChildProcess | null = null;
  private status: WorkerStatus = {
    isRunning: false,
    errorCount: 0
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30秒
  private readonly MAX_ERROR_COUNT = 3;
  private readonly WORKER_SCRIPT_PATH: string;

  constructor() {
    this.WORKER_SCRIPT_PATH = path.join(__dirname, '..', '..', 'start_workers.py');
  }

  /**
   * 清理现有的Worker进程
   */
  private async cleanupExistingWorkers(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows: 查找并终止现有的start_workers.py进程
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
          const { stdout } = await execAsync('wmic process where "CommandLine like \'%start_workers.py%\'" get ProcessId /value');
          const pids = stdout.match(/ProcessId=(\d+)/g);

          if (pids && pids.length > 0) {
            logger.info(`Found ${pids.length} existing Worker processes, cleaning up...`);
            for (const pidMatch of pids) {
              const pid = pidMatch.split('=')[1];
              if (pid && pid !== '0') {
                try {
                  await execAsync(`taskkill /F /PID ${pid}`);
                  logger.info(`Terminated existing Worker process: ${pid}`);
                } catch (error) {
                  // 进程可能已经不存在，忽略错误
                }
              }
            }
          }
        } catch (error) {
          // 没有找到现有进程，这是正常的
        }
      }
    } catch (error) {
      logger.warn(`Error during Worker cleanup: ${error}`);
    }
  }

  /**
   * 启动Worker进程
   */
  async startWorker(): Promise<boolean> {
    try {
      if (this.status.isRunning && this.workerProcess && !this.workerProcess.killed) {
        logger.info('Worker is already running');
        return true;
      }

      // 清理可能存在的僵尸进程
      await this.cleanupExistingWorkers();

      // 检查Python和脚本文件
      if (!fs.existsSync(this.WORKER_SCRIPT_PATH)) {
        logger.error(`Worker script not found: ${this.WORKER_SCRIPT_PATH}`);
        return false;
      }

      logger.info('Starting Worker process...');

      // 启动Worker进程
      const spawnOptions: any = {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.dirname(this.WORKER_SCRIPT_PATH)
      };

      // Windows特定配置：完全隐藏窗口
      if (process.platform === 'win32') {
        spawnOptions.windowsHide = true;
        spawnOptions.shell = false;
        // 使用CREATE_NO_WINDOW标志
        spawnOptions.windowsVerbatimArguments = false;
      }

      // 跨平台Python命令选择 - 优先使用项目venv中的Python
      let pythonCommand: string;
      const venvPython = path.join(__dirname, '..', '..', '..', '..', 'venv', 'bin', 'python3');

      if (process.platform === 'win32') {
        pythonCommand = 'python';
      } else if (fs.existsSync(venvPython)) {
        // Linux/WSL: 优先使用venv中的Python
        pythonCommand = venvPython;
        logger.info(`Using venv Python: ${venvPython}`);
      } else {
        pythonCommand = 'python3';
        logger.warn('Venv Python not found, using system Python');
      }

      const fallbackCommand = process.platform === 'win32' ? 'py' : 'python3';

      try {
        this.workerProcess = spawn(pythonCommand, [this.WORKER_SCRIPT_PATH], spawnOptions);
      } catch (error) {
        // 如果主命令失败，回退到备用命令
        logger.warn(`Failed to start with ${pythonCommand}, falling back to ${fallbackCommand}`);
        this.workerProcess = spawn(fallbackCommand, [this.WORKER_SCRIPT_PATH], spawnOptions);
      }

      // 设置进程事件监听
      this.setupProcessListeners();

      // 等待进程启动
      await this.waitForWorkerStart();

      // 启动健康检查
      this.startHealthCheck();

      logger.info('✅ Worker process started successfully');
      return true;

    } catch (error) {
      logger.error(`Failed to start Worker process: ${error}`);
      this.status.errorCount++;
      return false;
    }
  }

  /**
   * 停止Worker进程
   */
  async stopWorker(): Promise<void> {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.workerProcess && !this.workerProcess.killed) {
        logger.info('Stopping Worker process...');
        this.workerProcess.kill('SIGTERM');
        
        // 等待进程优雅退出
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (this.workerProcess && !this.workerProcess.killed) {
              this.workerProcess.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          this.workerProcess?.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      this.resetStatus();
      logger.info('Worker process stopped');

    } catch (error) {
      logger.error(`Error stopping Worker process: ${error}`);
    }
  }

  /**
   * 检查Worker状态
   */
  async checkWorkerStatus(): Promise<WorkerStatus> {
    try {
      // 检查进程是否还在运行
      if (this.workerProcess && !this.workerProcess.killed) {
        // 检查Redis连接和队列
        const isRedisHealthy = await this.checkRedisHealth();
        
        this.status.isRunning = isRedisHealthy;
        this.status.lastHealthCheck = new Date();
        
        if (!isRedisHealthy) {
          this.status.errorCount++;
          logger.warn('Worker health check failed - Redis connection issue');
        } else {
          this.status.errorCount = 0; // 重置错误计数
        }
      } else {
        this.status.isRunning = false;
      }

      return { ...this.status };
    } catch (error) {
      logger.error(`Error checking Worker status: ${error}`);
      this.status.isRunning = false;
      this.status.errorCount++;
      return { ...this.status };
    }
  }

  /**
   * 确保Worker运行（自动启动）
   */
  async ensureWorkerRunning(): Promise<boolean> {
    const status = await this.checkWorkerStatus();
    
    if (!status.isRunning) {
      logger.info('Worker not running, attempting to start...');
      return await this.startWorker();
    }
    
    return true;
  }

  /**
   * 获取Worker状态
   */
  getStatus(): WorkerStatus {
    return { ...this.status };
  }

  /**
   * 设置进程事件监听器
   */
  private setupProcessListeners(): void {
    if (!this.workerProcess) return;

    this.workerProcess.on('spawn', () => {
      this.status.isRunning = true;
      this.status.processId = this.workerProcess?.pid;
      this.status.startTime = new Date();
      this.status.errorCount = 0;
      logger.info(`Worker process spawned with PID: ${this.workerProcess?.pid}`);
    });

    this.workerProcess.on('exit', (code, signal) => {
      logger.warn(`Worker process exited with code: ${code}, signal: ${signal}`);
      this.resetStatus();

      // 如果错误次数未超过限制，尝试重启
      if (this.status.errorCount < this.MAX_ERROR_COUNT) {
        logger.info('Attempting to restart Worker process...');
        // 增加重启延迟，并确保不会重复启动
        setTimeout(async () => {
          if (!this.status.isRunning) {
            await this.startWorker();
          }
        }, 5000);
      } else {
        logger.error('Worker process failed too many times, stopping auto-restart');
      }
    });

    this.workerProcess.on('error', (error) => {
      logger.error(`Worker process error: ${error}`);
      this.status.errorCount++;
      this.resetStatus();
    });

    // 捕获输出日志
    this.workerProcess.stdout?.on('data', (data) => {
      logger.info(`Worker stdout: ${data.toString().trim()}`);
    });

    this.workerProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      // Python Worker的正常日志通常输出到stderr，根据内容判断日志级别
      if (output.includes('ERROR') || output.includes('CRITICAL') || output.includes('FATAL')) {
        logger.error(`Worker stderr: ${output}`);
      } else if (output.includes('WARNING') || output.includes('WARN')) {
        logger.warn(`Worker stderr: ${output}`);
      } else {
        // INFO级别的日志不应该显示为ERROR
        logger.info(`Worker info: ${output}`);
      }
    });
  }

  /**
   * 等待Worker启动
   */
  private async waitForWorkerStart(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker start timeout'));
      }, 30000);

      const checkStart = async () => {
        try {
          const isHealthy = await this.checkRedisHealth();
          if (isHealthy) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkStart, 1000);
          }
        } catch (error) {
          setTimeout(checkStart, 1000);
        }
      };

      setTimeout(checkStart, 2000); // 等待2秒后开始检查
    });
  }

  /**
   * 检查Redis健康状态
   */
  private async checkRedisHealth(): Promise<boolean> {
    try {
      await redisClient.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkWorkerStatus();
      
      // 如果错误次数过多，停止健康检查
      if (this.status.errorCount >= this.MAX_ERROR_COUNT) {
        logger.error('Worker health check failed too many times, stopping health check');
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 重置状态
   */
  private resetStatus(): void {
    this.status.isRunning = false;
    this.status.processId = undefined;
    this.status.startTime = undefined;
    this.workerProcess = null;
  }
}

// 导出单例实例
export const workerService = new WorkerService();
