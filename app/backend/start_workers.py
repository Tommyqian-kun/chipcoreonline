#!/usr/bin/python3
"""
Worker启动脚本
用于启动和管理多进程Worker系统
"""

import os
import sys
import signal
import time
import logging
import argparse
from pathlib import Path

# 添加项目路径
sys.path.append(str(Path(__file__).parent))
sys.path.append(str(Path(__file__).parent / 'src' / 'workers'))

from src.workers.worker_manager import WorkerManager
# Redis cleanup service is TypeScript, not needed in Python worker

# 配置日志 - 仅输出到控制台，不写入文件（任务日志统一保存到 logs/<taskId> 目录）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('WorkerStarter')


class WorkerService:
    """Worker服务管理器"""
    
    def __init__(self):
        self.worker_manager = None
        self.cleanup_service = None
        self.running = True
        
        # 设置信号处理（跨平台兼容）
        try:
            signal.signal(signal.SIGINT, self._signal_handler)
            if hasattr(signal, 'SIGTERM'):  # Windows可能不支持SIGTERM
                signal.signal(signal.SIGTERM, self._signal_handler)
        except (AttributeError, OSError) as e:
            logger.warning(f"Signal handling setup failed (platform limitation): {e}")
            # 在Windows上，某些信号可能不可用，但程序仍可正常运行
        
    def start(self):
        """启动所有服务"""
        logger.info("Starting Worker Service")
        
        try:
            # 1. 启动Worker管理器
            self.worker_manager = WorkerManager()
            self.worker_manager.start_workers()
            
            # 2. Redis队列清理服务（由TypeScript后端处理，Python Worker不需要）
            logger.info("Redis queue cleanup is handled by TypeScript backend")
            
            # 3. 开始监控
            logger.info("All services started, beginning monitoring")
            self._monitor_services()
            
        except Exception as e:
            logger.error(f"Failed to start services: {e}", exc_info=True)
            self.stop()
    
    def stop(self):
        """停止所有服务"""
        logger.info("Stopping Worker Service")
        self.running = False
        
        try:
            # 停止清理服务
            if self.cleanup_service:
                self.cleanup_service.stop_cleanup_service()
                logger.info("Redis cleanup service stopped")
            
            # 停止Worker管理器
            if self.worker_manager:
                self.worker_manager.shutdown()
                logger.info("Worker manager stopped")
                
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")
        
        logger.info("Worker Service stopped")
    
    def _monitor_services(self):
        """监控服务状态"""
        while self.running:
            try:
                # 检查Worker管理器状态
                if self.worker_manager:
                    status = self.worker_manager.get_status()
                    if status['alive_workers'] < status['worker_count']:
                        logger.warning(f"Some workers are down: {status['alive_workers']}/{status['worker_count']}")
                
                # 记录资源状态
                if self.worker_manager:
                    resource_status = self.worker_manager.resource_manager.get_resource_status()
                    logger.debug(f"Resource usage: CPU {resource_status['cpu_used']}/{resource_status['cpu_total']}, "
                               f"Memory {resource_status['memory_used_gb']}/{resource_status['memory_total_gb']}GB")
                
                time.sleep(60)  # 每分钟检查一次
                
            except Exception as e:
                logger.error(f"Error in service monitoring: {e}")
                time.sleep(30)
    
    def _signal_handler(self, signum, frame):
        """处理终止信号"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)
    
    def get_status(self):
        """获取服务状态"""
        status = {
            'running': self.running,
            'worker_manager': None,
            'cleanup_service': None
        }
        
        if self.worker_manager:
            status['worker_manager'] = self.worker_manager.get_status()
        
        if self.cleanup_service:
            status['cleanup_service'] = self.cleanup_service.get_service_status()
        
        return status


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='Worker Service Manager')
    parser.add_argument('--status', action='store_true', help='Show service status')
    parser.add_argument('--stop', action='store_true', help='Stop running service')
    parser.add_argument('--cleanup', action='store_true', help='Trigger manual cleanup')
    
    args = parser.parse_args()
    
    if args.status:
        # 显示状态（这里可以实现状态检查逻辑）
        print("Service status check not implemented yet")
        return
    
    if args.stop:
        # 停止服务（这里可以实现停止逻辑）
        print("Service stop not implemented yet")
        return
    
    if args.cleanup:
        # 手动清理（这里可以实现手动清理逻辑）
        print("Manual cleanup not implemented yet")
        return
    
    # 默认启动服务
    service = WorkerService()
    
    try:
        service.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        service.stop()


if __name__ == '__main__':
    main()
