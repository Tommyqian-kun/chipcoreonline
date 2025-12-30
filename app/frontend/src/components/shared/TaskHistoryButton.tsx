import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import TaskHistoryTable from './TaskHistoryTable';

interface TaskHistoryButtonProps {
  className?: string;
  variant?: 'default' | 'modal';
}

/**
 * 任务历史按钮组件
 * 支持两种模式：
 * - default: 直接跳转到个人中心
 * - modal: 在模态框中显示任务历史
 */
export const TaskHistoryButton: React.FC<TaskHistoryButtonProps> = ({
  className = '',
  variant = 'default'
}) => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const handleTaskHistoryClick = () => {
    if (variant === 'modal') {
      setShowModal(true);
    } else {
      // 在新标签页打开独立的任务历史页面
      window.open('/task-history', '_blank');
    }
  };

  const handleNavigateToProfile = () => {
    setShowModal(false);
    window.open('/task-history', '_blank');
  };

  return (
    <>
      <Button
        onClick={handleTaskHistoryClick}
        className={`bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 ${className}`}
      >
        任务历史
      </Button>

      {/* 任务历史模态框 */}
      {variant === 'modal' && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                任务历史
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                您提交的所有任务记录（与个人中心保持一致）
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              <TaskHistoryTable
                showUserInfo={false}
                pageSize={5}
                className="border-0"
              />
            </div>

            <DialogFooter className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setShowModal(false)}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                关闭
              </Button>
              <Button
                onClick={handleNavigateToProfile}
                className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white"
              >
                查看完整历史
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

/**
 * 工具页面专用的任务历史按钮
 * 根据当前任务状态决定行为：
 * - IDLE状态：覆盖刷新当前页面
 * - 任务执行中：在新标签页打开任务历史页面
 */
export const ToolPageTaskHistoryButton: React.FC<{
  className?: string;
  taskStatus?: { status: string };
}> = ({ className = '', taskStatus }) => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  // 判断任务是否正在执行中
  const isTaskRunning = taskStatus?.status && ['PENDING', 'POLLING', 'RUNNING'].includes(taskStatus.status);

  const handleTaskHistoryClick = () => {
    // 修复：任何时候都在新标签页打开任务历史，避免影响工具页面的任务执行状态和下载按钮
    window.open('/task-history', '_blank');
  };

  return (
    <Button
      onClick={handleTaskHistoryClick}
      className={`bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 ${className}`}
    >
      任务历史
    </Button>
  );
};

export default TaskHistoryButton;
