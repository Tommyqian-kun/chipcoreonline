#!/usr/bin/env python3
"""
调试容器执行问题
使用修复后的路径处理和环境变量
"""
import os
import platform
import subprocess
import sys

def normalize_docker_path(host_path: str) -> str:
    """规范化Docker挂载路径"""
    normalized = os.path.normpath(host_path)
    
    if platform.system() == 'Windows':
        normalized = normalized.replace('\\', '/')
        if len(normalized) >= 2 and normalized[1] == ':':
            drive = normalized[0].lower()
            path_part = normalized[2:] if len(normalized) > 2 else ''
            normalized = f'/{drive}{path_part}'
    
    return normalized

def test_container_with_debug():
    """使用调试模式测试容器执行"""
    print("🔧 调试容器执行问题")
    print("=" * 60)
    
    # 查找最新的任务目录
    jobs_dir = "jobs"
    if not os.path.exists(jobs_dir):
        print("❌ jobs目录不存在")
        return False
    
    task_dirs = [d for d in os.listdir(jobs_dir) if os.path.isdir(os.path.join(jobs_dir, d))]
    if not task_dirs:
        print("❌ 没有找到任务目录")
        return False
    
    # 使用最新的任务目录
    latest_task = task_dirs[-1]
    task_path = os.path.join(jobs_dir, latest_task)
    
    print(f"使用任务目录: {latest_task}")
    
    # 准备路径
    paths = {
        'input': os.path.join(task_path, 'input'),
        'output': os.path.join(task_path, 'output'),
        'logs': os.path.join(task_path, 'logs'),
        'work': os.path.join(task_path, 'work')
    }
    
    # 验证所有路径存在
    print("\n📁 路径验证:")
    for name, path in paths.items():
        if not os.path.exists(path):
            print(f"❌ {name}目录不存在: {path}")
            return False
        print(f"✅ {name}: {path}")
    
    # 规范化路径
    print("\n🔄 路径规范化:")
    normalized_paths = {}
    for name, path in paths.items():
        normalized = normalize_docker_path(path)
        normalized_paths[name] = normalized
        print(f"  {name}: {path}")
        print(f"    → {normalized}")
    
    # 检查输入文件
    print("\n📋 输入文件检查:")
    input_files = ['hier.yaml', 'vlog.v', 'dcont.xlsx']
    for file in input_files:
        file_path = os.path.join(paths['input'], file)
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            print(f"  ✅ {file}: {size} bytes")
        else:
            print(f"  ❌ {file}: 不存在")
            return False
    
    # 构建Docker命令
    docker_cmd = [
        "docker", "run", "--rm", "-it",
        "-v", f"{normalized_paths['input']}:/data/input:ro",
        "-v", f"{normalized_paths['output']}:/data/output:rw", 
        "-v", f"{normalized_paths['logs']}:/data/logs:rw",
        "-v", f"{normalized_paths['work']}:/data/work:rw",
        "-e", "SDC_MOD_NAME=jpeg_top_wrapx",
        "-e", "SDC_IS_FLAT=false",
        "-e", f"TASK_ID={latest_task}",
        "-e", "USER_PERMISSION_TYPE=pro",
        "-e", "JOB_INPUT_DIR=/data/input",
        "-e", "JOB_OUTPUT_DIR=/data/output", 
        "-e", "JOB_LOG_DIR=/data/logs",
        "logiccore/sdc-generator:latest"
    ]
    
    print("\n🐳 Docker命令:")
    print(" ".join(docker_cmd))
    print()
    
    # 测试1: 检查容器基本功能
    print("🧪 测试1: 容器基本功能")
    test_cmd = docker_cmd[:-1] + ["--help"]
    try:
        result = subprocess.run(test_cmd, capture_output=True, text=True, timeout=30)
        print(f"  退出码: {result.returncode}")
        if result.stdout:
            print(f"  输出: {result.stdout[:200]}...")
        if result.stderr:
            print(f"  错误: {result.stderr[:200]}...")
    except Exception as e:
        print(f"  异常: {str(e)}")
    
    # 测试2: 检查环境变量
    print("\n🧪 测试2: 检查环境变量")
    env_cmd = docker_cmd[:-1] + ["env"]
    try:
        result = subprocess.run(env_cmd, capture_output=True, text=True, timeout=30)
        print(f"  退出码: {result.returncode}")
        if result.stdout:
            env_lines = result.stdout.split('\n')
            relevant_env = [line for line in env_lines if any(key in line for key in ['SDC_', 'JOB_', 'TASK_'])]
            for env_line in relevant_env:
                print(f"    {env_line}")
    except Exception as e:
        print(f"  异常: {str(e)}")
    
    # 测试3: 检查文件访问
    print("\n🧪 测试3: 检查文件访问")
    file_cmd = docker_cmd[:-1] + ["ls", "-la", "/data/input"]
    try:
        result = subprocess.run(file_cmd, capture_output=True, text=True, timeout=30)
        print(f"  退出码: {result.returncode}")
        if result.stdout:
            print(f"  /data/input内容:")
            for line in result.stdout.split('\n'):
                if line.strip():
                    print(f"    {line}")
        if result.stderr:
            print(f"  错误: {result.stderr}")
    except Exception as e:
        print(f"  异常: {str(e)}")
    
    # 测试4: 执行工具（带详细输出）
    print("\n🧪 测试4: 执行SDC工具")
    run_cmd = docker_cmd + ["run"]
    try:
        print("  ⏳ 启动容器...")
        result = subprocess.run(run_cmd, capture_output=True, text=True, timeout=180)
        
        print(f"  📊 退出码: {result.returncode}")
        
        if result.stdout:
            print("  📝 标准输出:")
            for line in result.stdout.split('\n'):
                if line.strip():
                    print(f"    {line}")
        
        if result.stderr:
            print("  ❌ 标准错误:")
            for line in result.stderr.split('\n'):
                if line.strip():
                    print(f"    {line}")
        
        # 检查执行结果
        if result.returncode == 0:
            print("  ✅ 容器执行成功！")
            
            # 检查输出文件
            print("\n📁 检查输出文件:")
            output_dir = paths['output']
            if os.path.exists(output_dir):
                output_files = os.listdir(output_dir)
                print(f"  输出目录: {len(output_files)}个文件")
                for file in output_files:
                    file_path = os.path.join(output_dir, file)
                    if os.path.isfile(file_path):
                        size = os.path.getsize(file_path)
                        print(f"    📄 {file}: {size} bytes")
            
            # 检查work目录的outputs
            work_outputs = os.path.join(paths['work'], 'jpeg_top_wrapx', 'sdcgen', 'outputs')
            if os.path.exists(work_outputs):
                sdc_files = os.listdir(work_outputs)
                print(f"  SDC输出: {len(sdc_files)}个文件")
                for file in sdc_files:
                    file_path = os.path.join(work_outputs, file)
                    if os.path.isfile(file_path):
                        size = os.path.getsize(file_path)
                        print(f"    📄 {file}: {size} bytes")
            
            return True
        else:
            print(f"  ❌ 容器执行失败 (退出码: {result.returncode})")
            return False
            
    except subprocess.TimeoutExpired:
        print("  ⏰ 容器执行超时")
        return False
    except Exception as e:
        print(f"  💥 执行异常: {str(e)}")
        return False

if __name__ == "__main__":
    print("🚀 容器执行调试工具")
    print(f"平台: {platform.system()} {platform.release()}")
    print()
    
    success = test_container_with_debug()
    
    if success:
        print("\n🎉 调试完成！容器执行成功")
    else:
        print("\n💥 调试发现问题，需要进一步分析")
    
    print("=" * 60)
