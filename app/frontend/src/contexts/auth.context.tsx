"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { getMe } from '@/services/user.service';
import { logout as logoutUser } from '@/services/auth.service';

// 定义角色枚举，与后端保持一致
const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN'
} as const;

type Role = typeof Role[keyof typeof Role];

export { Role };

interface User {
  id: string;
  email: string;
  name: string | null; // 更新字段名以匹配后端schema
  avatar: string | null; // 更新字段名以匹配后端schema
  isVerified: boolean;
  role: Role; // 添加角色字段
  createdAt: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean; // 添加便捷的管理员检查
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // 计算是否为管理员
  const isAdmin = user?.role === Role.ADMIN;

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);
  
  useEffect(() => {
    const checkAuthStatus = async () => {
      // 如果已经通过登录初始化过，就不需要再检查
      if (isInitialized) {
        console.log('🔐 认证上下文 - 已初始化，跳过检查');
        setLoading(false);
        return;
      }

      console.log('🔐 认证上下文 - 开始检查认证状态');
      setLoading(true);
      try {
        const response = await getMe();
        console.log('✅ 认证检查成功:', {
          id: response.data.id,
          email: response.data.email
        });
        setUser(response.data);
        setIsAuthenticated(true);
      } catch (error: any) {
        console.log('❌ 认证检查失败:', error.response?.status, error.response?.data?.message);
        // 静默处理错误，不让它冒泡到全局拦截器
        // 这样游客访问时，获取用户信息失败（401）不会触发全局跳转
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
        setIsInitialized(true);
        console.log('🏁 认证状态检查完成');
      }
    };

    checkAuthStatus();
  }, [isInitialized]);
  
  const login = (user: User) => {
    console.log('🔐 认证上下文 - 用户登录:', {
      id: user.id,
      email: user.email
    });
    setUser(user);
    setIsAuthenticated(true);
    setLoading(false); // 登录成功后停止loading状态，确保页面能正常获取数据
    setIsInitialized(true); // 标记已初始化，避免重复检查认证状态
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 