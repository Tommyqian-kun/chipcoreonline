/**
 * ECS Only模式状态指示器组件
 * 显示任务状态、倒计时和相关提示信息
 */

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock, Loader2, Download, AlertTriangle, CheckCircle } from "lucide-react";
import { TaskStatus } from '@/hooks/useToolExecution';

interface EcsOnlyStatusIndicatorProps {
    status: TaskStatus['status'];
    downloadTimeRemaining: number | null;
    isDownloadExpired: boolean;
    deploymentMode: string | null;
    progress?: number;
}

export const EcsOnlyStatusIndicator: React.FC<EcsOnlyStatusIndicatorProps> = ({
    status,
    downloadTimeRemaining,
    isDownloadExpired,
    deploymentMode,
    progress = 0
}) => {
    // 只在ECS Only模式下显示
    if (deploymentMode !== 'ecs_only') return null;

    // 格式化时间显示
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 根据状态返回不同的指示器
    switch (status) {
        case 'SUBMITTING':
            return (
                <Alert className="border-blue-200 bg-blue-50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>正在提交任务</AlertTitle>
                    <AlertDescription>
                        正在将您的任务提交到ECS执行队列，请稍候...
                    </AlertDescription>
                </Alert>
            );

        case 'POLLING':
            return (
                <Alert className="border-orange-200 bg-orange-50">
                    <Clock className="h-4 w-4" />
                    <AlertTitle>任务排队中</AlertTitle>
                    <AlertDescription>
                        <div className="space-y-2">
                            <div>您的任务正在队列中等待执行，请耐心等待...</div>
                            {progress > 0 && (
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className="bg-orange-500 h-2 rounded-full transition-all duration-300" 
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>
                    </AlertDescription>
                </Alert>
            );

        case 'COMPLETED':
            if (isDownloadExpired) {
                return (
                    <Alert className="border-red-200 bg-red-50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>下载已过期</AlertTitle>
                        <AlertDescription>
                            <div className="space-y-2">
                                <div>下载时间已过期，为保护您的数据隐私，结果文件已被自动删除。</div>
                                <div className="text-sm text-red-600">
                                    如需重新获取结果，请重新提交任务。
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                );
            }

            if (downloadTimeRemaining !== null && downloadTimeRemaining > 0) {
                return (
                    <Alert className="border-green-200 bg-green-50">
                        <Download className="h-4 w-4" />
                        <AlertTitle>任务完成 - 请及时下载</AlertTitle>
                        <AlertDescription>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-lg text-green-700">
                                        剩余下载时间: {formatTime(downloadTimeRemaining)}
                                    </span>
                                    <div className="text-sm text-green-600">
                                        {downloadTimeRemaining <= 30 && (
                                            <span className="animate-pulse font-bold text-red-600">
                                                ⚠️ 即将过期
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className={`h-2 rounded-full transition-all duration-1000 ${
                                            downloadTimeRemaining <= 30 ? 'bg-red-500' : 'bg-green-500'
                                        }`}
                                        style={{ width: `${(downloadTimeRemaining / 120) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="text-sm text-gray-600">
                                    为保护您的数据隐私，结果文件将在2分钟后自动删除
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                );
            }

            return (
                <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>任务完成</AlertTitle>
                    <AlertDescription>
                        您的任务已成功完成，可以下载结果文件。
                    </AlertDescription>
                </Alert>
            );

        case 'FAILED':
            return (
                <Alert className="border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>任务执行失败</AlertTitle>
                    <AlertDescription>
                        任务执行过程中发生错误，请检查输入参数后重新提交。
                    </AlertDescription>
                </Alert>
            );

        default:
            return null;
    }
};

export default EcsOnlyStatusIndicator;
