import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

// 支持的API版本
export const SUPPORTED_VERSIONS = ['v1', 'v2'] as const;
export type ApiVersion = typeof SUPPORTED_VERSIONS[number];

// 版本兼容性映射
const VERSION_COMPATIBILITY: Record<string, ApiVersion[]> = {
  'v1': ['v1'],
  'v2': ['v1', 'v2'], // v2向后兼容v1
};

// 弃用的API版本和弃用时间
const DEPRECATED_VERSIONS: Record<string, { deprecatedAt: string; sunsetAt: string }> = {
  // 示例：'v1': { deprecatedAt: '2024-01-01', sunsetAt: '2024-06-01' }
};

/**
 * 扩展Request接口以包含API版本信息
 */
declare global {
  namespace Express {
    interface Request {
      apiVersion: ApiVersion;
      requestedVersion?: string;
      isVersionDeprecated: boolean;
      compatibleVersions: ApiVersion[];
    }
  }
}

/**
 * API版本管理中间件
 * 支持多种版本指定方式：URL路径、Header、查询参数
 */
export const apiVersionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let requestedVersion: string | undefined;
  let resolvedVersion: ApiVersion = 'v1'; // 默认版本

  // 1. 从URL路径中提取版本 (优先级最高)
  const pathVersionMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (pathVersionMatch) {
    requestedVersion = pathVersionMatch[1];
  }

  // 2. 从Header中获取版本
  if (!requestedVersion) {
    requestedVersion = req.headers['api-version'] as string || 
                     req.headers['x-api-version'] as string;
  }

  // 3. 从查询参数中获取版本
  if (!requestedVersion) {
    requestedVersion = req.query.version as string;
  }

  // 4. 验证和解析版本
  if (requestedVersion) {
    // 标准化版本格式
    const normalizedVersion = requestedVersion.toLowerCase().startsWith('v') 
      ? requestedVersion.toLowerCase() 
      : `v${requestedVersion}`;

    if (SUPPORTED_VERSIONS.includes(normalizedVersion as ApiVersion)) {
      resolvedVersion = normalizedVersion as ApiVersion;
    } else {
      // 不支持的版本，返回错误
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_API_VERSION',
          message: `API version '${requestedVersion}' is not supported`,
          supportedVersions: SUPPORTED_VERSIONS,
          requestedVersion
        }
      });
    }
  }

  // 5. 检查版本是否已弃用
  const isDeprecated = DEPRECATED_VERSIONS.hasOwnProperty(resolvedVersion);
  const compatibleVersions = VERSION_COMPATIBILITY[resolvedVersion] || [resolvedVersion];

  // 6. 设置响应头
  res.setHeader('X-API-Version', resolvedVersion);
  res.setHeader('X-Supported-Versions', SUPPORTED_VERSIONS.join(', '));

  if (isDeprecated) {
    const deprecationInfo = DEPRECATED_VERSIONS[resolvedVersion];
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Date', deprecationInfo.deprecatedAt);
    res.setHeader('X-API-Sunset-Date', deprecationInfo.sunsetAt);
    res.setHeader('Warning', `299 - "API version ${resolvedVersion} is deprecated. Please migrate to a newer version."`);
  }

  // 7. 将版本信息附加到请求对象
  req.apiVersion = resolvedVersion;
  req.requestedVersion = requestedVersion;
  req.isVersionDeprecated = isDeprecated;
  req.compatibleVersions = compatibleVersions;

  // 8. 记录版本使用情况
  logger.info({
    apiVersion: resolvedVersion,
    requestedVersion,
    isDeprecated,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  }, 'API version resolved');

  next();
};

/**
 * 版本特定的路由处理器工厂
 * 允许为不同版本提供不同的实现
 */
export const versionedHandler = (handlers: Partial<Record<ApiVersion, any>>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.apiVersion;
    const handler = handlers[version];

    if (!handler) {
      // 尝试使用兼容版本的处理器
      const compatibleHandler = req.compatibleVersions
        .reverse() // 从最新兼容版本开始尝试
        .map(v => handlers[v])
        .find(h => h !== undefined);

      if (compatibleHandler) {
        return compatibleHandler(req, res, next);
      }

      // 没有找到合适的处理器
      return res.status(501).json({
        success: false,
        error: {
          code: 'VERSION_NOT_IMPLEMENTED',
          message: `API version '${version}' is not implemented for this endpoint`,
          availableVersions: Object.keys(handlers)
        }
      });
    }

    return handler(req, res, next);
  };
};

/**
 * 响应格式转换中间件
 * 根据API版本调整响应格式
 */
export const responseFormatMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;

  res.json = function(data: any) {
    const version = req.apiVersion;
    let transformedData = data;

    // 根据版本转换响应格式
    switch (version) {
      case 'v1':
        // v1格式保持不变
        break;
      
      case 'v2':
        // v2格式：统一响应结构
        if (data && typeof data === 'object' && !data.hasOwnProperty('success')) {
          transformedData = {
            success: true,
            data: data,
            version: 'v2',
            timestamp: new Date().toISOString()
          };
        }
        break;
    }

    // 添加版本信息到响应
    if (transformedData && typeof transformedData === 'object') {
      transformedData._meta = {
        version: version,
        deprecated: req.isVersionDeprecated,
        ...(transformedData._meta || {})
      };
    }

    return originalJson.call(this, transformedData);
  };

  next();
};

/**
 * 版本兼容性检查装饰器
 * 用于标记需要特定版本的控制器方法
 */
export const requireVersion = (minVersion: ApiVersion) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const currentVersion = req.apiVersion;
    const minVersionIndex = SUPPORTED_VERSIONS.indexOf(minVersion);
    const currentVersionIndex = SUPPORTED_VERSIONS.indexOf(currentVersion);

    if (currentVersionIndex < minVersionIndex) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VERSION_TOO_OLD',
          message: `This endpoint requires API version ${minVersion} or higher`,
          currentVersion,
          requiredVersion: minVersion
        }
      });
    }

    next();
  };
};

/**
 * 获取API版本统计信息
 */
export const getVersionStats = async (): Promise<{
  supportedVersions: string[];
  deprecatedVersions: Record<string, any>;
  defaultVersion: string;
  compatibility: Record<string, string[]>;
}> => {
  return {
    supportedVersions: [...SUPPORTED_VERSIONS],
    deprecatedVersions: DEPRECATED_VERSIONS,
    defaultVersion: 'v1',
    compatibility: VERSION_COMPATIBILITY
  };
};

/**
 * 版本迁移指南生成器
 */
export const generateMigrationGuide = (fromVersion: ApiVersion, toVersion: ApiVersion): {
  changes: string[];
  breakingChanges: string[];
  recommendations: string[];
} => {
  const migrationGuides: Record<string, any> = {
    'v1-to-v2': {
      changes: [
        'Response format now includes success field',
        'All responses include timestamp',
        'Error responses have standardized structure',
        'Pagination format updated'
      ],
      breakingChanges: [
        'Some field names have changed for consistency',
        'Date formats are now ISO 8601 strings',
        'Error codes have been standardized'
      ],
      recommendations: [
        'Update client code to handle new response format',
        'Test all error handling scenarios',
        'Update date parsing logic',
        'Review pagination implementation'
      ]
    }
  };

  const guideKey = `${fromVersion}-to-${toVersion}`;
  return migrationGuides[guideKey] || {
    changes: [],
    breakingChanges: [],
    recommendations: ['Please refer to API documentation for migration details']
  };
};

/**
 * 版本弃用通知中间件
 */
export const deprecationNoticeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.isVersionDeprecated) {
    const deprecationInfo = DEPRECATED_VERSIONS[req.apiVersion];
    
    logger.warn({
      apiVersion: req.apiVersion,
      deprecationDate: deprecationInfo.deprecatedAt,
      sunsetDate: deprecationInfo.sunsetAt,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      path: req.path
    }, 'Deprecated API version used');

    // 可以在这里添加通知逻辑，如发送邮件给API使用者
  }

  next();
};
