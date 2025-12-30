import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth.context';
import {
  LayoutDashboard,
  Users,
  Package,
  Settings,
  FileText,
  Activity,
  CreditCard,
  LogOut,
  Shield,
  Wrench,
  MessageSquare,
  Monitor
} from 'lucide-react';

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navigationItems = [
    {
      title: '仪表盘',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      description: '系统概览和核心指标'
    },
    {
      title: '用户管理',
      href: '/admin/users',
      icon: Users,
      description: '管理用户账户和权限'
    },
    {
      title: '任务监控',
      href: '/admin/tasks',
      icon: Activity,
      description: '查看和管理系统任务'
    },
    {
      title: '订单管理',
      href: '/admin/orders',
      icon: CreditCard,
      description: '订单和支付记录'
    },
    {
      title: '订阅管理',
      href: '/admin/subscriptions',
      icon: Package,
      description: '用户订阅和会员状态'
    },
    {
      title: '计划管理',
      href: '/admin/plans',
      icon: Settings,
      description: '会员计划和定价配置'
    },
    {
      title: '工具管理',
      href: '/admin/tools',
      icon: Wrench,
      description: 'EDA工具配置和管理'
    },
    {
      title: '用户反馈',
      href: '/admin/feedback',
      icon: MessageSquare,
      description: '用户反馈和客服管理'
    },
    {
      title: '系统日志',
      href: '/admin/logs',
      icon: FileText,
      description: '系统运行日志和错误记录'
    },
    {
      title: '系统监控',
      href: '/admin/monitoring',
      icon: Monitor,
      description: '实时监控系统性能和资源使用'
    }
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className={cn("flex flex-col h-full bg-slate-900 border-r border-slate-800", className)}>
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">后台管理</h2>
            <p className="text-sm text-slate-400">LogicCore Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 flex-shrink-0",
                isActive ? "text-white" : "text-slate-400 group-hover:text-white"
              )} />
              <span className="flex-1">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-slate-800">
        <div className="mb-3 p-3 bg-slate-800 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || '管理员'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        </div>
        
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4 mr-2" />
          退出登录
        </Button>
      </div>
    </div>
  );
};

export default Sidebar; 