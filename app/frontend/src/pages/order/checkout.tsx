import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import QRCode from "react-qr-code";
// Assuming you have these aliased in your components.json or paths
import { AlipayIcon, WechatPayIcon } from '@/components/ui/payment-icons'; 
import { createOrder } from '@/services/order.service'; // Assuming an order service exists
import { Alert, AlertDescription } from "@/components/ui/alert";

type PaymentMethod = "ALIPAY" | "WECHAT";

const MotionCard = motion(Card);

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const planId = searchParams.get("planId");
  const cycle = searchParams.get("cycle");
  const planName = searchParams.get("planName"); // Assuming planName is passed

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ALIPAY");

  useEffect(() => {
    if (!planId || !cycle || !planName) {
      navigate("/membership");
    }
  }, [planId, cycle, planName, navigate]);

  const handleCreateOrder = async () => {
    if (!planId || !cycle) return;

    setLoading(true);
    setError(null);
    try {
      const response = await createOrder({
        planId,
        billingCycle: cycle?.toUpperCase(),
        paymentMethod,
      });
      setOrder(response.data.order);
      setQrCode(response.data.paymentDetails.qrCode);
    } catch (err: any) {
      console.error("Error creating order:", err);
      setError(err.response?.data?.message || "创建订单失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, y: -50, transition: { duration: 0.3, ease: "easeIn" } },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <MotionCard
        className="w-full max-w-md shadow-lg"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="wait">
          {!qrCode ? (
            <motion.div key="selection" variants={cardVariants} exit="exit">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">安全支付</CardTitle>
                <CardDescription className="text-center">请确认您的订阅信息并选择支付方式</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg bg-gray-50/50">
                  <h3 className="text-lg font-semibold mb-1">{planName}</h3>
                  <p className="text-sm text-muted-foreground">
                    计费周期: {cycle === "monthly" ? "按月订阅" : "按年订阅"}
                  </p>
                </div>
                
                <RadioGroup
                  defaultValue="ALIPAY"
                  className="grid grid-cols-2 gap-4"
                  onValueChange={(value: string) => setPaymentMethod(value as PaymentMethod)}
                >
                  <PaymentOption id="alipay" value="ALIPAY" icon={<AlipayIcon />} label="支付宝" />
                  <PaymentOption id="wechatpay" value="WECHAT" icon={<WechatPayIcon />} label="微信支付" />
                </RadioGroup>
                
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              </CardContent>
              <CardFooter className="flex-col gap-4">
                <Button className="w-full gradient-bg-orange" onClick={handleCreateOrder} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "生成支付二维码"}
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/membership"><ArrowLeft className="mr-2 h-4 w-4" />返回选择</Link>
                </Button>
              </CardFooter>
            </motion.div>
          ) : (
            <motion.div key="payment" variants={cardVariants} exit="exit" className="text-center p-6">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">扫码支付</CardTitle>
                <CardDescription>
                  请使用 <span className="font-bold text-primary">{paymentMethod === "ALIPAY" ? "支付宝" : "微信"}</span> 完成支付
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-2 bg-white inline-block rounded-lg border shadow-sm">
                  <QRCode value={qrCode!} size={220} />
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>订单号: {order?.id}</p>
                  <p className="font-semibold text-destructive animate-pulse mt-1">请在10分钟内完成支付</p>
                </div>
              </CardContent>
              <CardFooter>
                  <Button variant="link" onClick={() => setQrCode(null)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    返回重新选择
                  </Button>
              </CardFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionCard>
    </div>
  );
}

const PaymentOption = ({ id, value, icon, label }: { id: string, value: string, icon: React.ReactNode, label: string }) => (
  <div>
    <RadioGroupItem value={value} id={id} className="peer sr-only" />
    <Label
      htmlFor={id}
      className="flex items-center justify-center gap-4 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
    >
      {icon}
      <span className="font-semibold">{label}</span>
    </Label>
  </div>
)

// Helper component for icons - create this file: src/components/ui/payment-icons.tsx
/*
export const AlipayIcon = () => <img src="/path/to/alipay.svg" alt="Alipay" className="h-6 w-6" />;
export const WechatPayIcon = () => <img src="/path/to/wechatpay.svg" alt="WechatPay" className="h-6 w-6" />;
*/ 