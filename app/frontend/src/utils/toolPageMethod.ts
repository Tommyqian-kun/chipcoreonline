/**
 * 工具页面模式控制工具
 * 从后端获取TOOL_PAGE_METHOD配置决定使用单页面还是多页面交互
 */

// 缓存配置值
let cachedMethod: 'single' | 'multi' | null = null;

// 获取工具页面模式
export const getToolPageMethod = async (): Promise<'single' | 'multi'> => {
  // 如果已缓存，直接返回
  if (cachedMethod) {
    return cachedMethod;
  }

  try {
    // 从后端API获取配置
    const response = await fetch('/api/v1/config/tool-page-method');
    if (response.ok) {
      const data = await response.json();
      cachedMethod = data.method === 'single' ? 'single' : 'multi';
    } else {
      // 默认为multi模式
      cachedMethod = 'multi';
    }
  } catch (error) {
    console.warn('Failed to fetch tool page method config, using default:', error);
    cachedMethod = 'multi';
  }

  return cachedMethod;
};

// 同步版本（用于已知配置的场景）
export const getToolPageMethodSync = (): 'single' | 'multi' => {
  // 默认为multi，实际使用时应该先调用异步版本
  return cachedMethod || 'multi';
};

// 检查是否为多页面模式
export const isMultiPageMode = (): boolean => {
  return getToolPageMethodSync() === 'multi';
};

// 检查是否为单页面模式
export const isSinglePageMode = (): boolean => {
  return getToolPageMethodSync() === 'single';
};

// 获取SDC工具的正确路径
export const getSdcToolPath = (): string => {
  return isMultiPageMode() ? '/tools/sdc-generator/initialize' : '/tools/sdc-generator';
};

// 异步版本的路径获取
export const getSdcToolPathAsync = async (): Promise<string> => {
  const method = await getToolPageMethod();
  return method === 'multi' ? '/tools/sdc-generator/initialize' : '/tools/sdc-generator';
};

// 获取UPF工具的正确路径
export const getUpfToolPath = (): string => {
  return isMultiPageMode() ? '/tools/upf-generator/initialize' : '/tools/upf-generator';
};

// 异步版本的UPF路径获取
export const getUpfToolPathAsync = async (): Promise<string> => {
  const method = await getToolPageMethod();
  return method === 'multi' ? '/tools/upf-generator/initialize' : '/tools/upf-generator';
};

// 获取工具路径的通用函数
export const getToolPath = (toolName: string): string => {
  switch (toolName) {
    case 'sdc-generator':
      return getSdcToolPath();
    case 'upf-generator':
      return getUpfToolPath();
    // 可以为其他工具添加类似的逻辑
    default:
      return `/tools/${toolName}`;
  }
};
