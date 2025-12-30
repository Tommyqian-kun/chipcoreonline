#!/usr/bin/env python3
"""
独立的Worker进程模块 - 解决Windows下的multiprocessing序列化问题
"""

import os
import sys
import logging
import multiprocessing
from typing import Dict, Any

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('WorkerProcess')


def worker_main_loop(worker_id: int):
    """独立的Worker主循环函数 - 完全避免序列化问题"""
    try:
        logger.info(f"Starting worker {worker_id}")
        
        # 动态导入，避免模块级别的序列化问题
        from worker_manager import IndependentResourceManager, TaskWorker

        # 在子进程中重新创建所有必要的对象
        resource_manager = IndependentResourceManager()
        worker = TaskWorker(worker_id, resource_manager)
        
        logger.info(f"Worker {worker_id} initialized successfully")
        worker.run()
        
    except Exception as e:
        logger.error(f"Worker {worker_id} crashed: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    # 支持直接运行测试
    if len(sys.argv) > 1:
        worker_id = int(sys.argv[1])
        worker_main_loop(worker_id)
    else:
        print("Usage: python worker_process.py <worker_id>")
