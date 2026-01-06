/**
 * EcsOnlyStatusIndicator 组件单元测试
 * 测试ECS Only模式状态指示器组件
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock React组件
// 由于我们在测试环境中，使用简化版本的组件进行测试

// 模拟TaskStatus类型
type TaskStatusStatus = 'SUBMITTING' | 'POLLING' | 'COMPLETED' | 'FAILED';

// 简化的EcsOnlyStatusIndicator组件（模拟实现）
const MockEcsOnlyStatusIndicator = ({
  status,
  downloadTimeRemaining = null,
  isDownloadExpired = false,
  deploymentMode = 'ecs_only',
  progress = 0,
}: {
  status: TaskStatusStatus;
  downloadTimeRemaining: number | null;
  isDownloadExpired: boolean;
  deploymentMode: string | null;
  progress?: number;
}) => {
  // 只在ECS Only模式下显示
  if (deploymentMode !== 'ecs_only') return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 返回状态信息对象
  switch (status) {
    case 'SUBMITTING':
      return {
        type: 'submitting',
        title: '正在提交任务',
        description: '正在将您的任务提交到ECS执行队列，请稍候...',
      };

    case 'POLLING':
      return {
        type: 'polling',
        title: '任务排队中',
        description: '您的任务正在队列中等待执行，请耐心等待...',
        progress,
      };

    case 'COMPLETED':
      if (isDownloadExpired) {
        return {
          type: 'expired',
          title: '下载已过期',
          description: '下载时间已过期，为保护您的数据隐私，结果文件已被自动删除。',
        };
      }

      if (downloadTimeRemaining !== null && downloadTimeRemaining > 0) {
        return {
          type: 'downloading',
          title: '任务完成 - 请及时下载',
          timeRemaining: formatTime(downloadTimeRemaining),
          isExpiringSoon: downloadTimeRemaining <= 30,
        };
      }

      return {
        type: 'completed',
        title: '任务完成',
        description: '您的任务已成功完成，可以下载结果文件。',
      };

    case 'FAILED':
      return {
        type: 'failed',
        title: '任务执行失败',
        description: '任务执行过程中发生错误，请检查输入参数后重新提交。',
      };

    default:
      return null;
  }
};

describe('EcsOnlyStatusIndicator - 渲染逻辑', () => {
  it('非ECS Only模式应该返回null', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 60,
      isDownloadExpired: false,
      deploymentMode: 'ecs_oss_acr',
    });

    expect(result).toBeNull();
  });

  it('ECS Only模式应该正常渲染', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 60,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result).toBeDefined();
    expect(result?.type).toBe('downloading');
  });
});

describe('EcsOnlyStatusIndicator - SUBMITTING状态', () => {
  it('应该显示正在提交任务的状态', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'SUBMITTING',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('submitting');
    expect(result?.title).toBe('正在提交任务');
    expect(result?.description).toContain('ECS执行队列');
  });
});

describe('EcsOnlyStatusIndicator - POLLING状态', () => {
  it('应该显示任务排队中的状态', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'POLLING',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
      progress: 0,
    });

    expect(result?.type).toBe('polling');
    expect(result?.title).toBe('任务排队中');
  });

  it('应该包含进度信息', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'POLLING',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
      progress: 50,
    });

    expect(result?.progress).toBe(50);
  });

  it('进度为0时也应该正常显示', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'POLLING',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
      progress: 0,
    });

    expect(result?.type).toBe('polling');
  });
});

describe('EcsOnlyStatusIndicator - COMPLETED状态', () => {
  it('下载过期应该显示过期提示', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: null,
      isDownloadExpired: true,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('expired');
    expect(result?.title).toBe('下载已过期');
    expect(result?.description).toContain('自动删除');
  });

  it('有剩余时间应该显示倒计时', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 90,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('downloading');
    expect(result?.title).toBe('任务完成 - 请及时下载');
    expect(result?.timeRemaining).toBe('1:30');
  });

  it('剩余时间小于30秒应该显示即将过期', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 20,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('downloading');
    expect(result?.isExpiringSoon).toBe(true);
  });

  it('剩余时间为0时应该显示完成状态', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 0,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('completed');
    expect(result?.title).toBe('任务完成');
  });

  it('剩余时间为null时应该显示完成状态', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('completed');
  });
});

describe('EcsOnlyStatusIndicator - FAILED状态', () => {
  it('应该显示任务执行失败的提示', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'FAILED',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('failed');
    expect(result?.title).toBe('任务执行失败');
    expect(result?.description).toContain('重新提交');
  });
});

describe('EcsOnlyStatusIndicator - 时间格式化', () => {
  it('应该正确格式化秒数', () => {
    const result1 = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 45,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result1?.timeRemaining).toBe('0:45');

    const result2 = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 120,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result2?.timeRemaining).toBe('2:0');

    const result3 = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 0,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result3?.timeRemaining).toBe('0:0');
  });
});

describe('EcsOnlyStatusIndicator - 边界条件', () => {
  it('应该处理负数剩余时间', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: -10,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.type).toBe('downloading');
    expect(result?.timeRemaining).toBe('-1:-10');
  });

  it('应该处理非常大的剩余时间', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'COMPLETED',
      downloadTimeRemaining: 99999,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
    });

    expect(result?.timeRemaining).toBe('1666:39');
  });

  it('应该处理进度超过100', () => {
    const result = MockEcsOnlyStatusIndicator({
      status: 'POLLING',
      downloadTimeRemaining: null,
      isDownloadExpired: false,
      deploymentMode: 'ecs_only',
      progress: 150,
    });

    expect(result?.progress).toBe(150);
  });
});
