import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Clock, CreditCard, Home, Mail, Package, Phone, User } from 'lucide-react';

import { getOrderDetails } from '@/services/order.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

type OrderStatus = 'PAID' | 'PENDING' | 'FAILED';

const statusStyles: { [key in OrderStatus]: string } = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  FAILED: 'bg-red-100 text-red-800',
};

const statusIcons: { [key in OrderStatus]: JSX.Element } = {
    PAID: <CheckCircle className="h-5 w-5 text-green-500" />,
    PENDING: <Clock className="h-5 w-5 text-yellow-500" />,
    FAILED: <CheckCircle className="h-5 w-5 text-red-500" />,
}


const OrderDetailsPage = () => {
  const { orderNo } = useParams<{ orderNo: string }>();
  const navigate = useNavigate();

  const { data: orderData, isLoading, isError, error } = useQuery({
    queryKey: ['orderDetails', orderNo],
    queryFn: () => getOrderDetails(orderNo!),
    enabled: !!orderNo,
  });

  const order = orderData?.data;

  const DetailItem = ({ icon, label, children }: { icon: JSX.Element; label: string; children: React.ReactNode }) => (
    <div className="flex items-start space-x-3">
      <div className="mt-1 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-base font-semibold">{children}</p>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-4">加载订单失败</h2>
        <p className="text-muted-foreground mb-4">{(error as Error)?.message || '发生未知错误，请稍后再试。'}</p>
        <Button onClick={() => navigate('/profile')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> 返回个人中心
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8 text-center">
            <h2 className="text-2xl font-bold text-muted-foreground mb-4">未找到订单</h2>
            <p className="text-muted-foreground mb-4">无法找到指定的订单信息。</p>
            <Button onClick={() => navigate('/profile')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> 返回个人中心
            </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-50/50 min-h-screen"
    >
      <div className="container mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="text-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <Badge className={`px-3 py-1 text-sm ${statusStyles[order.status as OrderStatus]}`}>
            {statusIcons[order.status as OrderStatus]}
            <span className="ml-2 font-semibold">{order.status}</span>
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader className='bg-slate-50'>
                <CardTitle className="flex items-center text-xl">
                  <Package className="mr-3 h-6 w-6 text-primary" />
                  订单摘要
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <DetailItem icon={<User className="h-5 w-5" />} label="订单号">
                  {order.orderNo}
                </DetailItem>
                <DetailItem icon={<Clock className="h-5 w-5" />} label="创建时间">
                  {format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                </DetailItem>
                 <DetailItem icon={<CheckCircle className="h-5 w-5" />} label="支付状态">
                   <span className="font-bold text-primary">{order.status}</span>
                </DetailItem>
                <DetailItem icon={<CreditCard className="h-5 w-5" />} label="支付方式">
                  {order.payment.method === 'ALIPAY' ? '支付宝' : '微信支付'}
                </DetailItem>
              </CardContent>
            </Card>

            <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
               <CardHeader className='bg-slate-50'>
                <CardTitle className="flex items-center text-xl">
                  <Package className="mr-3 h-6 w-6 text-primary" />
                  套餐详情
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold">{order.plan.name}</h3>
                <p className="text-muted-foreground mt-1">{order.plan.description}</p>
                 <div className="text-right mt-4">
                    <p className="text-sm text-muted-foreground">总金额</p>
                    <p className="text-2xl font-bold text-primary">¥{order.amount.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-8">
            <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
               <CardHeader className='bg-slate-50'>
                <CardTitle className="flex items-center text-xl">
                  <Home className="mr-3 h-6 w-6 text-primary" />
                  账单地址
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <DetailItem icon={<User className="h-5 w-5" />} label="收件人">
                  {order.billingAddress.name}
                </DetailItem>
                <DetailItem icon={<Mail className="h-5 w-5" />} label="邮箱">
                  {order.user.email}
                </DetailItem>
                <DetailItem icon={<Phone className="h-5 w-5" />} label="电话">
                  {order.billingAddress.phone}
                </DetailItem>
                <DetailItem icon={<Home className="h-5 w-5" />} label="地址">
                  {order.billingAddress.address}
                </DetailItem>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OrderDetailsPage; 