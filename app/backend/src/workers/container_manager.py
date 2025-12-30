"""
容器管理器 - 增强的容器清理机制
处理四种情况下的容器清理：
1. Worker崩溃
2. 容器中止
3. 任务正常执行完
4. 3分钟限时执行完仍然发现任务没有完成
"""

import docker
import logging
import os
from datetime import datetime
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

class ContainerManager:
    """容器管理器 - 跟踪和清理容器"""
    
    def __init__(self):
        try:
            self.docker_client = docker.from_env()
            self.active_containers: Dict[str, Dict[str, Any]] = {}
            logger.info("Container manager initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.docker_client = None
    
    def create_container(self, task_id: str, image_name: str, **kwargs) -> Optional[Any]:
        """创建并跟踪容器"""
        if not self.docker_client:
            raise Exception("Docker client not available")
            
        container_name = f"tool-job-{task_id}"
        
        try:
            # 移除remove=True，手动控制容器删除
            kwargs.pop('remove', None)
            
            container = self.docker_client.containers.run(
                image_name,
                name=container_name,
                detach=True,
                remove=False,  # 不自动删除，手动控制
                **kwargs
            )
            
            # 记录活跃容器
            self.active_containers[task_id] = {
                'container': container,
                'created_at': datetime.now(),
                'name': container_name,
                'image': image_name
            }
            
            logger.info(f"Container created and tracked: {container_name}")
            return container
            
        except Exception as e:
            logger.error(f"Failed to create container for task {task_id}: {e}")
            raise
    
    def cleanup_container(self, task_id: str, force: bool = False, reason: str = "unknown") -> bool:
        """清理指定任务的容器"""
        try:
            container_info = self.active_containers.get(task_id)
            success = False
            
            if container_info:
                container = container_info['container']
                container_name = container_info['name']
                
                try:
                    # 停止容器
                    container.stop(timeout=10)
                    logger.info(f"Container stopped: {container_name}")
                except Exception as e:
                    logger.warning(f"Failed to stop container {container_name}: {e}")
                
                try:
                    # 删除容器
                    container.remove(force=force)
                    logger.info(f"Container removed: {container_name}")
                    success = True
                except Exception as e:
                    logger.warning(f"Failed to remove container {container_name}: {e}")
                
                # 从跟踪列表移除
                del self.active_containers[task_id]
            
            # 尝试通过名称清理（备用方案）
            container_name = f"tool-job-{task_id}"
            try:
                container = self.docker_client.containers.get(container_name)
                container.stop(timeout=10)
                container.remove(force=force)
                logger.info(f"Container cleaned up by name: {container_name}")
                success = True
            except docker.errors.NotFound:
                logger.debug(f"Container {container_name} not found, already cleaned")
                success = True  # 容器不存在也算成功
            except Exception as e:
                logger.warning(f"Failed to cleanup container {container_name}: {e}")
            
            if success:
                logger.info(f"Container cleanup successful for task {task_id}, reason: {reason}")
            else:
                logger.error(f"Container cleanup failed for task {task_id}, reason: {reason}")
                
            return success
                
        except Exception as e:
            logger.error(f"Error cleaning up container for task {task_id}: {e}")
            return False
    
    def cleanup_all_task_containers(self, reason: str = "system_shutdown") -> int:
        """清理所有任务容器（系统关闭时调用）"""
        cleaned_count = 0
        task_ids = list(self.active_containers.keys())
        
        for task_id in task_ids:
            if self.cleanup_container(task_id, force=True, reason=reason):
                cleaned_count += 1
        
        logger.info(f"Cleaned up {cleaned_count} containers, reason: {reason}")
        return cleaned_count
    
    def get_container_status(self, task_id: str) -> Dict[str, Any]:
        """获取容器状态"""
        try:
            container_info = self.active_containers.get(task_id)
            if container_info:
                container = container_info['container']
                container.reload()
                return {
                    'exists': True,
                    'status': container.status,
                    'is_running': container.status == 'running',
                    'created_at': container_info['created_at'].isoformat(),
                    'name': container_info['name']
                }
            
            # 尝试通过名称查找
            container_name = f"tool-job-{task_id}"
            try:
                container = self.docker_client.containers.get(container_name)
                return {
                    'exists': True,
                    'status': container.status,
                    'is_running': container.status == 'running',
                    'name': container_name,
                    'tracked': False
                }
            except docker.errors.NotFound:
                return {'exists': False, 'status': None, 'is_running': False}
                
        except Exception as e:
            logger.error(f"Error getting container status for task {task_id}: {e}")
            return {'exists': False, 'status': None, 'is_running': False, 'error': str(e)}
    
    def list_active_containers(self) -> Dict[str, Dict[str, Any]]:
        """列出所有活跃容器"""
        return self.active_containers.copy()
    
    def cleanup_orphaned_containers(self) -> int:
        """清理孤立的工具容器（没有在跟踪列表中的）"""
        try:
            cleaned_count = 0
            containers = self.docker_client.containers.list(all=True)
            
            for container in containers:
                if container.name and container.name.startswith('tool-job-'):
                    # 提取task_id
                    task_id = container.name.replace('tool-job-', '')
                    
                    # 如果不在跟踪列表中，则为孤立容器
                    if task_id not in self.active_containers:
                        try:
                            container.stop(timeout=10)
                            container.remove(force=True)
                            logger.info(f"Cleaned up orphaned container: {container.name}")
                            cleaned_count += 1
                        except Exception as e:
                            logger.warning(f"Failed to cleanup orphaned container {container.name}: {e}")
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} orphaned containers")
            
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Error cleaning up orphaned containers: {e}")
            return 0

# 全局容器管理器实例
container_manager = ContainerManager()

def cleanup_container_for_task(task_id: str, reason: str = "task_cleanup") -> bool:
    """便捷函数：清理指定任务的容器"""
    return container_manager.cleanup_container(task_id, force=True, reason=reason)

def get_container_status_for_task(task_id: str) -> Dict[str, Any]:
    """便捷函数：获取任务容器状态"""
    return container_manager.get_container_status(task_id)
