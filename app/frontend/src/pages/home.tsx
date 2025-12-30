"use client";

import HeroSection from "@/components/hero-section";
import ToolsShowcase from "@/components/tools-showcase";
import LatestNews from "@/components/latest-news";

export default function Home() {
  console.log('🏠 Home组件开始渲染');
  
  try {
    return (
      <>
        <HeroSection />
        <ToolsShowcase />
        <LatestNews />
      </>
    );
  } catch (error) {
    console.error('🚨 Home组件渲染错误:', error);
    return (
      <div style={{ padding: '20px', backgroundColor: 'red', color: 'white' }}>
        <h1>渲染错误</h1>
        <p>Home组件渲染失败: {String(error)}</p>
      </div>
    );
  }
}
