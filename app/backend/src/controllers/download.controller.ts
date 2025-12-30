/**
 * 下载控制器
 * 处理任务结果文件的下载请求
 */

import { Request, Response } from 'express';
import DownloadService from '../services/download.service';

/**
 * 生成任务结果下载凭证
 */
export const generateDownloadCredential = async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const { fileName } = req.query;
        
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const credential = await DownloadService.generateDownloadCredential(
            taskId,
            req.user.id,
            fileName as string || 'sdc_result.zip'
        );

        // 记录下载凭证生成事件
        await DownloadService.recordDownloadEvent(
            taskId,
            req.user.id,
            credential.fileName,
            req.get('User-Agent'),
            req.ip
        );

        res.json({
            success: true,
            credential,
            message: 'Download credential generated successfully'
        });

    } catch (error) {
        console.error('Generate download credential error:', error);
        
        if ((error as Error).message.includes('not found')) {
            return res.status(404).json({ 
                message: 'Task not found or not completed',
                error: (error as Error).message 
            });
        }
        
        res.status(500).json({ 
            message: 'Failed to generate download credential',
            error: (error as Error).message 
        });
    }
};

/**
 * 获取任务完整下载包
 */
export const getTaskDownloadPackage = async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const downloadPackage = await DownloadService.generateTaskDownloadPackage(
            taskId,
            req.user.id
        );

        res.json({
            success: true,
            package: downloadPackage,
            message: 'Download package generated successfully'
        });

    } catch (error) {
        console.error('Get download package error:', error);
        
        if ((error as Error).message.includes('not found')) {
            return res.status(404).json({ 
                message: 'Task not found or not completed',
                error: (error as Error).message 
            });
        }
        
        res.status(500).json({ 
            message: 'Failed to generate download package',
            error: (error as Error).message 
        });
    }
};

/**
 * 获取任务可下载文件列表
 */
export const getDownloadableFiles = async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const files = await DownloadService.getTaskDownloadableFiles(
            taskId,
            req.user.id
        );

        res.json({
            success: true,
            files,
            taskId,
            message: 'Downloadable files retrieved successfully'
        });

    } catch (error) {
        console.error('Get downloadable files error:', error);
        
        if ((error as Error).message.includes('not found')) {
            return res.status(404).json({ 
                message: 'Task not found or not completed',
                error: (error as Error).message 
            });
        }
        
        res.status(500).json({ 
            message: 'Failed to get downloadable files',
            error: (error as Error).message 
        });
    }
};

/**
 * 直接下载文件（重定向到预签名URL）
 */
export const downloadFile = async (req: Request, res: Response) => {
    // 强制调试日志 - 检查是否被错误调用
    console.log('🚨 [WRONG ROUTE] downloadFile 函数被调用 - 这不应该发生！');
    console.log('🚨 [WRONG ROUTE] taskId:', req.params.taskId);
    console.log('🚨 [WRONG ROUTE] fileName:', req.params.fileName);
    console.log('🚨 [WRONG ROUTE] query:', req.query);
    console.log('🚨 [WRONG ROUTE] 完整URL:', req.originalUrl);

    try {
        const { taskId, fileName } = req.params;

        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const credential = await DownloadService.generateDownloadCredential(
            taskId,
            req.user.id,
            fileName || 'sdc_result.zip',
            1 // 1小时有效期，用于直接下载
        );

        // 记录下载事件
        await DownloadService.recordDownloadEvent(
            taskId,
            req.user.id,
            credential.fileName,
            req.get('User-Agent'),
            req.ip
        );

        // 重定向到预签名URL
        res.redirect(credential.downloadUrl);

    } catch (error) {
        console.error('Download file error:', error);
        
        if ((error as Error).message.includes('not found')) {
            return res.status(404).json({ 
                message: 'Task not found or not completed',
                error: (error as Error).message 
            });
        }
        
        res.status(500).json({ 
            message: 'Failed to download file',
            error: (error as Error).message 
        });
    }
};
