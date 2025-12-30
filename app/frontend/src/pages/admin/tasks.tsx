import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  Search, 
  Eye, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  ChevronLeft,
  ChevronRight,
  Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTasks } from '@/services/admin.service';

interface Task {
  id: string;
  userId: string;
  toolId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  inputData: any;
  outputData: any;
  filePath: string | null;
  deploymentMode?: 'ecs_only' | 'ecs_oss_acr';  // 新增部署模式字段
  localStoragePath?: string | null;              // 新增本地存储路径字段
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  tool: {
    id: string;
    name: string;
    description: string | null;
  };
}

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTool, setSelectedTool] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);
  const { toast } = useToast();

  const itemsPerPage = 10;

  useEffect(() => {
    fetchTasks();
  }, [currentPage, searchTerm, selectedStatus, selectedTool]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await getTasks({
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm || undefined,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        toolId: selectedTool === 'all' ? undefined : selectedTool
      });
      
      setTasks(response.data.tasks);
      setTotalTasks(response.data.total);
      setTotalPages(Math.ceil(response.data.total / itemsPerPage));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: "错误",
        description: "获取任务列表失败",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="text-purple-600">
            <Clock className="w-3 h-3 mr-1" />
            填写中
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="outline" className="text-yellow-600">
            <Clock className="w-3 h-3 mr-1" />
            等待中
          </Badge>
        );
      case 'RUNNING':
        return (
          <Badge variant="secondary" className="text-blue-600">
            <Play className="w-3 h-3 mr-1" />
            运行中
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="secondary" className="text-green-600">
            <CheckCircle className="w-3 h-3 mr-1" />
            已完成
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            失败
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <AlertCircle className="w-3 h-3 mr-1" />
            未知
          </Badge>
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'text-yellow-600';
      case 'RUNNING': return 'text-blue-600';
      case 'COMPLETED': return 'text-green-600';
      case 'FAILED': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getDeploymentModeLabel = (mode?: string) => {
    return mode === 'ecs_only' ? 'ECS Only' : 'ECS+OSS+ACR';
  };

  const getDeploymentModeBadge = (mode?: string) => {
    const isEcsOnly = mode === 'ecs_only';
    return (
      <Badge variant={isEcsOnly ? 'secondary' : 'default'}>
        {getDeploymentModeLabel(mode)}
      </Badge>
    );
  };

  const getTaskDuration = (createdAt: string, updatedAt: string) => {
    const created = new Date(createdAt);
    const updated = new Date(updatedAt);
    const diffMs = updated.getTime() - created.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return `${diffSec}秒`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟`;
    return `${Math.floor(diffSec / 3600)}小时`;
  };

  const handleViewDetails = (task: Task) => {
    // 这里可以实现查看任务详情的功能
    console.log('查看任务详情:', task);
    toast({
      title: "任务详情",
      description: `任务ID: ${task.id}`,
    });
  };

  const handleDownloadResult = async (task: Task) => {
    try {
      const deploymentMode = task.deploymentMode || 'ecs_only';

      if (deploymentMode === 'ecs_only') {
        // ECS Only模式：使用本地文件下载
        // 注意：实际文件名可能是新格式 result_{taskid}_{tool_type}_{timestamp}.zip
        // 但API会自动查找正确的文件
        const fileName = `${task.id}_${task.tool.name}.zip`;
        const response = await fetch(`/api/v1/admin/tasks/${task.id}/download-ecs/${fileName}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          window.URL.revokeObjectURL(url);

          toast({
            title: "下载成功",
            description: `文件 ${fileName} 下载完成`,
          });
        } else {
          throw new Error('下载失败');
        }
      } else {
        // ECS + OSS + ACR模式：使用OSS预签名URL
        const response = await fetch(`/api/v1/admin/tasks/${task.id}/download-oss`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          window.open(data.downloadUrl, '_blank');

          toast({
            title: "下载开始",
            description: "文件下载已开始",
          });
        } else {
          throw new Error('获取下载链接失败');
        }
      }
    } catch (error) {
      toast({
        title: "下载失败",
        description: error instanceof Error ? error.message : "下载过程中发生错误",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center space-x-3">
        <Activity className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">任务管理</h1>
          <p className="text-gray-600">监控和管理系统任务执行情况</p>
        </div>
      </div>

      {/* 任务统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总任务数</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-xs text-muted-foreground">
              系统中的所有任务
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">运行中</CardTitle>
            <Play className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {tasks.filter(t => t.status === 'RUNNING').length}
            </div>
            <p className="text-xs text-muted-foreground">
              正在执行的任务
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已完成</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {tasks.filter(t => t.status === 'COMPLETED').length}
            </div>
            <p className="text-xs text-muted-foreground">
              成功完成的任务
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">失败</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {tasks.filter(t => t.status === 'FAILED').length}
            </div>
            <p className="text-xs text-muted-foreground">
              执行失败的任务
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 任务列表 */}
      <Card>
        <CardHeader>
          <CardTitle>任务列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索任务ID、用户或工具..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="PENDING">等待中</SelectItem>
                <SelectItem value="RUNNING">运行中</SelectItem>
                <SelectItem value="COMPLETED">已完成</SelectItem>
                <SelectItem value="FAILED">失败</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedTool} onValueChange={setSelectedTool}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="筛选工具" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有工具</SelectItem>
                {/* 这里可以动态加载工具列表 */}
                <SelectItem value="sdc-generator">SDC生成器</SelectItem>
                <SelectItem value="clk-generator">时钟生成器</SelectItem>
                <SelectItem value="memory-generator">内存生成器</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>任务信息</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>工具</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>部署模式</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {task.id.substring(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{task.user.name || '未设置'}</div>
                          <div className="text-sm text-gray-500">{task.user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{task.tool.name}</div>
                          <div className="text-sm text-gray-500">{task.tool.description}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(task.status)}
                      </TableCell>
                      <TableCell>
                        {getDeploymentModeBadge(task.deploymentMode)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.status === 'RUNNING' ? (
                          <span className={getStatusColor(task.status)}>
                            运行中...
                          </span>
                        ) : (
                          getTaskDuration(task.createdAt, task.updatedAt)
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(task.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(task)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {task.status === 'COMPLETED' && (task.filePath || task.deploymentMode === 'ecs_only') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadResult(task)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  共 {totalTasks} 个任务，第 {currentPage} 页，共 {totalPages} 页
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    下一页
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TasksPage; 