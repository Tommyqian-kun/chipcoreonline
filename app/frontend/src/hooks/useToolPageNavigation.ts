import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth.context';

/**
 * 工具页面导航处理Hook
 * 实现工具通用功能逻辑：任务提交后页面不能关闭/刷新，所有链接在新页面打开
 */
export const useToolPageNavigation = (taskStatus: { status: string }) => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    /**
     * 处理导航链接点击
     * @param path 目标路径
     * @param external 是否为外部链接
     */
    const handleNavigation = useCallback((path: string, external: boolean = false) => {
        // 如果任务正在执行中，在新窗口打开链接
        if (taskStatus.status !== 'IDLE') {
            if (external) {
                window.open(path, '_blank');
            } else {
                window.open(path, '_blank');
            }
        } else {
            // 任务空闲状态，正常导航
            if (external) {
                window.open(path, '_blank');
            } else {
                navigate(path);
            }
        }
    }, [taskStatus.status, navigate]);

    /**
     * 处理指导页面链接
     * @param toolId 工具ID
     */
    const handleGuidanceClick = useCallback((toolId: string) => {
        handleNavigation(`/tools/guidance/${toolId}`);
    }, [handleNavigation]);

    /**
     * 处理模板下载链接
     * @param toolId 工具ID
     */
    const handleTemplateDownload = useCallback((toolId: string) => {
        // 检查用户是否已登录
        if (!isAuthenticated) {
            // 游客用户跳转到注册页面
            handleNavigation('/auth/register');
            return;
        }

        // 已登录用户可以下载模板
        const templateMap: { [key: string]: string } = {
            'sdc-generator': '/api/v1/templates/sdcgen/sdcgen.zip',
            'upf-generator': '/api/v1/templates/upfgen/upfgen.zip',
        };

        const templateUrl = templateMap[toolId];
        if (templateUrl) {
            window.open(templateUrl, '_blank');
        } else {
            console.warn(`Unknown tool ID for template download: ${toolId}`);
        }
    }, [isAuthenticated, handleNavigation]);

    /**
     * 处理工具列表页面链接
     */
    const handleToolsPageClick = useCallback(() => {
        handleNavigation('/tools');
    }, [handleNavigation]);

    /**
     * 处理个人中心链接
     */
    const handleProfileClick = useCallback(() => {
        handleNavigation('/profile');
    }, [handleNavigation]);

    /**
     * 处理订阅页面链接
     */
    const handleSubscriptionClick = useCallback(() => {
        handleNavigation('/subscription');
    }, [handleNavigation]);

    /**
     * 处理外部链接
     * @param url 外部URL
     */
    const handleExternalLink = useCallback((url: string) => {
        handleNavigation(url, true);
    }, [handleNavigation]);

    return {
        handleNavigation,
        handleGuidanceClick,
        handleTemplateDownload,
        handleToolsPageClick,
        handleProfileClick,
        handleSubscriptionClick,
        handleExternalLink,
    };
};
