#!/usr/bin/env python3
"""
独立的Worker进程模块 - 异步架构版本
支持每个Worker并发处理多个任务
"""

import os
import sys
import logging
import asyncio
from typing import Dict, Any

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('WorkerProcess')


async def worker_main_loop_async(worker_id: int):
    """异步Worker主循环"""
    try:
        logger.info(f"Starting async worker {worker_id}")

        # 动态导入，避免模块级别的序列化问题
        from worker_manager import IndependentResourceManager, TaskWorker

        # 在子进程中重新创建所有必要的对象
        resource_manager = IndependentResourceManager()
        worker = TaskWorker(worker_id, resource_manager)

        logger.info(f"Async worker {worker_id} initialized successfully")

        # 运行异步主循环
        await worker.run()

    except Exception as e:
        logger.error(f"Async worker {worker_id} crashed: {e}", exc_info=True)
        raise


def worker_main_loop(worker_id: int):
    """Worker主循环入口 - 启动异步事件循环"""
    try:
        # 创建新的事件循环并运行异步Worker
        asyncio.run(worker_main_loop_async(worker_id))
    except KeyboardInterrupt:
        logger.info(f"Worker {worker_id} received keyboard interrupt")
    except Exception as e:
        logger.error(f"Worker {worker_id} fatal error: {e}", exc_info=True)


if __name__ == "__main__":
    # 支持直接运行测试
    if len(sys.argv) > 1:
        worker_id = int(sys.argv[1])
        worker_main_loop(worker_id)
    else:
        print("Usage: python worker_process.py <worker_id>")
