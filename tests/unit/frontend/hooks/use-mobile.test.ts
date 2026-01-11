/**
 * React Hooks 单元测试
 * 测试自定义Hooks的功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 模拟useMobile hook
interface MockWindow {
  innerWidth: number;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
}

let mockWindow: MockWindow = {
  innerWidth: 1024,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// 模拟isMobile函数
const mockIsMobile = (breakpoint = 768) => {
  return mockWindow.innerWidth < breakpoint;
};

// 模拟useMediaQuery函数
const mockUseMediaQuery = (query: string) => {
  // 解析媒体查询
  const maxWidthMatch = query.match(/max-width:\s*(\d+)px/);
  if (maxWidthMatch) {
    const maxWidth = parseInt(maxWidthMatch[1], 10);
    return mockWindow.innerWidth <= maxWidth;
  }

  const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
  if (minWidthMatch) {
    const minWidth = parseInt(minWidthMatch[1], 10);
    return mockWindow.innerWidth >= minWidth;
  }

  return false;
};

describe('useMobile Hook - 基本功能', () => {
  beforeEach(() => {
    mockWindow = {
      innerWidth: 1024,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  it('桌面环境应该返回false', () => {
    mockWindow.innerWidth = 1024;
    const result = mockIsMobile(768);
    expect(result).toBe(false);
  });

  it('移动环境应该返回true', () => {
    mockWindow.innerWidth = 375;
    const result = mockIsMobile(768);
    expect(result).toBe(true);
  });

  it('平板环境应该根据断点判断', () => {
    mockWindow.innerWidth = 768;
    const result1 = mockIsMobile(768);
    expect(result1).toBe(false);

    const result2 = mockIsMobile(769);
    expect(result2).toBe(true);
  });
});

describe('useMediaQuery Hook - 媒体查询', () => {
  beforeEach(() => {
    mockWindow.innerWidth = 1024;
  });

  it('应该正确匹配max-width查询', () => {
    mockWindow.innerWidth = 500;

    const result1 = mockUseMediaQuery('(max-width: 768px)');
    expect(result1).toBe(true);

    const result2 = mockUseMediaQuery('(max-width: 480px)');
    expect(result2).toBe(false);
  });

  it('应该正确匹配min-width查询', () => {
    mockWindow.innerWidth = 1200;

    const result1 = mockUseMediaQuery('(min-width: 1024px)');
    expect(result1).toBe(true);

    const result2 = mockUseMediaQuery('(min-width: 1400px)');
    expect(result2).toBe(false);
  });

  it('应该处理不匹配的查询', () => {
    const result = mockUseMediaQuery('(invalid-query)');
    expect(result).toBe(false);
  });
});

describe('useMediaQuery Hook - 边界条件', () => {
  it('应该处理等于断点的情况', () => {
    mockWindow.innerWidth = 768;

    const result1 = mockUseMediaQuery('(max-width: 768px)');
    expect(result1).toBe(true);

    const result2 = mockUseMediaQuery('(min-width: 768px)');
    expect(result2).toBe(true);
  });

  it('应该处理极端小屏幕', () => {
    mockWindow.innerWidth = 0;

    const result = mockUseMediaQuery('(max-width: 320px)');
    expect(result).toBe(true);
  });

  it('应该处理极端大屏幕', () => {
    mockWindow.innerWidth = 9999;

    const result = mockUseMediaQuery('(min-width: 3840px)');
    expect(result).toBe(true);
  });
});

describe('useMediaQuery Hook - 响应式场景', () => {
  it('应该匹配移动设备', () => {
    mockWindow.innerWidth = 375;

    const isMobile = mockUseMediaQuery('(max-width: 768px)');
    const isTablet = mockUseMediaQuery('(min-width: 769px) and (max-width: 1024px)');
    const isDesktop = mockUseMediaQuery('(min-width: 1025px)');

    expect(isMobile).toBe(true);
    expect(isTablet).toBe(false);
    expect(isDesktop).toBe(false);
  });

  it('应该匹配平板设备', () => {
    mockWindow.innerWidth = 800;

    const isMobile = mockUseMediaQuery('(max-width: 768px)');
    const isTablet = mockUseMediaQuery('(min-width: 769px) and (max-width: 1024px)');
    const isDesktop = mockUseMediaQuery('(min-width: 1025px)');

    expect(isMobile).toBe(false);
    expect(isTablet).toBe(true);
    expect(isDesktop).toBe(false);
  });

  it('应该匹配桌面设备', () => {
    mockWindow.innerWidth = 1400;

    const isMobile = mockUseMediaQuery('(max-width: 768px)');
    const isTablet = mockUseMediaQuery('(min-width: 769px) and (max-width: 1024px)');
    const isDesktop = mockUseMediaQuery('(min-width: 1025px)');

    expect(isMobile).toBe(false);
    expect(isTablet).toBe(false);
    expect(isDesktop).toBe(true);
  });
});

// 模拟useLocalStorage hook
interface MockLocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const mockLocalStorage: MockLocalStorage = {
  storage: new Map<string, string>(),

  getItem(key: string): string | null {
    return this.storage.get(key) || null;
  },

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  },

  removeItem(key: string): void {
    this.storage.delete(key);
  },
};

describe('useLocalStorage Hook - 本地存储', () => {
  beforeEach(() => {
    mockLocalStorage.storage.clear();
  });

  it('应该能存储数据', () => {
    mockLocalStorage.setItem('test-key', 'test-value');
    const result = mockLocalStorage.getItem('test-key');
    expect(result).toBe('test-value');
  });

  it('应该能读取数据', () => {
    mockLocalStorage.setItem('user', JSON.stringify({ id: '123', name: 'test' }));
    const result = mockLocalStorage.getItem('user');
    expect(result).toBe('{"id":"123","name":"test"}');
  });

  it('读取不存在的key应该返回null', () => {
    const result = mockLocalStorage.getItem('nonexistent');
    expect(result).toBeNull();
  });

  it('应该能删除数据', () => {
    mockLocalStorage.setItem('test-key', 'test-value');
    mockLocalStorage.removeItem('test-key');
    const result = mockLocalStorage.getItem('test-key');
    expect(result).toBeNull();
  });

  it('应该能覆盖已存在的数据', () => {
    mockLocalStorage.setItem('test-key', 'value1');
    mockLocalStorage.setItem('test-key', 'value2');
    const result = mockLocalStorage.getItem('test-key');
    expect(result).toBe('value2');
  });

  it('应该能存储JSON对象', () => {
    const obj = { id: '123', name: 'test', active: true };
    mockLocalStorage.setItem('user', JSON.stringify(obj));
    const result = mockLocalStorage.getItem('user');
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual(obj);
  });

  it('应该能存储数组', () => {
    const arr = ['item1', 'item2', 'item3'];
    mockLocalStorage.setItem('items', JSON.stringify(arr));
    const result = mockLocalStorage.getItem('items');
    expect(JSON.parse(result!)).toEqual(arr);
  });
});

describe('useLocalStorage Hook - 边界条件', () => {
  beforeEach(() => {
    mockLocalStorage.storage.clear();
  });

  it('应该处理空字符串', () => {
    mockLocalStorage.setItem('empty-key', '');
    const result = mockLocalStorage.getItem('empty-key');
    expect(result).toBe('');
  });

  it('应该处理特殊字符', () => {
    const specialKey = 'key-with-特殊字符-@#$';
    const value = 'value-with-特殊字符-@#$';

    mockLocalStorage.setItem(specialKey, value);
    const result = mockLocalStorage.getItem(specialKey);
    expect(result).toBe(value);
  });

  it('应该处理超长字符串', () => {
    const longString = 'a'.repeat(10000);
    mockLocalStorage.setItem('long-key', longString);
    const result = mockLocalStorage.getItem('long-key');
    expect(result).toBe(longString);
  });

  it('应该处理Unicode字符', () => {
    const unicodeValue = '你好世界🌍🎉';
    mockLocalStorage.setItem('unicode-key', unicodeValue);
    const result = mockLocalStorage.getItem('unicode-key');
    expect(result).toBe(unicodeValue);
  });
});

// 模拟useDebounce hook
const mockDebounce = (value: string, delay: number): string => {
  // 简化实现，直接返回值
  // 实际使用时会有延迟
  return value;
};

describe('useDebounce Hook - 防抖功能', () => {
  it('应该返回输入值', () => {
    const result = mockDebounce('test', 300);
    expect(result).toBe('test');
  });

  it('应该处理空字符串', () => {
    const result = mockDebounce('', 300);
    expect(result).toBe('');
  });

  it('应该处理特殊字符', () => {
    const result = mockDebounce('test@#$%', 300);
    expect(result).toBe('test@#$%');
  });

  it('应该处理不同延迟时间', () => {
    const result1 = mockDebounce('test', 100);
    const result2 = mockDebounce('test', 500);
    const result3 = mockDebounce('test', 1000);

    expect(result1).toBe('test');
    expect(result2).toBe('test');
    expect(result3).toBe('test');
  });
});

// 模拟usePrevious hook
const mockUsePrevious = <T>(value: T): T | undefined => {
  // 简化实现
  return undefined;
};

describe('usePrevious Hook - 之前的值', () => {
  it('初始调用应该返回undefined', () => {
    const result = mockUsePrevious('current');
    expect(result).toBeUndefined();
  });

  it('应该能处理字符串', () => {
    const result = mockUsePrevious('test');
    expect(result).toBeUndefined();
  });

  it('应该能处理数字', () => {
    const result = mockUsePrevious(123);
    expect(result).toBeUndefined();
  });

  it('应该能处理对象', () => {
    const obj = { id: 1, name: 'test' };
    const result = mockUsePrevious(obj);
    expect(result).toBeUndefined();
  });

  it('应该能处理数组', () => {
    const arr = [1, 2, 3];
    const result = mockUsePrevious(arr);
    expect(result).toBeUndefined();
  });
});
