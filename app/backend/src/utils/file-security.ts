import path from 'path';
import logger from '../config/logger';

const ALLOWED_EXTENSIONS = ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls', '.json', '.csv'];
const MAX_FILE_NAME_LENGTH = 255;

export interface SanitizedFileInfo {
  safeName: string;
  originalName: string;
  extension: string;
}

/**
 * 验证并清理文件名，防止路径遍历攻击
 */
export function sanitizeFileName(fileName: string): SanitizedFileInfo {
  // 1. 基本验证
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid file name');
  }

  // 2. 移除路径分隔符（防止路径遍历）
  const sanitized = fileName.replace(/[\\/]/g, '');

  // 3. 验证长度
  if (sanitized.length > MAX_FILE_NAME_LENGTH || sanitized.length === 0) {
    throw new Error('File name too long or empty');
  }

  // 4. 只允许安全字符（字母、数字、下划线、连字符、点）
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new Error('File name contains invalid characters');
  }

  // 5. 防止保留文件名（Windows）
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];
  const nameWithoutExt = sanitized.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    throw new Error('Reserved file name not allowed');
  }

  // 6. 验证文件扩展名
  const ext = path.extname(sanitized).toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`File extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  // 7. 防止点文件（隐藏文件）
  if (sanitized.startsWith('.')) {
    throw new Error('Hidden files not allowed');
  }

  return {
    safeName: sanitized,
    originalName: fileName,
    extension: ext
  };
}

/**
 * 生成安全的文件路径（防止路径遍历）
 */
export function generateSafeFilePath(
  baseDir: string,
  fileName: string
): string {
  const { safeName } = sanitizeFileName(fileName);

  // 使用path.join自动处理路径拼接
  const fullPath = path.join(baseDir, safeName);

  // 确保路径在baseDir内（防止路径遍历）
  const resolvedPath = path.resolve(fullPath);
  const resolvedBaseDir = path.resolve(baseDir);

  if (!resolvedPath.startsWith(resolvedBaseDir)) {
    logger.error({
      fileName,
      safeName,
      resolvedPath,
      resolvedBaseDir
    }, 'Path traversal attempt detected');
    throw new Error('Attempted path traversal attack');
  }

  return fullPath;
}
