import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Search,
  Filter,
  Edit,
  Users,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import { getSubscriptions, updateSubscription } from '@/services/admin.service';

interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED';
  startDate: string;
  endDate: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  plan: {
    id: string;
    name: string;
    priceMonth: number;
    priceYear: number;
  };
  createdAt: string;
  updatedAt: string;
}

const statusColors = {
  ACTIVE: 'bg-green-100 text-green-800',
  CANCELED: 'bg-yellow-100 text-yellow-800',
  EXPIRED: 'bg-red-100 text-red-800',
};

const statusLabels = {
  ACTIVE: '活跃',
  CANCELED: '已取消',
  EXPIRED: '已过期',
};

const statusIcons = {
  ACTIVE: <CheckCircle className="h-4 w-4" />,
  CANCELED: <XCircle className="h-4 w-4" />,
  EXPIRED: <AlertCircle className="h-4 w-4" />,
};

const SubscriptionsPage: React.FC = () => {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSubscriptions, setTotalSubscriptions] = useState(0);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const itemsPerPage = 8; // 按用户要求，超过8条就分页

  useEffect(() => {
    fetchSubscriptions();
  }, [currentPage, statusFilter]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await getSubscriptions({
        page: currentPage,
        limit: itemsPerPage,
        status: statusFilter === 'all' ? undefined : statusFilter
      });

      setSubscriptions(response.data.subscriptions);
      setTotalSubscriptions(response.data.total);
      setTotalPages(Math.ceil(response.data.total / itemsPerPage));
    } catch (error) {
      toast({
        title: "加载失败",
        description: "无法加载订阅列表",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubscription = async () => {
    if (!selectedSubscription) return;

    try {
      const updateData: any = {};
      if (editStatus !== selectedSubscription.status) updateData.status = editStatus;
      if (editEndDate !== (selectedSubscription.endDate || '')) updateData.endDate = editEndDate;

      await updateSubscription(selectedSubscription.id, updateData);

      toast({
        title: "更新成功",
        description: "订阅状态已更新",
      });

      setIsEditDialogOpen(false);
      fetchSubscriptions();
    } catch (error) {
      toast({
        title: "更新失败",
        description: "无法更新订阅状态",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setEditStatus(subscription.status);
    setEditEndDate(subscription.endDate || '');
    setIsEditDialogOpen(true);
  };

  const filteredSubscriptions = subscriptions.filter(subscription =>
    subscription.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    subscription.user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    subscription.plan.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '无限期';
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">订阅管理</h1>
            <p className="text-gray-600">管理用户订阅状态和会员权限</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订阅数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              活跃: {subscriptions.filter(s => s.status === 'ACTIVE').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃订阅</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {subscriptions.filter(s => s.status === 'ACTIVE').length}
            </div>
            <p className="text-xs text-muted-foreground">
              正在使用中的订阅
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已取消</CardTitle>
            <XCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {subscriptions.filter(s => s.status === 'CANCELED').length}
            </div>
            <p className="text-xs text-muted-foreground">
              用户主动取消
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已过期</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {subscriptions.filter(s => s.status === 'EXPIRED').length}
            </div>
            <p className="text-xs text-muted-foreground">
              到期未续费
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
                  placeholder="搜索用户邮箱、姓名或计划名称..."
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
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="ACTIVE">活跃</SelectItem>
                <SelectItem value="CANCELED">已取消</SelectItem>
                <SelectItem value="EXPIRED">已过期</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions List */}
      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">加载中...</div>
            </CardContent>
          </Card>
        ) : filteredSubscriptions.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>暂无订阅数据</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredSubscriptions.map((subscription) => (
            <motion.div
              key={subscription.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">
                          {subscription.user.name || subscription.user.email}
                        </h3>
                        <Badge className={statusColors[subscription.status]}>
                          {statusIcons[subscription.status]}
                          <span className="ml-1">{statusLabels[subscription.status]}</span>
                        </Badge>
                        <Badge variant="outline">
                          {subscription.plan.name}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-sm text-gray-500">用户邮箱</div>
                          <div className="text-sm font-medium">{subscription.user.email}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">计划价格</div>
                          <div className="text-sm font-medium">
                            ¥{subscription.plan.priceMonth}/月
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">开始时间</div>
                          <div className="text-sm font-medium">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {formatDate(subscription.startDate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">结束时间</div>
                          <div className="text-sm font-medium">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {formatDate(subscription.endDate)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>创建时间: {new Date(subscription.createdAt).toLocaleDateString()}</span>
                        <span>更新时间: {new Date(subscription.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(subscription)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      编辑
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            显示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalSubscriptions)} 条，
            共 {totalSubscriptions} 条订阅
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </Button>
            <span className="flex items-center px-3 text-sm">
              第 {currentPage} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* Edit Subscription Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑订阅</DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">用户</label>
                <p className="text-sm text-gray-600">
                  {selectedSubscription.user.name || selectedSubscription.user.email}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">计划</label>
                <p className="text-sm text-gray-600">{selectedSubscription.plan.name}</p>
              </div>

              <div>
                <label className="text-sm font-medium">状态</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">活跃</SelectItem>
                    <SelectItem value="CANCELED">已取消</SelectItem>
                    <SelectItem value="EXPIRED">已过期</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">结束时间</label>
                <Input
                  type="datetime-local"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleEditSubscription}>
                  更新订阅
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionsPage;