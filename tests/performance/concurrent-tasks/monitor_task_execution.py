#!/usr/bin/env python3
import redis
import psycopg2
import time
import os
import json
import subprocess
from datetime import datetime
import glob

class TaskMonitor:
    def __init__(self):
        # Redis连接
        self.redis_client = redis.Redis(host='localhost', port=6379, db=0)
        
        # 数据库连接参数
        self.db_params = {
            'host': 'localhost',
            'database': 'chipcore_dev',
            'user': 'postgres',
            'password': 'password'
        }
        
        self.monitoring = True
        self.last_task_id = None
        
    def get_latest_task(self):
        """获取最新提交的任务"""
        try:
            conn = psycopg2.connect(**self.db_params)
            cur = conn.cursor()
            
            cur.execute("""
                SELECT id, status, progress, "currentStep", "createdAt", "startedAt", 
                       "containerStartedAt", "finishedAt", "workerId", "errorMessage"
                FROM "Task" 
                ORDER BY "createdAt" DESC 
                LIMIT 1
            """)
            
            result = cur.fetchone()
            cur.close()
            conn.close()
            
            if result:
                return {
                    'id': result[0],
                    'status': result[1],
                    'progress': result[2],
                    'currentStep': result[3],
                    'createdAt': result[4],
                    'startedAt': result[5],
                    'containerStartedAt': result[6],
                    'finishedAt': result[7],
                    'workerId': result[8],
                    'errorMessage': result[9]
                }
            return None
        except Exception as e:
            print(f"❌ 获取最新任务失败: {e}")
            return None
    
    def check_redis_queue(self):
        """检查Redis队列状态"""
        try:
            queue_length = self.redis_client.llen('task_queue')
            tasks = []
            if queue_length > 0:
                task_list = self.redis_client.lrange('task_queue', 0, -1)
                tasks = [task.decode('utf-8') for task in task_list]
            
            return {
                'length': queue_length,
                'tasks': tasks
            }
        except Exception as e:
            print(f"❌ 检查Redis队列失败: {e}")
            return {'length': -1, 'tasks': []}
    
    def check_file_system(self, task_id):
        """检查文件系统状态"""
        if not task_id:
            return {'temp': False, 'jobs': False, 'temp_files': [], 'jobs_structure': {}}
        
        # 检查temp目录
        temp_path = f"temp/{task_id}"
        temp_exists = os.path.exists(temp_path)
        temp_files = []
        if temp_exists:
            temp_files = os.listdir(temp_path)
        
        # 检查jobs目录
        jobs_path = f"jobs/{task_id}"
        jobs_exists = os.path.exists(jobs_path)
        jobs_structure = {}
        
        if jobs_exists:
            for root, dirs, files in os.walk(jobs_path):
                rel_path = os.path.relpath(root, jobs_path)
                if rel_path == '.':
                    rel_path = 'root'
                jobs_structure[rel_path] = {
                    'dirs': dirs,
                    'files': files
                }
        
        return {
            'temp': temp_exists,
            'jobs': jobs_exists,
            'temp_files': temp_files,
            'jobs_structure': jobs_structure
        }
    
    def check_docker_containers(self, task_id=None):
        """检查Docker容器状态"""
        try:
            # 检查所有容器
            result = subprocess.run(['docker', 'ps', '-a', '--format', 
                                   'table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Command}}'], 
                                  capture_output=True, text=True, timeout=10)
            
            containers = []
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')[1:]  # 跳过标题行
                for line in lines:
                    if line.strip():
                        parts = line.split('\t')
                        if len(parts) >= 3:
                            containers.append({
                                'name': parts[0],
                                'status': parts[1],
                                'created': parts[2],
                                'command': parts[3] if len(parts) > 3 else ''
                            })
            
            # 如果有task_id，查找相关容器
            task_containers = []
            if task_id:
                for container in containers:
                    if task_id in container['name'] or 'tool-' in container['name']:
                        task_containers.append(container)
            
            return {
                'all_containers': containers,
                'task_containers': task_containers
            }
        except Exception as e:
            print(f"❌ 检查Docker容器失败: {e}")
            return {'all_containers': [], 'task_containers': []}
    
    def check_task_logs(self, task_id):
        """检查任务日志"""
        if not task_id:
            return {'exists': False, 'files': [], 'latest_entries': []}
        
        log_dir = f"logs/{task_id}"
        if not os.path.exists(log_dir):
            return {'exists': False, 'files': [], 'latest_entries': []}
        
        log_files = os.listdir(log_dir)
        latest_entries = []
        
        # 查找最新的Worker日志
        worker_logs = [f for f in log_files if 'worker_' in f]
        if worker_logs:
            latest_worker_log = sorted(worker_logs)[-1]
            log_path = os.path.join(log_dir, latest_worker_log)
            
            try:
                with open(log_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    for line in lines[-10:]:  # 最后10行
                        if line.strip():
                            try:
                                log_data = json.loads(line.strip())
                                latest_entries.append({
                                    'timestamp': log_data.get('timestamp', ''),
                                    'level': log_data.get('level', 'INFO'),
                                    'message': log_data.get('message', ''),
                                    'step': log_data.get('step', '')
                                })
                            except:
                                latest_entries.append({
                                    'timestamp': '',
                                    'level': 'RAW',
                                    'message': line.strip(),
                                    'step': ''
                                })
            except Exception as e:
                print(f"❌ 读取Worker日志失败: {e}")
        
        return {
            'exists': True,
            'files': log_files,
            'latest_entries': latest_entries
        }
    
    def print_status_update(self, task_data, queue_data, file_data, container_data, log_data):
        """打印状态更新"""
        current_time = datetime.now().strftime('%H:%M:%S')
        
        print(f"\n{'='*80}")
        print(f"🔍 任务执行监控 - {current_time}")
        print(f"{'='*80}")
        
        if task_data:
            print(f"📋 最新任务: {task_data['id'][:8]}...")
            print(f"   状态: {task_data['status']}")
            print(f"   进度: {task_data['progress'] or 0}%")
            print(f"   当前步骤: {task_data['currentStep'] or '未设置'}")
            print(f"   创建时间: {task_data['createdAt']}")
            print(f"   开始时间: {task_data['startedAt'] or '未开始'}")
            print(f"   容器启动: {task_data['containerStartedAt'] or '未启动'}")
            print(f"   Worker: {task_data['workerId'] or '未分配'}")
            if task_data['errorMessage']:
                print(f"   错误: {task_data['errorMessage']}")
        
        print(f"\n📊 Redis队列: 长度 {queue_data['length']}")
        if queue_data['tasks']:
            for i, task_id in enumerate(queue_data['tasks'][:3]):
                print(f"   {i+1}. {task_id[:8]}...")
        
        if task_data:
            task_id = task_data['id']
            print(f"\n📁 文件系统:")
            print(f"   temp/{task_id[:8]}...: {'✅' if file_data['temp'] else '❌'}")
            if file_data['temp_files']:
                print(f"     文件: {', '.join(file_data['temp_files'])}")
            
            print(f"   jobs/{task_id[:8]}...: {'✅' if file_data['jobs'] else '❌'}")
            if file_data['jobs_structure']:
                for path, content in file_data['jobs_structure'].items():
                    if content['files'] or content['dirs']:
                        print(f"     {path}: {len(content['files'])} 文件, {len(content['dirs'])} 目录")
        
        print(f"\n🐳 Docker容器:")
        if container_data['task_containers']:
            for container in container_data['task_containers']:
                print(f"   {container['name']}: {container['status']}")
        else:
            print("   没有发现任务相关容器")
        
        if log_data['exists'] and log_data['latest_entries']:
            print(f"\n📝 最新Worker日志:")
            for entry in log_data['latest_entries'][-5:]:  # 只显示最后5条
                timestamp = entry['timestamp'][:19] if entry['timestamp'] else ''
                print(f"   [{timestamp}] {entry['level']}: {entry['message']}")
    
    def monitor_task(self, duration_minutes=10):
        """监控任务执行"""
        print(f"🚀 开始监控任务执行 (持续 {duration_minutes} 分钟)")
        print("💡 请在另一个窗口提交SDC工具任务...")
        
        start_time = time.time()
        end_time = start_time + (duration_minutes * 60)
        
        while time.time() < end_time and self.monitoring:
            try:
                # 获取最新任务
                task_data = self.get_latest_task()
                
                # 检查Redis队列
                queue_data = self.check_redis_queue()
                
                # 检查文件系统
                file_data = self.check_file_system(task_data['id'] if task_data else None)
                
                # 检查Docker容器
                container_data = self.check_docker_containers(task_data['id'] if task_data else None)
                
                # 检查任务日志
                log_data = self.check_task_logs(task_data['id'] if task_data else None)
                
                # 打印状态更新
                self.print_status_update(task_data, queue_data, file_data, container_data, log_data)
                
                # 如果任务完成，停止监控
                if task_data and task_data['status'] in ['COMPLETED', 'FAILED']:
                    print(f"\n🎯 任务已完成，状态: {task_data['status']}")
                    break
                
                # 等待5秒后继续监控
                time.sleep(5)
                
            except KeyboardInterrupt:
                print("\n⏹️ 监控被用户中断")
                break
            except Exception as e:
                print(f"\n❌ 监控过程中出错: {e}")
                time.sleep(5)
        
        print(f"\n{'='*80}")
        print("📋 监控结束")
        print(f"{'='*80}")

def main():
    monitor = TaskMonitor()
    
    # 开始监控，持续10分钟
    monitor.monitor_task(duration_minutes=10)

if __name__ == "__main__":
    main()
