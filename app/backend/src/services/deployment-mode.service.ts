/**
 * 部署模式配置接口
 */
interface EcsOnlyConfig {
  deploymentMode: string;
  storageService: string;
  localStorageRoot?: string;
  jobsDir?: string;
  tempJobsDir?: string;
  templatesDir?: string;
  dockerDir?: string;
  cleanupInterval?: string;
  downloadTimeout?: string;
  failedTaskCleanupDelay?: string;
  logRetentionHours?: string;
  downloadPort?: string;
  maxStorageSize?: string;
  localDockerRegistry?: string;
  imagesCacheSize?: string;
}

interface OssConfig {
  deploymentMode: string;
  storageService: string;
  ossRegion?: string;
  ossBucket?: string;
  // 这些属性在OSS模式下不使用，但需要存在以兼容类型
  jobsDir?: undefined;
  tempJobsDir?: undefined;
}

type DeploymentConfig = EcsOnlyConfig | OssConfig;

/**
 * 部署模式检测和配置服务
 * 支持ECS Only和ECS+OSS+ACR两种部署模式
 */

export class DeploymentModeService {
    /**
     * 检查是否为ECS Only模式
     * 默认为ECS Only模式
     */
    static isEcsOnlyMode(): boolean {
        return process.env.DEPLOYMENT_MODE === 'ecs_only' || !process.env.DEPLOYMENT_MODE;
    }

    /**
     * 检查是否为ECS+OSS+ACR模式
     */
    static isEcsOssAcrMode(): boolean {
        return process.env.DEPLOYMENT_MODE === 'ecs_oss_acr';
    }

    /**
     * 获取当前部署模式
     */
    static getDeploymentMode(): 'ecs_only' | 'ecs_oss_acr' {
        return this.isEcsOnlyMode() ? 'ecs_only' : 'ecs_oss_acr';
    }

    /**
     * 获取存储服务类型
     */
    static getStorageService(): 'ecs-local' | 'oss' {
        return this.isEcsOnlyMode() ? 'ecs-local' : 'oss';
    }

    /**
     * 获取下载超时时间（秒）
     */
    static getDownloadTimeout(): number {
        return parseInt(process.env.ECS_DOWNLOAD_TIMEOUT || '120');
    }

    /**
     * 获取清理间隔时间（秒）
     */
    static getCleanupInterval(): number {
        return parseInt(process.env.ECS_TEMP_CLEANUP_INTERVAL || '120');
    }

    /**
     * 获取失败任务清理延迟时间（秒）
     * 失败任务需要保留更长时间用于问题分析，但jobs目录需要更快清理
     * temp和logs目录保留24小时，jobs目录失败后5分钟清理
     */
    static getFailedTaskCleanupDelay(): number {
        return parseInt(process.env.ECS_FAILED_TASK_CLEANUP_DELAY || '300'); // 默认5分钟
    }

    /**
     * 获取日志目录保留时间（小时）- 用于问题分析
     */
    static getLogRetentionHours(): number {
        return parseInt(process.env.ECS_LOG_RETENTION_HOURS || '24');
    }

    /**
     * 获取文件下载端口
     */
    static getFileDownloadPort(): number {
        return parseInt(process.env.ECS_FILE_DOWNLOAD_PORT || '8081');
    }

    /**
     * 获取最大存储大小
     */
    static getMaxStorageSize(): string {
        return process.env.ECS_MAX_STORAGE_SIZE || '50GB';
    }

    /**
     * 检查本地Docker注册表是否启用
     */
    static isLocalDockerRegistryEnabled(): boolean {
        return process.env.LOCAL_DOCKER_REGISTRY_ENABLED === 'true';
    }

    /**
     * 获取本地镜像缓存大小
     */
    static getLocalImagesCacheSize(): string {
        return process.env.LOCAL_IMAGES_CACHE_SIZE || '20GB';
    }

    /**
     * 验证ECS Only模式配置
     */
    static validateEcsOnlyConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (this.isEcsOnlyMode()) {
            // 检查必需的环境变量
            if (!process.env.ECS_LOCAL_STORAGE_ROOT) {
                errors.push('ECS_LOCAL_STORAGE_ROOT is required for ECS Only mode');
            }
            if (!process.env.ECS_JOBS_DIR) {
                errors.push('ECS_JOBS_DIR is required for ECS Only mode');
            }
            if (!process.env.ECS_TEMPLATES_DIR) {
                errors.push('ECS_TEMPLATES_DIR is required for ECS Only mode');
            }
            if (!process.env.ECS_DOCKER_DIR) {
                errors.push('ECS_DOCKER_DIR is required for ECS Only mode');
            }

            // 检查数值配置
            const cleanupInterval = parseInt(process.env.ECS_TEMP_CLEANUP_INTERVAL || '120');
            if (isNaN(cleanupInterval) || cleanupInterval < 60) {
                errors.push('ECS_TEMP_CLEANUP_INTERVAL must be a number >= 60 seconds');
            }

            const downloadTimeout = parseInt(process.env.ECS_DOWNLOAD_TIMEOUT || '120');
            if (isNaN(downloadTimeout) || downloadTimeout < 60) {
                errors.push('ECS_DOWNLOAD_TIMEOUT must be a number >= 60 seconds');
            }

            const failedTaskCleanupDelay = parseInt(process.env.ECS_FAILED_TASK_CLEANUP_DELAY || '300');
            if (isNaN(failedTaskCleanupDelay) || failedTaskCleanupDelay < 60) {
                errors.push('ECS_FAILED_TASK_CLEANUP_DELAY must be a number >= 60 seconds');
            }

            const logRetentionHours = parseInt(process.env.ECS_LOG_RETENTION_HOURS || '24');
            if (isNaN(logRetentionHours) || logRetentionHours < 1) {
                errors.push('ECS_LOG_RETENTION_HOURS must be a number >= 1 hour');
            }

            const downloadPort = parseInt(process.env.ECS_FILE_DOWNLOAD_PORT || '8081');
            if (isNaN(downloadPort) || downloadPort < 1024 || downloadPort > 65535) {
                errors.push('ECS_FILE_DOWNLOAD_PORT must be a valid port number (1024-65535)');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 获取部署模式配置摘要
     */
    static getConfigSummary(): DeploymentConfig {
        const mode = this.getDeploymentMode();

        if (mode === 'ecs_only') {
            return {
                deploymentMode: mode,
                storageService: this.getStorageService(),
                localStorageRoot: process.env.ECS_LOCAL_STORAGE_ROOT,
                jobsDir: process.env.ECS_JOBS_DIR,
                tempJobsDir: process.env.TEMP_UPLOAD_DIR, // 添加临时作业目录
                templatesDir: process.env.ECS_TEMPLATES_DIR,
                dockerDir: process.env.ECS_DOCKER_DIR,
                cleanupInterval: this.getCleanupInterval(),
                downloadTimeout: this.getDownloadTimeout(),
                failedTaskCleanupDelay: this.getFailedTaskCleanupDelay(),
                logRetentionHours: this.getLogRetentionHours(),
                downloadPort: this.getFileDownloadPort(),
                maxStorageSize: this.getMaxStorageSize(),
                localDockerRegistry: this.isLocalDockerRegistryEnabled(),
                imagesCacheSize: this.getLocalImagesCacheSize()
            } as DeploymentConfig;
        } else {
            return {
                deploymentMode: mode,
                storageService: this.getStorageService(),
                ossRegion: process.env.OSS_REGION,
                ossBucket: process.env.OSS_BUCKET
            } as DeploymentConfig;
        }
    }
}
