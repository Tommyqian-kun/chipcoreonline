"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth.context';
import { motion } from 'framer-motion';
import { getAvailableTools } from '@/config/tools.config';
import { renderIcon } from '@/utils/icon-utils';

const tools = getAvailableTools();

const ToolsIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleToolClick = (path: string, available: boolean) => {
    if (!available) return;
    if (!isAuthenticated) {
      navigate('/auth/login');
      return;
    }
    navigate(path);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto px-4 py-16">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            <span className="gradient-text-blue">ChipCore</span> 智能工具集
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            一站式芯片设计自动化平台，从约束生成到功耗分析，我们为您提供全方位的支持，加速您的设计流程。
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {tools.map((tool) => (
            <motion.div key={tool.id} variants={itemVariants}>
              <Card 
                className={`flex flex-col h-full overflow-hidden transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 ${tool.available ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                onClick={() => handleToolClick(tool.path, tool.available)}
              >
                <CardHeader className="flex-row items-start bg-gray-50 p-4">
                  <div className="p-3 bg-white rounded-lg shadow-sm mr-4">
                     {renderIcon(tool.iconName, tool.iconColor)}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold">{tool.title}</CardTitle>
                     <div className="flex flex-wrap gap-2 mt-2">
                        {tool.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                     </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-6">
                  <CardDescription className="flex-grow mb-4 text-base">
                    {tool.description}
                  </CardDescription>
                  <Button 
                    className={`w-full mt-auto font-semibold ${!tool.available && 'bg-gray-400'}`}
                    disabled={!tool.available}
                    aria-label={tool.title}
                  >
                    {tool.available ? '立即使用' : '即将推出'}
                    {tool.available && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default ToolsIndexPage;