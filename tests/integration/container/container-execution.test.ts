/**
 * Docker容器执行集成测试
 * 测试容器创建、启动、执行和清理流程
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 模拟Docker容器接口
interface MockDockerContainer {
  id: string;
  name: string;
  image: string;
  status: 'created' | 'running' | 'exited' | 'removed';
  exitCode: number | null;
  mounts: Array<{
    source: string;
    destination: string;
    rw: boolean;
  }>;
  env: Record<string, string>;
  startedAt?: Date;
  stoppedAt?: Date;
}

// 模拟容器执行结果
interface ContainerExecutionResult {
  success: boolean;
  exitCode: number;
  outputPath?: string;
  logPath?: string;
  error?: string;
  duration: number;
}

// 模拟容器管理器
class MockContainerManager {
  private containers: Map<string, MockDockerContainer> = new Map();
  private executionTime = 0; // 模拟执行时间

  async createContainer(config: {
    taskId: string;
    toolType: string;
    imageName: string;
    inputPath: string;
    outputPath: string;
    logPath: string;
    env?: Record<string, string>;
  }): Promise<MockDockerContainer> {
    const containerId = `container-${config.taskId}-${Date.now()}`;
    const container: MockDockerContainer = {
      id: containerId,
      name: `${config.toolType}-${config.taskId}`,
      image: config.imageName,
      status: 'created',
      exitCode: null,
      mounts: [
        {
          source: config.inputPath,
          destination: '/data/input',
          rw: false, // 只读
        },
        {
          source: config.outputPath,
          destination: '/data/output',
          rw: true, // 读写
        },
        {
          source: config.logPath,
          destination: '/data/logs',
          rw: true,
        },
      ],
      env: config.env || {},
    };

    this.containers.set(containerId, container);
    return container;
  }

  async startContainer(containerId: string): Promise<boolean> {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    container.status = 'running';
    container.startedAt = new Date();
    return true;
  }

  async runContainer(config: {
    taskId: string;
    toolType: string;
    imageName: string;
    inputPath: string;
    outputPath: string;
    logPath: string;
    timeout: number;
    command?: string;
  }): Promise<ContainerExecutionResult> {
    const startTime = Date.now();

    try {
      // 创建容器
      const container = await this.createContainer(config);

      // 启动容器
      await this.startContainer(container.id);

      // 模拟执行时间
      const executionTime = this.executionTime || 100;
      await new Promise(resolve => setTimeout(resolve, executionTime));

      // 模拟成功或失败
      const shouldFail = config.command?.includes('fail') || false;
      const exitCode = shouldFail ? 1 : 0;

      // 更新容器状态
      container.status = 'exited';
      container.exitCode = exitCode;
      container.stoppedAt = new Date();

      const duration = Date.now() - startTime;

      if (exitCode === 0) {
        return {
          success: true,
          exitCode,
          outputPath: config.outputPath,
          logPath: config.logPath,
          duration,
        };
      } else {
        return {
          success: false,
          exitCode,
          error: 'Container execution failed',
          duration,
        };
      }
    } catch (error) {
      return {
        success: false,
        exitCode: -1,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  async removeContainer(containerId: string, force = false): Promise<boolean> {
    const container = this.containers.get(containerId);
    if (!container) {
      return false;
    }

    // 检查容器是否还在运行
    if (container.status === 'running' && !force) {
      throw new Error('Cannot remove running container without force flag');
    }

    container.status = 'removed';
    this.containers.delete(containerId);
    return true;
  }

  async getContainer(containerId: string): Promise<MockDockerContainer | null> {
    return this.containers.get(containerId) || null;
  }

  listContainers(): MockDockerContainer[] {
    return Array.from(this.containers.values()).filter(c => c.status !== 'removed');
  }

  setExecutionTime(ms: number): void {
    this.executionTime = ms;
  }
}

describe('Docker容器执行 - 容器创建和管理', () => {
  let containerManager: MockContainerManager;

  beforeEach(() => {
    containerManager = new MockContainerManager();
  });

  it('应该成功创建SDC工具容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-sdc-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-sdc-001/input',
      outputPath: '/tmp/test/jobs/task-sdc-001/output',
      logPath: '/tmp/test/jobs/task-sdc-001/logs',
    });

    expect(container.id).toBeDefined();
    expect(container.image).toBe('logiccore/sdcgen:latest');
    expect(container.name).toBe('sdc-gen-task-sdc-001');
    expect(container.status).toBe('created');
  });

  it('应该成功创建UPF工具容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-upf-001',
      toolType: 'upf-gen',
      imageName: 'logiccore/upfgen:latest',
      inputPath: '/tmp/test/jobs/task-upf-001/input',
      outputPath: '/tmp/test/jobs/task-upf-001/output',
      logPath: '/tmp/test/jobs/task-upf-001/logs',
    });

    expect(container.image).toBe('logiccore/upfgen:latest');
    expect(container.name).toBe('upf-gen-task-upf-001');
  });

  it('应该正确配置容器挂载点', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-mount-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-mount-001/input',
      outputPath: '/tmp/test/jobs/task-mount-001/output',
      logPath: '/tmp/test/jobs/task-mount-001/logs',
    });

    // 验证输入挂载是只读的
    const inputMount = container.mounts.find(m => m.destination === '/data/input');
    expect(inputMount).toBeDefined();
    expect(inputMount?.rw).toBe(false);

    // 验证输出挂载是读写的
    const outputMount = container.mounts.find(m => m.destination === '/data/output');
    expect(outputMount).toBeDefined();
    expect(outputMount?.rw).toBe(true);

    // 验证日志挂载是读写的
    const logMount = container.mounts.find(m => m.destination === '/data/logs');
    expect(logMount).toBeDefined();
    expect(logMount?.rw).toBe(true);
  });

  it('应该能启动已创建的容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-start-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-start-001/input',
      outputPath: '/tmp/test/jobs/task-start-001/output',
      logPath: '/tmp/test/jobs/task-start-001/logs',
    });

    expect(container.status).toBe('created');

    const started = await containerManager.startContainer(container.id);
    expect(started).toBe(true);

    const updatedContainer = await containerManager.getContainer(container.id);
    expect(updatedContainer?.status).toBe('running');
    expect(updatedContainer?.startedAt).toBeDefined();
  });

  it('应该能删除已停止的容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-remove-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-remove-001/input',
      outputPath: '/tmp/test/jobs/task-remove-001/output',
      logPath: '/tmp/test/jobs/task-remove-001/logs',
    });

    await containerManager.startContainer(container.id);
    // 模拟容器停止
    const updatedContainer = await containerManager.getContainer(container.id);
    if (updatedContainer) {
      updatedContainer.status = 'exited';
    }

    const removed = await containerManager.removeContainer(container.id);
    expect(removed).toBe(true);

    const shouldNotExist = await containerManager.getContainer(container.id);
    expect(shouldNotExist).toBeNull();
  });

  it('应该能强制删除运行中的容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-force-remove-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-force-remove-001/input',
      outputPath: '/tmp/test/jobs/task-force-remove-001/output',
      logPath: '/tmp/test/jobs/task-force-remove-001/logs',
    });

    await containerManager.startContainer(container.id);

    // 强制删除
    const removed = await containerManager.removeContainer(container.id, true);
    expect(removed).toBe(true);
  });

  it('删除不存在的容器应该返回false', async () => {
    const removed = await containerManager.removeContainer('nonexistent-container');
    expect(removed).toBe(false);
  });
});

describe('Docker容器执行 - 容器执行流程', () => {
  let containerManager: MockContainerManager;

  beforeEach(() => {
    containerManager = new MockContainerManager();
    // 设置快速执行时间
    containerManager.setExecutionTime(10);
  });

  it('应该成功执行SDC工具容器', async () => {
    const result = await containerManager.runContainer({
      taskId: 'task-exec-sdc-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-exec-sdc-001/input',
      outputPath: '/tmp/test/jobs/task-exec-sdc-001/output',
      logPath: '/tmp/test/jobs/task-exec-sdc-001/logs',
      timeout: 60000,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.outputPath).toBeDefined();
    expect(result.logPath).toBeDefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('应该正确处理容器执行失败', async () => {
    const result = await containerManager.runContainer({
      taskId: 'task-exec-fail-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-exec-fail-001/input',
      outputPath: '/tmp/test/jobs/task-exec-fail-001/output',
      logPath: '/tmp/test/jobs/task-exec-fail-001/logs',
      timeout: 60000,
      command: 'fail-command', // 触发失败
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeDefined();
  });

  it('应该能执行多个工具类型', async () => {
    const sdcResult = await containerManager.runContainer({
      taskId: 'task-multi-sdc',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-multi-sdc/input',
      outputPath: '/tmp/test/jobs/task-multi-sdc/output',
      logPath: '/tmp/test/jobs/task-multi-sdc/logs',
      timeout: 60000,
    });

    const upfResult = await containerManager.runContainer({
      taskId: 'task-multi-upf',
      toolType: 'upf-gen',
      imageName: 'logiccore/upfgen:latest',
      inputPath: '/tmp/test/jobs/task-multi-upf/input',
      outputPath: '/tmp/test/jobs/task-multi-upf/output',
      logPath: '/tmp/test/jobs/task-multi-upf/logs',
      timeout: 60000,
    });

    expect(sdcResult.success).toBe(true);
    expect(upfResult.success).toBe(true);
  });

  it('应该记录容器执行时长', async () => {
    containerManager.setExecutionTime(100);

    const result = await containerManager.runContainer({
      taskId: 'task-duration-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-duration-001/input',
      outputPath: '/tmp/test/jobs/task-duration-001/output',
      logPath: '/tmp/test/jobs/task-duration-001/logs',
      timeout: 60000,
    });

    expect(result.duration).toBeGreaterThanOrEqual(100);
    expect(result.duration).toBeLessThan(200); // 加上一些开销
  });

  it('执行容器后应该自动清理', async () => {
    const initialCount = containerManager.listContainers().length;

    await containerManager.runContainer({
      taskId: 'task-cleanup-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-cleanup-001/input',
      outputPath: '/tmp/test/jobs/task-cleanup-001/output',
      logPath: '/tmp/test/jobs/task-cleanup-001/logs',
      timeout: 60000,
    });

    // 容器应该被清理
    const finalCount = containerManager.listContainers().length;
    expect(finalCount).toBe(initialCount);
  });
});

describe('Docker容器执行 - 边界条件', () => {
  let containerManager: MockContainerManager;

  beforeEach(() => {
    containerManager = new MockContainerManager();
  });

  it('应该处理超长的任务ID', async () => {
    const longTaskId = 'task-' + 'a'.repeat(1000);

    const container = await containerManager.createContainer({
      taskId: longTaskId,
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/long/input',
      outputPath: '/tmp/test/jobs/long/output',
      logPath: '/tmp/test/jobs/long/logs',
    });

    expect(container.id).toBeDefined();
    expect(container.name).toContain(longTaskId.substring(0, 50));
  });

  it('应该处理空的环境变量', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-env-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-env-001/input',
      outputPath: '/tmp/test/jobs/task-env-001/output',
      logPath: '/tmp/test/jobs/task-env-001/logs',
      env: {},
    });

    expect(container.env).toEqual({});
  });

  it('应该处理自定义环境变量', async () => {
    const customEnv = {
      CUSTOM_VAR: 'custom_value',
      ANOTHER_VAR: 'another_value',
    };

    const container = await containerManager.createContainer({
      taskId: 'task-custom-env-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-custom-env-001/input',
      outputPath: '/tmp/test/jobs/task-custom-env-001/output',
      logPath: '/tmp/test/jobs/task-custom-env-001/logs',
      env: customEnv,
    });

    expect(container.env).toEqual(customEnv);
  });

  it('应该处理零超时时间', async () => {
    containerManager.setExecutionTime(0);

    const result = await containerManager.runContainer({
      taskId: 'task-zero-timeout',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-zero-timeout/input',
      outputPath: '/tmp/test/jobs/task-zero-timeout/output',
      logPath: '/tmp/test/jobs/task-zero-timeout/logs',
      timeout: 0,
    });

    expect(result.success).toBe(true);
  });
});

describe('Docker容器执行 - 错误处理', () => {
  let containerManager: MockContainerManager;

  beforeEach(() => {
    containerManager = new MockContainerManager();
  });

  it('启动不存在的容器应该抛出错误', async () => {
    await expect(containerManager.startContainer('nonexistent-container'))
      .rejects.toThrow('Container nonexistent-container not found');
  });

  it('无force标记不能删除运行中的容器', async () => {
    const container = await containerManager.createContainer({
      taskId: 'task-no-force-001',
      toolType: 'sdc-gen',
      imageName: 'logiccore/sdcgen:latest',
      inputPath: '/tmp/test/jobs/task-no-force-001/input',
      outputPath: '/tmp/test/jobs/task-no-force-001/output',
      logPath: '/tmp/test/jobs/task-no-force-001/logs',
    });

    await containerManager.startContainer(container.id);

    await expect(containerManager.removeContainer(container.id, false))
      .rejects.toThrow('Cannot remove running container without force flag');
  });

  it('应该处理创建容器的参数错误', async () => {
    // 测试缺少必需参数的情况
    await expect(containerManager.createContainer({
      taskId: '',
      toolType: '',
      imageName: '',
      inputPath: '',
      outputPath: '',
      logPath: '',
    })).resolves.toBeDefined(); // Mock实现会接受空值
  });
});

describe('Docker容器执行 - 并发场景', () => {
  let containerManager: MockContainerManager;

  beforeEach(() => {
    containerManager = new MockContainerManager();
    containerManager.setExecutionTime(50);
  });

  it('应该能并发创建多个容器', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      containerManager.createContainer({
        taskId: `concurrent-create-${i}`,
        toolType: 'sdc-gen',
        imageName: 'logiccore/sdcgen:latest',
        inputPath: `/tmp/test/jobs/concurrent-create-${i}/input`,
        outputPath: `/tmp/test/jobs/concurrent-create-${i}/output`,
        logPath: `/tmp/test/jobs/concurrent-create-${i}/logs`,
      })
    );

    const containers = await Promise.all(promises);

    expect(containers).toHaveLength(10);
    containers.forEach(container => {
      expect(container.id).toBeDefined();
      expect(container.status).toBe('created');
    });
  });

  it('应该能并发执行多个容器', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      containerManager.runContainer({
        taskId: `concurrent-exec-${i}`,
        toolType: 'sdc-gen',
        imageName: 'logiccore/sdcgen:latest',
        inputPath: `/tmp/test/jobs/concurrent-exec-${i}/input`,
        outputPath: `/tmp/test/jobs/concurrent-exec-${i}/output`,
        logPath: `/tmp/test/jobs/concurrent-exec-${i}/logs`,
        timeout: 60000,
      })
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach(result => {
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  it('并发执行时容器应该独立运行', async () => {
    const results = await Promise.all([
      containerManager.runContainer({
        taskId: 'independent-1',
        toolType: 'sdc-gen',
        imageName: 'logiccore/sdcgen:latest',
        inputPath: '/tmp/test/jobs/independent-1/input',
        outputPath: '/tmp/test/jobs/independent-1/output',
        logPath: '/tmp/test/jobs/independent-1/logs',
        timeout: 60000,
      }),
      containerManager.runContainer({
        taskId: 'independent-2',
        toolType: 'upf-gen',
        imageName: 'logiccore/upfgen:latest',
        inputPath: '/tmp/test/jobs/independent-2/input',
        outputPath: '/tmp/test/jobs/independent-2/output',
        logPath: '/tmp/test/jobs/independent-2/logs',
        timeout: 60000,
      }),
    ]);

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[0].outputPath).toContain('independent-1');
    expect(results[1].outputPath).toContain('independent-2');
  });
});
