import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { TEMPLATE_PATHS, validatePath } from '../config/paths';

/**
 * Download template file for a specific tool
 * Templates are stored in stuff/tool_template/{toolId}/ directory
 */
export const downloadTemplate = async (req: Request, res: Response) => {
  const { toolId, filename } = req.params;

  try {
    // 验证文件名安全性
    if (!validatePath.isSafeFilename(filename)) {
      return res.status(400).json({
        message: 'Invalid filename: contains unsafe characters',
        filename
      });
    }

    // 验证路径安全性
    if (!validatePath.isValidTemplatePath(toolId, filename)) {
      return res.status(403).json({
        message: 'Access denied: Invalid file path',
        toolId,
        filename
      });
    }

    // 使用统一的路径配置
    const templatePath = TEMPLATE_PATHS.getTemplateFilePath(toolId, filename);

    // 检查文件是否存在
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({
        message: 'Template file not found',
        toolId,
        filename,
        path: templatePath
      });
    }

    // 获取文件信息
    const stats = fs.statSync(templatePath);
    
    // 设置响应头
    res.setHeader('Content-Type', getContentType(filename));
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时

    // 创建文件流并发送
    const fileStream = fs.createReadStream(templatePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming template file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error reading template file' });
      }
    });

  } catch (error) {
    console.error('Error downloading template:', error);
    res.status(500).json({ 
      message: 'Internal server error while downloading template',
      error: (error as Error).message 
    });
  }
};

/**
 * 根据文件扩展名返回适当的Content-Type
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  switch (ext) {
    case '.yaml':
    case '.yml':
      return 'application/x-yaml';
    case '.v':
    case '.sv':
      return 'text/plain';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    default:
      return 'application/octet-stream';
  }
}
