"use client";

import { motion } from "framer-motion";

export default function HeroSection() {
  console.log('🎯 HeroSection组件开始渲染');
  
  try {
    return (
      <section className="bg-gradient-to-br from-blue-50 to-orange-50 h-[60vh] flex items-center relative overflow-hidden">
        {/* 简化的背景 */}
        <div className="absolute inset-0 opacity-40">
          <div className="w-full h-full bg-gradient-to-br from-blue-500/15 to-orange-500/15 animate-pulse-subtle" />
        </div>
        
        <div className="relative z-10 max-w-8xl mx-auto px-6 sm:px-8 lg:px-12 py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-8">
              探索芯片设计实现的
              <span className="gradient-text-blue">无限可能</span>
            </h1>
            <p className="text-2xl md:text-3xl text-gray-700 mb-12 max-w-4xl mx-auto">
              提供
              <span className="font-semibold gradient-text-orange">专业高效精准</span>
              的解决方案
            </p>
          </motion.div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('🚨 HeroSection渲染错误:', error);
    return (
      <div style={{ 
        padding: '20px', 
        backgroundColor: 'red', 
        color: 'white',
        minHeight: '200px'
      }}>
        <h1>HeroSection渲染错误</h1>
        <p>错误: {String(error)}</p>
      </div>
    );
  }
}
