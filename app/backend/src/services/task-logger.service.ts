import fs from 'fs/promises';
import path from 'path';

interface TaskLogEntry {
    timestamp: string;
    step: string;
    status: 'START' | 'SUCCESS' | 'ERROR' | 'INFO';
    message: string;
    details?: any;
    duration?: number;
}

interface TaskLogMetadata {
    taskId: string;
    userId: string;
    username: string;
    toolType: string;
    submissionTime: string;
    logFileName: string;
}

export class TaskLogger {
    private logsDir: string;
    private taskLogDir: string;
    private logFilePath: string;
    private metadata: TaskLogMetadata;
    private stepStartTimes: Map<string, number> = new Map();

    constructor(taskId: string, userId: string, username: string, toolType: string) {
        // 使用专用的任务日志目录环境变量
        this.logsDir = process.env.TASK_LOGS_DIR || path.join(process.cwd(), 'logs');
        this.taskLogDir = path.join(this.logsDir, taskId);
        
        const submissionTime = new Date().toISOString().replace(/[:.]/g, '-');
        const logFileName = `${username}_${toolType}_${submissionTime}.log`;
        this.logFilePath = path.join(this.taskLogDir, logFileName);
        
        this.metadata = {
            taskId,
            userId,
            username,
            toolType,
            submissionTime,
            logFileName
        };
    }

    /**
     * 初始化日志目录和文件
     */
    async initialize(): Promise<void> {
        try {
            // 确保logs目录存在 - 设置权限为750（所有者读写执行，组读执行，其他无权限）
            await fs.mkdir(this.logsDir, { recursive: true, mode: 0o750 });

            // 确保任务日志目录存在 - 设置权限为750（所有者读写执行，组读执行，其他无权限）
            await fs.mkdir(this.taskLogDir, { recursive: true, mode: 0o750 });
            // 如果目录已存在，也需要设置权限
            try {
                await fs.chmod(this.taskLogDir, 0o750);
            } catch (error) {
                console.error('⚠️ 无法设置日志目录权限:', error);
            }

            // 写入初始元数据
            await this.writeLog({
                timestamp: new Date().toISOString(),
                step: 'INITIALIZATION',
                status: 'START',
                message: 'Task logging initialized',
                details: this.metadata
            });

        } catch (error) {
            console.error('Failed to initialize task logger:', error);
        }
    }

    /**
     * 记录步骤开始
     */
    async logStepStart(step: string, message: string, details?: any): Promise<void> {
        const startTime = Date.now();
        this.stepStartTimes.set(step, startTime);
        
        await this.writeLog({
            timestamp: new Date().toISOString(),
            step,
            status: 'START',
            message,
            details
        });
    }

    /**
     * 记录步骤成功
     */
    async logStepSuccess(step: string, message: string, details?: any): Promise<void> {
        const duration = this.calculateDuration(step);
        
        await this.writeLog({
            timestamp: new Date().toISOString(),
            step,
            status: 'SUCCESS',
            message,
            details,
            duration
        });
    }

    /**
     * 记录步骤错误
     */
    async logStepError(step: string, message: string, error: any): Promise<void> {
        const duration = this.calculateDuration(step);
        
        await this.writeLog({
            timestamp: new Date().toISOString(),
            step,
            status: 'ERROR',
            message,
            details: {
                error: error.message || error,
                stack: error.stack
            },
            duration
        });
    }

    /**
     * 记录信息
     */
    async logInfo(step: string, message: string, details?: any): Promise<void> {
        await this.writeLog({
            timestamp: new Date().toISOString(),
            step,
            status: 'INFO',
            message,
            details
        });
    }

    /**
     * 写入日志条目
     */
    private async writeLog(entry: TaskLogEntry): Promise<void> {
        try {
            const logLine = JSON.stringify(entry) + '\n';
            await fs.appendFile(this.logFilePath, logLine, 'utf8');
        } catch (error) {
            console.error('Failed to write log entry:', error);
        }
    }

    /**
     * 计算步骤持续时间
     */
    private calculateDuration(step: string): number | undefined {
        const startTime = this.stepStartTimes.get(step);
        if (startTime) {
            this.stepStartTimes.delete(step);
            return Date.now() - startTime;
        }
        return undefined;
    }

    /**
     * 获取任务日志目录路径
     */
    getLogDirectory(): string {
        return this.taskLogDir;
    }

    /**
     * 获取日志文件路径
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    /**
     * 读取日志内容
     */
    async readLogs(): Promise<TaskLogEntry[]> {
        try {
            const content = await fs.readFile(this.logFilePath, 'utf8');
            return content.split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (error) {
            console.error('Failed to read logs:', error);
            return [];
        }
    }

    /**
     * 清理旧日志（保留指定天数）
     */
    static async cleanupOldLogs(retentionDays: number = 30): Promise<void> {
        try {
            const logsDir = path.join(process.cwd(), '../../logs');
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            
            const entries = await fs.readdir(logsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const dirPath = path.join(logsDir, entry.name);
                    const stats = await fs.stat(dirPath);
                    
                    if (stats.mtime.getTime() < cutoffTime) {
                        await fs.rm(dirPath, { recursive: true, force: true });
                        console.log(`Cleaned up old log directory: ${entry.name}`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }
}

/**
 * 创建任务日志器实例
 */
export const createTaskLogger = async (
    taskId: string, 
    userId: string, 
    username: string, 
    toolType: string
): Promise<TaskLogger> => {
    const logger = new TaskLogger(taskId, userId, username, toolType);
    await logger.initialize();
    return logger;
};
