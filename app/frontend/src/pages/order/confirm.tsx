import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, ShoppingCart, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import api from '@/services/api';

interface PlanDetails {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}

const OrderConfirmPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [planDetails, setPlanDetails] = useState<PlanDetails | null>(null);

  const planId = searchParams.get('planId');
  const cycle = searchParams.get('cycle') as 'MONTHLY' | 'YEARLY';

  useEffect(() => {
    if (!planId || !cycle) {
      toast({
        title: "参数错误",
        description: "缺少必要的订单参数，请重新选择计划。",
        variant: "destructive",
      });
      navigate('/membership');
      return;
    }

    fetchPlanDetails();
  }, [planId, cycle, navigate, toast]);

  const fetchPlanDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/plans`);
      const plans = response.data;
      const plan = plans.find((p: any) => p.id === planId);

      if (!plan) {
        throw new Error('计划不存在');
      }

      setPlanDetails(plan);
    } catch (error) {
      toast({
        title: "加载失败",
        description: "无法加载计划详情，请稍后重试。",
        variant: "destructive",
      });
      navigate('/membership');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!planId || !cycle) return;

    // 跳转到支付页面，传递必要参数
    navigate(`/order/checkout?planId=${planId}&cycle=${cycle}&planName=${encodeURIComponent(planDetails?.name || '')}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>加载计划详情...</span>
        </div>
      </div>
    );
  }

  if (!planDetails) {
    return null;
  }

  const price = cycle === 'YEARLY' ? planDetails.yearlyPrice : planDetails.monthlyPrice;
  const billingCycle = cycle === 'YEARLY' ? '年度订阅' : '月度订阅';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 flex items-center justify-center">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <ShoppingCart className="h-6 w-6 gradient-text-orange" />
              <CardTitle className="text-2xl">确认您的订单</CardTitle>
            </div>
            <CardDescription>请在支付前核对您的订阅计划详情。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 border rounded-lg">
              <h3 className="text-lg font-semibold">{planDetails.name}</h3>
              <p className="text-sm text-gray-500">{billingCycle}</p>
              <Separator className="my-4" />
              <ul className="space-y-2 text-sm">
                {planDetails.features.map((feature, index) => (
                  <li key={index} className="flex items-center">
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Separator className="my-4" />
              <div className="text-right">
                <p className="text-sm text-gray-600">总计</p>
                <p className="text-2xl font-bold">¥{price.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" asChild>
              <Link to="/membership">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回
              </Link>
            </Button>
            <Button className="gradient-bg-orange" onClick={handleConfirm}>
              确认并支付
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
};

export default OrderConfirmPage; 