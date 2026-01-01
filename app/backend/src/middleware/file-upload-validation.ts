import { Request, Response, NextFunction } from 'express';
import path from 'path';
import logger from '../config/logger';

/**
 * 芯片设计工具支持的文件类型
 * 基于实际生产场景：SDC和UPF工具使用
 */
const ALLOWED_FILE_EXTENSIONS = [
  // 硬件描述语言
  '.v',   // Verilog
  '.sv',  // SystemVerilog
  '.vh',  // Verilog header
  '.vhd', // VHDL
  '.vhdl', // VHDL alternate
  '.svh', // SystemVerilog header

  // 配置文件（工具需要）
  '.yaml',
  '.yml',

  // TCL脚本（工具执行需要）
  '.tcl',

  // Excel文件（多页面交互使用）
  '.xlsx',
  '.xls',

  // 文本文件（日志、报告）
  '.txt',
  '.log',
  '.rpt'
];

/**
 * 危险文件扩展名（严格禁止）
 * 这些文件类型可能包含恶意代码
 */
const DANGEROUS_EXTENSIONS = [
  // 可执行文件
  '.exe', '.dll', '.so', '.dylib', '.app', '.bin', '.o', '.a', '.lib',

  // 脚本文件（可能包含恶意代码）
  '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx',
  '.php', '.phtml', '.phar',
  '.asp', '.aspx', '.jsp',
  '.py', '.pl', '.rb', '.go', '.rs',
  '.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh', '.bat', '.cmd', '.ps1', '.vbs',

  // Web文件（可能包含XSS）
  '.html', '.htm', '.css',

  // 其他危险类型
  '.jar', '.war', '.class'
];

/**
 * 文件大小限制（100MB - 足够处理大型设计文件）
 */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * 验证单个文件
 *
 * @param file Multer文件对象
 * @param fieldName 字段名（用于提供更友好的错误信息）
 * @returns 验证结果
 */
function validateFile(file: Express.Multer.File, fieldName?: string): { valid: boolean; error?: string } {
  // 1. 检查文件名
  if (!file.originalname || file.originalname.trim() === '') {
    return {
      valid: false,
      error: fieldName ? `${fieldName}: 文件名为空` : '文件名为空'
    };
  }

  // 2. 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: fieldName
        ? `${fieldName}: 文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`
        : `文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`
    };
  }

  // 3. 获取文件扩展名
  const ext = path.extname(file.originalname).toLowerCase();

  // 4. 检查危险扩展名（安全第一）
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: fieldName
        ? `${fieldName}: 禁止上传 ${ext} 文件类型`
        : `禁止上传 ${ext} 文件类型`
    };
  }

  // 5. 检查允许的扩展名
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: fieldName
        ? `${fieldName}: 不支持的文件类型 ${ext}`
        : `不支持的文件类型 ${ext}。允许的类型: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`
    };
  }

  // 6. MIME类型检查（宽松策略）
  // 允许text/*和application/octet-stream
  // 芯片设计文件可能被识别为各种MIME类型，所以不做严格限制
  const mimeType = file.mimetype.toLowerCase();
  if (mimeType && !mimeType.startsWith('text/') && mimeType !== 'application/octet-stream' && mimeType !== 'application/json' && mimeType !== 'application/xml') {
    // 只记录警告，不拒绝文件（因为某些工具可能生成特殊的MIME类型）
    logger.debug({
      fileName: file.originalname,
      mimeType: file.mimetype
    }, 'Unusual MIME type detected, but allowing for compatibility');
  }

  return { valid: true };
}

/**
 * 字段名到友好名称的映射
 */
const FIELD_NAME_MAP: Record<string, string> = {
  'hierYamlFile': 'hier.yaml文件',
  'vlogFile': 'vlog.v文件',
  'pvlogFile': 'pvlog.v文件',
  'pobjTclFile': 'pobj.tcl文件',
  'pcellYamlFile': 'pcell.yaml文件'
};

/**
 * 文件上传验证中间件
 *
 * 使用场景：
 * - 在multer文件上传之后使用
 * - 验证文件类型、大小、安全性
 * - 支持SDC和UPF工具的文件上传
 *
 * 使用示例：
 * router.post('/upload',
 *   upload.fields([...]),
 *   validateUploadFiles,
 *   controller
 * );
 */
export const validateUploadFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 获取上传的文件（支持单文件和多文件）
  const files: Array<{ file: Express.Multer.File; fieldName?: string }> = [];

  // 处理req.files（可能是对象或数组）
  if (req.files) {
    if (Array.isArray(req.files)) {
      // 单个字段的多文件
      files.push(...req.files.map(f => ({ file: f })));
    } else if (typeof req.files === 'object') {
      // 多字段文件 { fieldName: [files] }
      for (const [fieldName, fieldFiles] of Object.entries(req.files)) {
        if (Array.isArray(fieldFiles)) {
          files.push(...fieldFiles.map(f => ({ file: f, fieldName })));
        } else {
          files.push({ file: fieldFiles as Express.Multer.File, fieldName });
        }
      }
    }
  }

  // 如果没有文件，直接通过（让后续逻辑处理）
  if (files.length === 0) {
    return next();
  }

  // 验证每个文件
  const errors: Array<{ fileName: string; fieldName?: string; error: string }> = [];

  for (const { file, fieldName } of files) {
    const friendlyFieldName = fieldName ? FIELD_NAME_MAP[fieldName] || fieldName : undefined;
    const result = validateFile(file, friendlyFieldName);

    if (!result.valid) {
      errors.push({
        fileName: file.originalname,
        fieldName: friendlyFieldName,
        error: result.error || '未知错误'
      });

      logger.warn({
        userId: (req as any).user?.id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fieldName: friendlyFieldName,
        error: result.error
      }, 'File upload validation failed');
    }
  }

  // 如果有验证错误，返回错误响应
  if (errors.length > 0) {
    return res.status(400).json({
      message: '文件验证失败',
      code: 'INVALID_FILE',
      errors,
      allowedTypes: ALLOWED_FILE_EXTENSIONS,
      maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`
    });
  }

  // 验证通过，记录日志
  logger.info({
    userId: (req as any).user?.id,
    fileCount: files.length,
    fileNames: files.map(f => f.file.originalname),
    totalSize: files.reduce((sum, f) => sum + f.file.size, 0)
  }, 'File upload validation passed');

  next();
};

/**
 * 获取允许的文件类型列表（供前端使用）
 */
export const getAllowedFileTypes = (): {
  extensions: string[];
  description: Record<string, string>;
  maxFileSize: string;
} => {
  return {
    extensions: ALLOWED_FILE_EXTENSIONS,
    description: {
      'Hardware Description Files': '.v, .sv, .vhd, .vhdl, .vh, .svh',
      'Configuration Files': '.yaml, .yml',
      'TCL Scripts': '.tcl',
      'Excel Files': '.xlsx, .xls',
      'Text Files': '.txt, .log, .rpt'
    },
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`
  };
};

/**
 * 获取文件类型验证状态（用于调试）
 */
export const getFileValidationStatus = (): {
  dangerousTypesCount: number;
  allowedTypesCount: number;
  maxFileSizeBytes: number;
} => {
  return {
    dangerousTypesCount: DANGEROUS_EXTENSIONS.length,
    allowedTypesCount: ALLOWED_FILE_EXTENSIONS.length,
    maxFileSizeBytes: MAX_FILE_SIZE
  };
};
