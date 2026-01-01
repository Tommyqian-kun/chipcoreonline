import * as fs from 'fs';
import * as path from 'path';
import logger from '../config/logger';

/**
 * 文件系统锁服务
 * 解决多Worker并发操作文件系统的安全问题
 */
export class FileSystemLockService {
  private static locks = new Map<string, Promise<void>>();

  /**
   * 文件操作加锁
   */
  public static async withLock<T>(
    lockKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // 如果已有锁，等待完成
    if (this.locks.has(lockKey)) {
      await this.locks.get(lockKey);
    }

    // 创建新锁
    const lockPromise = this.executeWithLock(operation);
    this.locks.set(lockKey, lockPromise.then(() => {}, () => {}));

    try {
      return await lockPromise;
    } finally {
      this.locks.delete(lockKey);
    }
  }

  private static async executeWithLock<T>(operation: () => Promise<T>): Promise<T> {
    return await operation();
  }

  /**
   * 安全创建目录
   */
  public static async safeCreateDirectory(dirPath: string): Promise<void> {
    return this.withLock(`create_dir_${dirPath}`, async () => {
      try {
        if (!fs.existsSync(dirPath)) {
          await fs.promises.mkdir(dirPath, { recursive: true });
          logger.debug({ dirPath }, 'Directory created safely');
        } else {
          logger.debug({ dirPath }, 'Directory already exists');
        }
      } catch (error) {
        logger.error({
          dirPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to create directory safely');
        throw error;
      }
    });
  }

  /**
   * 安全删除目录
   */
  public static async safeRemoveDirectory(dirPath: string): Promise<void> {
    return this.withLock(`remove_dir_${dirPath}`, async () => {
      try {
        if (fs.existsSync(dirPath)) {
          await fs.promises.rmdir(dirPath, { recursive: true });
          logger.debug({ dirPath }, 'Directory removed safely');
        } else {
          logger.debug({ dirPath }, 'Directory does not exist');
        }
      } catch (error) {
        logger.error({
          dirPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to remove directory safely');
        throw error;
      }
    });
  }

  /**
   * 安全复制文件
   */
  public static async safeCopyFile(srcPath: string, destPath: string): Promise<void> {
    const lockKey = `copy_file_${srcPath}_to_${destPath}`;
    return this.withLock(lockKey, async () => {
      try {
        // 确保目标目录存在
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          await fs.promises.mkdir(destDir, { recursive: true });
        }

        await fs.promises.copyFile(srcPath, destPath);
        logger.debug({ srcPath, destPath }, 'File copied safely');
      } catch (error) {
        logger.error({
          srcPath,
          destPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to copy file safely');
        throw error;
      }
    });
  }

  /**
   * 安全移动文件
   */
  public static async safeMoveFile(srcPath: string, destPath: string): Promise<void> {
    const lockKey = `move_file_${srcPath}_to_${destPath}`;
    return this.withLock(lockKey, async () => {
      try {
        // 确保目标目录存在
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          await fs.promises.mkdir(destDir, { recursive: true });
        }

        await fs.promises.rename(srcPath, destPath);
        logger.debug({ srcPath, destPath }, 'File moved safely');
      } catch (error) {
        logger.error({
          srcPath,
          destPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to move file safely');
        throw error;
      }
    });
  }

  /**
   * 检查磁盘空间
   */
  public static async checkDiskSpace(checkPath: string, requiredSpaceGB: number): Promise<boolean> {
    try {
      const stats = await fs.promises.statfs(checkPath);
      const freeSpaceGB = (stats.bavail * (stats as any).frsize) / (1024 ** 3);
      
      const hasEnoughSpace = freeSpaceGB >= requiredSpaceGB;
      
      logger.debug({
        checkPath,
        freeSpaceGB: freeSpaceGB.toFixed(2),
        requiredSpaceGB,
        hasEnoughSpace
      }, 'Disk space check completed');
      
      return hasEnoughSpace;
    } catch (error) {
      logger.error({
        checkPath,
        requiredSpaceGB,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check disk space');
      return false;
    }
  }

  /**
   * 获取目录大小
   */
  public static async getDirectorySize(dirPath: string): Promise<number> {
    return this.withLock(`get_size_${dirPath}`, async () => {
      try {
        let totalSize = 0;

        const calculateSize = async (currentPath: string): Promise<void> => {
          const stats = await fs.promises.stat(currentPath);
          
          if (stats.isFile()) {
            totalSize += stats.size;
          } else if (stats.isDirectory()) {
            const files = await fs.promises.readdir(currentPath);
            for (const file of files) {
              await calculateSize(path.join(currentPath, file));
            }
          }
        };

        if (fs.existsSync(dirPath)) {
          await calculateSize(dirPath);
        }

        logger.debug({
          dirPath,
          totalSizeBytes: totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        }, 'Directory size calculated');

        return totalSize;
      } catch (error) {
        logger.error({
          dirPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to calculate directory size');
        return 0;
      }
    });
  }

  /**
   * 清理过期文件
   */
  public static async cleanupExpiredFiles(
    dirPath: string, 
    maxAgeHours: number
  ): Promise<{ deletedFiles: number; freedSpaceBytes: number }> {
    return this.withLock(`cleanup_${dirPath}`, async () => {
      try {
        let deletedFiles = 0;
        let freedSpaceBytes = 0;
        const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

        const cleanupRecursive = async (currentPath: string): Promise<void> => {
          if (!fs.existsSync(currentPath)) return;

          const items = await fs.promises.readdir(currentPath);
          
          for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const stats = await fs.promises.stat(itemPath);
            
            if (stats.isFile()) {
              if (stats.mtime.getTime() < cutoffTime) {
                freedSpaceBytes += stats.size;
                await fs.promises.unlink(itemPath);
                deletedFiles++;
                logger.debug({ itemPath, age: stats.mtime }, 'Expired file deleted');
              }
            } else if (stats.isDirectory()) {
              await cleanupRecursive(itemPath);
              
              // 检查目录是否为空，如果为空则删除
              const remainingItems = await fs.promises.readdir(itemPath);
              if (remainingItems.length === 0) {
                await fs.promises.rmdir(itemPath);
                logger.debug({ itemPath }, 'Empty directory removed');
              }
            }
          }
        };

        await cleanupRecursive(dirPath);

        logger.info({
          dirPath,
          maxAgeHours,
          deletedFiles,
          freedSpaceMB: (freedSpaceBytes / (1024 * 1024)).toFixed(2)
        }, 'Expired files cleanup completed');

        return { deletedFiles, freedSpaceBytes };
      } catch (error) {
        logger.error({
          dirPath,
          maxAgeHours,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to cleanup expired files');
        return { deletedFiles: 0, freedSpaceBytes: 0 };
      }
    });
  }

  /**
   * 获取锁状态信息
   */
  public static getLockStatus(): {
    activeLocks: number;
    lockKeys: string[];
  } {
    return {
      activeLocks: this.locks.size,
      lockKeys: Array.from(this.locks.keys())
    };
  }
}
