/**
 * 系统路径配置
 * 统一管理ECS上的文件存储路径
 */

import path from 'path';
import fs from 'fs';

// ECS项目根目录
export const PROJECT_ROOT = process.cwd();

// 获取默认的安全临时目录路径（避免使用系统/tmp）
const getDefaultTempPath = (): string => {
    // 从backend目录向上两级到LogicCore根目录，然后使用temp子目录
    const logicCoreRoot = path.join(PROJECT_ROOT, '..', '..');
    const defaultTempPath = path.join(logicCoreRoot, 'temp');

    console.warn(`⚠️  TEMP_UPLOAD_DIR not set, using fallback: ${defaultTempPath}`);
    console.warn(`   Please set TEMP_UPLOAD_DIR environment variable for production use`);

    return defaultTempPath;
};

// Template文件存储路径配置
// 支持生产环境和开发环境的不同路径配置
const getTemplateRootPath = (): string => {
    // 生产环境：使用环境变量指定的路径
    if (process.env.TEMPLATE_ROOT_PATH) {
        console.log(`✅ Using production template path: ${process.env.TEMPLATE_ROOT_PATH}`);
        return process.env.TEMPLATE_ROOT_PATH;
    }

    // 开发环境：使用LogicCore根目录下的templates目录
    // 当前工作目录是 app/backend，需要向上两级到 LogicCore 根目录
    const logicCoreRoot = path.join(PROJECT_ROOT, '..', '..');  // 从 backend 到 LogicCore 根目录
    const templatePath = path.join(logicCoreRoot, 'templates');  // LogicCore/templates

    // 检查模板路径是否存在
    if (fs.existsSync(templatePath)) {
        console.log(`✅ Template path found: ${templatePath}`);
        return templatePath;
    } else {
        console.error(`❌ Template path not found: ${templatePath}`);
        console.error(`   Current working directory: ${PROJECT_ROOT}`);
        console.error(`   LogicCore root: ${logicCoreRoot}`);
        // 返回期望的路径，让错误在运行时显示
        return templatePath;
    }
};

export const TEMPLATE_PATHS = {
    // Template根目录
    ROOT: getTemplateRootPath(),

    // 各工具的Template目录
    SDC_GENERATOR: path.join(getTemplateRootPath(), 'sdcgen'),
    UPF_GENERATOR: path.join(getTemplateRootPath(), 'upfgen'),
    CLK_GENERATOR: path.join(getTemplateRootPath(), 'clkgen'),
    MEMORY_DATA_GENERATOR: path.join(getTemplateRootPath(), 'memgen'),

    // 获取特定工具的Template目录
    getToolTemplatePath: (toolId: string): string => {
        return path.join(getTemplateRootPath(), toolId);
    },

    // 获取特定Template文件路径
    getTemplateFilePath: (toolId: string, filename: string): string => {
        return path.join(getTemplateRootPath(), toolId, filename);
    }
};

// 临时工作目录配置 - 用于任务执行过程中的临时文件
// 注意：不使用系统/tmp目录，确保数据安全和跨平台一致性
export const TEMP_PATHS = {
    // 临时目录根路径：优先使用TEMP_UPLOAD_DIR，fallback到安全路径
    ROOT: process.env.TEMP_UPLOAD_DIR || getDefaultTempPath(),

    // 获取任务临时目录（用于上传文件的临时存储）
    getJobTempDir: (taskId: string): string => {
        const tempRoot = process.env.TEMP_UPLOAD_DIR || getDefaultTempPath();
        return path.join(tempRoot, taskId);
    },

    // 获取任务输入目录（在临时目录中）
    getJobInputDir: (taskId: string): string => {
        const tempRoot = process.env.TEMP_UPLOAD_DIR || getDefaultTempPath();
        return path.join(tempRoot, taskId, 'input');
    },

    // 获取任务输出目录（在临时目录中）
    getJobOutputDir: (taskId: string): string => {
        const tempRoot = process.env.TEMP_UPLOAD_DIR || getDefaultTempPath();
        return path.join(tempRoot, taskId, 'output');
    },

    // 获取任务工作目录（在临时目录中）
    getJobWorkDir: (taskId: string): string => {
        const tempRoot = process.env.TEMP_UPLOAD_DIR || getDefaultTempPath();
        return path.join(tempRoot, taskId, 'work');
    },

    // 获取任务日志目录（在临时目录中）
    getJobLogDir: (taskId: string): string => {
        const tempRoot = process.env.TEMP_UPLOAD_DIR || getDefaultTempPath();
        return path.join(tempRoot, taskId, 'logs');
    }
};

// 任务日志目录配置 - 用于持久化的任务执行日志
export const TASK_LOG_PATHS = {
    // 日志根目录
    ROOT: process.env.TASK_LOGS_DIR || path.join(process.cwd(), 'logs'),

    // 获取任务日志目录
    getTaskLogDir: (taskId: string): string => {
        const logsRoot = process.env.TASK_LOGS_DIR || path.join(process.cwd(), 'logs');
        return path.join(logsRoot, taskId);
    },

    // 获取任务日志文件路径
    getTaskLogFile: (taskId: string, filename: string): string => {
        const logsRoot = process.env.TASK_LOGS_DIR || path.join(process.cwd(), 'logs');
        return path.join(logsRoot, taskId, filename);
    }
};

// OSS路径配置
export const OSS_PATHS = {
    // 获取用户输入文件OSS路径
    getUserInputPath: (userId: string, taskId: string): string => {
        return `${userId}/${taskId}/inputs`;
    },
    
    // 获取任务输出文件OSS路径
    getTaskOutputPath: (userId: string, taskId: string): string => {
        return `${userId}/${taskId}/outputs`;
    },
    
    // 获取任务日志文件OSS路径
    getTaskLogPath: (userId: string, taskId: string): string => {
        return `${userId}/${taskId}/logs`;
    },
    
    // 获取具体文件的OSS路径
    getFileOssPath: (userId: string, taskId: string, category: 'inputs' | 'outputs' | 'logs', filename: string): string => {
        return `${userId}/${taskId}/${category}/${filename}`;
    }
};

// ECS本地存储路径配置（ECS Only模式）
export const ECS_LOCAL_PATHS = {
    ROOT: process.env.ECS_LOCAL_STORAGE_ROOT || '/data/chipcore',
    JOBS: process.env.ECS_JOBS_DIR || '/data/chipcore/jobs',
    TEMPLATES: process.env.ECS_TEMPLATES_DIR || '/data/chipcore/templates',
    DOCKER: process.env.ECS_DOCKER_DIR || '/data/chipcore/docker',

    // 任务相关路径
    getTaskDir: (taskId: string) => path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId),
    getTaskInputDir: (taskId: string) => path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'input'),
    getTaskOutputDir: (taskId: string) => path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'output'),
    getTaskLogDir: (taskId: string) => path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'logs'),
    getTaskWorkDir: (taskId: string) => path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work'),

    // 工具特定路径
    getToolWorkDir: (taskId: string, moduleName: string, toolType: string) =>
        path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work', moduleName, toolType),
    getToolInputDir: (taskId: string, moduleName: string, toolType: string) =>
        path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work', moduleName, toolType, 'inputs'),
    getToolOutputDir: (taskId: string, moduleName: string, toolType: string) =>
        path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work', moduleName, toolType, 'outputs'),
    getToolLogDir: (taskId: string, moduleName: string, toolType: string) =>
        path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work', moduleName, toolType, 'logs'),
    getToolRptDir: (taskId: string, moduleName: string, toolType: string) =>
        path.join(process.env.ECS_JOBS_DIR || '/data/chipcore/jobs', taskId, 'work', moduleName, toolType, 'rpts'),

    // 镜像缓存路径
    getImagesDir: () => path.join(process.env.ECS_DOCKER_DIR || '/data/chipcore/docker', 'images'),
    getVolumesDir: () => path.join(process.env.ECS_DOCKER_DIR || '/data/chipcore/docker', 'volumes')
};

// Docker容器内路径配置
export const CONTAINER_PATHS = {
    INPUT_DIR: '/data/input',
    OUTPUT_DIR: '/data/output',
    WORK_DIR: '/data/work',
    LOG_DIR: '/data/logs',

    // SDC工具特定路径
    SDC_MODULE_DIR: (modName: string) => `/data/work/${modName}`,
    SDC_INPUT_DIR: (modName: string) => `/data/work/${modName}/sdc/inputs`,
    SDC_OUTPUT_DIR: (modName: string) => `/data/work/${modName}/sdc/outputs`,
};

// 路径验证函数
export const validatePath = {
    // 验证Template路径是否安全
    isValidTemplatePath: (toolId: string, filename: string): boolean => {
        const filePath = TEMPLATE_PATHS.getTemplateFilePath(toolId, filename);
        const allowedDir = TEMPLATE_PATHS.getToolTemplatePath(toolId);

        const resolvedPath = path.resolve(filePath);
        const resolvedAllowedDir = path.resolve(allowedDir);

        return resolvedPath.startsWith(resolvedAllowedDir);
    },
    
    // 验证文件名是否安全（防止路径遍历）
    isSafeFilename: (filename: string): boolean => {
        // 不允许包含路径分隔符和特殊字符
        const dangerousChars = ['..', '/', '\\', ':', '*', '?', '"', '<', '>', '|'];
        return !dangerousChars.some(char => filename.includes(char));
    }
};

export default {
    TEMPLATE_PATHS,
    TEMP_PATHS,
    OSS_PATHS,
    CONTAINER_PATHS,
    validatePath
};
