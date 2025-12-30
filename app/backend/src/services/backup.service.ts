import { exec } from 'child_process';
import { promisify } from 'util';
import { Redis } from 'ioredis';
import logger from '../config/logger';
import { getOssClient } from '../utils/oss';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../utils/database';

const execAsync = promisify(exec);

/**
 * 数据备份和灾难恢复服务
 */
export class BackupService {
  private redis: Redis;
  private backupConfig = {
    // 备份保留策略
    retention: {
      daily: 7,    // 保留7天的每日备份
      weekly: 4,   // 保留4周的每周备份
      monthly: 12  // 保留12个月的月度备份
    },
    // 备份存储路径 - 优先使用环境变量配置
    localBackupDir: process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), '..', '..', 'backups'),
    ossBackupBucket: process.env.OSS_BACKUP_BUCKET || 'chipcore-backups',
    // 数据库配置
    dbConfig: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      database: process.env.DB_NAME || 'chipcore_dev',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    }
  };

  constructor(redis: Redis) {
    this.redis = redis;

    // 记录备份目录配置信息
    logger.info({
      configuredDir: process.env.BACKUP_LOCAL_DIR,
      actualDir: this.backupConfig.localBackupDir,
      isCustomPath: !!process.env.BACKUP_LOCAL_DIR
    }, 'Backup service configuration');

    this.ensureBackupDirectory();
  }

  /**
   * 确保备份目录存在
   */
  private ensureBackupDirectory(): void {
    try {
      if (!fs.existsSync(this.backupConfig.localBackupDir)) {
        fs.mkdirSync(this.backupConfig.localBackupDir, { recursive: true });
        logger.info({
          dir: this.backupConfig.localBackupDir,
          source: process.env.BACKUP_LOCAL_DIR ? 'environment variable' : 'default fallback'
        }, 'Backup directory created successfully');
      } else {
        logger.info({
          dir: this.backupConfig.localBackupDir,
          source: process.env.BACKUP_LOCAL_DIR ? 'environment variable' : 'default fallback'
        }, 'Backup directory already exists');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        dir: this.backupConfig.localBackupDir
      }, 'Failed to create backup directory');
      throw error;
    }
  }

  /**
   * 执行完整数据备份
   */
  public async performFullBackup(): Promise<{
    success: boolean;
    backupId: string;
    files: string[];
    size: number;
    duration: number;
  }> {
    const startTime = Date.now();
    const backupId = `full_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const backupFiles: string[] = [];

    logger.info({ backupId }, 'Starting full backup');

    try {
      // 1. 备份PostgreSQL数据库
      const dbBackupFile = await this.backupDatabase(backupId);
      backupFiles.push(dbBackupFile);

      // 2. 备份Redis数据
      const redisBackupFile = await this.backupRedis(backupId);
      backupFiles.push(redisBackupFile);

      // 3. 备份OSS关键数据索引
      const ossIndexFile = await this.backupOssIndex(backupId);
      backupFiles.push(ossIndexFile);

      // 4. 创建备份清单
      const manifestFile = await this.createBackupManifest(backupId, backupFiles);
      backupFiles.push(manifestFile);

      // 5. 计算总大小
      const totalSize = backupFiles.reduce((sum, file) => {
        try {
          return sum + fs.statSync(file).size;
        } catch {
          return sum;
        }
      }, 0);

      // 6. 上传到OSS
      await this.uploadBackupToOss(backupId, backupFiles);

      // 7. 验证备份完整性
      await this.verifyBackup(backupId, backupFiles);

      // 8. 清理本地文件（可选）
      if (process.env.BACKUP_CLEANUP_LOCAL === 'true') {
        await this.cleanupLocalBackup(backupFiles);
      }

      const duration = Date.now() - startTime;

      logger.info({
        backupId,
        filesCount: backupFiles.length,
        totalSize,
        duration
      }, 'Full backup completed successfully');

      return {
        success: true,
        backupId,
        files: backupFiles,
        size: totalSize,
        duration
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId,
        duration: Date.now() - startTime
      }, 'Full backup failed');

      // 清理失败的备份文件
      await this.cleanupLocalBackup(backupFiles);

      return {
        success: false,
        backupId,
        files: [],
        size: 0,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 备份PostgreSQL数据库
   */
  private async backupDatabase(backupId: string): Promise<string> {
    const filename = `${backupId}_database.sql`;
    const filepath = path.join(this.backupConfig.localBackupDir, filename);

    const pgDumpCommand = `pg_dump "${process.env.DATABASE_URL}" > "${filepath}"`;

    try {
      await execAsync(pgDumpCommand);
      
      // 验证备份文件是否创建且不为空
      const stats = fs.statSync(filepath);
      if (stats.size === 0) {
        throw new Error('Database backup file is empty');
      }

      logger.info({
        backupId,
        filename,
        size: stats.size
      }, 'Database backup completed');

      return filepath;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId,
        command: pgDumpCommand
      }, 'Database backup failed');
      throw error;
    }
  }

  /**
   * 备份Redis数据
   */
  private async backupRedis(backupId: string): Promise<string> {
    const filename = `${backupId}_redis.json`;
    const filepath = path.join(this.backupConfig.localBackupDir, filename);

    try {
      // 获取所有Redis键值对
      const keys = await this.redis.keys('*');
      const redisData: Record<string, any> = {};

      for (const key of keys) {
        const type = await this.redis.type(key);
        
        switch (type) {
          case 'string':
            redisData[key] = await this.redis.get(key);
            break;
          case 'list':
            redisData[key] = await this.redis.lrange(key, 0, -1);
            break;
          case 'set':
            redisData[key] = await this.redis.smembers(key);
            break;
          case 'hash':
            redisData[key] = await this.redis.hgetall(key);
            break;
          case 'zset':
            redisData[key] = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
            break;
        }
      }

      // 写入文件
      fs.writeFileSync(filepath, JSON.stringify(redisData, null, 2));

      const stats = fs.statSync(filepath);
      logger.info({
        backupId,
        filename,
        keysCount: keys.length,
        size: stats.size
      }, 'Redis backup completed');

      return filepath;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId
      }, 'Redis backup failed');
      throw error;
    }
  }

  /**
   * 备份OSS数据索引
   */
  private async backupOssIndex(backupId: string): Promise<string> {
    const filename = `${backupId}_oss_index.json`;
    const filepath = path.join(this.backupConfig.localBackupDir, filename);

    try {
      // 从数据库获取所有文件路径信息
      const tasks = await prisma.task.findMany({
        select: {
          id: true,
          userId: true,
          inputFile: true,
          outputFile: true,
          logFile: true,
          createdAt: true
        }
      });

      const ossIndex = {
        timestamp: new Date().toISOString(),
        totalTasks: tasks.length,
        tasks: tasks.map(task => ({
          taskId: task.id,
          userId: task.userId,
          files: {
            input: task.inputFile,
            output: task.outputFile,
            log: task.logFile
          },
          createdAt: task.createdAt.toISOString()
        }))
      };

      fs.writeFileSync(filepath, JSON.stringify(ossIndex, null, 2));

      const stats = fs.statSync(filepath);
      logger.info({
        backupId,
        filename,
        tasksCount: tasks.length,
        size: stats.size
      }, 'OSS index backup completed');

      return filepath;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId
      }, 'OSS index backup failed');
      throw error;
    }
  }

  /**
   * 创建备份清单
   */
  private async createBackupManifest(backupId: string, files: string[]): Promise<string> {
    const filename = `${backupId}_manifest.json`;
    const filepath = path.join(this.backupConfig.localBackupDir, filename);

    const filesWithChecksum = await Promise.all(
      files.map(async (file) => ({
        name: path.basename(file),
        path: file,
        size: fs.statSync(file).size,
        checksum: await this.calculateFileChecksum(file)
      }))
    );

    const manifest = {
      backupId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      files: filesWithChecksum,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        hostname: process.env.HOSTNAME || 'unknown'
      }
    };

    fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2));

    logger.info({
      backupId,
      filename,
      filesCount: files.length
    }, 'Backup manifest created');

    return filepath;
  }

  /**
   * 计算文件校验和
   */
  private calculateFileChecksum(filepath: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filepath);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * 上传备份到OSS
   */
  private async uploadBackupToOss(backupId: string, files: string[]): Promise<void> {
    try {
      const ossClient = getOssClient(this.backupConfig.ossBackupBucket);
      
      for (const file of files) {
        const filename = path.basename(file);
        const ossKey = `${backupId}/${filename}`;
        
        await ossClient.put(ossKey, fs.createReadStream(file));
        
        logger.info({
          backupId,
          filename,
          ossKey
        }, 'File uploaded to OSS');
      }

      logger.info({
        backupId,
        filesCount: files.length
      }, 'All backup files uploaded to OSS');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId
      }, 'Failed to upload backup to OSS');
      throw error;
    }
  }

  /**
   * 验证备份完整性
   */
  private async verifyBackup(backupId: string, files: string[]): Promise<void> {
    try {
      // 验证所有文件存在且不为空
      for (const file of files) {
        const stats = fs.statSync(file);
        if (stats.size === 0) {
          throw new Error(`Backup file ${file} is empty`);
        }
      }

      // 验证数据库备份可以被解析
      const dbBackupFile = files.find(f => f.includes('_database.sql'));
      if (dbBackupFile) {
        const content = fs.readFileSync(dbBackupFile, 'utf8');
        if (!content.includes('PostgreSQL database dump')) {
          throw new Error('Database backup file appears to be corrupted');
        }
      }

      logger.info({ backupId }, 'Backup verification completed successfully');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        backupId
      }, 'Backup verification failed');
      throw error;
    }
  }

  /**
   * 清理本地备份文件
   */
  private async cleanupLocalBackup(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          logger.info({ file }, 'Local backup file cleaned up');
        }
      } catch (error) {
        logger.warn({
          error: error instanceof Error ? error.message : 'Unknown error',
          file
        }, 'Failed to cleanup local backup file');
      }
    }
  }

  /**
   * 获取备份历史
   */
  public async getBackupHistory(): Promise<any[]> {
    try {
      const ossClient = getOssClient(this.backupConfig.ossBackupBucket);
      const result = await ossClient.list({
        prefix: 'full_',
        delimiter: '/'
      });

      const backups = result.prefixes?.map(prefix => {
        const backupId = prefix.replace('/', '');
        const timestamp = backupId.replace('full_', '').replace(/-/g, ':');
        return {
          backupId,
          timestamp,
          path: prefix
        };
      }) || [];

      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    } catch (error) {
      logger.error({ error }, 'Failed to get backup history');
      return [];
    }
  }

  /**
   * 启动定期备份任务
   */
  public startScheduledBackups(): void {
    // 每天凌晨2点执行备份
    const scheduleBackup = () => {
      const now = new Date();
      const nextBackup = new Date();
      nextBackup.setHours(2, 0, 0, 0);
      
      if (nextBackup <= now) {
        nextBackup.setDate(nextBackup.getDate() + 1);
      }

      const timeUntilBackup = nextBackup.getTime() - now.getTime();

      setTimeout(async () => {
        logger.info('Starting scheduled backup');
        await this.performFullBackup();
        scheduleBackup(); // 安排下一次备份
      }, timeUntilBackup);

      logger.info({
        nextBackup: nextBackup.toISOString(),
        timeUntilBackup: Math.round(timeUntilBackup / 1000 / 60)
      }, 'Next backup scheduled');
    };

    scheduleBackup();
  }
}

// 单例实例
let backupService: BackupService | null = null;

export const initializeBackupService = (redis: Redis): BackupService => {
  if (!backupService) {
    backupService = new BackupService(redis);
    logger.info('Backup service initialized');
  }
  return backupService;
};

export const getBackupService = (): BackupService | null => {
  return backupService;
};
