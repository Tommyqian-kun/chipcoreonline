import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Wrench,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Activity,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Target,
  Star,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Timer,
  Database,
  Cpu
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { getTools, createTool, updateTool, deleteTool, getToolsAnalytics } from '@/services/admin.service';

interface Tool {
  id: string;
  name: string;
  description: string;
  version: string;
  dockerImage: string;
  inputSchema: Record<string, any>;
  configTemplate?: Record<string, any>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tasks: number;
  };
}

interface ToolStats {
  // 基础使用数据
  totalUsage: number;
  activeUsers: number;
  revenue: number;
  successRate: number;

  // 商业分析数据
  conversionRate: number; // 付费转化率
  avgSessionTime: number; // 平均使用时长(分钟)
  userRetentionRate: number; // 用户留存率
  customerSatisfaction: number; // 客户满意度(1-5分)

  // 技术运营数据
  avgExecutionTime: number; // 平均执行时间(秒)
  errorRate: number; // 错误率
  resourceUtilization: number; // 资源利用率

  // 趋势数据
  usageGrowth: number; // 使用量增长率
  revenueGrowth: number; // 收入增长率

  // 用户行为数据
  repeatUsageRate: number; // 重复使用率
  featureAdoptionRate: number; // 功能采用率
}

interface ToolAnalytics {
  // 时间序列数据
  usageHistory: Array<{
    date: string;
    usage: number;
    revenue: number;
    users: number;
  }>;

  // 用户分布数据
  userSegments: Array<{
    segment: string;
    count: number;
    revenue: number;
  }>;

  // 功能使用分析
  featureUsage: Array<{
    feature: string;
    usage: number;
    satisfaction: number;
  }>;

  // 错误分析
  errorTypes: Array<{
    type: string;
    count: number;
    impact: string;
  }>;
}

const ToolsPage: React.FC = () => {
  const { toast } = useToast();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [toolStats, setToolStats] = useState<Record<string, ToolStats>>({});
  const [toolAnalytics, setToolAnalytics] = useState<Record<string, ToolAnalytics>>({});
  const [activeTab, setActiveTab] = useState('overview');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: '',
    dockerImage: '',
    inputSchema: '{}',
    configTemplate: '{}',
    isPublic: true,
  });

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      setLoading(true);

      // 分别处理工具列表和分析数据，避免一个失败影响另一个
      let toolsData = [];
      let analyticsData = [];

      try {
        console.log('Fetching tools...');
        const toolsResponse = await getTools();
        console.log('Tools response:', toolsResponse);
        if (toolsResponse.data) {
          toolsData = toolsResponse.data;
          setTools(toolsData);
          console.log('Tools data set:', toolsData);
        }
      } catch (toolsError) {
        console.error('Error fetching tools:', toolsError);
        toast({
          title: "工具列表加载失败",
          description: "无法加载工具列表，请检查服务器连接",
          variant: "destructive",
        });
      }

      try {
        const analyticsResponse = await getToolsAnalytics();
        console.log('Analytics response:', analyticsResponse);
        if (analyticsResponse.data) {
          // 检查响应结构
          if (analyticsResponse.data.data) {
            analyticsData = analyticsResponse.data.data;
          } else if (Array.isArray(analyticsResponse.data)) {
            analyticsData = analyticsResponse.data;
          }
        }
      } catch (analyticsError) {
        console.error('Error fetching analytics:', analyticsError);
        // 分析数据失败不影响工具列表显示
        toast({
          title: "分析数据加载失败",
          description: "工具分析数据暂时无法加载，但不影响基本功能",
          variant: "destructive",
        });
      }

      // 处理真实的工具分析数据
      const realStats: Record<string, ToolStats> = {};
      const realAnalytics: Record<string, ToolAnalytics> = {};

      if (Array.isArray(analyticsData)) {
        analyticsData.forEach((analytics: any) => {
          if (analytics && analytics.toolId && analytics.stats) {
            realStats[analytics.toolId] = analytics.stats;
            realAnalytics[analytics.toolId] = {
              usageHistory: analytics.usageHistory || [],
              userSegments: analytics.userSegments || [],
              featureUsage: analytics.featureUsage || [
                { feature: '基础功能', usage: 0, satisfaction: 0 },
                { feature: '高级配置', usage: 0, satisfaction: 0 },
                { feature: '自定义模板', usage: 0, satisfaction: 0 },
                { feature: '批量处理', usage: 0, satisfaction: 0 },
              ],
              errorTypes: analytics.errorTypes || [
                { type: '输入验证错误', count: 0, impact: '低' },
                { type: '资源超限', count: 0, impact: '中' },
                { type: '系统异常', count: 0, impact: '高' },
              ],
            };
          }
        });
      }

      // 为没有分析数据的工具生成默认数据（显示真实的0值）
      toolsData.forEach((tool: Tool) => {
        if (!realStats[tool.id]) {
          realStats[tool.id] = {
            totalUsage: tool._count?.tasks || 0,
            activeUsers: 0, // 真实活跃用户数，暂无数据
            revenue: 0, // 真实收入，暂无数据
            successRate: 0, // 真实成功率，暂无数据
            avgExecutionTime: 0, // 真实平均执行时间，暂无数据
            errorRate: "0.0", // 真实错误率，暂无数据
            conversionRate: 0, // 真实转化率，暂无数据
            userRetentionRate: 0, // 真实用户留存率，暂无数据
            customerSatisfaction: "0.0", // 真实客户满意度，暂无数据
            usageGrowth: "0.0", // 真实使用增长率，暂无数据
            revenueGrowth: "0.0", // 真实收入增长率，暂无数据
            repeatUsageRate: 0, // 真实重复使用率，暂无数据
            featureAdoptionRate: 0, // 真实功能采用率，暂无数据
            resourceUtilization: 0, // 真实资源利用率，暂无数据
          };
        }

        if (!realAnalytics[tool.id]) {
          realAnalytics[tool.id] = {
            usageHistory: Array.from({ length: 30 }, (_, i) => ({
              date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              usage: 0, // 真实使用数据，暂无数据
              revenue: 0, // 真实收入数据，暂无数据
              users: 0, // 真实用户数据，暂无数据
            })),
            userSegments: [
              { segment: '免费用户', count: 0, revenue: 0 }, // 真实免费用户数据
              { segment: '专业用户', count: 0, revenue: 0 }, // 真实专业用户数据
              { segment: '企业用户', count: 0, revenue: 0 }, // 真实企业用户数据
            ],
            featureUsage: [
              { feature: '基础功能', usage: 0, satisfaction: 0 }, // 真实功能使用数据
              { feature: '高级配置', usage: 0, satisfaction: 0 }, // 真实高级配置使用数据
              { feature: '自定义模板', usage: 0, satisfaction: 0 }, // 真实模板使用数据
              { feature: '批量处理', usage: 0, satisfaction: 0 }, // 真实批量处理使用数据
            ],
            errorTypes: [
              { type: '输入验证错误', count: 0, impact: '低' }, // 真实错误数据
              { type: '资源超限', count: 0, impact: '中' }, // 真实资源错误数据
              { type: '系统异常', count: 0, impact: '高' }, // 真实系统错误数据
            ],
          };
        }
      });

      setToolStats(realStats);
      setToolAnalytics(realAnalytics);
    } catch (error) {
      console.error('Error in fetchTools:', error);
      toast({
        title: "加载失败",
        description: "工具管理页面加载失败",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTool = async () => {
    try {
      let inputSchema, configTemplate;

      try {
        inputSchema = JSON.parse(formData.inputSchema);
        configTemplate = JSON.parse(formData.configTemplate);
      } catch (error) {
        toast({
          title: "格式错误",
          description: "JSON格式不正确",
          variant: "destructive",
        });
        return;
      }

      await createTool({
        ...formData,
        inputSchema,
        configTemplate,
      });

      toast({
        title: "创建成功",
        description: "工具已成功创建",
      });

      setIsCreateDialogOpen(false);
      resetForm();
      fetchTools();
    } catch (error) {
      toast({
        title: "创建失败",
        description: "无法创建工具",
        variant: "destructive",
      });
    }
  };

  const handleEditTool = async () => {
    if (!selectedTool) return;

    try {
      let inputSchema, configTemplate;

      try {
        inputSchema = JSON.parse(formData.inputSchema);
        configTemplate = JSON.parse(formData.configTemplate);
      } catch (error) {
        toast({
          title: "格式错误",
          description: "JSON格式不正确",
          variant: "destructive",
        });
        return;
      }

      await updateTool(selectedTool.id, {
        ...formData,
        inputSchema,
        configTemplate,
      });

      toast({
        title: "更新成功",
        description: "工具已成功更新",
      });

      setIsEditDialogOpen(false);
      resetForm();
      fetchTools();
    } catch (error) {
      toast({
        title: "更新失败",
        description: "无法更新工具",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    if (!confirm('确定要删除这个工具吗？此操作不可撤销。')) return;

    try {
      await deleteTool(toolId);
      toast({
        title: "删除成功",
        description: "工具已成功删除",
      });
      fetchTools();
    } catch (error) {
      toast({
        title: "删除失败",
        description: "无法删除工具",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      version: '',
      dockerImage: '',
      inputSchema: '{}',
      configTemplate: '{}',
      isPublic: true,
    });
    setSelectedTool(null);
  };

  const openEditDialog = (tool: Tool) => {
    setSelectedTool(tool);
    setFormData({
      name: tool.name,
      description: tool.description,
      version: tool.version,
      dockerImage: tool.dockerImage,
      inputSchema: JSON.stringify(tool.inputSchema, null, 2),
      configTemplate: JSON.stringify(tool.configTemplate || {}, null, 2),
      isPublic: tool.isPublic,
    });
    setIsEditDialogOpen(true);
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'public' && tool.isPublic) ||
                         (statusFilter === 'private' && !tool.isPublic);
    return matchesSearch && matchesStatus;
  });

  // 图表颜色配置
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Wrench className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">工具管理与商业分析</h1>
            <p className="text-gray-600">深度分析工具性能、用户行为和商业价值</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          新增工具
        </Button>
      </div>

      {/* 主要内容区域 - 使用Tabs组织 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">概览分析</TabsTrigger>
          <TabsTrigger value="business">商业分析</TabsTrigger>
          <TabsTrigger value="technical">技术运营</TabsTrigger>
          <TabsTrigger value="management">工具配置</TabsTrigger>
        </TabsList>

        {/* 概览分析 Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* 核心指标卡片 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总工具数</CardTitle>
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tools.length}</div>
                <p className="text-xs text-muted-foreground">
                  公开: {tools.filter(t => t.isPublic).length} | 私有: {tools.filter(t => !t.isPublic).length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总使用次数</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).reduce((sum, stats) => sum + stats.totalUsage, 0).toLocaleString()}
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  暂无趋势数据
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总收入</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ¥{Object.values(toolStats).reduce((sum, stats) => sum + stats.revenue, 0).toLocaleString()}
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  暂无趋势数据
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均满意度</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? (Object.values(toolStats).reduce((sum, stats) => sum + parseFloat(stats.customerSatisfaction), 0) / Object.values(toolStats).length).toFixed(1)
                    : 0}/5.0
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <ThumbsUp className="h-3 w-3 mr-1" />
                  暂无评价数据
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 工具使用趋势图 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                工具使用趋势分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={tools.length > 0 && toolAnalytics[tools[0]?.id] ? toolAnalytics[tools[0].id].usageHistory : []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="usage" stackId="1" stroke="#8884d8" fill="#8884d8" name="使用次数" />
                  <Area type="monotone" dataKey="users" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="活跃用户" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 工具性能排行榜 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  使用量排行榜
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tools
                    .sort((a, b) => (toolStats[b.id]?.totalUsage || 0) - (toolStats[a.id]?.totalUsage || 0))
                    .slice(0, 5)
                    .map((tool, index) => (
                      <div key={tool.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? 'bg-yellow-100 text-yellow-800' :
                            index === 1 ? 'bg-gray-100 text-gray-800' :
                            index === 2 ? 'bg-orange-100 text-orange-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium">{tool.name}</span>
                        </div>
                        <span className="text-sm text-gray-600">
                          {toolStats[tool.id]?.totalUsage.toLocaleString() || 0}次
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  收入贡献排行榜
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tools
                    .sort((a, b) => (toolStats[b.id]?.revenue || 0) - (toolStats[a.id]?.revenue || 0))
                    .slice(0, 5)
                    .map((tool, index) => (
                      <div key={tool.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? 'bg-green-100 text-green-800' :
                            index === 1 ? 'bg-blue-100 text-blue-800' :
                            index === 2 ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium">{tool.name}</span>
                        </div>
                        <span className="text-sm text-gray-600">
                          ¥{toolStats[tool.id]?.revenue.toLocaleString() || 0}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 商业分析 Tab */}
        <TabsContent value="business" className="space-y-6">
          {/* 商业关键指标 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均转化率</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.conversionRate, 0) / Object.values(toolStats).length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">免费转付费用户</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">用户留存率</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.userRetentionRate, 0) / Object.values(toolStats).length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">30天留存率</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均使用时长</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.avgSessionTime, 0) / Object.values(toolStats).length)
                    : 0}分钟
                </div>
                <p className="text-xs text-muted-foreground">单次会话时长</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">重复使用率</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.repeatUsageRate, 0) / Object.values(toolStats).length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">用户粘性指标</p>
              </CardContent>
            </Card>
          </div>

          {/* 用户分布分析 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  用户类型分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={tools.length > 0 && toolAnalytics[tools[0]?.id] ? toolAnalytics[tools[0].id].userSegments : []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ segment, count }) => `${segment}: ${count}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {tools.length > 0 && toolAnalytics[tools[0]?.id] && toolAnalytics[tools[0].id].userSegments.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  收入贡献分析
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={tools.length > 0 && toolAnalytics[tools[0]?.id] ? toolAnalytics[tools[0].id].userSegments : []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#8884d8" name="收入贡献" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* 商业机会分析 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                商业机会与建议
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="p-4 border rounded-lg bg-green-50">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-green-800">高价值机会</h4>
                  </div>
                  <p className="text-sm text-green-700">
                    转化率超过30%的工具具有很大的收入增长潜力，建议加大推广力度。
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-yellow-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <h4 className="font-semibold text-yellow-800">需要优化</h4>
                  </div>
                  <p className="text-sm text-yellow-700">
                    留存率低于60%的工具需要改进用户体验，提升功能易用性。
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-blue-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold text-blue-800">功能扩展</h4>
                  </div>
                  <p className="text-sm text-blue-700">
                    高满意度工具可以考虑增加高级功能，提升客单价。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 技术运营 Tab */}
        <TabsContent value="technical" className="space-y-6">
          {/* 技术指标 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均成功率</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.successRate, 0) / Object.values(toolStats).length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">任务执行成功率</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均执行时间</CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.avgExecutionTime, 0) / Object.values(toolStats).length)
                    : 0}秒
                </div>
                <p className="text-xs text-muted-foreground">任务平均耗时</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">资源利用率</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.resourceUtilization, 0) / Object.values(toolStats).length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">系统资源使用</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">错误率</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(toolStats).length > 0
                    ? (Object.values(toolStats).reduce((sum, stats) => sum + parseFloat(stats.errorRate), 0) / Object.values(toolStats).length).toFixed(1)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">系统错误率</p>
              </CardContent>
            </Card>
          </div>

          {/* 性能分析图表 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  工具性能对比
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={tools.map(tool => ({
                    name: tool.name,
                    successRate: toolStats[tool.id]?.successRate || 0,
                    avgTime: toolStats[tool.id]?.avgExecutionTime || 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="successRate" fill="#8884d8" name="成功率%" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  错误类型分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={tools.length > 0 && toolAnalytics[tools[0]?.id] ? toolAnalytics[tools[0].id].errorTypes : []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ type, count }) => `${type}: ${count}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {tools.length > 0 && toolAnalytics[tools[0]?.id] && toolAnalytics[tools[0].id].errorTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* 技术优化建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                技术优化建议
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tools.map(tool => {
                  const stats = toolStats[tool.id];
                  if (!stats) return null;

                  const suggestions = [];
                  if (stats.successRate < 90) {
                    suggestions.push({ type: 'error', text: '成功率偏低，需要优化错误处理机制' });
                  }
                  if (stats.avgExecutionTime > 180) {
                    suggestions.push({ type: 'warning', text: '执行时间过长，建议优化算法或增加资源' });
                  }
                  if (stats.resourceUtilization > 90) {
                    suggestions.push({ type: 'info', text: '资源利用率高，考虑扩容或负载均衡' });
                  }
                  if (parseFloat(stats.errorRate) > 3) {
                    suggestions.push({ type: 'error', text: '错误率偏高，需要排查系统稳定性问题' });
                  }

                  if (suggestions.length === 0) {
                    suggestions.push({ type: 'success', text: '运行状态良好，继续保持' });
                  }

                  return (
                    <div key={tool.id} className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">{tool.name}</h4>
                      <div className="space-y-2">
                        {suggestions.map((suggestion, index) => (
                          <div key={index} className={`flex items-center gap-2 text-sm ${
                            suggestion.type === 'error' ? 'text-red-600' :
                            suggestion.type === 'warning' ? 'text-yellow-600' :
                            suggestion.type === 'info' ? 'text-blue-600' :
                            'text-green-600'
                          }`}>
                            {suggestion.type === 'error' && <XCircle className="h-4 w-4" />}
                            {suggestion.type === 'warning' && <AlertCircle className="h-4 w-4" />}
                            {suggestion.type === 'info' && <Activity className="h-4 w-4" />}
                            {suggestion.type === 'success' && <CheckCircle className="h-4 w-4" />}
                            {suggestion.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 工具配置 Tab */}
        <TabsContent value="management" className="space-y-6">
          {/* Search and Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="搜索工具名称或描述..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="筛选状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部工具</SelectItem>
                    <SelectItem value="public">公开工具</SelectItem>
                    <SelectItem value="private">私有工具</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总工具数</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tools.length}</div>
            <p className="text-xs text-muted-foreground">
              公开: {tools.filter(t => t.isPublic).length} | 私有: {tools.filter(t => !t.isPublic).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总使用次数</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(toolStats).reduce((sum, stats) => sum + stats.totalUsage, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              本月活跃用户: {Object.values(toolStats).reduce((sum, stats) => sum + stats.activeUsers, 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总收入</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{Object.values(toolStats).reduce((sum, stats) => sum + stats.revenue, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              来自工具使用费用
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均成功率</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(toolStats).length > 0
                ? Math.round(Object.values(toolStats).reduce((sum, stats) => sum + stats.successRate, 0) / Object.values(toolStats).length)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              任务执行成功率
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索工具名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部工具</SelectItem>
                <SelectItem value="public">公开工具</SelectItem>
                <SelectItem value="private">私有工具</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tools List */}
      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">加载工具管理数据中...</p>
                <p className="text-sm text-gray-500 mt-2">正在连接后端API...</p>
              </div>
            </CardContent>
          </Card>
        ) : filteredTools.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Wrench className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>暂无工具数据</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredTools.map((tool) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{tool.name}</h3>
                        <Badge variant={tool.isPublic ? "default" : "secondary"}>
                          {tool.isPublic ? "公开" : "私有"}
                        </Badge>
                        <Badge variant="outline">v{tool.version}</Badge>
                      </div>
                      <p className="text-gray-600 mb-3">{tool.description}</p>

                      {/* Tool Statistics */}
                      {toolStats[tool.id] && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                          <div className="text-center">
                            <div className="text-lg font-semibold text-blue-600">
                              {toolStats[tool.id].totalUsage}
                            </div>
                            <div className="text-xs text-gray-500">总使用次数</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-green-600">
                              {toolStats[tool.id].activeUsers}
                            </div>
                            <div className="text-xs text-gray-500">活跃用户</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-orange-600">
                              ¥{toolStats[tool.id].revenue.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">收入</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-semibold text-purple-600">
                              {toolStats[tool.id].successRate}%
                            </div>
                            <div className="text-xs text-gray-500">成功率</div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Docker: {tool.dockerImage}</span>
                        <span>创建时间: {new Date(tool.createdAt).toLocaleDateString()}</span>
                        <span>更新时间: {new Date(tool.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(tool)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTool(tool.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Tool Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加新工具</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">工具名称</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入工具名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium">版本</label>
              <Input
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="例如: 1.0.0"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">描述</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="输入工具描述"
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Docker镜像</label>
            <Input
              value={formData.dockerImage}
              onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
              placeholder="例如: registry.com/tool:latest"
            />
          </div>

          <div>
            <label className="text-sm font-medium">输入模式 (JSON)</label>
            <Textarea
              value={formData.inputSchema}
              onChange={(e) => setFormData({ ...formData, inputSchema: e.target.value })}
              placeholder='{"field1": "string", "field2": "number"}'
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">配置模板 (JSON)</label>
            <Textarea
              value={formData.configTemplate}
              onChange={(e) => setFormData({ ...formData, configTemplate: e.target.value })}
              placeholder='{"defaultValue": "example"}'
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
            />
            <label htmlFor="isPublic" className="text-sm font-medium">公开工具</label>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateTool}>
              创建工具
            </Button>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      {/* Edit Tool Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑工具</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">工具名称</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="输入工具名称"
                />
              </div>
              <div>
                <label className="text-sm font-medium">版本</label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="例如: 1.0.0"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="输入工具描述"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Docker镜像</label>
              <Input
                value={formData.dockerImage}
                onChange={(e) => setFormData({ ...formData, dockerImage: e.target.value })}
                placeholder="例如: registry.com/tool:latest"
              />
            </div>

            <div>
              <label className="text-sm font-medium">输入模式 (JSON)</label>
              <Textarea
                value={formData.inputSchema}
                onChange={(e) => setFormData({ ...formData, inputSchema: e.target.value })}
                placeholder='{"field1": "string", "field2": "number"}'
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">配置模板 (JSON)</label>
              <Textarea
                value={formData.configTemplate}
                onChange={(e) => setFormData({ ...formData, configTemplate: e.target.value })}
                placeholder='{"defaultValue": "example"}'
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPublicEdit"
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              />
              <label htmlFor="isPublicEdit" className="text-sm font-medium">公开工具</label>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleEditTool}>
                更新工具
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ToolsPage;