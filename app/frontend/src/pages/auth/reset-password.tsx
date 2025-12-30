"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { resetPassword } from '@/services/auth.service';
import { motion } from 'framer-motion';

const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError('无效的重置链接：缺少令牌。');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要6个字符。');
      return;
    }
    if (!token) {
      setError('无效的重置链接。');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await resetPassword(token, password);
      setMessage(response.data.message);
      setTimeout(() => navigate('/auth/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || '请求失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <motion.div
        className="mx-auto w-full max-w-md"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-6">
            <h1 className="text-3xl font-bold gradient-text-orange">ChipCore</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">设置新密码</CardTitle>
            <CardDescription>
              请输入您的新密码。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                
                <div className="space-y-2">
                  <Label htmlFor="password">新密码</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="至少6位字符"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="再次输入新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !!message}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '重置密码'}
                </Button>
              </form>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>{error || '无效的密码重置链接。'}</AlertDescription>
                <div className="mt-4">
                  <Button asChild variant="link" className="p-0 h-auto">
                    <Link to="/login">返回登录</Link>
                  </Button>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage; 