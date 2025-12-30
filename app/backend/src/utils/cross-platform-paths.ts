/**
 * 跨平台路径处理工具
 * 确保在Windows和Linux环境下路径处理的一致性
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

export class CrossPlatformPaths {
  /**
   * 规范化路径，确保跨平台兼容性
   */
  static normalize(inputPath: string): string {
    return path.normalize(inputPath);
  }

  /**
   * 安全地连接路径组件
   */
  static join(...pathComponents: string[]): string {
    return path.join(...pathComponents);
  }

  /**
   * 获取绝对路径
   */
  static resolve(...pathComponents: string[]): string {
    return path.resolve(...pathComponents);
  }

  /**
   * 检查路径是否为绝对路径
   */
  static isAbsolute(inputPath: string): boolean {
    return path.isAbsolute(inputPath);
  }

  /**
   * 确保路径为绝对路径，如果不是则相对于工作目录解析
   */
  static ensureAbsolute(inputPath: string, basePath?: string): string {
    if (this.isAbsolute(inputPath)) {
      return this.normalize(inputPath);
    }
    
    const base = basePath || process.cwd();
    return this.resolve(base, inputPath);
  }

  /**
   * 创建目录，支持递归创建
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    const normalizedPath = this.normalize(dirPath);
    
    try {
      await fs.promises.mkdir(normalizedPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${normalizedPath}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * 同步创建目录
   */
  static ensureDirectorySync(dirPath: string): void {
    const normalizedPath = this.normalize(dirPath);
    
    try {
      fs.mkdirSync(normalizedPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${normalizedPath}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * 检查路径是否存在
   */
  static exists(inputPath: string): boolean {
    return fs.existsSync(this.normalize(inputPath));
  }

  /**
   * 获取相对路径
   */
  static relative(from: string, to: string): string {
    return path.relative(this.normalize(from), this.normalize(to));
  }

  /**
   * 获取路径的目录部分
   */
  static dirname(inputPath: string): string {
    return path.dirname(this.normalize(inputPath));
  }

  /**
   * 获取路径的文件名部分
   */
  static basename(inputPath: string, ext?: string): string {
    return path.basename(this.normalize(inputPath), ext);
  }

  /**
   * 获取文件扩展名
   */
  static extname(inputPath: string): string {
    return path.extname(this.normalize(inputPath));
  }

  /**
   * 转换路径分隔符为当前平台格式
   */
  static toPlatformPath(inputPath: string): string {
    if (os.platform() === 'win32') {
      return inputPath.replace(/\//g, '\\');
    } else {
      return inputPath.replace(/\\/g, '/');
    }
  }

  /**
   * 转换为Unix风格路径（用于Docker挂载等）
   */
  static toUnixPath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
  }

  /**
   * 验证路径安全性（防止路径遍历攻击）
   */
  static isSafePath(inputPath: string, basePath: string): boolean {
    const normalizedInput = this.normalize(inputPath);
    const normalizedBase = this.normalize(basePath);
    const resolvedPath = this.resolve(normalizedBase, normalizedInput);
    
    return resolvedPath.startsWith(normalizedBase);
  }

  /**
   * 获取平台信息
   */
  static getPlatformInfo(): {
    platform: string;
    arch: string;
    separator: string;
    delimiter: string;
  } {
    return {
      platform: os.platform(),
      arch: os.arch(),
      separator: path.sep,
      delimiter: path.delimiter
    };
  }

  /**
   * 为Docker容器准备挂载路径
   */
  static prepareDockerMountPath(hostPath: string): {
    hostPath: string;
    isValid: boolean;
    error?: string;
  } {
    try {
      const normalizedPath = this.normalize(hostPath);
      
      if (!this.isAbsolute(normalizedPath)) {
        return {
          hostPath: normalizedPath,
          isValid: false,
          error: 'Docker mount path must be absolute'
        };
      }

      return {
        hostPath: normalizedPath,
        isValid: true
      };
    } catch (error) {
      return {
        hostPath: hostPath,
        isValid: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * 构建任务目录路径
   */
  static buildTaskPath(basePath: string, taskId: string, ...subPaths: string[]): string {
    return this.join(basePath, taskId, ...subPaths);
  }

  /**
   * 构建工具特定路径
   */
  static buildToolPath(
    basePath: string,
    taskId: string,
    moduleName: string,
    toolType: string,
    ...subPaths: string[]
  ): string {
    return this.join(basePath, taskId, 'work', moduleName, toolType, ...subPaths);
  }

  /**
   * 验证并规范化环境变量路径
   */
  static validateEnvPath(envVarName: string, defaultPath: string): string {
    const envPath = process.env[envVarName];
    
    if (!envPath) {
      return this.normalize(defaultPath);
    }

    const normalizedPath = this.normalize(envPath);
    
    if (!this.isAbsolute(normalizedPath)) {
      console.warn(`Warning: Environment variable ${envVarName} contains relative path: ${envPath}`);
      return this.resolve(process.cwd(), normalizedPath);
    }

    return normalizedPath;
  }
}

// 导出便捷函数
export const {
  normalize,
  join,
  resolve,
  isAbsolute,
  ensureAbsolute,
  ensureDirectory,
  ensureDirectorySync,
  exists,
  relative,
  dirname,
  basename,
  extname,
  toPlatformPath,
  toUnixPath,
  isSafePath,
  getPlatformInfo,
  prepareDockerMountPath,
  buildTaskPath,
  buildToolPath,
  validateEnvPath
} = CrossPlatformPaths;
