import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Download, Clock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserTasks, Task } from '@/services/task.service';
import { downloadTaskResult, updateTaskDownloadStatus } from '@/services/download.service';
import { useWebSocket } from '@/hooks/useWebSocket';
import TaskProgressBar from './TaskProgressBar';

interface TaskHistoryTableProps {
  showUserInfo?: boolean; // 后台管理显示用户信息
  userId?: string; // 指定用户ID（可选）
  toolId?: string; // 指定工具ID（可选）
  pageSize?: number;
  className?: string;
}

interface EnhancedTask extends Task {
  downloadTimeRemaining?: number;
}

export const TaskHistoryTable: React.FC<TaskHistoryTableProps> = ({
  showUserInfo = false,
  userId,
  toolId,
  pageSize = 10,
  className = ''
}) => {
  const [tasks, setTasks] = useState<EnhancedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // 倒计时更新定时器 - 每秒更新一次所有活跃任务的倒计时
  const [countdownUpdateInterval, setCountdownUpdateInterval] = useState<NodeJS.Timeout | null>(null);
  // 使用ref跟踪是否有需要倒计时的任务，避免依赖tasks数组导致定时器重启
  const hasCountdownTasksRef = useRef(false);

  // ECS Only模式下载时间限制（2分钟 = 120秒，与后端ECS_DOWNLOAD_TIMEOUT一致）
  const DOWNLOAD_TIMEOUT_SECONDS = 120;

  // WebSocket处理任务状态更新
  const handleTaskStatusUpdate = (data: any) => {
    setTasks(prev => {
      const updated = prev.map(task => {
        if (task.id === data.taskId) {
          return {
            ...task,
            status: data.status || task.status,
            progress: data.progress !== undefined ? data.progress : task.progress,
            currentStep: data.currentStep !== undefined ? data.currentStep : task.currentStep,
            downloadStatus: data.downloadStatus || task.downloadStatus,
            // 优先使用后端返回的downloadTimeRemaining，如果没有则基于finishedAt计算
            downloadTimeRemaining: data.downloadTimeRemaining !== undefined
              ? data.downloadTimeRemaining
              : (data.finishedAt ? calculateDownloadTimeRemaining(data.finishedAt) : task.downloadTimeRemaining),
            hasResult: data.hasOutput !== undefined ? data.hasOutput : task.hasResult,
            finishedAt: data.finishedAt || task.finishedAt,
            duration: data.duration !== undefined ? data.duration : task.duration,
            lastUpdated: Date.now()
          };
        }
        return task;
      });

      // 更新ref：检查是否有需要倒计时的任务
      hasCountdownTasksRef.current = updated.some(task =>
        task.status === 'COMPLETED' && task.downloadTimeRemaining !== null && task.downloadTimeRemaining !== undefined
      );

      return updated;
    });
  };

  // 基于finishedAt计算下载剩余时间（秒）
  const calculateDownloadTimeRemaining = useCallback((finishedAt: string | Date): number => {
    const finishedTime = new Date(finishedAt).getTime();
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - finishedTime) / 1000;
    const remainingSeconds = DOWNLOAD_TIMEOUT_SECONDS - elapsedSeconds;
    return Math.max(0, Math.floor(remainingSeconds));
  }, []);

  // 初始化WebSocket
  const { subscribeToTask, unsubscribeFromTask } = useWebSocket({
    onTaskStatusUpdate: handleTaskStatusUpdate
  });

  // 加载任务数据
  const loadTasks = async () => {
    try {
      setLoading(true);
      const response = await getUserTasks({
        page: currentPage,
        limit: pageSize
      });

      setTasks(response.data);
      setTotalPages(response.pagination.totalPages);

      // 更新ref：检查是否有需要倒计时的任务
      hasCountdownTasksRef.current = response.data.some(task =>
        task.status === 'COMPLETED' && task.downloadTimeRemaining !== null && task.downloadTimeRemaining !== undefined
      );

      // 调试日志：检查API返回的数据
      console.log('[TaskHistory] Loaded tasks:', response.data.map(task => ({
        id: task.id,
        status: task.status,
        downloadStatus: task.downloadStatus,
        finishedAt: task.finishedAt,
        downloadTimeRemaining: task.downloadTimeRemaining,
        hasResult: task.hasResult
      })));

      // 初始化WebSocket订阅和倒计时
      response.data.forEach(task => {
        // 订阅正在执行的任务的WebSocket更新
        if (['PENDING', 'RUNNING', 'POLLING'].includes(task.status)) {
          subscribeToTask(task.id);
        }

        // 为已完成且有finishedAt的任务，倒计时会通过全局定时器自动计算
        if (task.status === 'COMPLETED' && task.finishedAt) {
          console.log(`[TaskHistory] Task ${task.id} finished at ${task.finishedAt}, countdown will update automatically`);
        }
      });

    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [currentPage, pageSize]);

  // 添加全局倒计时更新定时器 - 基于finishedAt实时计算倒计时
  useEffect(() => {
    // 在组件挂载时启动定时器，定时器内部检查是否有需要倒计时的任务
    // 这样可以避免依赖tasks数组导致定时器重启
    const interval = setInterval(() => {
      setTasks(prevTasks => {
        // 检查是否有需要倒计时的任务（基于finishedAt计算）
        const hasCountdownTasks = prevTasks.some(task =>
          task.status === 'COMPLETED' && task.finishedAt && task.downloadTimeRemaining !== null && task.downloadTimeRemaining !== undefined
        );

        // 更新ref
        hasCountdownTasksRef.current = hasCountdownTasks;

        // 如果没有需要倒计时的任务，不更新
        if (!hasCountdownTasks) {
          return prevTasks;
        }

        // 更新需要倒计时的任务 - 基于finishedAt实时计算
        return prevTasks.map(task => {
          // 只更新已完成且有finishedAt的任务
          if (task.status === 'COMPLETED' && task.finishedAt && task.downloadTimeRemaining !== null && task.downloadTimeRemaining !== undefined) {
            // 基于finishedAt实时计算倒计时，而不是递减
            const finishedTime = new Date(task.finishedAt).getTime();
            const currentTime = Date.now();
            const elapsedSeconds = (currentTime - finishedTime) / 1000;
            const newRemaining = Math.max(0, Math.floor(DOWNLOAD_TIMEOUT_SECONDS - elapsedSeconds));

            // 如果倒计时结束且状态不是EXPIRED，更新状态并调用后端API
            if (newRemaining === 0 && task.downloadStatus !== 'EXPIRED') {
              // 调用后端API更新状态
              updateTaskDownloadStatus(task.id, 'EXPIRED').catch(err => {
                console.error(`[TaskHistory] Failed to update EXPIRED status for task ${task.id}:`, err);
              });

              return {
                ...task,
                downloadTimeRemaining: 0,
                downloadStatus: 'EXPIRED' as any
              };
            }

            return {
              ...task,
              downloadTimeRemaining: newRemaining
            };
          }
          return task;
        });
      });
    }, 1000);

    setCountdownUpdateInterval(interval);

    // 清理函数
    return () => {
      clearInterval(interval);
    };
  }, []); // 空依赖数组，只在组件挂载时启动一次定时器

  // 添加定期刷新机制，确保数据实时性
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // 只在有运行中的任务时刷新
      const hasRunningTasks = tasks.some(task =>
        task.status === 'RUNNING' || task.status === 'PENDING'
      );
      if (hasRunningTasks) {
        loadTasks();
      }
    }, 5000); // 每5秒刷新一次

    return () => clearInterval(refreshInterval);
  }, [tasks]);

  // 清理倒计时定时器
  useEffect(() => {
    return () => {
      if (countdownUpdateInterval) {
        clearInterval(countdownUpdateInterval);
      }
    };
  }, [countdownUpdateInterval]);

  // 处理下载 - 完全复用单页面的下载逻辑
  const handleDownload = async (taskId: string) => {
    try {
      // 统一使用单页面的下载服务，与下载页面保持一致
      await downloadTaskResult(taskId);

      // 更新本地状态为已下载，但保持倒计时继续运行
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, downloadStatus: 'DOWNLOADED' as any }
          : task
      ));

    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // 格式化时间 - 增加秒级精度以区分提交时间和完成时间
  const formatTime = (dateString: string | undefined) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
    } catch {
      return '-';
    }
  };

  // 格式化持续时间
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}时${minutes}分`;
  };

  // 格式化倒计时 - 与工具页面保持一致的格式
  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 获取状态徽章
  const getStatusBadge = (task: EnhancedTask) => {
    const status = task.executionStatus || task.status;

    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            <Clock className="w-3 h-3 mr-1" />
            填写中
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            等待中
          </Badge>
        );
      case 'RUNNING':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            执行中
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="success" className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            已完成
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            失败
          </Badge>
        );
      case 'QUEUE_TIMEOUT':
        return (
          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            队列超时
          </Badge>
        );
      case 'EXECUTION_TIMEOUT':
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            执行超时
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            {status}
          </Badge>
        );
    }
  };

  // 获取下载按钮 - 简化逻辑，直接使用任务的 downloadTimeRemaining
  const getDownloadButton = useCallback((task: EnhancedTask) => {
    // 直接使用任务的 downloadTimeRemaining 属性，与工具页面保持一致
    const downloadTime = task.downloadTimeRemaining;

    // 调试日志：检查任务下载状态
    console.log(`[TaskHistory] Download button for task ${task.id}:`, {
      downloadStatus: task.downloadStatus,
      downloadTime,
      downloadTimeRemaining: task.downloadTimeRemaining,
      hasResult: task.hasResult,
      status: task.status
    });

    switch (task.downloadStatus) {
      case 'AVAILABLE':
        if (downloadTime && downloadTime > 0) {
          return (
            <Button
              size="sm"
              onClick={() => handleDownload(task.id)}
              className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600"
            >
              <Download className="w-3 h-3 mr-1" />
              下载({formatCountdown(downloadTime)})
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            onClick={() => handleDownload(task.id)}
            className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600"
          >
            <Download className="w-3 h-3 mr-1" />
            下载
          </Button>
        );
      case 'NOT_DOWNLOADED':
        // NOT_DOWNLOADED状态：如果有下载时间剩余，说明任务刚完成，应该显示下载按钮
        if (downloadTime && downloadTime > 0) {
          return (
            <Button
              size="sm"
              onClick={() => handleDownload(task.id)}
              className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600"
            >
              <Download className="w-3 h-3 mr-1" />
              下载({formatCountdown(downloadTime)})
            </Button>
          );
        }
        // 如果没有下载时间剩余，显示已过期
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
            <XCircle className="w-3 h-3 mr-1" />
            已过期
          </Badge>
        );
      case 'DOWNLOADED':
        if (downloadTime && downloadTime > 0) {
          return (
            <Button
              size="sm"
              onClick={() => handleDownload(task.id)}
              className="bg-gradient-to-r from-green-600 to-blue-500 hover:from-green-700 hover:to-blue-600"
            >
              <Download className="w-3 h-3 mr-1" />
              重新下载({formatCountdown(downloadTime)})
            </Button>
          );
        }
        // 倒计时结束后显示已过期
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
            <XCircle className="w-3 h-3 mr-1" />
            已过期
          </Badge>
        );
      case 'EXPIRED':
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-600">
            <XCircle className="w-3 h-3 mr-1" />
            已过期
          </Badge>
        );
      case 'NO_RESULT':
        return <span className="text-gray-400">无结果</span>;
      default:
        // 如果任务未完成，显示无结果
        if (!['COMPLETED'].includes(task.status)) {
          return <span className="text-gray-400">无结果</span>;
        }
        // 如果没有结果文件，显示无结果
        if (!task.hasResult) {
          return <span className="text-gray-400">无结果</span>;
        }
        // 对于已完成且有结果文件的任务，显示为可下载
        return (
          <Button
            size="sm"
            onClick={() => handleDownload(task.id)}
            className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600"
          >
            <Download className="w-3 h-3 mr-1" />
            下载
          </Button>
        );
    }
  }, [handleDownload]); // 移除 downloadTimers 依赖，因为我们直接使用 task.downloadTimeRemaining

  if (loading) {
    return <TaskHistoryTableSkeleton />;
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold text-gray-900">任务ID</TableHead>
            <TableHead className="font-semibold text-gray-900">工具名称</TableHead>
            <TableHead className="font-semibold text-gray-900">进度</TableHead>
            <TableHead className="font-semibold text-gray-900">提交时间</TableHead>
            <TableHead className="font-semibold text-gray-900">持续时间</TableHead>
            <TableHead className="font-semibold text-gray-900">执行状态</TableHead>
            <TableHead className="font-semibold text-gray-900">下载结果</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length > 0 ? (
            tasks.map(task => (
              <TableRow
                key={task.id}
                className="hover:bg-orange-50/50 transition-colors duration-200"
              >
                <TableCell className="font-mono text-blue-600">
                  {task.id.slice(0, 8)}...
                </TableCell>
                <TableCell className="font-medium">
                  {task.tool.name}
                </TableCell>
                <TableCell>
                  <TaskProgressBar
                    status={task.status}
                    currentStep={task.currentStep}
                    variant="compact"
                    progress={task.progress}
                  />
                </TableCell>
                <TableCell>
                  {formatTime(task.queuedAt || task.createdAt)}
                </TableCell>
                <TableCell>
                  {task.status === 'COMPLETED' && task.duration !== undefined && task.duration > 0 ? formatDuration(task.duration) : '-'}
                </TableCell>
                <TableCell>
                  {getStatusBadge(task)}
                </TableCell>
                <TableCell>
                  {getDownloadButton(task)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                暂无任务记录
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-4 space-x-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            上一页
          </Button>
          <span className="flex items-center px-3 text-sm text-gray-600">
            第 {currentPage} 页，共 {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
};

// 骨架屏组件
const TaskHistoryTableSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex space-x-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaskHistoryTable;
