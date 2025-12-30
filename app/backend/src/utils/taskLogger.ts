/**
 * 任务执行完整日志记录系统
 * 记录任务执行全过程的详细信息，包括错误处理、状态更新、数据库操作等
 */

import { Task } from '@prisma/client';
import { getOssClient } from './oss';

export interface TaskLogEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    category: 'TASK' | 'DATABASE' | 'OSS' | 'DOCKER' | 'SYSTEM';
    message: string;
    details?: any;
    taskId: string;
    userId: string;
}

export class TaskLogger {
    private logs: TaskLogEntry[] = [];
    private taskId: string;
    private userId: string;

    constructor(taskId: string, userId: string) {
        this.taskId = taskId;
        this.userId = userId;
        this.log('INFO', 'TASK', 'Task logger initialized', { taskId, userId });
    }

    /**
     * 记录日志条目
     */
    log(level: TaskLogEntry['level'], category: TaskLogEntry['category'], message: string, details?: any) {
        const entry: TaskLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            details,
            taskId: this.taskId,
            userId: this.userId
        };

        this.logs.push(entry);
        
        // 同时输出到控制台（用于实时监控）
        const logMessage = `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}`;
        
        switch (level) {
            case 'ERROR':
                console.error(logMessage, details || '');
                break;
            case 'WARN':
                console.warn(logMessage, details || '');
                break;
            case 'DEBUG':
                console.debug(logMessage, details || '');
                break;
            default:
                console.log(logMessage, details || '');
        }
    }

    /**
     * 记录任务状态变更
     */
    logStatusChange(fromStatus: string, toStatus: string, reason?: string) {
        this.log('INFO', 'TASK', `Status changed: ${fromStatus} -> ${toStatus}`, { 
            fromStatus, 
            toStatus, 
            reason 
        });
    }

    /**
     * 记录数据库操作
     */
    logDatabaseOperation(operation: string, table: string, success: boolean, details?: any) {
        const level = success ? 'INFO' : 'ERROR';
        this.log(level, 'DATABASE', `${operation} on ${table}: ${success ? 'SUCCESS' : 'FAILED'}`, details);
    }

    /**
     * 记录OSS操作
     */
    logOssOperation(operation: string, path: string, success: boolean, details?: any) {
        const level = success ? 'INFO' : 'ERROR';
        this.log(level, 'OSS', `${operation} ${path}: ${success ? 'SUCCESS' : 'FAILED'}`, details);
    }

    /**
     * 记录Docker操作
     */
    logDockerOperation(operation: string, containerName: string, success: boolean, details?: any) {
        const level = success ? 'INFO' : 'ERROR';
        this.log(level, 'DOCKER', `${operation} ${containerName}: ${success ? 'SUCCESS' : 'FAILED'}`, details);
    }

    /**
     * 记录错误信息
     */
    logError(category: TaskLogEntry['category'], message: string, error: Error | any) {
        this.log('ERROR', category, message, {
            error: error.message || error,
            stack: error.stack,
            name: error.name
        });
    }

    /**
     * 记录任务参数
     */
    logTaskParameters(parameters: any) {
        this.log('INFO', 'TASK', 'Task parameters recorded', {
            parameters: JSON.stringify(parameters, null, 2)
        });
    }

    /**
     * 记录文件操作
     */
    logFileOperation(operation: string, filePath: string, success: boolean, fileSize?: number) {
        this.log('INFO', 'SYSTEM', `File ${operation}: ${filePath}`, {
            success,
            fileSize: fileSize ? `${(fileSize / 1024 / 1024).toFixed(2)} MB` : undefined
        });
    }

    /**
     * 生成完整的日志报告
     */
    generateLogReport(): string {
        const report = {
            taskId: this.taskId,
            userId: this.userId,
            generatedAt: new Date().toISOString(),
            totalEntries: this.logs.length,
            summary: {
                errors: this.logs.filter(log => log.level === 'ERROR').length,
                warnings: this.logs.filter(log => log.level === 'WARN').length,
                info: this.logs.filter(log => log.level === 'INFO').length,
                debug: this.logs.filter(log => log.level === 'DEBUG').length
            },
            categorySummary: {
                task: this.logs.filter(log => log.category === 'TASK').length,
                database: this.logs.filter(log => log.category === 'DATABASE').length,
                oss: this.logs.filter(log => log.category === 'OSS').length,
                docker: this.logs.filter(log => log.category === 'DOCKER').length,
                system: this.logs.filter(log => log.category === 'SYSTEM').length
            },
            logs: this.logs
        };

        return JSON.stringify(report, null, 2);
    }

    /**
     * 生成人类可读的日志报告
     */
    generateHumanReadableReport(): string {
        const errorLogs = this.logs.filter(log => log.level === 'ERROR');
        const warningLogs = this.logs.filter(log => log.level === 'WARN');

        let report = `
Task Execution Log Report
========================
Task ID: ${this.taskId}
User ID: ${this.userId}
Generated: ${new Date().toISOString()}
Total Log Entries: ${this.logs.length}

Summary:
- Errors: ${errorLogs.length}
- Warnings: ${warningLogs.length}
- Info: ${this.logs.filter(log => log.level === 'INFO').length}
- Debug: ${this.logs.filter(log => log.level === 'DEBUG').length}

`;

        if (errorLogs.length > 0) {
            report += `\nERRORS:\n`;
            errorLogs.forEach((log, index) => {
                report += `${index + 1}. [${log.timestamp}] ${log.message}\n`;
                if (log.details) {
                    report += `   Details: ${JSON.stringify(log.details, null, 2)}\n`;
                }
            });
        }

        if (warningLogs.length > 0) {
            report += `\nWARNINGS:\n`;
            warningLogs.forEach((log, index) => {
                report += `${index + 1}. [${log.timestamp}] ${log.message}\n`;
            });
        }

        report += `\nDETAILED LOG:\n`;
        this.logs.forEach(log => {
            report += `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}\n`;
        });

        return report;
    }

    /**
     * 上传日志到OSS
     */
    async uploadToOss(): Promise<string> {
        try {
            const logContent = this.generateHumanReadableReport();
            const jsonContent = this.generateLogReport();
            
            // 上传人类可读的日志
            const readableLogPath = `${this.userId}/${this.taskId}/logs/task_execution.log`;
            const jsonLogPath = `${this.userId}/${this.taskId}/logs/task_execution.json`;
            
            const ossClient = getOssClient(process.env.OSS_BUCKET_JOB_LOGS as string);
            
            // 上传文本日志
            await ossClient.put(readableLogPath, Buffer.from(logContent, 'utf8'));
            this.log('INFO', 'OSS', `Uploaded readable log to: ${readableLogPath}`);
            
            // 上传JSON日志
            await ossClient.put(jsonLogPath, Buffer.from(jsonContent, 'utf8'));
            this.log('INFO', 'OSS', `Uploaded JSON log to: ${jsonLogPath}`);
            
            return readableLogPath;
        } catch (error) {
            this.logError('OSS', 'Failed to upload logs to OSS', error);
            throw error;
        }
    }

    /**
     * 获取所有日志
     */
    getAllLogs(): TaskLogEntry[] {
        return [...this.logs];
    }

    /**
     * 获取特定级别的日志
     */
    getLogsByLevel(level: TaskLogEntry['level']): TaskLogEntry[] {
        return this.logs.filter(log => log.level === level);
    }

    /**
     * 获取特定类别的日志
     */
    getLogsByCategory(category: TaskLogEntry['category']): TaskLogEntry[] {
        return this.logs.filter(log => log.category === category);
    }
}

export default TaskLogger;
