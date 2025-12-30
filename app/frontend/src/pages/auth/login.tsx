"use client";

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth.context';
import { login as loginUser, resendVerification } from '@/services/auth.service';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const { login: loginContext } = useAuth();
  const location = useLocation();

  const handleResendVerification = async () => {
    setResendLoading(true);
    setError('');
    try {
      await resendVerification(email);
      // 提供一个积极的反馈，即使后端总是返回成功
      setError("如果该邮箱已注册且尚未验证，新的验证邮件已发送至您的邮箱，请查收。");
      setShowResend(false); // 隐藏按钮以防重复点击
    } catch (err) {
      setError("请求失败，请稍后再试。");
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowResend(false);

    try {
      const response = await loginUser(email, password, rememberMe);
      const { user } = response.data;

      loginContext(user);

      // 如果是管理员，提示使用专门的管理员登录页面
      if (user.role === 'ADMIN') {
        setError('管理员请使用专门的管理员登录页面');
        return;
      }

      // 普通用户重定向到原来要去的页面或首页
      const from = location.state?.from?.pathname || '/';
      navigate(from);
    } catch (err: any) {
      if (err.response && err.response.data) {
        const errorMessage = err.response.data.message || '登录失败，请稍后再试。';
        setError(errorMessage);
        if (err.response.data.code === 'EMAIL_NOT_VERIFIED') {
          setShowResend(true);
        }
      } else {
        setError('发生未知网络错误，请检查您的网络连接。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
            <h1 className="text-3xl font-bold gradient-text-orange">ChipCore</h1>
            <p className="mt-2 text-gray-500">欢迎回来</p>
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              登录
            </CardTitle>
            <CardDescription className="text-center">
              输入您的邮箱和密码以继续
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error}
                    {showResend && (
                       <Button 
                         variant="link" 
                         onClick={handleResendVerification} 
                         disabled={resendLoading}
                         className="p-0 h-auto ml-2 text-white underline"
                       >
                         {resendLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '重新发送验证邮件'}
                       </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Checkbox 
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)} 
                    disabled={loading}
                  />
                  <Label htmlFor="remember-me" className="ml-2 font-normal">记住我</Label>
                </div>
                <div className="text-sm">
                  <Button asChild variant="link" className="p-0 h-auto font-normal">
                    <Link to="/auth/forgot-password">忘记密码？</Link>
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full gradient-bg-orange text-white"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
            
            <div className="mt-4 text-center text-sm">
              <span className="text-gray-600">还没有账户？</span>
              <Button asChild variant="link" className="p-0 ml-1 h-auto font-normal text-orange-600">
                <Link to="/auth/register">立即注册</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage; 