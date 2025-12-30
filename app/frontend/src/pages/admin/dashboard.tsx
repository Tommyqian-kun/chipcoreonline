import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  CreditCard, 
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { getDashboardStats } from '@/services/admin.service';
import { useToast } from '@/hooks/use-toast';

interface DashboardStats {
  users: {
    total: number;
    verified: number;
    admins: number;
    newThisMonth: number;
  };
  tasks: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  orders: {
    total: number;
    totalRevenue: number;
    thisMonth: number;
    thisMonthRevenue: number;
  };
  subscriptions: {
    active: number;
    canceled: number;
    expired: number;
  };
  tools: {
    total: number;
    public: number;
  };
}

const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getDashboardStats();
        setStats(response.data);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        setError('获取仪表盘数据失败');
        toast({
          title: "错误",
          description: "获取仪表盘数据失败，请稍后重试",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <LayoutDashboard className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">管理仪表盘</h1>
            <p className="text-gray-600">系统概览和核心指标</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <LayoutDashboard className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">管理仪表盘</h1>
            <p className="text-gray-600">系统概览和核心指标</p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error || '无法加载仪表盘数据'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <LayoutDashboard className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">管理仪表盘</h1>
          <p className="text-gray-600">系统概览和核心指标</p>
        </div>
      </div>

      {/* 核心统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总用户数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              本月新增 {stats.users.newThisMonth} 人
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                已验证: {stats.users.verified}
              </Badge>
              <Badge variant="outline" className="text-xs">
                管理员: {stats.users.admins}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">任务执行</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tasks.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              完成率 {((stats.tasks.completed / stats.tasks.total) * 100).toFixed(1)}%
            </p>
            <div className="flex gap-1 mt-2">
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                完成: {stats.tasks.completed}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                进行中: {stats.tasks.running}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">订单收入</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{stats.orders.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              本月 ¥{stats.orders.thisMonthRevenue.toLocaleString()}
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                <TrendingUp className="w-3 h-3 mr-1" />
                总订单: {stats.orders.total}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃订阅</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.subscriptions.active.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              取消: {stats.subscriptions.canceled} | 过期: {stats.subscriptions.expired}
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                工具: {stats.tools.total}
              </Badge>
              <Badge variant="outline" className="text-xs">
                公开: {stats.tools.public}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细统计信息 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">任务状态分布</CardTitle>
            <CardDescription>各状态任务数量统计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">待处理</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full" 
                    style={{ width: `${(stats.tasks.pending / stats.tasks.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{stats.tasks.pending}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">进行中</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${(stats.tasks.running / stats.tasks.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{stats.tasks.running}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">已完成</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${(stats.tasks.completed / stats.tasks.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{stats.tasks.completed}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">失败</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full" 
                    style={{ width: `${(stats.tasks.failed / stats.tasks.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{stats.tasks.failed}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">用户概览</CardTitle>
            <CardDescription>用户注册和验证情况</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm">总用户数</span>
              <span className="font-medium">{stats.users.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">已验证用户</span>
              <span className="font-medium">{stats.users.verified}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">管理员</span>
              <span className="font-medium">{stats.users.admins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">本月新增</span>
              <span className="font-medium text-green-600">+{stats.users.newThisMonth}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="text-sm text-gray-600">
                验证率: {((stats.users.verified / stats.users.total) * 100).toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">订阅状态</CardTitle>
            <CardDescription>用户订阅分布情况</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm">活跃订阅</span>
              <span className="font-medium text-green-600">{stats.subscriptions.active}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">已取消</span>
              <span className="font-medium text-yellow-600">{stats.subscriptions.canceled}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">已过期</span>
              <span className="font-medium text-red-600">{stats.subscriptions.expired}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="text-sm text-gray-600">
                总订阅: {stats.subscriptions.active + stats.subscriptions.canceled + stats.subscriptions.expired}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage; 