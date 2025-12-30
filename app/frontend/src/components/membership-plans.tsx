"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Check, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth.context";
import api from "@/services/api";

// This should ideally match the structure of the data coming from the backend
interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnually: number;
  features: PlanFeature[];
  description: string;
  buttonText: string;
  buttonVariant: "default" | "outline";
  popular: boolean;
}

const planMetadata: { [key: string]: Omit<Partial<Plan>, 'id' | 'name' | 'priceMonthly' | 'priceAnnually'> } = {
  "Professional": {
    description: "适合专业团队和企业用户",
    buttonText: "立即升级",
    buttonVariant: "default",
    popular: true,
    // 权益信息完全从数据库API获取，不再使用硬编码fallback
    features: []
  },
  "Free": {
    description: "适合个人用户和小型项目",
    buttonText: "开始使用",
    buttonVariant: "outline",
    popular: false,
    // 权益信息完全从数据库API获取，不再使用硬编码fallback
    features: []
  },
};

// --- ECS Only部署方式默认权益数据 ---
// 这些数据符合ECS Only部署方式的权益定义，用作API失败时的fallback
const DEFAULT_PLANS: Plan[] = [
  {
    id: "ecs-only-free-plan",
    name: "Free",
    priceMonthly: 0,
    priceAnnually: 0,
    description: "适合个人用户试用",
    buttonText: "开始使用",
    buttonVariant: "outline",
    popular: false,
    features: [
      { text: "总共20次工具试用", included: true },
      { text: "2个并发任务", included: true },
      { text: "5次技术资讯（邮件方式）", included: true },
      { text: "工具部分功能受限制", included: true },
      { text: "不提供定制化技术服务", included: false },
      { text: "20MB存储空间", included: true },
      { text: "2分钟限时下载并自动清除任务数据", included: true },
    ],
  },
  {
    id: "ecs-only-professional-plan",
    name: "Professional",
    priceMonthly: 0.01,
    priceAnnually: 0.12,
    description: "适合专业团队和企业用户",
    buttonText: "立即升级",
    buttonVariant: "default",
    popular: true,
    features: [
      { text: "每月50次工具使用", included: true },
      { text: "5个并发任务", included: true },
      { text: "每月10次一对一技术资讯（线上交流或邮件方式）", included: true },
      { text: "支持工具高级功能", included: true },
      { text: "提供定制化技术服务", included: true },
      { text: "部分工具提供API接口", included: true },
      { text: "50MB存储空间", included: true },
      { text: "2分钟限时下载并自动清除任务数据", included: true },
    ],
  },
];
// --- End Default Plans ---

export default function MembershipPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();



  // 数据验证函数：确保只包含正确的计划（Free和Professional）
  const validatePlansData = (plans: any[]): Plan[] => {
    if (!Array.isArray(plans)) {
      console.warn('❌ 计划数据不是数组格式');
      return [];
    }

    // 只保留Free和Professional计划，过滤掉其他错误的计划
    const validPlans = plans.filter(plan =>
      plan &&
      typeof plan === 'object' &&
      plan.name &&
      (plan.name === 'Free' || plan.name === 'Professional')
    );

    if (validPlans.length !== 2) {
      console.warn('❌ 计划数据不完整，期望2个计划(Free+Professional)，实际:', validPlans.length);
      return [];
    }

    console.log('✅ 计划数据验证通过:', validPlans.map(p => p.name));
    return validPlans;
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 开始获取会员计划数据...');

      // 使用配置好的api实例，自动处理baseURL和认证
      const response = await api.get('/plans/features');

      console.log('📡 API响应状态:', response.status);
      console.log('📊 API响应数据:', response.data);

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // 验证API数据
        const validatedApiData = validatePlansData(response.data);

        if (validatedApiData.length === 2) {
          const fetchedPlans = validatedApiData.map((plan: any): Plan => ({
            id: plan.id,
            name: plan.name,
            priceMonthly: plan.priceMonth,
            priceAnnually: plan.priceYear,
            description: planMetadata[plan.name]?.description || plan.description || '',
            buttonText: planMetadata[plan.name]?.buttonText || '选择方案',
            buttonVariant: planMetadata[plan.name]?.buttonVariant || 'default',
            popular: planMetadata[plan.name]?.popular || false,
            // 使用后端返回的真实权益列表，确保与个人中心完全一致
            features: plan.featureList?.map((feature: string) => ({
              text: feature,
              included: true
            })) || [],
          }));

          // 缓存验证通过的计划数据
          localStorage.setItem('membershipPlans', JSON.stringify(fetchedPlans));
          setPlans(fetchedPlans);

          console.log('✅ 从API获取权益数据成功:', fetchedPlans.map(p => ({
            name: p.name,
            featuresCount: p.features.length
          })));
          return;
        } else {
          throw new Error('API返回的计划数据验证失败');
        }
      } else {
        throw new Error('API返回空数据或格式错误');
      }
    } catch (err: any) {
      console.error('❌ API获取失败:', err.response?.status, err.response?.data || err.message);

      // 简化fallback策略：确保API通路的唯一正确性
      // 不使用可能过期或不一致的缓存数据，直接使用可靠的默认数据
      setPlans(DEFAULT_PLANS);
      setError("网络连接失败，显示默认权益信息");
      console.log('🔧 API失败，使用默认权益数据确保数据一致性');

      // 清理可能存在的错误缓存数据
      localStorage.removeItem('membershipPlans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []); // 移除retryCount依赖，简化重试机制

  const handleCtaClick = (plan: Plan) => {
    // 检查用户是否已登录
    if (!isAuthenticated) {
      navigate('/auth/register');
      return;
    }

    if (plan.name === "Free") {
      // 已登录用户点击Free计划，跳转到工具集页面
      navigate('/tools');
      return;
    }

    // 已登录用户点击Professional计划，跳转到支付页面
    navigate(`/order/checkout?planId=${plan.id}&cycle=${billingCycle}&planName=${plan.name}`);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        </div>
      );
    }

    return (
      <div>
        {/* 简单的错误提示横幅 */}
        {error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <X className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => {
          const price = billingCycle === 'annually' ? plan.priceAnnually : plan.priceMonthly;
          const period = billingCycle === 'annually' ? '/年' : '/月';

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
            >
              <Card className={`shadow-lg border-2 p-8 relative flex flex-col h-full ${
                plan.popular ? 'border-blue-500 shadow-xl' : 'border-gray-100'
              }`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="gradient-bg-blue text-white px-4 py-1">推荐</Badge>
                  </div>
                )}
                
                <CardContent className="p-0 flex flex-col flex-grow">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <div className={`text-4xl font-bold mb-2 ${plan.popular ? 'gradient-text-blue' : 'text-gray-900'}`}>
                      ¥{price}
                      <span className="text-lg font-normal text-gray-600">{period}</span>
                    </div>
                    <p className="text-gray-600">{plan.description}</p>
                  </div>
                  
                  <ul className="space-y-4 mb-8 flex-grow">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
                        )}
                        <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    onClick={() => handleCtaClick(plan)}
                    variant={plan.buttonVariant} 
                    className={`w-full py-3 ${
                      plan.popular 
                        ? 'gradient-bg-blue text-white hover:opacity-90' 
                        : 'border-2 border-gray-300 hover:border-blue-500 hover:text-blue-600'
                    }`}
                  >
                    {plan.buttonText}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
        </div>
      </div>
    );
  };

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">会员计划</h2>
          <p className="text-xl text-gray-600 mb-8">选择适合您的使用方案</p>
          <div className="flex items-center justify-center space-x-4">
            <Label htmlFor="billing-cycle" className={billingCycle === 'monthly' ? 'font-bold' : 'text-gray-500'}>
              月度
            </Label>
            <Switch
              id="billing-cycle"
              checked={billingCycle === "annually"}
              onCheckedChange={(checked) => setBillingCycle(checked ? "annually" : "monthly")}
              aria-label="切换计费周期"
            />
            <Label htmlFor="billing-cycle" className={billingCycle === 'annually' ? 'font-bold' : 'text-gray-500'}>
              年度 (享八折优惠)
            </Label>
          </div>
        </motion.div>
        
        {renderContent()}
      </div>
    </section>
  );
}
