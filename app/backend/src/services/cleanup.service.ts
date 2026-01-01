/**
 * ECS本地文件清理服务
 * 实现精确的目录清理机制：
 * - 正常完成任务：2分钟下载期结束后精确清理jobs/temp/logs三个目录
 * - 失败/出错任务：jobs目录5分钟清理，temp/logs目录保留24小时用于问题分析
 *
 * 使用Redis分布式锁防止多实例同时执行清理
 */

import * as fs from 'fs';
import * as path from 'path';
import { ECS_LOCAL_PATHS, TASK_LOG_PATHS } from '../config/paths';
import { DeploymentModeService } from './deployment-mode.service';
import { EcsLocalStorageService } from './ecs-local-storage.service';
import { ExcelThrpagesService } from './excel_thrpages.service';
import { TaskLogCleanupService } from './task-log-cleanup.service';
import { redisPool } from './redis-pool.service';
import { prisma } from '../utils/database';
import logger from '../config/logger';

// 分布式锁配置
const CLEANUP_LOCK_KEY = 'ecs:cleanup:lock';
const PRECISE_CLEANUP_LOCK_KEY = 'ecs:cleanup:precise:lock';
const CLEANUP_LOCK_TTL = 300; // 5分钟锁TTL
const LOCK_RETRY_ATTEMPTS = 2; // 重试次数
const LOCK_RETRY_DELAY = 100; // 重试延迟(ms)

export class CleanupService {
    private static cleanupInterval: NodeJS.Timeout | null = null;
    private static preciseCleanupInterval: NodeJS.Timeout | null = null;

    /**
     * 启动清理服务
     */
    static startCleanupService(): void {
        if (!DeploymentModeService.isEcsOnlyMode()) {
            logger.info('Cleanup service not started - not in ECS Only mode');
            return;
        }

        if (this.cleanupInterval) {
            logger.warn('Cleanup service already running');
            return;
        }

        const intervalMs = DeploymentModeService.getCleanupInterval() * 1000;

        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, intervalMs);

        // 启动精确的任务完成倒计时清理（每10秒检查一次）
        this.preciseCleanupInterval = setInterval(() => {
            this.checkCompletedTasksForPreciseCleanup();
        }, 10000);

        logger.info({
            intervalMs,
            intervalSeconds: DeploymentModeService.getCleanupInterval(),
            preciseCleanupEnabled: true
        }, 'ECS cleanup service started with precise task completion cleanup');
    }

    /**
     * 停止清理服务
     */
    static stopCleanupService(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.preciseCleanupInterval) {
            clearInterval(this.preciseCleanupInterval);
            this.preciseCleanupInterval = null;
        }

        logger.info('ECS cleanup service stopped (including precise cleanup)');
    }

    /**
     * 检查已完成任务的精确清理时机（每10秒执行一次）
     * 正常完成任务后，2分钟下载期结束时精确清理jobs/temp/logs三个目录
     * 使用Redis分布式锁防止多实例同时执行
     */
    private static async checkCompletedTasksForPreciseCleanup(): Promise<void> {
        // 获取分布式锁
        const redis = redisPool.getClient();
        const lockId = `${process.env.HOSTNAME || 'unknown'}-${Date.now()}`;

        // 使用SET NX获取锁
        const acquired = await redis.set(
            PRECISE_CLEANUP_LOCK_KEY,
            lockId,
            'EX',
            CLEANUP_LOCK_TTL,
            'NX'
        );

        if (!acquired) {
            logger.debug('Precise cleanup already running in another instance, skipping this cycle');
            return;
        }

        logger.debug({
            lockId,
            key: PRECISE_CLEANUP_LOCK_KEY,
            ttl: CLEANUP_LOCK_TTL
        }, 'Precise cleanup lock acquired');

        try {
            // 查找最近3分钟内完成的任务（避免重复检查老任务）
            const completedTasks = await prisma.task.findMany({
                where: {
                    status: 'COMPLETED',
                    finishedAt: {
                        not: null,
                        gte: new Date(Date.now() - 3 * 60 * 1000) // 最近3分钟
                    },
                    cleanedAt: null // 只清理尚未清理的任务
                },
                include: {
                    tool: { select: { name: true } }
                }
            });

            const now = Date.now();
            const downloadTimeoutMs = DeploymentModeService.getDownloadTimeout() * 1000; // 使用统一的配置

            for (const task of completedTasks) {
                if (!task.finishedAt) continue;

                const timeSinceCompletion = now - task.finishedAt.getTime();

                // 如果刚好到达2分钟清理时间（允许15秒误差范围）
                if (timeSinceCompletion >= downloadTimeoutMs && timeSinceCompletion <= downloadTimeoutMs + 15000) {
                    logger.info({
                        taskId: task.id,
                        finishedAt: task.finishedAt,
                        timeSinceCompletion: Math.floor(timeSinceCompletion / 1000),
                        toolName: task.tool?.name,
                        downloadTimeoutSeconds: DeploymentModeService.getDownloadTimeout()
                    }, '[AUDIT] Task completed - starting precise cleanup of jobs/temp/logs directories');

                    // 记录清理前各目录状态
                    await this.logDirectoryState(task.id, 'BEFORE_PRECISE_CLEANUP');

                    // 立即执行完整清理（包括jobs、temp、logs三个目录）
                    await this.performCompleteTaskCleanup(task.id, 'DOWNLOAD_TIMEOUT_EXPIRED');

                    // 记录清理后各目录状态
                    await this.logDirectoryState(task.id, 'AFTER_PRECISE_CLEANUP');

                    // 更新任务状态，标记为已清理
                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            cleanedAt: new Date()
                            // 保持原有状态，不设置CLEANED状态（该状态不存在于TaskStatus枚举中）
                        }
                    });

                    logger.info({
                        taskId: task.id,
                        toolName: task.tool?.name
                    }, '[AUDIT] Task precise cleanup completed successfully');
                }
            }
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Error in precise cleanup check');
        } finally {
            // 释放锁（使用Lua脚本确保只释放自己的锁）
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;
            await redis.eval(luaScript, 1, PRECISE_CLEANUP_LOCK_KEY, lockId);
            logger.debug('Precise cleanup lock released');
        }
    }

    /**
     * 记录目录状态（审计日志）
     */
    private static async logDirectoryState(taskId: string, phase: string): Promise<void> {
        try {
            const jobsDir = ECS_LOCAL_PATHS.getTaskDir(taskId);
            const tempDir = path.join(process.env.TEMP_UPLOAD_DIR || path.join(process.cwd(), 'temp'), taskId);
            const logsDir = TASK_LOG_PATHS.getTaskLogDir(taskId);

            const jobsExists = fs.existsSync(jobsDir);
            const tempExists = fs.existsSync(tempDir);
            const logsExists = fs.existsSync(logsDir);

            let jobsSize = 0;
            let tempSize = 0;
            let logsSize = 0;

            if (jobsExists) {
                jobsSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
            }
            if (tempExists) {
                tempSize = await this.getDirectorySize(tempDir);
            }
            if (logsExists) {
                logsSize = await this.getDirectorySize(logsDir);
            }

            logger.info({
                taskId,
                phase,
                directories: {
                    jobs: { exists: jobsExists, sizeBytes: jobsSize, path: jobsDir },
                    temp: { exists: tempExists, sizeBytes: tempSize, path: tempDir },
                    logs: { exists: logsExists, sizeBytes: logsSize, path: logsDir }
                }
            }, `[AUDIT] Directory state recorded for task ${taskId}`);
        } catch (error) {
            logger.warn({ taskId, phase, error }, 'Failed to log directory state');
        }
    }

    /**
     * 计算目录大小（辅助方法）
     */
    private static async getDirectorySize(dirPath: string): Promise<number> {
        if (!fs.existsSync(dirPath)) {
            return 0;
        }

        let totalSize = 0;
        const calculateSize = async (dir: string): Promise<void> => {
            const items = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const item of items) {
                const itemPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    await calculateSize(itemPath);
                } else if (item.isFile()) {
                    const stats = await fs.promises.stat(itemPath);
                    totalSize += stats.size;
                }
            }
        };
        await calculateSize(dirPath);
        return totalSize;
    }

    /**
     * 执行完整的任务清理（包括容器、文件、日志、数据库状态）
     * 用于正常完成任务后的精确清理（2分钟下载期结束后）
     */
    private static async performCompleteTaskCleanup(taskId: string, reason: string): Promise<void> {
        logger.info({
            taskId,
            reason,
            cleanupType: 'PRECISE_CLEANUP'
        }, '[AUDIT] Starting complete task cleanup (jobs + temp + logs)');

        try {
            // 1. 清理Docker容器
            await this.cleanupTaskContainer(taskId);

            // 2. 清理jobs目录（使用rm -rf，确保删除容器用户创建的文件）
            await this.cleanupJobsDirectory(taskId);

            // 3. 清理temp目录
            await this.cleanupTempDirectory(taskId);

            // 4. 清理logs目录（新增）
            await this.cleanupLogsDirectory(taskId);

            // 5. 清理Redis中的任务记录
            await this.cleanupRedisTaskRecords(taskId);

            // 6. 清理Excel多页面交互数据（步骤a15）
            await this.cleanupExcelThrpagesData(taskId);

            logger.info({
                taskId,
                reason,
                cleanupType: 'PRECISE_CLEANUP'
            }, '[AUDIT] Complete task cleanup finished successfully (jobs + temp + logs)');

        } catch (error) {
            logger.error({
                taskId,
                reason,
                cleanupType: 'PRECISE_CLEANUP',
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Error during complete task cleanup');
            throw error;
        }
    }

    /**
     * 清理logs目录（精确清理时调用）
     */
    private static async cleanupLogsDirectory(taskId: string): Promise<void> {
        try {
            const logsDir = TASK_LOG_PATHS.getTaskLogDir(taskId);
            if (fs.existsSync(logsDir)) {
                const dirSize = await this.getDirectorySize(logsDir);
                await fs.promises.rm(logsDir, { recursive: true, force: true });
                logger.info({
                    taskId,
                    directory: logsDir,
                    sizeBytes: dirSize
                }, '[AUDIT] Logs directory cleaned up');
            }
        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to cleanup logs directory');
        }
    }

    /**
     * 清理任务容器
     */
    private static async cleanupTaskContainer(taskId: string): Promise<void> {
        try {
            // 调用Python Worker的容器清理函数
            const { spawn } = await import('child_process');

            return new Promise((resolve, reject) => {
                const pythonProcess = spawn('python3', [
                    '-c',
                    `
import sys
import os
sys.path.append('${process.cwd()}/app/backend/src/workers')
from container_manager import cleanup_container_for_task
result = cleanup_container_for_task('${taskId}', 'download_timeout_cleanup')
print(f'Container cleanup result: {result}')
                    `
                ], {
                    cwd: process.cwd(),
                    stdio: 'pipe'
                });

                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info({ taskId }, 'Container cleanup completed');
                        resolve();
                    } else {
                        logger.warn({ taskId, exitCode: code }, 'Container cleanup failed or no container found');
                        resolve(); // 不阻塞其他清理操作
                    }
                });

                pythonProcess.on('error', (error) => {
                    logger.warn({ taskId, error: error.message }, 'Container cleanup process error');
                    resolve(); // 不阻塞其他清理操作
                });
            });
        } catch (error) {
            logger.warn({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to cleanup task container');
        }
    }

    /**
     * 清理jobs目录
     */
    private static async cleanupJobsDirectory(taskId: string): Promise<void> {
        try {
            const jobsDir = ECS_LOCAL_PATHS.getTaskDir(taskId);
            if (fs.existsSync(jobsDir)) {
                const dirSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
                await EcsLocalStorageService.deleteTaskDirectory(taskId);
                logger.info({
                    taskId,
                    directory: jobsDir,
                    sizeBytes: dirSize
                }, 'Jobs directory cleaned up');
            }
        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to cleanup jobs directory');
        }
    }

    /**
     * 清理temp目录
     */
    private static async cleanupTempDirectory(taskId: string): Promise<void> {
        try {
            const tempDir = path.join(process.env.TEMP_UPLOAD_DIR || path.join(process.cwd(), 'temp'), taskId);
            if (fs.existsSync(tempDir)) {
                const dirSize = await this.getDirectorySize(tempDir);
                await fs.promises.rmdir(tempDir, { recursive: true });
                logger.info({
                    taskId,
                    directory: tempDir,
                    sizeBytes: dirSize
                }, '[AUDIT] Temp directory cleaned up');
            }
        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to cleanup temp directory');
        }
    }

    /**
     * 清理Redis中的任务记录
     */
    private static async cleanupRedisTaskRecords(taskId: string): Promise<void> {
        try {
            const redis = await import('ioredis');
            const redisClient = new redis.Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0')
            });

            // 清理可能的Redis记录
            await redisClient.del(`task:${taskId}`);
            await redisClient.srem('active_task_ids', taskId);

            await redisClient.quit();

            logger.info({ taskId }, 'Redis task records cleaned up');
        } catch (error) {
            logger.warn({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to cleanup Redis task records');
        }
    }

    /**
     * 执行清理操作
     * 使用Redis分布式锁防止多实例同时执行清理
     */
    private static async performCleanup(): Promise<void> {
        // 获取分布式锁
        const redis = redisPool.getClient();
        const lockId = `${process.env.HOSTNAME || 'unknown'}-${Date.now()}`;

        // 使用SET NX获取锁
        const acquired = await redis.set(
            CLEANUP_LOCK_KEY,
            lockId,
            'EX',
            CLEANUP_LOCK_TTL,
            'NX'
        );

        if (!acquired) {
            logger.debug('Cleanup already running in another instance, skipping this cycle');
            return;
        }

        logger.debug({
            lockId,
            key: CLEANUP_LOCK_KEY,
            ttl: CLEANUP_LOCK_TTL
        }, 'Cleanup lock acquired');

        try {
            const jobsDir = ECS_LOCAL_PATHS.JOBS;

            if (!fs.existsSync(jobsDir)) {
                logger.debug('Jobs directory does not exist, skipping cleanup');
                return;
            }

            const taskDirs = await fs.promises.readdir(jobsDir);
            const now = Date.now();
            const cleanupThreshold = DeploymentModeService.getCleanupInterval() * 1000; // 转换为毫秒

            let cleanedCount = 0;
            let totalSize = 0;

            for (const taskId of taskDirs) {
                try {
                    const taskDir = path.join(jobsDir, taskId);
                    const stats = await fs.promises.stat(taskDir);

                    if (!stats.isDirectory()) {
                        continue;
                    }

                    // 检查任务元数据
                    const metadata = await EcsLocalStorageService.getTaskMetadata(taskId);

                    if (metadata) {
                        // 如果有完成时间，使用完成时间计算
                        const completedAt = metadata.completedAt ? new Date(metadata.completedAt).getTime() : null;
                        const createdAt = metadata.createdAt ? new Date(metadata.createdAt).getTime() : stats.ctimeMs;

                        const referenceTime = completedAt || createdAt;

                        if (now - referenceTime > cleanupThreshold) {
                            // 验证清理条件：只在以下三种情况下清理
                            const cleanupReason = await this.validateCleanupConditions(taskId, metadata);

                            if (cleanupReason) {
                                // 获取目录大小
                                const dirSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
                                totalSize += dirSize;

                                // 删除任务目录
                                await EcsLocalStorageService.deleteTaskDirectory(taskId);
                                cleanedCount++;

                                logger.info({
                                    taskId,
                                    ageMs: now - referenceTime,
                                    sizeBytes: dirSize,
                                    completedAt: metadata.completedAt,
                                    createdAt: metadata.createdAt,
                                    cleanupReason
                                }, 'Cleaned up expired task');
                            } else {
                                logger.debug({
                                    taskId,
                                    ageMs: now - referenceTime
                                }, 'Task directory preserved - cleanup conditions not met');
                            }
                        }
                    } else {
                        // 没有元数据，使用文件系统时间
                        if (now - stats.ctimeMs > cleanupThreshold) {
                            const dirSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
                            totalSize += dirSize;

                            await EcsLocalStorageService.deleteTaskDirectory(taskId);
                            cleanedCount++;

                            logger.info({
                                taskId,
                                ageMs: now - stats.ctimeMs,
                                sizeBytes: dirSize,
                                reason: 'no_metadata'
                            }, 'Cleaned up task without metadata');
                        }
                    }
                } catch (error) {
                    logger.error({
                        taskId,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    }, 'Error cleaning up task');
                }
            }

            if (cleanedCount > 0) {
                logger.info({
                    cleanedCount,
                    totalSizeBytes: totalSize,
                    totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
                }, 'Cleanup cycle completed');
            } else {
                logger.debug('Cleanup cycle completed - no tasks to clean');
            }

        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Cleanup service error');
        } finally {
            // 释放锁（使用Lua脚本确保只释放自己的锁）
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;
            await redis.eval(luaScript, 1, CLEANUP_LOCK_KEY, lockId);
            logger.debug('Cleanup lock released');
        }
    }

    /**
     * 验证清理条件 - jobs目录清理规则：
     * 1. 工具任务正常执行完并生成zip压缩结果，然后2分钟限时完后 -> 精确清理
     * 2. 任务执行超时 -> 5分钟后清理
     * 3. 任务失败（可能由于Worker崩溃）-> 5分钟后清理
     * 4. 队列超时 -> 5分钟后清理
     *
     * 注意：temp和logs目录在任务失败时会保留24小时用于问题分析，
     * 但jobs目录在任务失败后5分钟就会清理（避免容器用户创建的文件占用空间）
     */
    private static async validateCleanupConditions(taskId: string, metadata: any): Promise<string | null> {
        try {
            // 使用全局prisma实例，避免创建新连接
            const task = await prisma.task.findUnique({
                where: { id: taskId },
                select: {
                    status: true,
                    finishedAt: true,
                    timeoutType: true,
                    outputFile: true,
                    createdAt: true,
                    startedAt: true,
                    cleanedAt: true
                }
            });

            if (!task) {
                return 'TASK_NOT_FOUND'; // 任务不存在，可以清理
            }

            // 如果已经清理过，不再清理
            if (task.cleanedAt) {
                return null;
            }

            const now = Date.now();
            const failedTaskCleanupDelay = DeploymentModeService.getFailedTaskCleanupDelay() * 1000; // 转换为毫秒

            // 情况1：任务正常完成且2分钟下载期已过
            // 这种情况由精确清理逻辑处理，不在这里处理
            if (task.status === 'COMPLETED' && task.finishedAt && task.outputFile) {
                const downloadTimeoutMs = DeploymentModeService.getDownloadTimeout() * 1000;
                const timeSinceCompletion = now - task.finishedAt.getTime();

                // 精确清理会处理这种情况，这里只处理超过精确清理窗口的情况
                if (timeSinceCompletion > downloadTimeoutMs + 60000) { // 超过3分钟还没清理，周期性清理来处理
                    return 'DOWNLOAD_TIMEOUT_EXPIRED_LATE';
                }
                return null; // 等待精确清理
            }

            // 情况2：任务执行超时 -> 5分钟后清理
            if (task.status === 'EXECUTION_TIMEOUT' || task.timeoutType === 'EXECUTION_TIMEOUT') {
                if (task.finishedAt) {
                    const timeSinceFailure = now - task.finishedAt.getTime();
                    if (timeSinceFailure > failedTaskCleanupDelay) {
                        return 'EXECUTION_TIMEOUT_CLEANUP';
                    }
                } else if (task.startedAt) {
                    // 如果没有finishedAt但有startedAt，使用startedAt计算
                    const timeSinceStart = now - task.startedAt.getTime();
                    if (timeSinceStart > failedTaskCleanupDelay + 180000) { // 3分钟执行超时 + 5分钟清理延迟
                        return 'EXECUTION_TIMEOUT_CLEANUP';
                    }
                }
                return null; // 等待5分钟清理延迟
            }

            // 情况3：任务失败（可能由于Worker崩溃或容器执行出错）-> 5分钟后清理
            if (task.status === 'FAILED') {
                if (task.finishedAt) {
                    const timeSinceFailure = now - task.finishedAt.getTime();
                    if (timeSinceFailure > failedTaskCleanupDelay) {
                        return 'TASK_FAILED_CLEANUP';
                    }
                } else if (task.createdAt) {
                    // 如果没有finishedAt但有createdAt，使用createdAt计算
                    const timeSinceCreated = now - task.createdAt.getTime();
                    // 失败任务至少保留5分钟
                    if (timeSinceCreated > failedTaskCleanupDelay) {
                        return 'TASK_FAILED_CLEANUP';
                    }
                }
                return null; // 等待5分钟清理延迟
            }

            // 情况4：队列超时 -> 5分钟后清理
            if (task.status === 'QUEUE_TIMEOUT' || task.timeoutType === 'QUEUE_TIMEOUT') {
                if (task.createdAt) {
                    const timeSinceCreated = now - task.createdAt.getTime();
                    if (timeSinceCreated > failedTaskCleanupDelay) {
                        return 'QUEUE_TIMEOUT_CLEANUP';
                    }
                }
                return null;
            }

            // 其他情况不允许清理jobs目录
            return null;

        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to validate cleanup conditions');
            return null;
        }
    }

    /**
     * 清理Excel多页面交互数据（步骤a15）
     */
    private static async cleanupExcelThrpagesData(taskId: string): Promise<void> {
        try {
            logger.info({ taskId }, 'Starting Excel thrpages data cleanup');

            // 清理该任务相关的数据库table_data表格数据
            // 保留sheets表模型和tables表模型
            await ExcelThrpagesService.cleanupTaskData(taskId);

            logger.info({ taskId }, 'Excel thrpages data cleanup completed');
        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Error cleaning up Excel thrpages data');
            // 不抛出错误，避免影响其他清理步骤
        }
    }

    /**
     * 手动清理指定任务
     */
    static async cleanupTask(taskId: string): Promise<boolean> {
        try {
            const taskDir = ECS_LOCAL_PATHS.getTaskDir(taskId);

            if (!fs.existsSync(taskDir)) {
                logger.warn({ taskId }, 'Task directory does not exist for manual cleanup');
                return false;
            }

            const dirSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
            await EcsLocalStorageService.deleteTaskDirectory(taskId);

            // 同时清理Excel数据
            await this.cleanupExcelThrpagesData(taskId);

            logger.info({
                taskId,
                sizeBytes: dirSize,
                sizeMB: Math.round(dirSize / 1024 / 1024 * 100) / 100
            }, 'Manually cleaned up task');

            return true;
        } catch (error) {
            logger.error({
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Error manually cleaning up task');
            return false;
        }
    }

    /**
     * 清理失败/出错任务的所有目录（统一入口）
     * 根据需求：失败任务的jobs目录5分钟清理，temp/logs保留24小时
     * 为了工具独立性，此方法由各工具（SDC/UPF）自行调用
     *
     * @param taskId 任务ID
     * @param toolType 工具类型 ('sdc' | 'upf')
     * @param cleanupMode 清理模式
     *   - 'all': 清理所有目录（jobs + temp + logs）- 用户主动删除时
     *   - 'jobs_only': 仅清理jobs目录 - 失败任务5分钟后自动清理
     *   - 'temp_logs': 仅清理temp和logs - 24小时后由定时任务清理
     */
    static async cleanupFailedTask(
        taskId: string,
        toolType: 'sdc' | 'upf',
        cleanupMode: 'all' | 'jobs_only' | 'temp_logs' = 'all'
    ): Promise<{ success: boolean; reason: string; cleanedDirectories: string[] }> {
        const cleanedDirectories: string[] = [];
        const now = new Date();

        logger.info({
            taskId,
            toolType,
            cleanupMode
        }, `[AUDIT][${toolType.toUpperCase()}] Starting failed task cleanup`);

        try {
            // 获取任务信息
            const task = await prisma.task.findUnique({
                where: { id: taskId },
                select: { status: true, finishedAt: true }
            });

            if (!task) {
                return { success: false, reason: 'TASK_NOT_FOUND', cleanedDirectories };
            }

            // 根据清理模式执行不同的清理操作
            if (cleanupMode === 'all' || cleanupMode === 'jobs_only') {
                // 1. 清理jobs目录（使用rm -rf）
                const jobsDir = ECS_LOCAL_PATHS.getTaskDir(taskId);
                if (fs.existsSync(jobsDir)) {
                    const jobsSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
                    await EcsLocalStorageService.deleteTaskDirectory(taskId);
                    cleanedDirectories.push('jobs');
                    logger.info({
                        taskId,
                        toolType,
                        sizeBytes: jobsSize,
                        reason: 'Failed task jobs cleanup (rm -rf)'
                    }, `[AUDIT][${toolType.toUpperCase()}] Jobs directory cleaned up (rm -rf)`);
                }
            }

            if (cleanupMode === 'all' || cleanupMode === 'temp_logs') {
                // 2. 清理temp目录
                const tempDir = path.join(process.env.TEMP_UPLOAD_DIR || path.join(process.cwd(), 'temp'), taskId);
                if (fs.existsSync(tempDir)) {
                    const tempSize = await this.getDirectorySize(tempDir);
                    await fs.promises.rm(tempDir, { recursive: true, force: true });
                    cleanedDirectories.push('temp');
                    logger.info({
                        taskId,
                        toolType,
                        sizeBytes: tempSize,
                        reason: 'Failed task temp cleanup'
                    }, `[AUDIT][${toolType.toUpperCase()}] Temp directory cleaned up`);
                }

                // 3. 清理logs目录（注意：失败任务通常保留24小时，此操作由定时任务执行）
                const logsDir = TASK_LOG_PATHS.getTaskLogDir(taskId);
                if (fs.existsSync(logsDir)) {
                    const logsSize = await this.getDirectorySize(logsDir);
                    await fs.promises.rm(logsDir, { recursive: true, force: true });
                    cleanedDirectories.push('logs');
                    logger.info({
                        taskId,
                        toolType,
                        sizeBytes: logsSize,
                        reason: 'Failed task logs cleanup'
                    }, `[AUDIT][${toolType.toUpperCase()}] Logs directory cleaned up`);
                }
            }

            // 4. 清理Excel多页面交互数据
            await this.cleanupExcelThrpagesData(taskId);
            cleanedDirectories.push('excel_data');

            // 5. 更新任务的cleanedAt时间戳
            await prisma.task.update({
                where: { id: taskId },
                data: { cleanedAt: now }
            });

            logger.info({
                taskId,
                toolType,
                cleanupMode,
                cleanedDirectories,
                reason: `${toolType.toUpperCase()} failed task cleanup completed`
            }, `[AUDIT][${toolType.toUpperCase()}] Failed task cleanup completed successfully`);

            return { success: true, reason: 'CLEANUP_COMPLETED', cleanedDirectories };

        } catch (error) {
            logger.error({
                taskId,
                toolType,
                cleanupMode,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, `[AUDIT][${toolType.toUpperCase()}] Failed to cleanup task`);

            return {
                success: false,
                reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
                cleanedDirectories
            };
        }
    }

    /**
     * 获取清理统计信息
     */
    static async getCleanupStats(): Promise<{
        totalTasks: number;
        expiredTasks: number;
        totalSize: number;
        expiredSize: number;
    }> {
        const jobsDir = ECS_LOCAL_PATHS.JOBS;
        
        if (!fs.existsSync(jobsDir)) {
            return { totalTasks: 0, expiredTasks: 0, totalSize: 0, expiredSize: 0 };
        }

        const taskDirs = await fs.promises.readdir(jobsDir);
        const now = Date.now();
        const cleanupThreshold = DeploymentModeService.getCleanupInterval() * 1000;
        
        let totalTasks = 0;
        let expiredTasks = 0;
        let totalSize = 0;
        let expiredSize = 0;

        for (const taskId of taskDirs) {
            try {
                const taskDir = path.join(jobsDir, taskId);
                const stats = await fs.promises.stat(taskDir);

                if (!stats.isDirectory()) {
                    continue;
                }

                totalTasks++;
                const dirSize = await EcsLocalStorageService.getTaskDirectorySize(taskId);
                totalSize += dirSize;

                const metadata = await EcsLocalStorageService.getTaskMetadata(taskId);
                const completedAt = metadata?.completedAt ? new Date(metadata.completedAt).getTime() : null;
                const createdAt = metadata?.createdAt ? new Date(metadata.createdAt).getTime() : stats.ctimeMs;
                const referenceTime = completedAt || createdAt;

                if (now - referenceTime > cleanupThreshold) {
                    expiredTasks++;
                    expiredSize += dirSize;
                }
            } catch (error) {
                logger.error({
                    taskId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }, 'Error calculating cleanup stats for task');
            }
        }

        return { totalTasks, expiredTasks, totalSize, expiredSize };
    }

    /**
     * 强制清理所有过期任务
     */
    static async forceCleanupExpiredTasks(): Promise<number> {
        logger.info('Starting force cleanup of expired tasks');
        
        const statsBefore = await this.getCleanupStats();
        await this.performCleanup();
        const statsAfter = await this.getCleanupStats();

        const cleanedCount = statsBefore.totalTasks - statsAfter.totalTasks;
        
        logger.info({
            cleanedCount,
            beforeTotal: statsBefore.totalTasks,
            afterTotal: statsAfter.totalTasks,
            freedBytes: statsBefore.totalSize - statsAfter.totalSize
        }, 'Force cleanup completed');

        return cleanedCount;
    }

    /**
     * 检查清理服务状态
     */
    static getServiceStatus(): {
        isRunning: boolean;
        intervalMs: number;
        cleanupThresholdMs: number;
        deploymentMode: string;
    } {
        return {
            isRunning: this.cleanupInterval !== null,
            intervalMs: DeploymentModeService.getCleanupInterval() * 1000,
            cleanupThresholdMs: DeploymentModeService.getCleanupInterval() * 1000,
            deploymentMode: DeploymentModeService.getDeploymentMode()
        };
    }
}
