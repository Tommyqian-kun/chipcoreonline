import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Upload, AlertCircle } from 'lucide-react';
import { TaskStatus } from '@/hooks/useToolExecution';

interface ToolSubmissionButtonProps {
    taskStatus: TaskStatus;
    isSubmitting?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
}

export const ToolSubmissionButton: React.FC<ToolSubmissionButtonProps> = ({
    taskStatus,
    isSubmitting = false,
    disabled = false,
    onClick,
    children = 'Submission'
}) => {
    // 修改按钮禁用逻辑：确保状态转换的正确性
    const isDisabled = disabled ||
        isSubmitting ||
        (taskStatus.status !== 'IDLE' && taskStatus.status !== 'FAILED');

    const getButtonText = () => {
        // 根据后端真实状态显示按钮文字，确保状态转换的连续性
        if (isSubmitting || taskStatus.status === 'SUBMITTING') return 'Submitting...';
        if (taskStatus.status === 'PENDING') return 'Processing...';  // 等待处理
        if (taskStatus.status === 'RUNNING') return 'Processing...';  // 正在处理
        if (taskStatus.status === 'POLLING') return 'Processing...';  // 轮询状态
        if (taskStatus.status === 'COMPLETED') return 'Task Completed';
        if (taskStatus.status === 'FAILED') return 'Task Failed';
        return children;
    };

    const showLoader = isSubmitting ||
        taskStatus.status === 'VALIDATING' ||
        taskStatus.status === 'SUBMITTING' ||
        taskStatus.status === 'POLLING';

    return (
        <Button
            type={onClick ? "button" : "submit"}
            className={`font-bold text-lg px-12 py-3 rounded-lg shadow-lg transform transition-all duration-200 ${
                isDisabled
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white hover:scale-105 hover:shadow-xl'
            }`}
            disabled={isDisabled}
            onClick={onClick}
        >
            {showLoader && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {getButtonText()}
        </Button>
    );
};

interface ToolDownloadButtonProps {
    taskStatus: TaskStatus;
    onClick?: () => void;
    fileName?: string;
    className?: string;
}

export const ToolDownloadButton: React.FC<ToolDownloadButtonProps> = ({
    taskStatus,
    onClick,
    fileName = 'result',
    className = ''
}) => {
    // 格式化倒计时时间为MM:SS格式
    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getButtonText = () => {
        if (taskStatus.status === 'COMPLETED') {
            // 检查文件是否过期
            if (taskStatus.downloadTimeRemaining !== null && taskStatus.downloadTimeRemaining <= 0) {
                return 'File Expired - Please Re-run Task';
            }

            // 格式化倒计时显示
            const countdownText = (taskStatus.downloadTimeRemaining && taskStatus.downloadTimeRemaining > 0)
                ? `(${formatCountdown(taskStatus.downloadTimeRemaining)})`
                : '';

            if (taskStatus.downloadStatus === 'DOWNLOADED') {
                // 已下载状态：显示倒计时
                return `Download Generated Results ✓ ${countdownText}`;
            } else if (taskStatus.downloadStatus === 'DOWNLOADING') {
                // 下载中状态：显示倒计时
                return `Downloading... ${countdownText}`;
            } else {
                // 未下载状态：显示倒计时
                return `Download Generated Results ${countdownText}`;
            }
        } else if (taskStatus.status === 'PENDING' ||
                   taskStatus.status === 'RUNNING' ||
                   taskStatus.status === 'POLLING' ||
                   taskStatus.status === 'SUBMITTING') {
            return 'Processing...';
        } else if (taskStatus.status === 'FAILED') {
            return 'Execution Failed';
        } else {
            return 'Download Zip Data';
        }
    };

    const getButtonStyle = () => {
        if (taskStatus.status === 'COMPLETED') {
            // 修复：移除对resultUrl的依赖，只要任务完成就可以显示下载样式
            if (taskStatus.downloadStatus === 'DOWNLOADED') {
                // 已下载状态：绿蓝渐变，与任务历史页面保持一致
                return 'bg-gradient-to-r from-green-600 to-blue-500 hover:from-green-700 hover:to-blue-600 text-white cursor-pointer shadow-lg hover:scale-105';
            } else if (taskStatus.downloadStatus === 'DOWNLOADING') {
                // 下载中状态：蓝色不可点击
                return 'bg-blue-500 text-white cursor-not-allowed border-blue-500';
            } else {
                // 未下载状态（倒计时中）：蓝橙渐变，与任务历史页面保持一致
                return 'bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white cursor-pointer shadow-lg hover:scale-105';
            }
        } else if (taskStatus.status === 'PENDING' ||
                   taskStatus.status === 'RUNNING' ||
                   taskStatus.status === 'POLLING' ||
                   taskStatus.status === 'SUBMITTING') {
            return 'bg-yellow-400 text-yellow-800 cursor-not-allowed border-yellow-400';
        } else if (taskStatus.status === 'FAILED') {
            return 'bg-red-400 text-red-800 cursor-not-allowed border-red-400';
        } else {
            // IDLE状态：灰色不可点击
            return 'bg-gray-400 text-gray-600 cursor-not-allowed border-gray-400';
        }
    };

    const getIcon = () => {
        if (taskStatus.status === 'COMPLETED') {
            // 修复：移除对resultUrl的依赖，只要任务完成就可以显示下载图标
            if (taskStatus.downloadStatus === 'DOWNLOADING') {
                return <Loader2 className="mr-2 h-5 w-5 animate-spin" />;
            } else {
                return <Download className="mr-2 h-5 w-5" />;
            }
        } else if (taskStatus.status === 'PENDING' ||
                   taskStatus.status === 'RUNNING' ||
                   taskStatus.status === 'POLLING' ||
                   taskStatus.status === 'SUBMITTING') {
            return <Loader2 className="mr-2 h-5 w-5 animate-spin" />;
        } else if (taskStatus.status === 'FAILED') {
            return <AlertCircle className="mr-2 h-5 w-5" />;
        } else {
            return <Download className="mr-2 h-5 w-5" />;
        }
    };

    const isDisabled = taskStatus.status !== 'COMPLETED' ||
        taskStatus.downloadStatus === 'DOWNLOADING' ||
        // 修复：如果下载时间已过期，禁用按钮
        (taskStatus.downloadTimeRemaining !== null && taskStatus.downloadTimeRemaining <= 0);

    return (
        <Button
            className={`px-16 py-4 text-lg border-2 border-dashed w-96 font-bold transform transition-all duration-300 ${getButtonStyle()} ${className}`}
            disabled={isDisabled}
            onClick={onClick}
        >
            {getIcon()}
            {getButtonText()}
        </Button>
    );
};
