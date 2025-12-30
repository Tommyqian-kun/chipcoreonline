import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TaskHistoryTable from '@/components/shared/TaskHistoryTable';
import { History } from 'lucide-react';

/**
 * 独立的任务历史页面
 * 与个人中心的任务历史表格完全一致
 */
const TaskHistoryPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 - 简化版本 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">任务历史</h1>
          <p className="text-gray-600 mt-1">您提交的所有任务记录</p>
        </div>

        {/* 任务历史表格 - 与个人中心完全一致的简洁版本 */}
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <TaskHistoryTable
            showUserInfo={false}
            pageSize={10}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskHistoryPage;
