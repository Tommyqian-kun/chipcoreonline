import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth.context';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/services/api'; // 使用我们封装的axios实例
import { useToast } from "@/hooks/use-toast";

import { useGlobalTaskStatus } from '@/contexts/task-status.context';
import { useWebSocket } from '@/hooks/useWebSocket';

// Defines the shape of the status object returned by the hook
export type TaskStatus = {
    status: 'IDLE' | 'VALIDATING' | 'SUBMITTING' | 'POLLING' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    progress: number;
    taskId: string | null;
    resultUrl: string | null;
    logUrl: string | null;
    errorMessage: string | null;
    downloadStatus: 'NOT_DOWNLOADED' | 'DOWNLOADING' | 'DOWNLOADED' | 'EXPIRED';
    // 新增ECS Only相关状态
    deploymentMode: 'ecs_only' | 'ecs_oss_acr' | null;
    downloadTimeRemaining: number | null;
    isDownloadExpired: boolean;
    // 新增进度相关字段
    currentStep: string | null;
    finishedAt: string | null; // 添加finishedAt字段用于计算倒计时
    // 添加hasOutput字段
    hasOutput?: boolean;
}

// Defines the parameters for the submitTask function
export interface SubmitTaskParams {
    toolId: string;
    parameters: Record<string, any>;
    inputFile?: File | null;
    inputFiles?: File[]; // 支持多文件上传
}

// 输入验证配置接口
export interface ValidationConfig {
    modNameRequired?: boolean;
    requiredFiles?: {
        fieldName: string;
        fileName: string;
        fileType: 'yaml' | 'verilog' | 'excel' | 'tcl';
        required: boolean;
    }[];
    maxFileSize?: number;
    customValidations?: (data: any) => string[];
}

// 验证结果接口
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const POLLING_INTERVAL = 3000;

// 通用输入验证函数
export const validateToolInput = async (
    data: any,
    config: ValidationConfig
): Promise<ValidationResult> => {
    const errors: string[] = [];

    // 验证ModName
    if (config.modNameRequired) {
        if (!data.modName || data.modName.trim().length === 0) {
            errors.push('ModName不能为空');
        } else if (!/^[a-zA-Z0-9_]+$/.test(data.modName)) {
            errors.push('ModName只能包含字母、数字和下划线');
        }
    }

    // 验证必需文件
    if (config.requiredFiles) {
        for (const fileConfig of config.requiredFiles) {
            const file = data[fileConfig.fieldName];
            if (fileConfig.required && !file) {
                errors.push(`请上传${fileConfig.fileName}文件`);
            }
        }
    }

    // 验证文件大小
    if (config.maxFileSize && config.requiredFiles) {
        for (const fileConfig of config.requiredFiles) {
            const file = data[fileConfig.fieldName];
            if (file && file.size > config.maxFileSize) {
                errors.push(`${fileConfig.fileName}文件大小不能超过${Math.round(config.maxFileSize / 1024 / 1024)}MB`);
            }
        }
    }

    // 自定义验证
    if (config.customValidations) {
        const customErrors = config.customValidations(data);
        errors.push(...customErrors);
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * A custom hook to manage the lifecycle of a tool execution task.
 * It handles task submission, status polling, and result management.
 * @param apiConfig - Optional API configuration for custom endpoints
 * @returns An object containing the task status and functions to interact with the task.
 */
export function useToolExecution(apiConfig?: {
    statusEndpoint?: (taskId: string) => string;
    downloadEndpoint?: (taskId: string, type: string) => string;
}) {
    const { isAuthenticated } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { updateTaskStatus: updateGlobalTaskStatus } = useGlobalTaskStatus();

    const [taskStatus, setTaskStatusState] = useState<TaskStatus>({
        status: 'IDLE',
        progress: 0,
        taskId: null,
        resultUrl: null,
        logUrl: null,
        errorMessage: null,
        downloadStatus: 'NOT_DOWNLOADED',
        // 新增ECS Only相关状态
        deploymentMode: null,
        downloadTimeRemaining: null,
        isDownloadExpired: false,
        // 新增进度相关字段
        currentStep: null,
        finishedAt: null, // 添加finishedAt字段用于计算倒计时
    });

    // 添加组件挂载状态跟踪
    const isMountedRef = useRef(true);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const countdownUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null); // 倒计时更新定时器

    // ECS Only模式下载时间限制（2分钟 = 120秒，与后端ECS_DOWNLOAD_TIMEOUT一致）
    const DOWNLOAD_TIMEOUT_SECONDS = 120;

    // 安全的setState函数，只在组件挂载时更新状态
    const safeSetTaskStatus = useCallback((updater: any) => {
        console.log('🔍 safeSetTaskStatus调用, isMounted:', isMountedRef.current);
        if (isMountedRef.current) {
            setTaskStatusState(updater);
        } else {
            console.log('⚠️ 组件已卸载，跳过状态更新');
        }
    }, []);

    // 基于finishedAt计算下载剩余时间（秒）- 与TaskHistoryTable使用相同逻辑
    const calculateDownloadTimeRemaining = useCallback((finishedAt: string | Date | null): number | null => {
        if (!finishedAt) return null;
        const finishedTime = new Date(finishedAt).getTime();
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - finishedTime) / 1000;
        const remainingSeconds = DOWNLOAD_TIMEOUT_SECONDS - elapsedSeconds;
        return Math.max(0, Math.floor(remainingSeconds));
    }, []);

    // WebSocket任务状态更新处理
    const handleTaskStatusUpdate = useCallback((data: any) => {
        console.log('🔍 WebSocket消息详情:', {
            receivedTaskId: data.taskId,
            dataStatus: data.status,
            dataProgress: data.progress,
            finishedAt: data.finishedAt,
            fullData: data
        });

        console.log('🔍 准备调用safeSetTaskStatus, isMounted:', isMountedRef.current);

        safeSetTaskStatus((prev: TaskStatus) => {
            console.log('🔍 状态更新比较:', {
                receivedTaskId: data.taskId,
                storedTaskId: prev.taskId,
                match: data.taskId === prev.taskId,
                receivedStatus: data.status,
                currentStatus: prev.status
            });

            // 修复：允许接收第一个WebSocket消息时设置taskId，或者taskId匹配时更新
            if (data.taskId === prev.taskId || (prev.taskId === null && data.taskId)) {
                const newFinishedAt = data.finishedAt || prev.finishedAt;
                // 优先使用后端返回的downloadTimeRemaining，如果没有则基于finishedAt计算
                const newDownloadTimeRemaining = data.downloadTimeRemaining !== undefined
                    ? data.downloadTimeRemaining
                    : (newFinishedAt ? calculateDownloadTimeRemaining(newFinishedAt) : prev.downloadTimeRemaining);
                const newStatus = {
                    ...prev,
                    taskId: data.taskId || prev.taskId, // 设置taskId
                    status: data.status || prev.status,
                    progress: data.progress !== undefined ? data.progress : prev.progress,
                    currentStep: data.currentStep !== undefined ? data.currentStep : prev.currentStep,
                    resultUrl: data.resultUrl || data.outputFile || prev.resultUrl,
                    logUrl: data.logUrl || data.logFile || prev.logUrl,
                    errorMessage: data.errorMessage || prev.errorMessage,
                    finishedAt: newFinishedAt,
                    downloadTimeRemaining: newDownloadTimeRemaining,
                    isDownloadExpired: newDownloadTimeRemaining === 0,
                    downloadStatus: data.downloadStatus || prev.downloadStatus,
                    hasOutput: data.hasOutput !== undefined ? data.hasOutput : prev.hasOutput
                };

                console.log('📊 Updated task status:', newStatus);
                console.log('📊 Progress updated to:', newStatus.progress, 'Step:', newStatus.currentStep);

                // 如果任务完成但没有resultUrl，主动获取任务状态
                if (data.status === 'COMPLETED' && !newStatus.resultUrl && prev.taskId) {
                    console.log('🔄 Task completed but no resultUrl, fetching task status...');
                    setTimeout(() => pollTaskStatus(prev.taskId!), 1000);
                }

                console.log('🔍 状态更新成功:', {
                    oldStatus: prev.status,
                    newStatus: newStatus.status,
                    oldProgress: prev.progress,
                    newProgress: newStatus.progress,
                    taskId: newStatus.taskId,
                    finishedAt: newStatus.finishedAt,
                    downloadTimeRemaining: newStatus.downloadTimeRemaining
                });

                return newStatus;
            } else {
                console.log('🔍 taskId不匹配，忽略更新:', {
                    receivedTaskId: data.taskId,
                    storedTaskId: prev.taskId
                });
            }
            return prev;
        });
    }, [safeSetTaskStatus, calculateDownloadTimeRemaining]);

    // 初始化WebSocket
    const { subscribeToTask, unsubscribeFromTask, isConnected } = useWebSocket({
        onTaskStatusUpdate: handleTaskStatusUpdate,
        onError: (error) => {
            console.error('WebSocket error:', error);
        }
    });



    // 包装函数：同时更新本地和全局状态
    const setTaskStatus = useCallback((updater: any) => {
        safeSetTaskStatus((prev: TaskStatus) => {
            const newStatus = typeof updater === 'function' ? updater(prev) : updater;

            // 更新全局任务状态
            updateGlobalTaskStatus({
                isTaskRunning: !['IDLE', 'COMPLETED', 'FAILED'].includes(newStatus.status),
                taskId: newStatus.taskId,
                toolType: newStatus.toolId || null,
                status: newStatus.status
            });

            return newStatus;
        });
    }, [updateGlobalTaskStatus]);

    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        // 取消WebSocket订阅
        if (taskStatus.taskId) {
            unsubscribeFromTask(taskStatus.taskId);
        }
    }, [taskStatus.taskId, unsubscribeFromTask]);
    
    const handleApiError = (error: any, defaultMessage: string) => {
        let message = defaultMessage;
        if (error?.response?.data?.message) {
            message = error.response.data.message;
        } else if (error instanceof Error) {
            message = error.message;
        }
        setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'FAILED', errorMessage: message }));
        toast({
            title: "发生错误",
            description: message,
            variant: "destructive",
        });
        cleanup();
    };

    const submitTask = useCallback(async ({ toolId, parameters, inputFile, inputFiles }: SubmitTaskParams) => {
        if (!isAuthenticated) {
            navigate('/auth/login', { state: { from: location } });
            return;
        }

        // 重置任务状态（开始新任务时）
        setTaskStatus((prev: TaskStatus) => ({
            ...prev,
            status: 'SUBMITTING',
            progress: 0,
            taskId: null,
            resultUrl: null,
            logUrl: null,
            errorMessage: null,
            downloadStatus: 'NOT_DOWNLOADED',
            deploymentMode: null,
            downloadTimeRemaining: null,
            isDownloadExpired: false,
            currentStep: null,
        }));

        try {
            const formData = new FormData();
            formData.append('toolId', toolId);
            // 修复：如果parameters已经是字符串，直接使用；否则转换为JSON字符串
            const parametersString = typeof parameters === 'string' ? parameters : JSON.stringify(parameters);
            formData.append('parameters', parametersString);

            // 支持多文件上传
            if (inputFiles && inputFiles.length > 0) {
                inputFiles.forEach((file) => {
                    formData.append('files', file);
                });
            } else if (inputFile) {
                formData.append('files', inputFile);
            }

            const response = await api.post('/tasks', formData);
            // 修复：从正确的响应结构中获取taskId
            const taskId = response.data.data?.id || response.data.taskId;

            // 调试日志：检查API响应结构
            console.log('🔍 API Response:', response.data);
            console.log('🔍 Extracted taskId:', taskId);
            console.log('🔍 Response data structure:', {
                hasData: !!response.data.data,
                hasTaskId: !!response.data.taskId,
                dataKeys: Object.keys(response.data),
                taskObject: response.data.data
            });

            if (!taskId) {
                throw new Error('任务ID获取失败，请重试');
            }

            // 提交成功后立即显示成功提示
            toast({
                title: "任务提交成功！",
                description: `任务ID: ${taskId}，正在开始执行...`,
                duration: 3000,
            });

            // 立即订阅WebSocket任务更新，使用从响应中获取的taskId
            console.log('📡 Task submitted successfully, taskId:', taskId);

            setTaskStatus((prev: TaskStatus) => {
                const newStatus = { ...prev, status: 'POLLING', taskId, progress: 30 };
                console.log('🔍 设置任务状态为POLLING:', {
                    oldStatus: prev.status,
                    newStatus: newStatus.status,
                    oldTaskId: prev.taskId,
                    newTaskId: newStatus.taskId,
                    progress: newStatus.progress
                });
                return newStatus;
            });

            // 立即订阅WebSocket任务更新
            if (isConnected()) {
                subscribeToTask(taskId);
                console.log('📡 Subscribed to WebSocket updates for task:', taskId);
            } else {
                console.log('❌ WebSocket not connected, will use polling fallback');
            }

            // 轮询机制会在状态变为POLLING时自动启动（见useEffect）
            console.log('📊 Polling will start automatically for POLLING status');

        } catch (error: any) {
            // 处理特定的权限错误
            if (error?.response) {
                const status = error.response.status;
                const message = error.response.data?.message || "任务提交失败";

                if (status === 401) {
                    // 权限验证失败，直接跳转到登录页面，不显示错误提示
                    setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'IDLE' })); // 重置为可提交状态
                    navigate('/auth/login', { state: { from: location } });
                    return;
                } else if (status === 403) {
                    // 权限不足，重置为可提交状态
                    setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'IDLE' }));
                    if (message.includes('subscription')) {
                        handleApiError(error, "您需要有效的订阅才能使用此功能，请升级您的会员计划");
                    } else if (message.includes('daily limit')) {
                        handleApiError(error, "您今日的任务配额已用完，请明天再试或升级会员计划");
                    } else {
                        handleApiError(error, message);
                    }
                    return;
                } else if (status === 429) {
                    // 队列满的情况，重置为可提交状态，允许用户重复提交
                    const queueMessage = error.response.data?.message || "目前任务比较多，请稍等一会再提交";
                    setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'IDLE' })); // 重置为可提交状态
                    toast({
                        title: "队列繁忙",
                        description: queueMessage,
                        variant: "destructive",
                        duration: 5000,
                    });
                    return;
                }
            }
            // 其他错误，重置为可提交状态
            setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'IDLE' }));
            handleApiError(error, "任务提交失败");
        }
    }, [isAuthenticated, navigate, location, cleanup]);

    // 带验证的任务提交函数
    const submitTaskWithValidation = useCallback(async (
        { toolId, parameters, inputFile, inputFiles }: SubmitTaskParams,
        validationConfig: ValidationConfig,
        formData: any
    ) => {
        if (!isAuthenticated) {
            navigate('/auth/login', { state: { from: location } });
            return;
        }

        // 设置验证状态
        setTaskStatus((prev: TaskStatus) => ({ ...prev, status: 'VALIDATING' }));

        try {
            // 执行输入验证
            const validation = await validateToolInput(formData, validationConfig);

            if (!validation.valid) {
                // 验证失败，显示错误信息
                const errorMessage = validation.errors.join('; ');
                setTaskStatus((prev: TaskStatus) => ({
                    ...prev,
                    status: 'FAILED',
                    errorMessage
                }));
                toast({
                    title: "输入验证失败",
                    description: errorMessage,
                    variant: "destructive",
                });
                return;
            }

            // 验证通过，显示成功提示
            toast({
                title: "✅ 输入检查通过！",
                description: "所有文件和参数验证成功，正在提交任务...",
                duration: 2000,
            });

            // 调用原始的submitTask函数
            await submitTask({ toolId, parameters, inputFile, inputFiles });

        } catch (error) {
            handleApiError(error, "输入验证失败");
        }
    }, [isAuthenticated, navigate, location, submitTask, toast]);

    // 轮询任务状态
    const pollTaskStatus = useCallback(async (taskId: string) => {
        try {
            console.log('🔄 Polling task status for:', taskId);
            const statusUrl = apiConfig?.statusEndpoint ? apiConfig.statusEndpoint(taskId) : `/tasks/${taskId}/status`;
            const response = await api.get(statusUrl);
            const {
                status,
                progress,
                resultUrl,
                logUrl,
                deploymentMode,
                downloadTimeRemaining,
                errorMessage,
                currentStep,
                finishedAt
            } = response.data;

            console.log('📊 Polling response:', {
                status,
                progress,
                currentStep,
                resultUrl,
                finishedAt,
                downloadTimeRemaining,
                deploymentMode
            });

            if (status === 'COMPLETED' || status === 'FAILED') {
                const newFinishedAt = finishedAt || taskStatus.finishedAt;
                // 优先使用后端返回的downloadTimeRemaining，如果没有则基于finishedAt计算
                const newDownloadTimeRemaining = downloadTimeRemaining !== undefined
                    ? downloadTimeRemaining
                    : (newFinishedAt ? calculateDownloadTimeRemaining(newFinishedAt) : null);

                setTaskStatus((prev: TaskStatus) => ({
                    ...prev,
                    status,
                    resultUrl,
                    logUrl,
                    progress: status === 'COMPLETED' ? 100 : (progress || prev.progress || 0),
                    deploymentMode,
                    finishedAt: newFinishedAt,
                    downloadTimeRemaining: newDownloadTimeRemaining,
                    isDownloadExpired: newDownloadTimeRemaining === 0,
                    errorMessage,
                    currentStep
                }));

                // 延迟停止轮询，确保获取到最终状态
                setTimeout(() => {
                    cleanup();
                }, 1000);

                // 如果任务失败，显示错误通知
                if (status === 'FAILED') {
                    toast({
                        title: "任务执行失败",
                        description: errorMessage || "任务执行过程中发生错误，请检查输入参数后重新提交。",
                        variant: "destructive",
                    });
                }

                // 倒计时会通过全局定时器自动更新，无需手动启动
                console.log('🔥 [Polling] Task completed, countdown will update automatically via global timer:', {
                    taskId: taskStatus.taskId,
                    finishedAt: newFinishedAt,
                    deploymentMode,
                    status
                });
            } else {
                setTaskStatus((prev: TaskStatus) => ({
                    ...prev,
                    status,
                    progress,
                    resultUrl,
                    logUrl,
                    deploymentMode,
                    errorMessage,
                    currentStep,
                    finishedAt: finishedAt || prev.finishedAt
                }));
            }
        } catch (error) {
            handleApiError(error, "获取任务状态失败");
        }
    }, [toast, cleanup]);

    // 添加全局倒计时更新定时器 - 基于finishedAt实时计算倒计时
    useEffect(() => {
        // 只有当任务已完成且有finishedAt时才启动定时器
        if (taskStatus.status === 'COMPLETED' && taskStatus.finishedAt && taskStatus.downloadTimeRemaining !== null && taskStatus.downloadTimeRemaining !== undefined) {
            // 清除之前的定时器
            if (countdownUpdateIntervalRef.current) {
                clearInterval(countdownUpdateIntervalRef.current);
            }

            // 创建新的定时器，基于finishedAt实时计算倒计时
            const interval = setInterval(() => {
                safeSetTaskStatus((prev: TaskStatus) => {
                    // 基于finishedAt实时计算倒计时，而不是递减
                    if (prev.finishedAt) {
                        const finishedTime = new Date(prev.finishedAt).getTime();
                        const currentTime = Date.now();
                        const elapsedSeconds = (currentTime - finishedTime) / 1000;
                        const newRemaining = Math.max(0, Math.floor(DOWNLOAD_TIMEOUT_SECONDS - elapsedSeconds));
                        return {
                            ...prev,
                            downloadTimeRemaining: newRemaining,
                            isDownloadExpired: newRemaining === 0
                        };
                    }
                    return prev;
                });
            }, 1000);

            countdownUpdateIntervalRef.current = interval;

            // 清理函数
            return () => {
                clearInterval(interval);
                countdownUpdateIntervalRef.current = null;
            };
        } else {
            // 没有需要倒计时的任务，清除定时器
            if (countdownUpdateIntervalRef.current) {
                clearInterval(countdownUpdateIntervalRef.current);
                countdownUpdateIntervalRef.current = null;
            }
        }
    }, [taskStatus.status, taskStatus.finishedAt, safeSetTaskStatus]); // 只监听状态变化，不监听倒计时值变化，避免定时器重启

    useEffect(() => {
        // 当任务状态为POLLING时启用轮询
        if (taskStatus.status === 'POLLING' && taskStatus.taskId && !pollingRef.current) {
            console.log('📊 Starting polling for task:', taskStatus.taskId);
            pollingRef.current = setInterval(() => {
                pollTaskStatus(taskStatus.taskId!);
            }, POLLING_INTERVAL);
        }

        return () => {
            if (taskStatus.status !== 'POLLING' && pollingRef.current) {
                cleanup();
            }
        };
    }, [taskStatus.status, taskStatus.taskId, pollTaskStatus, cleanup]);

    const handleDownload = useCallback(async (type: 'result' | 'log') => {
        if (!taskStatus.taskId) {
            toast({ title: "任务ID不存在", variant: "destructive" });
            return;
        }

        // 设置下载状态
        setTaskStatus((prev: TaskStatus) => ({ ...prev, downloadStatus: 'DOWNLOADING' }));

        try {
            // 使用标准的任务下载API，而不是直接使用resultUrl
            const downloadUrl = apiConfig?.downloadEndpoint ?
                apiConfig.downloadEndpoint(taskStatus.taskId, type) :
                `/tasks/${taskStatus.taskId}/download?type=${type}`;
            const response = await api.get(downloadUrl, {
                responseType: 'blob'
            });

            if (response.status === 200) {
                // 获取文件名 - 优先使用后端返回的Content-Disposition头中的文件名
                const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
                let filename = `result_${taskStatus.taskId}_${type}.zip`; // 默认文件名（现在Content-Disposition头可以正确访问）

                console.log('🔍 useToolExecution.ts 原始响应头:', {
                    allHeaders: response.headers,
                    contentDisposition: contentDisposition
                });

                if (contentDisposition) {
                    // 支持多种Content-Disposition格式的解析
                    let extractedFilename = null;

                    // 方法1: 标准格式 filename="xxx"
                    let match = contentDisposition.match(/filename="([^"]+)"/);
                    if (match) {
                        extractedFilename = match[1];
                    } else {
                        // 方法2: 无引号格式 filename=xxx
                        match = contentDisposition.match(/filename=([^;,\s]+)/);
                        if (match) {
                            extractedFilename = match[1];
                        }
                    }

                    if (extractedFilename) {
                        filename = extractedFilename;
                        console.log('✅ useToolExecution.ts 成功提取文件名:', filename);
                    } else {
                        console.log('❌ useToolExecution.ts 无法提取文件名，使用默认值');
                    }
                } else {
                    console.log('❌ useToolExecution.ts 没有Content-Disposition头');
                }

                console.log('📁 useToolExecution.ts 最终使用的文件名:', filename);

                // 创建下载链接
                const blob = new Blob([response.data]);
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(downloadUrl);

                // 设置为已下载状态
                setTaskStatus((prev: TaskStatus) => ({ ...prev, downloadStatus: 'DOWNLOADED' }));
                toast({
                    title: "下载成功",
                    description: `文件 ${filename} 已下载到本地`,
                    duration: 3000
                });
            } else {
                throw new Error(`下载失败 (${response.status})`);
            }
        } catch (error: any) {
            // 详细的错误处理
            let errorMessage = '下载失败';

            if (error?.response) {
                const status = error.response.status;
                if (status === 401) {
                    errorMessage = '认证失败，请重新登录';
                } else if (status === 404) {
                    errorMessage = '文件不存在或已过期，请重新执行任务';
                } else if (status === 403) {
                    errorMessage = '没有下载权限';
                } else {
                    errorMessage = error.response?.data?.message || `下载失败 (${status})`;
                }
            } else if (error.code === 'NETWORK_ERROR') {
                errorMessage = '网络连接失败，请检查网络后重试';
            } else {
                errorMessage = error.message || '下载过程中发生未知错误';
            }

            console.error('Download failed:', {
                error: error.message,
                response: error?.response,
                taskId: taskStatus.taskId,
                type
            });

            setTaskStatus((prev: TaskStatus) => ({ ...prev, downloadStatus: 'NOT_DOWNLOADED' }));
            toast({
                title: "下载失败",
                description: errorMessage,
                variant: "destructive",
            });
        }
    }, [taskStatus.taskId, toast, apiConfig]);

    const resetTask = useCallback(() => {
        cleanup();
        setTaskStatus({
            status: 'IDLE',
            progress: 0,
            taskId: null,
            resultUrl: null,
            logUrl: null,
            errorMessage: null,
            downloadStatus: 'NOT_DOWNLOADED',
            deploymentMode: null,
            downloadTimeRemaining: null,
            isDownloadExpired: false,
            currentStep: null,
        });

        // 刷新页面重新填写表单（工具通用功能逻辑）
        window.location.reload();
    }, [cleanup]);

    // 组件挂载状态管理和清理
    useEffect(() => {
        // 组件挂载时设置为true
        isMountedRef.current = true;

        return () => {
            // 标记组件已卸载
            isMountedRef.current = false;

            // 清理定时器
            if (countdownUpdateIntervalRef.current) {
                clearInterval(countdownUpdateIntervalRef.current);
                countdownUpdateIntervalRef.current = null;
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, []);

    return {
        taskStatus,
        submitTask,
        submitTaskWithValidation,
        handleDownload,
        resetTask,
        setTaskStatus
    };
}