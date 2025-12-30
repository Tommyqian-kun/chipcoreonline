"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth.context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/services/api';

interface UserData {
  id: string;
  email: string;
  name: string | null;
  isVerified: boolean;
  role: string;
  createdAt: string;
}

interface SubscriptionData {
  id: string;
  userId: string;
  status: string;
  startDate: string;
  endDate: string;
  plan: {
    id: string;
    name: string;
    priceMonth: number;
    priceYear: number;
  };
}

const DebugPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // 获取当前用户信息
  const fetchUserData = async () => {
    try {
      console.log('🔍 获取用户信息...');
      const response = await api.get('/users/me');
      setUserData(response.data);
      console.log('✅ 用户信息获取成功:', response.data);
    } catch (error: any) {
      const errorMsg = `获取用户信息失败: ${error.response?.status} - ${error.response?.data?.message || error.message}`;
      console.error('❌', errorMsg);
      setErrors(prev => [...prev, errorMsg]);
    }
  };

  // 获取订阅信息
  const fetchSubscriptionData = async () => {
    try {
      console.log('🔍 获取订阅信息...');
      const response = await api.get('/subscriptions/me');
      setSubscriptionData(response.data);
      console.log('✅ 订阅信息获取成功:', response.data);
    } catch (error: any) {
      const errorMsg = `获取订阅信息失败: ${error.response?.status} - ${error.response?.data?.message || error.message}`;
      console.error('❌', errorMsg);
      setErrors(prev => [...prev, errorMsg]);
      
      // 详细的错误分析
      if (error.config) {
        console.error('🔍 请求配置:', {
          url: error.config.url,
          baseURL: error.config.baseURL,
          method: error.config.method,
          fullURL: error.config.baseURL + error.config.url
        });
      }
    }
  };

  // 获取所有用户（管理员功能）
  const fetchAllUsers = async () => {
    try {
      console.log('🔍 获取所有用户...');
      const response = await api.get('/admin/users');
      setAllUsers(response.data.users || response.data);
      console.log('✅ 所有用户获取成功');
    } catch (error: any) {
      const errorMsg = `获取所有用户失败: ${error.response?.status} - ${error.response?.data?.message || error.message}`;
      console.error('❌', errorMsg);
      setErrors(prev => [...prev, errorMsg]);
    }
  };

  // 执行所有测试
  const runAllTests = async () => {
    setLoading(true);
    setErrors([]);
    
    await fetchUserData();
    await fetchSubscriptionData();
    
    // 如果是管理员，尝试获取所有用户
    if (user?.role === 'ADMIN') {
      await fetchAllUsers();
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      runAllTests();
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Debug页面</CardTitle>
          </CardHeader>
          <CardContent>
            <p>请先登录以查看调试信息</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🔧 Debug信息页面</CardTitle>
          <Button onClick={runAllTests} disabled={loading}>
            {loading ? '测试中...' : '重新测试所有API'}
          </Button>
        </CardHeader>
      </Card>

      {/* 认证上下文信息 */}
      <Card>
        <CardHeader>
          <CardTitle>🔐 认证上下文信息</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify({
              isAuthenticated,
              user,
              timestamp: new Date().toISOString()
            }, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* 用户信息 */}
      <Card>
        <CardHeader>
          <CardTitle>👤 用户信息 (GET /users/me)</CardTitle>
        </CardHeader>
        <CardContent>
          {userData ? (
            <pre className="bg-green-50 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(userData, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500">暂无数据</p>
          )}
        </CardContent>
      </Card>

      {/* 订阅信息 */}
      <Card>
        <CardHeader>
          <CardTitle>💳 订阅信息 (GET /subscriptions/me)</CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptionData ? (
            <pre className="bg-green-50 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(subscriptionData, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500">暂无订阅数据</p>
          )}
        </CardContent>
      </Card>

      {/* 所有用户信息（仅管理员） */}
      {user?.role === 'ADMIN' && (
        <Card>
          <CardHeader>
            <CardTitle>👥 所有用户信息 (GET /admin/users)</CardTitle>
          </CardHeader>
          <CardContent>
            {allUsers.length > 0 ? (
              <pre className="bg-blue-50 p-4 rounded text-sm overflow-auto max-h-96">
                {JSON.stringify(allUsers, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-500">暂无数据</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 错误信息 */}
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>❌ 错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errors.map((error, index) => (
                <div key={index} className="bg-red-50 p-3 rounded text-sm text-red-700">
                  {error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* API配置信息 */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ API配置信息</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify({
              VITE_API_URL: import.meta.env.VITE_API_URL,
              baseURL: api.defaults.baseURL,
              withCredentials: api.defaults.withCredentials,
              timeout: api.defaults.timeout
            }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugPage;
