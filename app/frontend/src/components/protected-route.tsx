import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth.context';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // 显示加载指示器而不是返回null
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // 将用户重定向到登录页，并保存他们试图访问的位置
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <Outlet />; // 如果已认证，渲染子路由
};

export default ProtectedRoute; 