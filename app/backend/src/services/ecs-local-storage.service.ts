/**
 * ECS本地文件存储服务
 * 实现ECS Only模式下的本地文件管理，支持工具特定目录结构
 */

import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { execSync } from 'child_process';
import { ECS_LOCAL_PATHS } from '../config/paths';
import logger from '../config/logger';
import { toolTypeManager } from '../config/tool-types.config';

export class EcsLocalStorageService {
    /**
     * 保存用户上传文件到本地input目录
     * 注意：此方法假设目录结构已经通过createTaskDirectories创建
     */
    static async saveUploadedFiles(taskId: string, files: Express.Multer.File[]): Promise<string[]> {
        const inputDir = ECS_LOCAL_PATHS.getTaskInputDir(taskId);

        // 确保input目录存在（防御性编程）
        if (!fs.existsSync(inputDir)) {
            await fs.promises.mkdir(inputDir, { recursive: true });
            logger.warn({
                taskId,
                inputDir
            }, 'Input directory did not exist, created it (this should not happen if createTaskDirectories was called first)');
        }

        const filePaths: string[] = [];
        for (const file of files) {
            const filePath = path.join(inputDir, file.originalname);
            await fs.promises.writeFile(filePath, file.buffer);
            filePaths.push(file.originalname);

            logger.info({
                taskId,
                fileName: file.originalname,
                fileSize: file.size,
                filePath,
                inputDir
            }, 'File saved to ECS local storage');
        }

        logger.info({
            taskId,
            filesCount: filePaths.length,
            inputDir
        }, 'All files saved to ECS local input directory');

        return filePaths;
    }

    /**
     * 创建完整的任务目录结构
     * 这是ECS Only模式下的关键方法，确保所有必需的目录都被创建
     */
    static async createTaskDirectories(taskId: string, moduleName: string, toolType: string): Promise<void> {
        // 验证输入参数
        if (!taskId || !moduleName || !toolType) {
            throw new Error(`Invalid parameters for createTaskDirectories: taskId=${taskId}, moduleName=${moduleName}, toolType=${toolType}`);
        }

        // 验证工具类型是否支持
        if (!toolTypeManager.isToolTypeSupported(toolType)) {
            throw new Error(`Tool type '${toolType}' is not supported`);
        }

        // 定义完整的目录结构
        const dirs = [
            // 任务级别目录
            ECS_LOCAL_PATHS.getTaskInputDir(taskId),      // {jobs}/{taskId}/input/
            ECS_LOCAL_PATHS.getTaskOutputDir(taskId),     // {jobs}/{taskId}/output/
            ECS_LOCAL_PATHS.getTaskLogDir(taskId),        // {jobs}/{taskId}/logs/
            ECS_LOCAL_PATHS.getTaskWorkDir(taskId),       // {jobs}/{taskId}/work/

            // 工具特定目录
            ECS_LOCAL_PATHS.getToolInputDir(taskId, moduleName, toolType),   // {jobs}/{taskId}/work/{moduleName}/{toolType}/inputs/
            ECS_LOCAL_PATHS.getToolOutputDir(taskId, moduleName, toolType),  // {jobs}/{taskId}/work/{moduleName}/{toolType}/outputs/
            ECS_LOCAL_PATHS.getToolLogDir(taskId, moduleName, toolType),     // {jobs}/{taskId}/work/{moduleName}/{toolType}/logs/
            ECS_LOCAL_PATHS.getToolRptDir(taskId, moduleName, toolType)      // {jobs}/{taskId}/work/{moduleName}/{toolType}/rpts/
        ];

        // 创建所有目录
        for (const dir of dirs) {
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                logger.debug({
                    taskId,
                    directory: dir
                }, 'Directory created successfully');
            } catch (error) {
                logger.error({
                    taskId,
                    directory: dir,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }, 'Failed to create directory');
                throw new Error(`Failed to create directory ${dir}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        logger.info({
            taskId,
            moduleName,
            toolType,
            dirsCreated: dirs.length,
            directories: dirs
        }, 'Complete task directory structure created successfully');
    }

    /**
     * 复制输入文件到工具特定目录
     */
    static async copyInputFilesToToolDir(taskId: string, moduleName: string, toolType: string): Promise<void> {
        const inputDir = ECS_LOCAL_PATHS.getTaskInputDir(taskId);
        const toolInputDir = ECS_LOCAL_PATHS.getToolInputDir(taskId, moduleName, toolType);

        if (fs.existsSync(inputDir)) {
            const files = await fs.promises.readdir(inputDir);
            for (const file of files) {
                const srcPath = path.join(inputDir, file);
                const destPath = path.join(toolInputDir, file);
                await fs.promises.copyFile(srcPath, destPath);
            }

            logger.info({
                taskId,
                moduleName,
                toolType,
                filesCopied: files.length
            }, 'Input files copied to tool directory');
        }
    }

    /**
     * 打包工具结果文件，文件名格式：${taskId}_${toolName}.zip
     */
    static async packageToolResults(taskId: string, moduleName: string, toolType: string, toolName: string): Promise<string> {
        const workDir = ECS_LOCAL_PATHS.getTaskWorkDir(taskId);
        const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);
        const zipFileName = `${taskId}_${toolName}.zip`;  // 重要：使用taskId_toolName格式
        const zipFilePath = path.join(outputDir, zipFileName);

        // 使用archiver库创建zip文件
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                logger.info({
                    taskId,
                    toolName,
                    zipFileName,
                    totalBytes: archive.pointer()
                }, 'Tool results packaged successfully');
                resolve(zipFileName);
            });

            archive.on('error', (err: Error) => {
                logger.error({
                    taskId,
                    toolName,
                    error: err.message
                }, 'Failed to package tool results');
                reject(err);
            });

            archive.pipe(output);

            // 添加工具目录下的所有文件
            const toolWorkDir = ECS_LOCAL_PATHS.getToolWorkDir(taskId, moduleName, toolType);
            if (fs.existsSync(toolWorkDir)) {
                archive.directory(toolWorkDir, `${moduleName}/${toolType}`);
            }

            // 添加任务级别的日志文件
            const taskLogDir = ECS_LOCAL_PATHS.getTaskLogDir(taskId);
            if (fs.existsSync(taskLogDir)) {
                archive.directory(taskLogDir, 'logs');
            }

            archive.finalize();
        });
    }

    /**
     * 生成本地下载URL
     */
    static generateLocalDownloadUrl(taskId: string, filename: string): string {
        const port = process.env.PORT || process.env.ECS_FILE_DOWNLOAD_PORT || '8080';
        const host = process.env.ECS_DOWNLOAD_HOST || 'localhost';
        return `http://${host}:${port}/api/v1/ecs-files/download/${taskId}/${filename}`;
    }

    /**
     * 检查文件是否存在
     */
    static async fileExists(taskId: string, filename: string): Promise<boolean> {
        const filePath = path.join(ECS_LOCAL_PATHS.getTaskOutputDir(taskId), filename);
        return fs.existsSync(filePath);
    }

    /**
     * 查找任务的结果文件（支持模式匹配）
     * 返回实际存在的文件名
     */
    static async findTaskResultFile(taskId: string): Promise<string | null> {
        const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);

        if (!fs.existsSync(outputDir)) {
            return null;
        }

        try {
            const files = await fs.promises.readdir(outputDir);

            // 查找匹配的结果文件
            // 支持格式：result_{taskId}_{toolType}_*.zip 或 {taskId}_{toolName}.zip
            const resultFile = files.find(file => {
                return file.endsWith('.zip') && (
                    file.startsWith(`result_${taskId}_`) ||
                    file.startsWith(`${taskId}_`)
                );
            });

            return resultFile || null;
        } catch (error) {
            logger.error({
                taskId,
                outputDir,
                error: (error as Error).message
            }, 'Failed to read output directory');
            return null;
        }
    }

    /**
     * 查找特定工具类型的结果文件
     * 优先查找新格式：result_{taskId}_{toolType}_{timestamp}.zip
     * 回退到旧格式：{taskId}_{toolName}.zip
     */
    static async findResultFile(taskId: string, toolType: string): Promise<string | null> {
        const outputDir = ECS_LOCAL_PATHS.getTaskOutputDir(taskId);

        if (!fs.existsSync(outputDir)) {
            return null;
        }

        try {
            const files = await fs.promises.readdir(outputDir);

            // 优先查找新格式：result_{taskId}_{toolType}_{timestamp}.zip
            let resultFile = files.find(file => {
                return file.endsWith('.zip') && file.startsWith(`result_${taskId}_${toolType}_`);
            });

            // 如果没找到，查找旧格式：{taskId}_{toolName}.zip
            if (!resultFile) {
                resultFile = files.find(file => {
                    return file.endsWith('.zip') && file.startsWith(`${taskId}_${toolType}`);
                });
            }

            return resultFile || null;
        } catch (error) {
            logger.error({
                taskId,
                toolType,
                outputDir,
                error: (error as Error).message
            }, 'Failed to find result file');
            return null;
        }
    }

    /**
     * 获取文件路径
     */
    static getFilePath(taskId: string, filename: string): string {
        return path.join(ECS_LOCAL_PATHS.getTaskOutputDir(taskId), filename);
    }

    /**
     * 获取文件大小
     */
    static async getFileSize(taskId: string, filename: string): Promise<number> {
        const filePath = this.getFilePath(taskId, filename);
        if (fs.existsSync(filePath)) {
            const stats = await fs.promises.stat(filePath);
            return stats.size;
        }
        return 0;
    }

    /**
     * 创建任务元数据
     */
    static async createTaskMetadata(taskId: string, metadata: any): Promise<void> {
        const metadataPath = path.join(ECS_LOCAL_PATHS.getTaskDir(taskId), 'metadata.json');
        await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

        logger.info({
            taskId,
            metadataPath
        }, 'Task metadata created');
    }

    /**
     * 更新任务元数据
     */
    static async updateTaskMetadata(taskId: string, updates: any): Promise<void> {
        const metadataPath = path.join(ECS_LOCAL_PATHS.getTaskDir(taskId), 'metadata.json');
        
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
            const content = await fs.promises.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(content);
        }

        const updatedMetadata = { ...metadata, ...updates, updatedAt: new Date().toISOString() };
        await fs.promises.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2));

        logger.info({
            taskId,
            updates: Object.keys(updates)
        }, 'Task metadata updated');
    }

    /**
     * 获取任务元数据
     */
    static async getTaskMetadata(taskId: string): Promise<any | null> {
        const metadataPath = path.join(ECS_LOCAL_PATHS.getTaskDir(taskId), 'metadata.json');
        
        if (fs.existsSync(metadataPath)) {
            const content = await fs.promises.readFile(metadataPath, 'utf8');
            return JSON.parse(content);
        }
        
        return null;
    }

    /**
     * 删除任务目录
     * 使用 rm -rf 命令来处理容器用户(uid=999)创建的文件权限问题
     */
    static async deleteTaskDirectory(taskId: string): Promise<void> {
        const taskDir = ECS_LOCAL_PATHS.getTaskDir(taskId);

        if (fs.existsSync(taskDir)) {
            try {
                // 使用 rm -rf 命令删除，可以可靠地处理容器用户创建的文件
                // 容器内的 sdcuser (uid=999) 创建的文件，fs.promises.rm 无法删除
                execSync(`rm -rf "${taskDir}"`, { stdio: 'ignore' });

                logger.info({
                    taskId,
                    taskDir
                }, 'Task directory deleted');
            } catch (error) {
                logger.error({
                    taskId,
                    taskDir,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }, 'Failed to delete task directory');
                throw error;
            }
        }
    }

    /**
     * 获取任务目录大小
     */
    static async getTaskDirectorySize(taskId: string): Promise<number> {
        const taskDir = ECS_LOCAL_PATHS.getTaskDir(taskId);
        
        if (!fs.existsSync(taskDir)) {
            return 0;
        }

        let totalSize = 0;
        const calculateSize = async (dirPath: string): Promise<void> => {
            const items = await fs.promises.readdir(dirPath);
            
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.promises.stat(itemPath);
                
                if (stats.isDirectory()) {
                    await calculateSize(itemPath);
                } else {
                    totalSize += stats.size;
                }
            }
        };

        await calculateSize(taskDir);
        return totalSize;
    }
}
