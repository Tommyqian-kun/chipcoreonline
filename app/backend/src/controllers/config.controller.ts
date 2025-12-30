/**
 * 配置控制器
 * 提供前端所需的配置信息
 */

import { Request, Response } from 'express';

/**
 * 获取工具页面模式配置
 */
export const getToolPageMethod = async (req: Request, res: Response) => {
  try {
    const method = process.env.TOOL_PAGE_METHOD || 'multi';
    
    res.json({
      success: true,
      method: method === 'single' ? 'single' : 'multi',
      data: {
        toolPageMethod: method,
        description: method === 'single' ? '单页面交互模式' : '多页面交互模式'
      }
    });
  } catch (error) {
    console.error('获取工具页面模式配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取配置失败',
      method: 'multi' // 默认值
    });
  }
};

/**
 * 获取所有前端配置
 */
export const getFrontendConfig = async (req: Request, res: Response) => {
  try {
    const config = {
      toolPageMethod: process.env.TOOL_PAGE_METHOD || 'multi',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0'
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取前端配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取配置失败'
    });
  }
};
