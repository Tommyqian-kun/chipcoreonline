import React from 'react';
import { Clock, Zap, Database, Cpu } from 'lucide-react';

// 图标映射
const iconMap = {
  Clock,
  Zap,
  Database,
  Cpu,
};

// 根据图标名称和颜色渲染图标组件
export const renderIcon = (iconName: string, iconColor: string, className: string = "h-8 w-8") => {
  const IconComponent = iconMap[iconName as keyof typeof iconMap];
  
  if (!IconComponent) {
    console.warn(`Icon "${iconName}" not found in iconMap`);
    return <div className={`${className} ${iconColor} bg-gray-200 rounded`} />;
  }
  
  return <IconComponent className={`${className} ${iconColor}`} />;
};

// 获取图标组件（不渲染，返回组件）
export const getIconComponent = (iconName: string) => {
  return iconMap[iconName as keyof typeof iconMap];
};
