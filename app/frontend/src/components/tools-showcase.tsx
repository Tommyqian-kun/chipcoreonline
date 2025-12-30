"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { getShowcaseTools } from "@/config/tools.config";

const tools = getShowcaseTools().map(tool => ({
  title: tool.showcaseTitle!,
  description: tool.showcaseDescription!,
  features: tool.showcaseFeatures!,
  icon: tool.showcaseIcon!,
  gradient: tool.showcaseGradient!,
  path: tool.path,
  layout: tool.showcaseLayout!
}));

export default function ToolsShowcase() {
  console.log('🔧 ToolsShowcase组件开始渲染');
  
  try {
    return (
      <section className="py-20">
        {/* Section Header */}
        <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">专业工具集</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              为芯片设计提供全方位的自动化工具，提升开发效率
            </p>
          </motion.div>
        </div>
        
        {/* Tools List */}
        <div className="space-y-0">
          {tools.map((tool, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className={`py-20 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
                <div className={`flex flex-col lg:flex-row items-center gap-16 ${
                  tool.layout === 'text-right' ? 'lg:flex-row-reverse' : ''
                }`}>
                  {/* Content Section */}
                  <div className="flex-1 space-y-6">
                    <div className={`w-16 h-16 ${tool.gradient} rounded-xl flex items-center justify-center`}>
                      <i className={`${tool.icon} text-white text-2xl`}></i>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900">{tool.title}</h3>
                    <p className="text-lg text-gray-600 leading-relaxed">{tool.description}</p>

                    <div className="grid grid-cols-2 gap-4">
                      {tool.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-center space-x-3">
                          <div className={`w-2 h-2 ${tool.gradient} rounded-full`}></div>
                          <span className="text-gray-700 font-medium">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Link to={tool.path}>
                      <Button className={`${tool.gradient} text-white hover:opacity-90 px-8 py-3 font-semibold text-lg shadow-lg transform transition-all duration-200 hover:scale-105`}>
                        立即使用
                      </Button>
                    </Link>
                  </div>

                  {/* Visual Section - 简化版 */}
                  <div className="flex-1">
                    <div className="relative">
                      <div className={`w-full h-80 ${tool.gradient} rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xl`}>
                        {/* 简化的视觉效果 */}
                        <div className="text-center">
                          <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-4 mx-auto backdrop-blur-sm">
                            <i className={`${tool.icon} text-white text-4xl`}></i>
                          </div>
                          <h4 className="text-white text-xl font-semibold">{tool.title}</h4>
                        </div>

                        {/* 增强的装饰效果 */}
                        <div className="absolute top-4 left-4 w-3 h-3 bg-white/30 rounded-full animate-pulse"></div>
                        <div className="absolute top-8 right-6 w-4 h-4 bg-white/20 rounded-full animate-pulse delay-100"></div>
                        <div className="absolute bottom-6 left-8 w-2 h-2 bg-white/40 rounded-full animate-pulse delay-200"></div>
                        <div className="absolute bottom-4 right-4 w-3 h-3 bg-white/30 rounded-full animate-pulse delay-300"></div>

                        {/* 渐变覆盖层 */}
                        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-white/10"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    );
  } catch (error) {
    console.error('🚨 ToolsShowcase渲染错误:', error);
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: 'red', 
        color: 'white',
        minHeight: '200px'
      }}>
        <h1>ToolsShowcase渲染错误</h1>
        <p>错误: {String(error)}</p>
      </div>
    );
  }
}
