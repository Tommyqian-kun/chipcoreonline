import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Eye, Edit, Search, Filter } from 'lucide-react';
import api from '@/services/api';

interface Feedback {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  message: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  response?: string;
  createdAt: string;
  updatedAt: string;
}

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

const statusLabels = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

export default function AdminFeedbackPage() {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    fetchFeedback();
  }, [statusFilter]);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await api.get(`/admin/feedback?${params.toString()}`);
      setFeedback(response.data.data.feedback);
    } catch (error) {
      toast({
        title: "加载失败",
        description: "无法加载反馈列表",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewFeedback = (item: Feedback) => {
    setSelectedFeedback(item);
    setResponse(item.response || '');
    setStatus(item.status);
    setIsDialogOpen(true);
  };

  const handleUpdateFeedback = async () => {
    if (!selectedFeedback) return;

    try {
      const updateData: any = {};
      if (status !== selectedFeedback.status) updateData.status = status;
      if (response !== (selectedFeedback.response || '')) updateData.response = response;

      await api.patch(`/admin/feedback/${selectedFeedback.id}`, updateData);
      
      toast({
        title: "更新成功",
        description: "反馈状态已更新",
      });
      
      setIsDialogOpen(false);
      fetchFeedback();
    } catch (error) {
      toast({
        title: "更新失败",
        description: "无法更新反馈状态",
        variant: "destructive",
      });
    }
  };

  const filteredFeedback = feedback.filter(item =>
    item.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">用户反馈管理</h1>
      </div>

      {/* 搜索和过滤 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索反馈内容、用户姓名或邮箱..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="PENDING">待处理</SelectItem>
                <SelectItem value="IN_PROGRESS">处理中</SelectItem>
                <SelectItem value="RESOLVED">已解决</SelectItem>
                <SelectItem value="CLOSED">已关闭</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 反馈列表 */}
      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">加载中...</div>
            </CardContent>
          </Card>
        ) : filteredFeedback.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>暂无反馈数据</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredFeedback.map((item) => (
            <motion.div
              key={item.id}
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
                          {item.firstName} {item.lastName}
                        </h3>
                        <Badge className={statusColors[item.status]}>
                          {statusLabels[item.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{item.email}</p>
                      <p className="text-gray-800 mb-3 line-clamp-2">{item.message}</p>
                      <p className="text-xs text-gray-500">
                        提交时间: {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewFeedback(item)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      查看详情
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* 反馈详情对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>反馈详情</DialogTitle>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">姓名</label>
                  <p className="text-sm text-gray-600">
                    {selectedFeedback.firstName} {selectedFeedback.lastName}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">邮箱</label>
                  <p className="text-sm text-gray-600">{selectedFeedback.email}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">反馈内容</label>
                <p className="text-sm text-gray-600 mt-1 p-3 bg-gray-50 rounded">
                  {selectedFeedback.message}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">状态</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">待处理</SelectItem>
                    <SelectItem value="IN_PROGRESS">处理中</SelectItem>
                    <SelectItem value="RESOLVED">已解决</SelectItem>
                    <SelectItem value="CLOSED">已关闭</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">管理员回复</label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="输入回复内容..."
                  className="mt-1"
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleUpdateFeedback}>
                  <Edit className="h-4 w-4 mr-2" />
                  更新
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
