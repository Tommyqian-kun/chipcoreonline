import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 防止浏览器返回导航的Hook
 * 用于SDC多页面交互的提交页面和下载页面
 * 当用户点击浏览器返回按钮时，直接跳转到初始化页面
 */
export const usePreventBackNavigation = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 添加一个虚拟的历史记录条目，防止直接返回到上一页
    window.history.pushState(null, '', window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // 阻止默认的返回行为
      event.preventDefault();
      
      console.log('🚫 [NAVIGATION] 拦截浏览器返回操作，跳转到初始化页面');
      
      // 直接跳转到SDC工具初始化页面，相当于重新开始新的工具任务流程
      navigate('/tools/sdc-generator/initialize', { replace: true });
    };

    // 监听浏览器返回事件
    window.addEventListener('popstate', handlePopState);

    // 清理函数
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);
};
