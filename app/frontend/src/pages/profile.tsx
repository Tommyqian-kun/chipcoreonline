"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth.context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, CreditCard, History, LogOut, ExternalLink, Pencil, Clock, CheckCircle, XCircle, AlertCircle, Activity } from "lucide-react";
import { getMySubscription } from '@/services/subscription.service';
import { getMyOrders } from '@/services/order.service';
import { getUserTasks, Task } from '@/services/task.service';
import { updateMyProfile } from '@/services/user.service';
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { format, isValid, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import TaskHistoryTable from '@/components/shared/TaskHistoryTable';

// 创建motion组件
const MotionDiv = motion.div;

// 辅助函数：判断是否为免费计划（基于数据库数据而非硬编码）
const isFreePlan = (subscription: Subscription): boolean => {
  // 基于价格判断（最可靠的方法）
  if (subscription.plan?.priceMonth === 0) return true;

  // 基于计划名称判断（fallback）
  if (subscription.planName && subscription.planName.toLowerCase().includes('免费')) return true;
  if (subscription.plan?.name && subscription.plan.name.toLowerCase().includes('free')) return true;

  // 如果没有订阅记录，默认为免费用户
  if (!subscription.id) return true;

  return false;
};

// 辅助函数：获取计划显示名称
const getPlanDisplayName = (subscription: Subscription): string => {
  return subscription.plan?.name || subscription.planName || '未知计划';
};

// 辅助函数：获取动态按钮文本
const getUpgradeButtonText = (subscription: Subscription): string => {
  if (isFreePlan(subscription)) {
    return '升级会员';
  }
  return '续订会员';
};

// 辅助函数：判断订阅是否已过期
const isSubscriptionExpired = (subscription: Subscription): boolean => {
  if (!subscription.endDate) return false;
  return new Date(subscription.endDate) < new Date();
};

// 辅助函数：判断订阅是否即将过期（7天内）
const isSubscriptionExpiringSoon = (subscription: Subscription): boolean => {
  if (!subscription.endDate) return false;
  const endDate = new Date(subscription.endDate);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
};

// 安全的时间格式化函数
const safeFormatDate = (dateString: string | null | undefined, formatStr: string = 'yyyy年MM月dd日'): string => {
  if (!dateString) return '未知';

  try {
    // 尝试解析 ISO 字符串
    let date = parseISO(dateString);

    // 如果解析失败，尝试直接创建 Date 对象
    if (!isValid(date)) {
      date = new Date(dateString);
    }

    // 检查日期是否有效
    if (!isValid(date)) {
      console.warn('Invalid date string:', dateString);
      return '无效日期';
    }

    return format(date, formatStr, { locale: zhCN });
  } catch (error) {
    console.error('Error formatting date:', error, 'dateString:', dateString);
    return '格式错误';
  }
};

// Interfaces
interface Subscription {
  id?: string | null;
  userId?: string;
  planId?: string;
  planName?: string; // 免费用户专用字段
  plan?: {
    name: string;
    priceMonth?: number;
    priceYear?: number;
    description?: string;
  }; // 计划详细信息
  status: string;
  startDate?: string;
  endDate?: string | null;
  // autoRenew字段在数据库schema中不存在，已移除
  usageLimit?: {
    totalTasks: number;
    concurrentTasks: number;
  };
  usageStats?: {
    totalUsage: number;
    monthlyUsage: number;
    runningTasks: number;
    monthlyLimit: number | null;
    totalUsageLimit: number | null;
    maxConcurrentTasks: number;
    monthlyRemaining: number | null;
    totalRemaining: number | null;
    resetDate: string;
  };
  features?: string[];
  createdAt?: string;
  updatedAt?: string;
}
interface Order {
  id?: string;
  orderNo: string;
  planName: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

// 侧边栏菜单项
const sidebarItems = [
  { id: 'profile', label: '基本资料', icon: User },
  { id: 'subscription', label: '会员订阅', icon: CreditCard },
  { id: 'payment-history', label: '支付历史', icon: History },
  { id: 'task-history', label: '任务历史', icon: Activity },
];

const ProfilePage: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();


  const [activeTab, setActiveTab] = useState('profile');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // 调试信息
      console.log('🔍 Profile页面 - fetchData执行:', {
        authLoading,
        user: user ? { id: user.id, email: user.email } : null,
        timestamp: new Date().toISOString()
      });

      // 等待认证状态加载完成
      if (authLoading) {
        console.log('⏳ 认证状态加载中，等待...');
        return;
      }

      // 如果没有用户信息，不需要手动跳转，ProtectedRoute会处理
      if (!user) {
        console.log('❌ 没有用户信息，等待认证...');
        return;
      }

      console.log('✅ 开始获取个人中心数据...');
      setDataLoading(true);

      try {
        const [subRes, ordersRes, tasksRes] = await Promise.all([
          getMySubscription().catch((err) => {
            console.warn('⚠️ 获取订阅信息失败:', err.response?.status, err.response?.data?.message);
            return null;
          }),
          getMyOrders().catch((err) => {
            console.warn('⚠️ 获取订单信息失败:', err.response?.status, err.response?.data?.message);
            return null;
          }),
          getUserTasks({ page: 1, limit: 10 }).catch((err) => {
            console.warn('⚠️ 获取任务信息失败:', err.response?.status, err.response?.data?.message);
            return null;
          }),
        ]);

        console.log('📊 API调用结果:', {
          subscription: subRes ? '成功' : '失败/无数据',
          orders: ordersRes ? '成功' : '失败/无数据',
          tasks: tasksRes ? '成功' : '失败/无数据'
        });

        // 订阅信息现在应该总是返回数据（免费用户返回免费计划信息）
        if (subRes) setSubscription(subRes);
        if (ordersRes) setOrders(ordersRes.data);
        if (tasksRes) setTasks(tasksRes.data);

      } catch (error) {
        console.error('❌ 获取个人中心数据失败:', error);
      } finally {
        setDataLoading(false);
        console.log('✅ 个人中心数据获取完成');
      }
    };

    fetchData();
  }, [user, authLoading]);

  // 如果认证状态还在加载中，显示加载指示器
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <span className="ml-2 text-gray-600">正在验证身份...</span>
      </div>
    );
  }

  // 如果没有用户信息，ProtectedRoute会处理重定向
  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };
  
  // handleCancelSubscription 函数已移除，因为数据库schema中没有autoRenew字段

  const tabContentVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  };

  // 显示加载状态
  if (authLoading || dataLoading) {
    return (
      <div className="container mx-auto py-20 flex justify-center items-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // 如果认证加载完成但没有用户信息，显示加载状态而不是返回null
  // ProtectedRoute会处理未认证的情况，这里不应该返回null
  if (!user) {
    return (
      <div className="container mx-auto py-20 flex justify-center items-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
        <motion.div
          className="container mx-auto py-8 px-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* 页面标题 */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">
                个人中心
              </h1>
              <p className="text-gray-600 mt-2">在这里管理您的账户信息、会员订阅和支付历史。</p>
            </div>
            <Button onClick={handleLogout} variant="ghost" size="sm" className="hover:bg-red-50 hover:text-red-600 transition-all duration-300">
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </Button>
          </div>

          {/* 主要内容区域 */}
          <div className="grid grid-cols-12 gap-8 max-w-7xl mx-auto">
            {/* 左侧导航 */}
            <div className="col-span-12 lg:col-span-3">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="p-6 border-b border-orange-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-lg font-bold">
                          {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{user?.name || '用户'}</h3>
                        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>
                  <nav className="p-2">
                    {sidebarItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all duration-300 ${
                            activeTab === item.id
                              ? 'bg-orange-50 text-orange-600 border-l-4 border-orange-500'
                              : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="font-medium">{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* 右侧内容区域 */}
            <div className="col-span-12 lg:col-span-9">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden border-2 border-orange-200">
                <CardContent className="p-8">
                <AnimatePresence mode="wait">
                  {/* 基本资料 */}
                  {activeTab === 'profile' && (
                    <MotionDiv
                      key="profile"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900">账户信息</h2>
                          <p className="text-gray-600">您的基础账户详情</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditDialogOpen(true)}
                          className="border-orange-500 text-orange-600 hover:bg-orange-50 transition-all duration-300"
                        >
                          <Pencil className="mr-2 h-4 w-4"/>
                          编辑
                        </Button>
                      </div>
                      <div className="space-y-6">
                        <InfoRow label="邮箱地址" value={user.email} />
                        <InfoRow label="用户昵称" value={user.name || '未设置'} />
                        <InfoRow label="邮箱状态" value={user.isVerified ? '已验证' : '未验证'} badgeVariant={user.isVerified ? 'success' : 'destructive'} />
                        <InfoRow label="加入时间" value={safeFormatDate(user.createdAt)} />
                      </div>
                    </MotionDiv>
                  )}
                  {/* 会员订阅 */}
                  {activeTab === 'subscription' && (
                    <MotionDiv
                      key="subscription"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                    >
                      <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">我的订阅</h2>
                        <p className="text-gray-600">您当前的会员计划详情</p>
                      </div>
                      {subscription ? (
                        <div className="space-y-6">
                          <div className="bg-gradient-to-r from-blue-50 to-orange-50 p-6 rounded-xl border border-orange-200">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-bold text-xl text-gray-900">
                                  当前方案: <Badge className="bg-orange-500 text-white ml-2">
                                    {subscription.plan?.name || subscription.planName || '未知方案'}
                                  </Badge>
                                </h4>
                                <p className="text-gray-600 mt-1">
                                  状态: {
                                    isSubscriptionExpired(subscription) ? (
                                      <span className="text-red-600 font-semibold">已过期</span>
                                    ) : subscription.status === 'ACTIVE' ? (
                                      isSubscriptionExpiringSoon(subscription) ? (
                                        <span className="text-orange-600 font-semibold">即将过期</span>
                                      ) : (
                                        <span className="text-green-600 font-semibold">有效</span>
                                      )
                                    ) : (
                                      <span className="text-gray-600">已取消</span>
                                    )
                                  }
                                </p>
                              </div>
                              <div className="text-right">
                                {subscription.endDate ? (
                                  <>
                                    {isSubscriptionExpired(subscription) ? (
                                      <>
                                        <p className="font-semibold text-red-600">已于 {safeFormatDate(subscription.endDate)} 过期</p>
                                        <p className="text-sm text-red-500">专业会员已过期</p>
                                      </>
                                    ) : isSubscriptionExpiringSoon(subscription) ? (
                                      <>
                                        <p className="font-semibold text-orange-600">将于 {safeFormatDate(subscription.endDate)} 到期</p>
                                        <p className="text-sm text-orange-500">专业会员即将过期</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="font-semibold text-gray-900">将于 {safeFormatDate(subscription.endDate)} 到期</p>
                                        <p className="text-sm text-gray-500">专业会员有效</p>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {isFreePlan(subscription) ? (
                                      <>
                                        <p className="font-semibold text-gray-900">免费计划</p>
                                        <p className="text-sm text-gray-500">无到期限制</p>
                                      </>
                                    ) : (
                                      <p className="font-semibold text-gray-900">永久有效</p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            {/* 免费用户显示详细使用统计和权益信息 */}
                            {isFreePlan(subscription) && (
                              <div className="mt-4 pt-4 border-t border-orange-200 space-y-4">
                                {/* 使用统计 */}
                                {subscription.usageStats && (
                                  <div>
                                    <h5 className="font-semibold text-gray-900 mb-3">总体使用情况</h5>
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                      <div className="bg-blue-50 p-3 rounded-lg">
                                        <div className="text-blue-600 font-semibold">总共已用</div>
                                        <div className="text-xl font-bold text-blue-700">
                                          {subscription.usageStats.totalUsage}
                                          {subscription.usageStats.totalUsageLimit && (
                                            <span className="text-sm text-gray-500">/{subscription.usageStats.totalUsageLimit}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="bg-green-50 p-3 rounded-lg">
                                        <div className="text-green-600 font-semibold">总共剩余</div>
                                        <div className="text-xl font-bold text-green-700">
                                          {subscription.usageStats.totalRemaining !== null ? subscription.usageStats.totalRemaining : '无限制'}
                                        </div>
                                      </div>
                                      <div className="bg-orange-50 p-3 rounded-lg">
                                        <div className="text-orange-600 font-semibold">运行中任务</div>
                                        <div className="text-xl font-bold text-orange-700">
                                          {subscription.usageStats.runningTasks}
                                          <span className="text-sm text-gray-500">/{subscription.usageStats.maxConcurrentTasks}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500">
                                      免费计划总共可使用 {subscription.usageStats.totalUsageLimit} 次
                                    </div>

                                    {/* 使用次数超限警告 */}
                                    {subscription.usageStats.totalUsageLimit &&
                                     subscription.usageStats.totalUsage >= subscription.usageStats.totalUsageLimit && (
                                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <div className="flex items-center">
                                          <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
                                          <span className="text-red-700 font-semibold">免费使用次数已达上限</span>
                                        </div>
                                        <p className="text-red-600 text-sm mt-1">
                                          您已使用 {subscription.usageStats.totalUsage} 次，已达到免费计划的 {subscription.usageStats.totalUsageLimit} 次限制。
                                          请升级到专业版以获得更多使用次数。
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 权益列表 */}
                                {subscription.features && subscription.features.length > 0 && (
                                  <div>
                                    <h5 className="font-semibold text-gray-900 mb-3">{getPlanDisplayName(subscription)}权益</h5>
                                    <div className="grid grid-cols-1 gap-2">
                                      {subscription.features.map((feature, index) => (
                                        <div key={index} className="flex items-center text-sm text-gray-700">
                                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                          {feature}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 专业用户显示详细使用统计和权益信息 */}
                            {!isFreePlan(subscription) && subscription.usageStats && (
                              <div className="mt-4 pt-4 border-t border-orange-200 space-y-4">
                                {/* 使用统计 */}
                                <div>
                                  <h5 className="font-semibold text-gray-900 mb-3">本月使用情况</h5>
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="bg-blue-50 p-3 rounded-lg">
                                      <div className="text-blue-600 font-semibold">本月已用</div>
                                      <div className="text-xl font-bold text-blue-700">
                                        {subscription.usageStats.monthlyUsage}
                                        {subscription.usageStats.monthlyLimit && (
                                          <span className="text-sm text-gray-500">/{subscription.usageStats.monthlyLimit}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded-lg">
                                      <div className="text-green-600 font-semibold">本月剩余</div>
                                      <div className="text-xl font-bold text-green-700">
                                        {subscription.usageStats.monthlyRemaining || '无限制'}
                                      </div>
                                    </div>
                                    <div className="bg-orange-50 p-3 rounded-lg">
                                      <div className="text-orange-600 font-semibold">运行中任务</div>
                                      <div className="text-xl font-bold text-orange-700">
                                        {subscription.usageStats.runningTasks}
                                        <span className="text-sm text-gray-500">/{subscription.usageStats.maxConcurrentTasks}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 text-xs text-gray-500">
                                    下次重置时间: {safeFormatDate(subscription.usageStats.resetDate, 'yyyy年MM月dd日')}
                                  </div>

                                  {/* 专业会员使用次数超限警告 */}
                                  {subscription.usageStats.monthlyLimit &&
                                   subscription.usageStats.monthlyUsage >= subscription.usageStats.monthlyLimit && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                      <div className="flex items-center">
                                        <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
                                        <span className="text-red-700 font-semibold">本月使用次数已达上限</span>
                                      </div>
                                      <p className="text-red-600 text-sm mt-1">
                                        您本月已使用 {subscription.usageStats.monthlyUsage} 次，已达到专业计划的 {subscription.usageStats.monthlyLimit} 次限制。
                                        请等待下月重置或联系客服了解更高级别的方案。
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* 权益列表 */}
                                {subscription.features && subscription.features.length > 0 && (
                                  <div>
                                    <h5 className="font-semibold text-gray-900 mb-3">{getPlanDisplayName(subscription)}权益</h5>
                                    <div className="grid grid-cols-1 gap-2">
                                      {subscription.features.map((feature, index) => (
                                        <div key={index} className="flex items-center text-sm text-gray-700">
                                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                          {feature}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-4">
                            {/* 根据订阅状态显示不同的按钮 */}
                            {isFreePlan(subscription) && (
                              <Button onClick={() => navigate('/membership')} className="bg-orange-500 text-white hover:bg-orange-600 transition-all duration-300">
                                升级会员
                              </Button>
                            )}
                            {!isFreePlan(subscription) && (
                              <Button
                                onClick={() => navigate('/membership')}
                                className={`transition-all duration-300 ${
                                  isSubscriptionExpired(subscription)
                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                    : isSubscriptionExpiringSoon(subscription)
                                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                }`}
                              >
                                {isSubscriptionExpired(subscription) ? '重新订阅' : '续订会员'}
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-16 border-2 border-dashed border-orange-200 rounded-xl bg-orange-50/30">
                          <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CreditCard className="h-8 w-8 text-white" />
                          </div>
                          <p className="text-gray-600 text-lg mb-4">您当前没有有效的会员订阅</p>
                          <Button onClick={() => navigate('/membership')} className="bg-orange-100 text-orange-600 hover:bg-orange-200 border border-orange-300 transition-all duration-300">
                            查看会员方案
                          </Button>
                        </div>
                      )}
                    </MotionDiv>
                  )}
                  {/* 支付历史 */}
                  {activeTab === 'payment-history' && (
                    <MotionDiv
                      key="payment-history"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                    >
                      <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">支付历史</h2>
                        <p className="text-gray-600">您最近的交易记录</p>
                      </div>
                      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="font-semibold text-gray-900">订单号</TableHead>
                              <TableHead className="font-semibold text-gray-900">订阅方案</TableHead>
                              <TableHead className="font-semibold text-gray-900">金额</TableHead>
                              <TableHead className="font-semibold text-gray-900">状态</TableHead>
                              <TableHead className="font-semibold text-gray-900">日期</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orders.length > 0 ? (
                              orders.slice(0, 5).map((order, index) => (
                                <TableRow
                                  key={order.id || order.orderNo || `order-${index}`}
                                  onClick={() => navigate(`/order/details/${order.id || order.orderNo}`)}
                                  className="cursor-pointer hover:bg-orange-50/50 transition-colors duration-200"
                                >
                                  <TableCell className="font-mono text-blue-600">{order.orderNo || order.id}</TableCell>
                                  <TableCell className="font-medium">{order.planName}</TableCell>
                                  <TableCell className="font-semibold text-green-600">¥{Number(order.amount).toFixed(2)}</TableCell>
                                  <TableCell>
                                    <Badge variant={order.status === 'PAID' ? 'success' : 'secondary'} className="font-medium">
                                      {order.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{safeFormatDate(order.createdAt, 'yyyy-MM-dd')}</TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-gray-500">
                                  没有找到支付记录
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                        {orders.length > 5 && (
                          <div className="p-4 bg-gray-50 text-center border-t">
                            <Button variant="link" asChild className="text-blue-600 hover:text-orange-600">
                              <Link to="/user/orders">
                                查看全部历史记录 <ExternalLink className="ml-2 h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    </MotionDiv>
                  )}
                  {/* 任务历史 */}
                  {activeTab === 'task-history' && (
                    <MotionDiv
                      key="task-history"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                    >
                      <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">任务历史</h2>
                        <p className="text-gray-600">您提交的所有任务记录</p>
                      </div>
                      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                        <TaskHistoryTable
                          showUserInfo={false}
                          pageSize={10}
                        />
                      </div>
                    </MotionDiv>
                  )}
                </AnimatePresence>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </div>
      <EditProfileDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} nickname={user.name || ''} />
    </>
  );
};

const InfoRow = ({ label, value, badgeVariant }: { label: string; value: string; badgeVariant?: "success" | "destructive" | "default" }) => (
  <div className="flex items-center justify-between py-4 px-6 bg-gray-50 rounded-lg border border-gray-200">
    <p className="text-sm font-semibold text-gray-700">{label}</p>
    {badgeVariant ? (
      <Badge variant={badgeVariant} className="font-medium">{value}</Badge>
    ) : (
      <p className="text-sm font-medium text-gray-900">{value}</p>
    )}
  </div>
);

const TaskStatusBadge = ({ status }: { status: string }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { icon: Clock, color: 'bg-purple-100 text-purple-800', label: '填写中' };
      case 'PENDING':
        return { icon: Clock, color: 'bg-yellow-100 text-yellow-800', label: '等待中' };
      case 'RUNNING':
        return { icon: Activity, color: 'bg-blue-100 text-blue-800', label: '运行中' };
      case 'COMPLETED':
        return { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: '已完成' };
      case 'FAILED':
        return { icon: XCircle, color: 'bg-red-100 text-red-800', label: '失败' };
      default:
        return { icon: AlertCircle, color: 'bg-gray-100 text-gray-800', label: '未知' };
    }
  };

  const { icon: Icon, color, label } = getStatusConfig(status);

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </div>
  );
};

const EditProfileDialog = ({ isOpen, onOpenChange, nickname }: { isOpen: boolean; onOpenChange: (open: boolean) => void; nickname: string }) => {
    const [currentNickname, setCurrentNickname] = useState(nickname);
    const [saving, setSaving] = useState(false);
    const { user, login } = useAuth();


    useEffect(() => {
        setCurrentNickname(nickname);
    }, [nickname]);

    const handleSave = async () => {
        if (!currentNickname.trim()) {
            console.error("昵称不能为空");
            alert("昵称不能为空");
            return;
        }

        setSaving(true);
        try {
            const response = await updateMyProfile({ name: currentNickname.trim() });

            // 更新认证上下文中的用户信息
            if (user) {
                login({
                    ...user,
                    name: response.data.name
                });
            }

            console.log("昵称更新成功");
            alert("昵称更新成功");
            onOpenChange(false);
        } catch (error: any) {
            console.error("Error updating profile:", error);
            alert(error.response?.data?.message || "更新失败，请重试");
        } finally {
            setSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>编辑个人资料</DialogTitle>
                    <DialogDescription>
                        在这里更新您的账户信息。点击保存以应用更改。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="nickname" className="text-right">昵称</Label>
                        <Input id="nickname" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        取消
                    </Button>
                    <Button
                        type="submit"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-orange-500 text-white hover:bg-orange-600 transition-all duration-300"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                保存中...
                            </>
                        ) : (
                            '保存更改'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ProfilePage; 