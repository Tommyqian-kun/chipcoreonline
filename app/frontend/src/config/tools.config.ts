// 工具配置接口
export interface ToolConfig {
  id: string;
  name: string;
  title: string;
  description: string;
  iconName: string; // 改为字符串，存储图标名称
  iconColor: string; // 图标颜色
  path: string;
  tags: string[];
  available: boolean;
  // 主页展示相关
  showcaseTitle?: string;
  showcaseDescription?: string;
  showcaseFeatures?: string[];
  showcaseIcon?: string;
  showcaseGradient?: string;
  showcaseLayout?: 'text-left' | 'text-right';
}

import { getSdcToolPath, getUpfToolPath } from '@/utils/toolPageMethod';

// 统一的工具配置
export const TOOLS_CONFIG: ToolConfig[] = [
  {
    id: '1',
    name: 'sdc-generator',
    title: 'SDC约束生成器',
    description: '根据您的设计参数，快速生成精确的时序设计约束(SDC)文件。',
    iconName: 'Clock',
    iconColor: 'text-blue-500',
    path: getSdcToolPath(),
    tags: ['时序分析', '自动化'],
    available: true,
    // 主页展示配置
    showcaseTitle: 'SDC高效生成',
    showcaseDescription: '自动化生成SDC约束文件，优化时序设计，提升芯片性能表现。支持复杂约束条件，确保设计满足时序要求。',
    showcaseFeatures: ['自动约束生成', '时序优化', '多格式支持', '智能检查'],
    showcaseIcon: 'fas fa-microchip',
    showcaseGradient: 'gradient-bg-blue',
    showcaseLayout: 'text-left',
  },
  {
    id: '4',
    name: 'upf-generator',
    title: 'UPF功耗管理生成器',
    description: '智能生成UPF功耗管理文件，优化芯片功耗设计，实现精确的功耗控制。',
    iconName: 'Cpu',
    iconColor: 'text-purple-500',
    path: getUpfToolPath(),
    tags: ['功耗管理', 'UPF'],
    available: true,
    // 主页展示配置
    showcaseTitle: 'UPF高效生成',
    showcaseDescription: '智能生成UPF功耗管理文件，优化芯片功耗设计，实现精确的功耗控制。支持多电压域和复杂功耗策略。',
    showcaseFeatures: ['功耗域管理', '电源策略', '状态控制', '功耗优化'],
    showcaseIcon: 'fas fa-bolt',
    showcaseGradient: 'gradient-bg-orange',
    showcaseLayout: 'text-right',
  },
  {
    id: '2',
    name: 'clk-generator',
    title: '时钟树生成器',
    description: '为复杂芯片设计自动生成优化的时钟树结构，确保时钟同步。',
    iconName: 'Zap',
    iconColor: 'text-orange-500',
    path: '/tools/clk-generator',
    tags: ['时钟设计', 'CTS'],
    available: true,
    // 主页展示配置
    showcaseTitle: 'CLK电路自动生成',
    showcaseDescription: '智能生成时钟树电路，自动优化时钟分配网络，确保时钟信号的稳定性和低延迟传输。',
    showcaseFeatures: ['时钟树生成', '延迟优化', '功耗控制', '信号完整性'],
    showcaseIcon: 'fas fa-project-diagram',
    showcaseGradient: 'gradient-bg-green',
    showcaseLayout: 'text-left',
  },
  {
    id: '3',
    name: 'memory-generator',
    title: 'Memory数据生成器',
    description: '生成用于测试和验证的内存初始化数据文件，支持多种格式。',
    iconName: 'Database',
    iconColor: 'text-green-500',
    path: '/tools/memory-generator',
    tags: ['验证', '数据'],
    available: true,
    // 主页展示配置
    showcaseTitle: 'Memory数据生成',
    showcaseDescription: '自动化生成内存控制器和数据路径，优化内存访问效率，支持多种内存类型和接口协议。',
    showcaseFeatures: ['内存控制器', '数据路径', '接口协议', '性能优化'],
    showcaseIcon: 'fas fa-memory',
    showcaseGradient: 'gradient-bg-purple',
    showcaseLayout: 'text-right',
  },
];

// 获取所有可用工具
export const getAvailableTools = () => {
  return TOOLS_CONFIG.filter(tool => tool.available);
};

// 根据名称获取工具
export const getToolByName = (name: string) => {
  return TOOLS_CONFIG.find(tool => tool.name === name);
};

// 获取主页展示工具（按展示顺序）
export const getShowcaseTools = () => {
  return TOOLS_CONFIG.filter(tool => tool.available && tool.showcaseTitle);
};
