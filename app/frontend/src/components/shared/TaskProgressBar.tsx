import React from 'react';
import { Progress } from '@/components/ui/progress';
import { getTaskProgress, getProgressDescription } from '@/utils/taskProgress';

interface TaskProgressBarProps {
  status: string;
  currentStep?: string;
  taskId?: string | null;
  variant?: 'default' | 'compact';
  className?: string;
  progress?: number; // 添加直接的progress属性
}

/**
 * 统一的任务进度条组件
 * 用于工具页面和任务历史表格
 */
export const TaskProgressBar: React.FC<TaskProgressBarProps> = ({
  status,
  currentStep,
  taskId,
  variant = 'default',
  className = '',
  progress: propProgress
}) => {
  // 修复：优先使用传入的progress值，确保显示实际进度
  const progress = propProgress !== undefined ? propProgress : getTaskProgress(status, currentStep);
  let description = getProgressDescription(status, currentStep);

  // 如果有taskId，将"启动容器执行工具命令"等文字替换为实际任务ID
  if (taskId && (currentStep === 'CONTAINER_EXECUTION' || status === 'RUNNING')) {
    description = `任务ID: ${taskId}`;
  }

  if (variant === 'compact') {
    // 紧凑版本，用于任务历史表格
    return (
      <div className={`flex items-center space-x-2 min-w-[120px] ${className}`}>
        <Progress value={progress} className="w-16 h-2" />
        <span className="text-xs text-gray-600 font-mono">
          {progress}%
        </span>
      </div>
    );
  }

  // 完整版本，用于工具页面
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">执行进度</span>
        <span className="text-sm text-gray-500">{progress}%</span>
      </div>
      
      <Progress value={progress} className="w-full h-2" />

      <p className="text-xs text-gray-600">{description}</p>
    </div>
  );
};

export default TaskProgressBar;
