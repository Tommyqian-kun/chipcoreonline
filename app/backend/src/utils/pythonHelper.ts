/**
 * Python工具类
 * 统一管理Python路径调用，确保使用虚拟环境中的Python
 */

import { spawn, SpawnOptions, ChildProcess } from 'child_process';

/**
 * 获取Python可执行文件路径
 * 优先使用环境变量PYTHON_PATH，否则使用系统的python3
 */
export function getPythonPath(): string {
  return process.env.PYTHON_PATH || 'python3';
}

/**
 * 使用虚拟环境中的Python执行命令
 * 统一封装spawn调用，确保Python路径一致
 */
export function spawnPython(
  args: string[],
  options?: SpawnOptions
): ChildProcess {
  const pythonPath = getPythonPath();
  // 使用类型断言解决类型冲突问题
  return spawn(pythonPath, args, options as SpawnOptions) as unknown as ChildProcess;
}

/**
 * 获取Python命令信息（用于日志）
 */
export function getPythonCommand(args: string[]): string {
  const pythonPath = getPythonPath();
  return `${pythonPath} ${args.join(' ')}`;
}
