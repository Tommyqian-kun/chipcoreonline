"use client";

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
// @ts-ignore - axios 导入类型问题
const axios = require('axios');

const VerifyCodePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  
  // 从注册页面传递的邮箱地址或URL参数获取
  const urlParams = new URLSearchParams(location.search);
  const email = location.state?.email || urlParams.get('email') || '';

  useEffect(() => {
    // 如果没有邮箱信息，重定向到注册页面
    if (!email) {
      navigate('/auth/register');
      return;
    }
  }, [email, navigate]);

  useEffect(() => {
    // 倒计时逻辑
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/v1/auth/verify-code', {
        email,
        code
      });

      if (response.status === 200) {
        setSuccess('邮箱验证成功！正在跳转到登录页面...');
        setTimeout(() => {
          navigate('/auth/login', { 
            state: { 
              message: '注册成功！请使用您的邮箱和密码登录。',
              email 
            } 
          });
        }, 2000);
      }
    } catch (error: any) {
      if (error.response?.status === 400) {
        setError('验证码无效或已过期，请重新获取');
      } else if (error.response?.status === 404) {
        setError('用户不存在，请重新注册');
      } else {
        setError('验证失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    setError('');
    setSuccess('');

    try {
      await axios.post('/api/v1/auth/resend-verification-code', {
        email
      });
      
      setSuccess('验证码已重新发送到您的邮箱');
      setCountdown(60); // 60秒倒计时
    } catch (error: any) {
      setError('重发验证码失败，请稍后重试');
    } finally {
      setResendLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    setError('');
    
    // 自动提交验证码
    if (value.length === 6) {
      setTimeout(() => {
        handleVerifyCode();
      }, 500);
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
          <p className="mt-2 text-gray-500">验证您的邮箱</p>
        </div>
        
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-orange-600" />
            </div>
            <CardTitle className="text-2xl">输入验证码</CardTitle>
            <CardDescription>
              我们已向 <span className="font-medium text-gray-900">{email}</span> 发送了6位验证码
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert>
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={handleCodeChange}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button 
                onClick={handleVerifyCode} 
                className="w-full" 
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    验证中...
                  </>
                ) : (
                  '验证邮箱'
                )}
              </Button>
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-gray-600">
                没有收到验证码？
              </p>
              <Button
                variant="link"
                onClick={handleResendCode}
                disabled={resendLoading || countdown > 0}
                className="p-0 h-auto text-orange-600"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    发送中...
                  </>
                ) : countdown > 0 ? (
                  `重新发送 (${countdown}s)`
                ) : (
                  '重新发送验证码'
                )}
              </Button>
            </div>

            <div className="text-center">
              <Button
                variant="link"
                onClick={() => navigate('/auth/register')}
                className="p-0 h-auto text-gray-600"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回注册
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default VerifyCodePage;
