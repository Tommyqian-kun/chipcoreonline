import logger from '../config/logger';

/**
 * STS临时凭证接口
 */
interface STSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: Date;
}

/**
 * 任务级别的OSS权限策略
 */
interface TaskOSSPolicy {
  userId: string;
  taskId: string;
  allowedActions: string[];
  allowedResources: string[];
  durationSeconds: number;
}

/**
 * STS凭证管理器
 * 实现任务级别的精细化权限控制
 */
export class STSCredentialManager {
  private credentialCache: Map<string, STSCredentials> = new Map();
  private readonly defaultDuration = 3600; // 1小时
  private readonly maxDuration = 7200; // 2小时

  constructor() {
    // 每30分钟清理过期凭证
    setInterval(() => {
      this.cleanupExpiredCredentials();
    }, 30 * 60 * 1000);

    logger.info('STS credential manager initialized');
  }

  /**
   * 为任务生成精细化的STS凭证
   */
  async generateTaskCredentials(
    userId: string, 
    taskId: string, 
    operations: ('read' | 'write' | 'delete')[] = ['read', 'write']
  ): Promise<STSCredentials> {
    const cacheKey = `${userId}_${taskId}`;
    
    // 检查缓存中是否有有效凭证
    const cachedCredentials = this.credentialCache.get(cacheKey);
    if (cachedCredentials && this.isCredentialValid(cachedCredentials)) {
      logger.debug({ userId, taskId }, 'Using cached STS credentials');
      return cachedCredentials;
    }

    try {
      // 构建任务级别的权限策略
      const policy = this.buildTaskPolicy(userId, taskId, operations);
      
      // 生成STS凭证
      const credentials = await this.assumeRoleWithPolicy(policy);
      
      // 缓存凭证
      this.credentialCache.set(cacheKey, credentials);
      
      logger.info({
        userId,
        taskId,
        operations,
        expiration: credentials.expiration
      }, 'Generated task-specific STS credentials');

      return credentials;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        taskId
      }, 'Failed to generate STS credentials');
      throw error;
    }
  }

  /**
   * 构建任务级别的权限策略
   */
  private buildTaskPolicy(
    userId: string, 
    taskId: string, 
    operations: ('read' | 'write' | 'delete')[]
  ): TaskOSSPolicy {
    const allowedActions: string[] = [];
    const allowedResources: string[] = [];

    // 根据操作类型添加权限
    if (operations.includes('read')) {
      allowedActions.push('oss:GetObject', 'oss:ListObjects');
    }
    if (operations.includes('write')) {
      allowedActions.push('oss:PutObject');
    }
    if (operations.includes('delete')) {
      allowedActions.push('oss:DeleteObject');
    }

    // 限制资源访问范围到特定任务目录
    const taskBasePath = `users/${userId}/tasks/${taskId}`;
    allowedResources.push(
      `acs:oss:*:*:${process.env.OSS_BUCKET_USER_INPUT}/${taskBasePath}/*`,
      `acs:oss:*:*:${process.env.OSS_BUCKET_JOB_RESULTS}/${taskBasePath}/*`,
      `acs:oss:*:*:${process.env.OSS_BUCKET_JOB_LOGS}/${taskBasePath}/*`
    );

    return {
      userId,
      taskId,
      allowedActions,
      allowedResources,
      durationSeconds: this.defaultDuration
    };
  }

  /**
   * 使用策略假设角色
   */
  private async assumeRoleWithPolicy(policy: TaskOSSPolicy): Promise<STSCredentials> {
    // 构建IAM策略文档
    const policyDocument = {
      Version: '1',
      Statement: [{
        Effect: 'Allow',
        Action: policy.allowedActions,
        Resource: policy.allowedResources,
        Condition: {
          DateLessThan: {
            'acs:CurrentTime': new Date(Date.now() + policy.durationSeconds * 1000).toISOString()
          },
          StringEquals: {
            'oss:ExistingObjectTag/userId': policy.userId,
            'oss:ExistingObjectTag/taskId': policy.taskId
          }
        }
      }]
    };

    try {
      // 在实际环境中，这里应该调用阿里云STS API
      // 由于当前可能没有配置STS，我们提供一个模拟实现
      
      if (process.env.NODE_ENV === 'development') {
        // 开发环境：返回模拟凭证
        return this.generateMockCredentials(policy);
      }

      // 生产环境：调用真实的STS API
      return await this.callSTSAPI(policyDocument, policy);

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        policy
      }, 'Failed to assume role with policy');
      throw error;
    }
  }

  /**
   * 调用STS API（生产环境）
   */
  private async callSTSAPI(policyDocument: any, policy: TaskOSSPolicy): Promise<STSCredentials> {
    // 这里应该集成阿里云STS SDK
    // 示例代码（需要安装 @alicloud/sts20150401 包）:
    /*
    const STS = require('@alicloud/sts20150401');
    const client = new STS({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: 'https://sts.aliyuncs.com'
    });

    const response = await client.assumeRole({
      roleArn: process.env.OSS_STS_ROLE_ARN,
      roleSessionName: `task-${policy.taskId}`,
      policy: JSON.stringify(policyDocument),
      durationSeconds: policy.durationSeconds
    });

    return {
      accessKeyId: response.body.credentials.accessKeyId,
      accessKeySecret: response.body.credentials.accessKeySecret,
      securityToken: response.body.credentials.securityToken,
      expiration: new Date(response.body.credentials.expiration)
    };
    */

    // 临时实现：如果没有配置STS，使用主账号凭证（仅用于过渡）
    logger.warn('STS not configured, using main account credentials (not recommended for production)');
    
    return {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID!,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET!,
      securityToken: '', // 主账号凭证不需要token
      expiration: new Date(Date.now() + policy.durationSeconds * 1000)
    };
  }

  /**
   * 生成模拟凭证（开发环境）
   */
  private generateMockCredentials(policy: TaskOSSPolicy): STSCredentials {
    logger.info({
      userId: policy.userId,
      taskId: policy.taskId
    }, 'Generated mock STS credentials for development');

    return {
      accessKeyId: `MOCK_AK_${policy.taskId}`,
      accessKeySecret: `MOCK_SK_${policy.taskId}`,
      securityToken: `MOCK_TOKEN_${policy.taskId}`,
      expiration: new Date(Date.now() + policy.durationSeconds * 1000)
    };
  }

  /**
   * 检查凭证是否有效
   */
  private isCredentialValid(credentials: STSCredentials): boolean {
    // 提前5分钟过期，确保有足够的缓冲时间
    const bufferTime = 5 * 60 * 1000;
    return credentials.expiration.getTime() > Date.now() + bufferTime;
  }

  /**
   * 清理过期凭证
   */
  private cleanupExpiredCredentials(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, credentials] of this.credentialCache.entries()) {
      if (credentials.expiration.getTime() <= now) {
        this.credentialCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info({
        cleanedCount,
        remainingCount: this.credentialCache.size
      }, 'Cleaned up expired STS credentials');
    }
  }

  /**
   * 撤销任务凭证
   */
  async revokeTaskCredentials(userId: string, taskId: string): Promise<void> {
    const cacheKey = `${userId}_${taskId}`;
    
    if (this.credentialCache.has(cacheKey)) {
      this.credentialCache.delete(cacheKey);
      logger.info({ userId, taskId }, 'Revoked task STS credentials');
    }
  }

  /**
   * 获取凭证统计信息
   */
  getCredentialStats(): {
    totalCached: number;
    validCredentials: number;
    expiredCredentials: number;
  } {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const credentials of this.credentialCache.values()) {
      if (credentials.expiration.getTime() > now) {
        validCount++;
      } else {
        expiredCount++;
      }
    }

    return {
      totalCached: this.credentialCache.size,
      validCredentials: validCount,
      expiredCredentials: expiredCount
    };
  }

  /**
   * 验证用户对特定资源的访问权限
   */
  async validateResourceAccess(
    userId: string, 
    taskId: string, 
    resourcePath: string, 
    action: string
  ): Promise<boolean> {
    try {
      // 检查资源路径是否在允许的范围内
      const taskBasePath = `users/${userId}/tasks/${taskId}`;
      
      if (!resourcePath.startsWith(taskBasePath)) {
        logger.warn({
          userId,
          taskId,
          resourcePath,
          expectedPrefix: taskBasePath
        }, 'Resource access denied - path outside task scope');
        return false;
      }

      // 检查操作是否被允许
      const allowedActions = ['oss:GetObject', 'oss:PutObject', 'oss:ListObjects'];
      const actionAllowed = allowedActions.some(allowed => 
        action === allowed || action.startsWith(allowed)
      );

      if (!actionAllowed) {
        logger.warn({
          userId,
          taskId,
          action,
          allowedActions
        }, 'Resource access denied - action not allowed');
        return false;
      }

      return true;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        taskId,
        resourcePath,
        action
      }, 'Error validating resource access');
      return false;
    }
  }
}

// 单例实例
let stsCredentialManager: STSCredentialManager | null = null;

export const getSTSCredentialManager = (): STSCredentialManager => {
  if (!stsCredentialManager) {
    stsCredentialManager = new STSCredentialManager();
    logger.info('STS credential manager initialized');
  }
  return stsCredentialManager;
};
