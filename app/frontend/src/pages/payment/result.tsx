import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const PaymentResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');

  const result = {
    success: {
      icon: <CheckCircle2 className="h-16 w-16 text-green-500" />,
      title: '支付成功',
      description: '感谢您的购买！您的订阅已成功激活。',
      buttonText: '开始使用',
      buttonLink: '/tools',
    },
    failure: {
      icon: <XCircle className="h-16 w-16 text-red-500" />,
      title: '支付失败',
      description: '支付过程中遇到问题，您的订单尚未完成。请稍后重试。',
      buttonText: '返回重试',
      buttonLink: '/membership',
    },
    unknown: {
      icon: <AlertTriangle className="h-16 w-16 text-yellow-500" />,
      title: '状态未知',
      description: '无法确认您的支付状态，请联系客服。',
      buttonText: '返回首页',
      buttonLink: '/',
    },
  };

  const currentStatus = status === 'success' ? 'success' : status === 'failure' ? 'failure' : 'unknown';
  const { icon, title, description, buttonText, buttonLink } = result[currentStatus];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              {icon}
            </div>
            <CardTitle className="mt-4 text-2xl">{title}</CardTitle>
            <CardDescription className="mt-2">{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full gradient-bg-orange">
              <Link to={buttonLink}>{buttonText}</Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default PaymentResultPage; 