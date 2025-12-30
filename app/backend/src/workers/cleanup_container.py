#!/usr/bin/env python3
"""
容器清理脚本
用于从TypeScript服务调用Python容器管理器
"""

import sys
import os
import logging

# 添加当前目录到Python路径
sys.path.append(os.path.dirname(__file__))

from container_manager import cleanup_container_for_task

def main():
    if len(sys.argv) != 3:
        print("Usage: python cleanup_container.py <task_id> <reason>", file=sys.stderr)
        sys.exit(1)
    
    task_id = sys.argv[1]
    reason = sys.argv[2]
    
    try:
        success = cleanup_container_for_task(task_id, reason)
        if success:
            print(f"Container cleanup successful for task {task_id}")
            sys.exit(0)
        else:
            print(f"Container cleanup failed for task {task_id}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Error cleaning up container for task {task_id}: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
