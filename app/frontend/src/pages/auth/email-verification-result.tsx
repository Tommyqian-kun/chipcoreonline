"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const EmailVerificationResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setStatus('success');
      setTimeout(() => {
        navigate('/auth/login');
      }, 3000); // 3秒后跳转到登录页
    } else {
      setStatus('error');
      switch (error) {
        case 'InvalidToken':
          setErrorMessage('无效的验证链接。');
          break;
        case 'InvalidOrExpiredToken':
          setErrorMessage('您的验证链接无效或已过期。');
          break;
        case 'ServerError':
        default:
          setErrorMessage('发生服务器错误，请稍后再试。');
          break;
      }
    }
  }, [searchParams, navigate]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 animate-spin text-orange-500 mb-4" />
            <p className="text-lg font-medium text-gray-700">正在验证您的邮箱...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium text-green-700">邮箱验证成功！</p>
            <p className="text-gray-500 mt-2">
              将在3秒后自动跳转至登录页面...
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <XCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-red-700">验证失败</p>
            <p className="text-gray-500 mt-2">{errorMessage}</p>
            <Button asChild className="mt-6">
              <Link to="/login">返回登录</Link>
            </Button>
            {/* 未来可以添加"重新发送邮件"的按钮 */}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold gradient-text-orange">
            ChipCore
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailVerificationResultPage; 