import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, Role } from '@/contexts/auth.context';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

const AdminRoute: React.FC = () => {
  const { isAuthenticated, user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // 显示加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">正在验证管理员权限...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 如果未登录，重定向到管理员登录页
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // 如果已登录但不是管理员，显示权限不足页面
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              权限不足
            </h2>
            <p className="text-gray-600 mb-4">
              您没有访问管理后台的权限。如需帮助，请联系系统管理员。
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>当前用户：{user?.email}</p>
              <p>用户角色：{user?.role === Role.USER ? '普通用户' : '未知'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 如果是管理员，渲染子路由
  return <Outlet />;
};

export default AdminRoute; 