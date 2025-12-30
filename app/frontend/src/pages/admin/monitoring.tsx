import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Monitor, 
  Cpu, 
  HardDrive, 
  MemoryStick,
  Activity,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Database,
  Server,
  Wifi,
  Shield
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { getSystemMetrics, getSystemResources } from '@/services/admin.service';

interface SystemMetrics {
  system: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      usage: number;
    };
    cpu: {
      usage: number;
    };
  };
  application: {
    totalRequests: number;
    errorCount: number;
    errorRate: number;
    activeUsers: number;
    runningTasks: number;
    avgResponseTime: number;
  };
}

interface SystemResources {
  server: {
    cpu: {
      cores: number;
      model: string;
      usage: number;
    };
    memory: {
      total: number;
      used: number;
      free: number;
      usage: number;
    };
    disk: {
      total: number;
      used: number;
      free: number;
      usage: number;
    };
  };
  application: {
    users: number;
    tasks: number;
    files: number;
    storage: {
      used: number;
      limit: number;
      usage: number;
    };
  };
}

const MonitoringPage: React.FC = () => {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchData();
    
    // 每30秒自动刷新数据
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 分别处理两个API调用，避免一个失败影响另一个
      try {
        const metricsResponse = await getSystemMetrics();
        if (metricsResponse.data && metricsResponse.data.data) {
          setMetrics(metricsResponse.data.data);
        }
      } catch (metricsError) {
        console.error('Error fetching system metrics:', metricsError);
        toast({
          title: "系统指标加载失败",
          description: "无法获取系统性能指标",
          variant: "destructive",
        });
      }

      try {
        const resourcesResponse = await getSystemResources();
        if (resourcesResponse.data && resourcesResponse.data.data) {
          setResources(resourcesResponse.data.data);
        }
      } catch (resourcesError) {
        console.error('Error fetching system resources:', resourcesError);
        toast({
          title: "系统资源加载失败",
          description: "无法获取系统资源信息",
          variant: "destructive",
        });
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  };

  const getStatusColor = (usage: number) => {
    if (usage < 50) return 'text-green-600';
    if (usage < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadge = (usage: number) => {
    if (usage < 50) return <Badge className="bg-green-100 text-green-800">正常</Badge>;
    if (usage < 80) return <Badge className="bg-yellow-100 text-yellow-800">警告</Badge>;
    return <Badge className="bg-red-100 text-red-800">危险</Badge>;
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>加载系统监控数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Monitor className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">系统监控</h1>
            <p className="text-gray-600">实时监控系统运行状态和性能指标</p>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          <Clock className="h-4 w-4 inline mr-1" />
          最后更新: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      {/* 系统状态概览 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">系统运行时间</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics && metrics.system ? formatUptime(metrics.system.uptime) : '--'}
            </div>
            <div className="flex items-center mt-2">
              {loading ? (
                <div className="text-xs text-gray-500">加载中...</div>
              ) : metrics ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-xs text-green-600">系统稳定运行</span>
                </>
              ) : (
                <div className="text-xs text-red-500">数据加载失败</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU使用率</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resources ? getStatusColor(resources.server.cpu.usage) : ''}`}>
              {resources ? `${resources.server.cpu.usage}%` : '--'}
            </div>
            <div className="flex items-center justify-between mt-2">
              {resources && getStatusBadge(resources.server.cpu.usage)}
              <span className="text-xs text-gray-500">
                {resources ? `${resources.server.cpu.cores}核心` : '--'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">内存使用率</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resources ? getStatusColor(resources.server.memory.usage) : ''}`}>
              {resources ? `${resources.server.memory.usage}%` : '--'}
            </div>
            <div className="flex items-center justify-between mt-2">
              {resources && getStatusBadge(resources.server.memory.usage)}
              <span className="text-xs text-gray-500">
                {resources ? `${resources.server.memory.used}/${resources.server.memory.total}GB` : '--'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">磁盘使用率</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${resources ? getStatusColor(resources.server.disk.usage) : ''}`}>
              {resources ? `${resources.server.disk.usage}%` : '--'}
            </div>
            <div className="flex items-center justify-between mt-2">
              {resources && getStatusBadge(resources.server.disk.usage)}
              <span className="text-xs text-gray-500">
                {resources ? `${resources.server.disk.used}/${resources.server.disk.total}GB` : '--'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 应用性能指标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃用户</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? metrics.application.activeUsers : '--'}
            </div>
            <p className="text-xs text-muted-foreground">24小时内活跃</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">运行任务</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? metrics.application.runningTasks : '--'}
            </div>
            <p className="text-xs text-muted-foreground">当前执行中</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">错误率</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics ? getStatusColor(metrics.application.errorRate) : ''}`}>
              {metrics ? `${metrics.application.errorRate}%` : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics ? `${metrics.application.errorCount}/${metrics.application.totalRequests}` : '--'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">响应时间</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? `${metrics.application.avgResponseTime}ms` : '--'}
            </div>
            <p className="text-xs text-muted-foreground">平均响应时间</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MonitoringPage;
