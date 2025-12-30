import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Mail, Phone, MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import api from '@/services/api';


const contactFormSchema = z.object({
  firstName: z.string().min(1, '姓氏不能为空'),
  lastName: z.string().min(1, '名字不能为空'),
  email: z.string().email('请输入有效的电子邮箱地址'),
  message: z.string().min(10, '消息内容至少需要10个字符').max(500, '消息内容不能超过500个字符'),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      message: '',
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await api.post('/feedback', data);

      if (response.data.success) {
        toast({
          title: "消息发送成功",
          description: "感谢您的反馈，我们会尽快与您联系。",
        });
        form.reset();
      } else {
        throw new Error(response.data.message || '提交失败');
      }
    } catch (error: any) {
      console.error('Feedback submission error:', error);
      toast({
        title: "发送失败",
        description: error.response?.data?.message || "网络错误，请稍后重试。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="container mx-auto py-12 px-6"
    >
      <motion.div variants={itemVariants} className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl gradient-text-blue">
          联系我们
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          我们随时倾听您的声音，欢迎通过以下任何方式与我们联系。
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="shadow-lg border-gray-200">
            <CardHeader>
              <CardTitle className="text-2xl">发送消息</CardTitle>
              <CardDescription>填写下表，我们会尽快回复您。</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>姓氏</FormLabel>
                          <FormControl>
                            <Input placeholder="您的姓氏" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>名字</FormLabel>
                          <FormControl>
                            <Input placeholder="您的名字" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>电子邮箱</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>消息内容</FormLabel>
                        <FormControl>
                          <Textarea placeholder="请在此处输入您的消息..." rows={6} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full gradient-bg-blue text-white font-bold py-3" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? '正在提交...' : '确认提交'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
            <h2 className="text-3xl font-bold gradient-text-orange">联系信息</h2>
            <div className="space-y-6">
                <ContactInfoItem icon={<Mail className="w-6 h-6 text-orange-500" />} title="电子邮箱">
                  <a href="mailto:support@chipcore.com" className="hover:underline">support@chipcore.com</a>
                  <a href="mailto:sales@chipcore.com" className="hover:underline">sales@chipcore.com</a>
                </ContactInfoItem>
                <ContactInfoItem icon={<Phone className="w-6 h-6 text-orange-500" />} title="电话">
                  <p>+86 400-123-4567</p>
                </ContactInfoItem>
                <ContactInfoItem icon={<MapPin className="w-6 h-6 text-orange-500" />} title="地址">
                  <p>中国上海市张江高科技园区</p>
                  <p>科苑路888号，201203</p>
                </ContactInfoItem>
            </div>
        </motion.div>
      </div>
    </motion.div>
  );
} 

const ContactInfoItem = ({ icon, title, children }: { icon: JSX.Element, title: string, children: React.ReactNode }) => (
  <div className="flex items-start space-x-4">
    <div className="bg-orange-100 p-3 rounded-full flex-shrink-0">
      {icon}
    </div>
    <div className="flex flex-col text-gray-600">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  </div>
); 