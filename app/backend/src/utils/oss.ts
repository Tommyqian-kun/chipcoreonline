import OSS from 'ali-oss';

// OSS Configuration from environment variables
const ossConfig = {
  region: process.env.OSS_REGION as string,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID as string,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET as string,
};

/**
 * 获取OSS客户端实例
 * 在生产环境中，应该使用STS临时凭证
 * 在开发环境中，可以使用固定凭证
 * @param bucket - OSS存储桶名称
 * @param stsCredentials - 可选的STS临时凭证
 * @returns OSS客户端实例
 */
export const getOssClient = (
  bucket: string,
  stsCredentials?: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
  }
): OSS => {
  const config = stsCredentials ? {
    region: ossConfig.region,
    accessKeyId: stsCredentials.accessKeyId,
    accessKeySecret: stsCredentials.accessKeySecret,
    stsToken: stsCredentials.securityToken,
    bucket: bucket,
  } : {
    ...ossConfig,
    bucket: bucket,
  };

  return new OSS(config);
};

/**
 * 验证OSS配置是否完整
 */
export const validateOssConfig = (): boolean => {
  const requiredEnvVars = [
    'OSS_REGION',
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_ACCESS_KEY_SECRET',
    'OSS_BUCKET_USER_INPUT',
    'OSS_BUCKET_JOB_RESULTS',
    'OSS_BUCKET_JOB_LOGS'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(`⚠️ Missing OSS environment variables: ${missingVars.join(', ')}`);
    return false;
  }

  // 检查是否使用占位符值
  const placeholderValues = ['your-app-user-input', 'your-app-job-results', 'your-app-job-logs'];
  const hasPlaceholders = [
    process.env.OSS_BUCKET_USER_INPUT,
    process.env.OSS_BUCKET_JOB_RESULTS,
    process.env.OSS_BUCKET_JOB_LOGS
  ].some(value => placeholderValues.includes(value || ''));

  if (hasPlaceholders) {
    console.warn('⚠️ OSS bucket names contain placeholder values. Please configure real bucket names for production.');
    return false;
  }

  return true;
};

/**
 * Generates a pre-signed URL for a given OSS object.
 * @param bucketName - The name of the bucket where the object is stored.
 * @param objectName - The name of the object.
 * @param expires - The expiration time for the URL in seconds. Defaults to 300 (5 minutes).
 * @returns A promise that resolves to the pre-signed URL.
 */
export const generatePresignedUrl = async (
  bucketName: string,
  objectName: string,
  expires: number = 300
): Promise<string> => {
  try {
    const client = getOssClient(bucketName);
    const signedUrl = client.signatureUrl(objectName, { expires });
    return signedUrl;
  } catch (error) {
    console.error('Failed to generate pre-signed URL:', error);
    throw new Error('Could not generate pre-signed URL.');
  }
}; 