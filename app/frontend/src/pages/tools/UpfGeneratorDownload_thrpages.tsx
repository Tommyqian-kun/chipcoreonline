/**
 * UPF工具多页面交互 - 下载页面
 * 完全复用SDC多页面工具的下载功能和useToolExecution hook
 */

import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToolDownloadButton } from '@/components/common/ToolButtons';
import { TaskProgressBar } from '@/components/shared/TaskProgressBar';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { usePreventBackNavigation } from '@/hooks/usePreventBackNavigation';
import { useToolExecution } from '@/hooks/useToolExecution';

const UpfGeneratorDownloadThrpages: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();

  // 防止浏览器返回导航，确保单向流程
  usePreventBackNavigation();

  // 完全复用单页面的useToolExecution hook - 使用相同的API端点
  const { taskStatus, handleDownload, setTaskStatus } = useToolExecution();

  // 初始化任务状态 - 设置taskId以启动轮询
  useEffect(() => {
    if (taskId && !taskStatus.taskId) {
      console.log(`[MultiPage] 初始化任务状态: ${taskId}`);
      setTaskStatus((prev: any) => ({ ...prev, taskId, status: 'POLLING' }));
    }
  }, [taskId, taskStatus.taskId, setTaskStatus]);

  // 复用单页面的下载逻辑 - 直接调用useToolExecution的handleDownload
  const handleDownloadClick = () => {
    handleDownload('result');
  };

  // 如果没有taskId，显示错误
  if (!taskId) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          任务ID不存在，请检查URL
        </AlertDescription>
      </Alert>
    );
  }

  // 如果正在加载，显示加载状态
  if (!taskStatus.taskId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">加载任务状态...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="relative">
        {/* 任务状态显示 - 显示倒计时信息 */}
        {taskStatus.downloadTimeRemaining && taskStatus.downloadTimeRemaining > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-center space-x-2">
              <span className="text-blue-700 font-medium">
                文件下载倒计时：{Math.floor(taskStatus.downloadTimeRemaining / 60)}:{(taskStatus.downloadTimeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        {/* UPF数据输出框 - 完全复用SDC页面设计 */}
        <Card className="border-2 border-orange-400 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-blue-600">
              UPF数据输出：
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <ToolDownloadButton
                taskStatus={taskStatus}
                onClick={handleDownloadClick}
                fileName="upf_result"
              />
            </div>

            {/* 任务进度条显示 - 完全复用SDC页面逻辑 */}
            {taskStatus.status !== 'IDLE' && (
              <div className="mt-6">
                <TaskProgressBar
                  status={taskStatus.status}
                  currentStep={taskStatus.currentStep || undefined}
                  taskId={taskStatus.taskId || undefined}
                  variant="default"
                  progress={taskStatus.progress}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 任务历史按钮和开始新任务按钮 - 绝对定位在Card外面的右侧 */}
        <div className="absolute top-[1.25rem] -right-4 transform translate-x-full">
          <div className="flex flex-col space-y-3">
            <ToolPageTaskHistoryButton taskStatus={taskStatus} />
            <Button
              onClick={() => window.open('/tools', '_blank')}
              className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              开始新任务
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpfGeneratorDownloadThrpages;
