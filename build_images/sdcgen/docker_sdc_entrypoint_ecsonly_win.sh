#!/bin/bash

# SDC Generator Tool Entrypoint Script for ECS Only Windows Testing
# 实现SDC工具的完整执行流程 - 针对Windows环境下ECS Only部署模式测试
# 配置文件: app/backend/.env.local
# 工具脚本路径: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\sdcgen
# 用户上传数据: E:\stone\work\webapp\augment\LogicCore\test_data\upload_data\sdcgen
# 任务数据存储: E:\stone\work\webapp\augment\LogicCore\jobs

set -e  # 遇到错误立即退出
set -u  # 使用未定义变量时退出

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /data/logs/execution.log
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

# 检查必需的环境变量
check_env_vars() {
    log "Checking environment variables..."
    
    required_vars=(
        "SDC_MOD_NAME"
        "SDC_IS_FLAT"
        "JOB_INPUT_DIR"
        "JOB_OUTPUT_DIR"
        "JOB_LOG_DIR"
        "TASK_ID"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error_exit "Required environment variable $var is not set"
        fi
    done
    
    log "Environment variables check passed"
}

# 检查输入文件
check_input_files() {
    log "Checking input files..."
    
    required_files=(
        "$JOB_INPUT_DIR/hier.yaml"
        "$JOB_INPUT_DIR/vlog.v"
        "$JOB_INPUT_DIR/dcont.xlsx"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            error_exit "Required input file not found: $file"
        fi
        log "Found input file: $file"
    done
    
    log "Input files check passed"
}

# 初始化工作环境
init_workspace() {
    log "Initializing workspace..."
    
    cd /data/work
    
    # 步骤1: 建立目录结构
    log "Step 1: Setting up directory structure..."
    python3 /app/sdcgen/sdcgen.py sdcgen -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -gen_dir ./ -blocks "$SDC_MOD_NAME" -setup
    
    if [[ $? -ne 0 ]]; then
        error_exit "Failed to setup directory structure"
    fi
    
    # 检查目录是否创建成功
    if [[ ! -d "$SDC_MOD_NAME" ]]; then
        error_exit "Module directory $SDC_MOD_NAME was not created"
    fi
    
    log "Directory structure created successfully"
}

# 放置配置文件
place_config_files() {
    log "Placing configuration files..."

    # 步骤2: 放置配置文件到 <ModName>/sdcgen/inputs/
    local input_dir="/data/work/$SDC_MOD_NAME/sdcgen/inputs"

    # 确保输入目录存在
    mkdir -p "$input_dir"

    # 复制输入文件（处理实际的文件名）
    local files_copied=0

    # 查找并复制hier.yaml文件（可能有不同的文件名）
    for file in "$JOB_INPUT_DIR"/*.yaml "$JOB_INPUT_DIR"/*.yml; do
        if [[ -f "$file" ]]; then
            cp "$file" "$input_dir/hier.yaml"
            log "Copied hierarchy file: $(basename "$file") -> hier.yaml"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    # 查找并复制verilog文件
    for file in "$JOB_INPUT_DIR"/*.v "$JOB_INPUT_DIR"/*.sv; do
        if [[ -f "$file" ]]; then
            cp "$file" "$input_dir/vlog.v"
            log "Copied verilog file: $(basename "$file") -> vlog.v"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    # 查找并复制Excel文件
    for file in "$JOB_INPUT_DIR"/*.xlsx "$JOB_INPUT_DIR"/*.xls; do
        if [[ -f "$file" ]]; then
            cp "$file" "$input_dir/dcont.xlsx"
            log "Copied constraint file: $(basename "$file") -> dcont.xlsx"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    if [[ $files_copied -lt 3 ]]; then
        error_exit "Not all required input files found. Expected: hier.yaml, vlog.v, dcont.xlsx"
    fi

    log "Configuration files placed in $input_dir ($files_copied files)"
}

# 检查输入信息
check_input_info() {
    log "Step 3: Checking input information..."
    
    cd /data/work
    
    python3 /app/sdcgen/sdcgen.py sdcgen -gen_dir ./ -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -check_only -blocks "$SDC_MOD_NAME"
    
    if [[ $? -ne 0 ]]; then
        error_exit "Input information check failed"
    fi
    
    log "Input information check passed"
}

# 生成SDC文件
generate_sdc() {
    log "Step 4: Generating SDC files..."

    cd /data/work

    # 获取用户权限类型，默认为fre（工具期望格式）
    local user_permission="${USER_PERMISSION_TYPE:-fre}"
    log "User permission type: $user_permission"

    if [[ "$SDC_IS_FLAT" == "true" ]]; then
        log "Generating SDC with flatten mode and user permission: $user_permission"
        python3 /app/sdcgen/sdcgen.py sdcgen -gen_dir ./ -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -blocks "$SDC_MOD_NAME" -sdc -flatten -usr "$user_permission"
    else
        log "Generating SDC with block-only mode and user permission: $user_permission"
        python3 /app/sdcgen/sdcgen.py sdcgen -gen_dir ./ -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -blocks "$SDC_MOD_NAME" -sdc -usr "$user_permission"
    fi

    if [[ $? -ne 0 ]]; then
        error_exit "SDC generation failed"
    fi

    log "SDC generation completed"
}

# 检查SDC文件
check_sdc_files() {
    log "Step 5: Checking generated SDC files..."
    
    cd /data/work
    
    if [[ "$SDC_IS_FLAT" == "true" ]]; then
        log "Checking SDC files in flatten mode..."
        python3 /app/sdcgen/sdcgen.py sdcgen -gen_dir ./ -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -blocks "$SDC_MOD_NAME" -check_sdc -flatten
    else
        log "Checking SDC files in block-only mode..."
        python3 /app/sdcgen/sdcgen.py sdcgen -gen_dir ./ -hier_yaml "$SDC_MOD_NAME/sdcgen/inputs/hier.yaml" -blocks "$SDC_MOD_NAME" -check_sdc
    fi
    
    if [[ $? -ne 0 ]]; then
        log "WARNING: SDC file check failed, but continuing..."
    else
        log "SDC file check passed"
    fi
}

# 打包输出文件
package_output() {
    log "Packaging output files..."

    cd /data/work

    # 检查SDC目录结构
    local sdc_base_dir="$SDC_MOD_NAME/sdcgen"
    if [[ ! -d "$sdc_base_dir" ]]; then
        error_exit "SDC base directory not found: $sdc_base_dir"
    fi

    # 需要打包的三个目录
    local output_dir="$sdc_base_dir/outputs"
    local logs_dir="$sdc_base_dir/logs"
    local rpts_dir="$sdc_base_dir/rpts"

    # 检查必需的outputs目录
    if [[ ! -d "$output_dir" ]]; then
        error_exit "SDC outputs directory not found: $output_dir"
    fi

    # 创建logs和rpts目录（如果不存在）
    mkdir -p "$logs_dir" "$rpts_dir"

    # 生成符合要求的输出文件名：result_{taskid}_{tool_type}_{timestamp}.zip
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local output_filename="result_${TASK_ID}_sdcgen_${timestamp}.zip"
    local output_zip="/data/output/$output_filename"

    log "Generated output filename: $output_filename"

    # 进入SDC目录并打包三个子目录
    cd "$sdc_base_dir"

    log "Packaging directories: outputs/, logs/, rpts/"

    # 检查每个目录的内容
    local outputs_files=$(find outputs/ -type f 2>/dev/null | wc -l)
    local logs_files=$(find logs/ -type f 2>/dev/null | wc -l)
    local rpts_files=$(find rpts/ -type f 2>/dev/null | wc -l)

    log "Directory contents: outputs($outputs_files files), logs($logs_files files), rpts($rpts_files files)"

    # 打包三个目录
    zip -r "$output_zip" outputs/ logs/ rpts/ 2>/dev/null

    if [[ $? -ne 0 ]]; then
        error_exit "Failed to create output zip file"
    fi

    # 检查zip文件大小
    local zip_size=$(stat -c%s "$output_zip" 2>/dev/null || echo "0")
    log "Output zip file created: $output_zip (size: $zip_size bytes)"

    # 统计生成的文件
    local sdc_files=$(find outputs/ -name "*.sdc" 2>/dev/null | wc -l)
    local total_files=$((outputs_files + logs_files + rpts_files))

    # 创建详细的结果摘要
    cat > /data/output/result_summary.txt << EOF
SDC Generation Results (ECS Only Windows Testing)
=================================================
Task ID: $TASK_ID
Module Name: $SDC_MOD_NAME
Flatten Mode: $SDC_IS_FLAT
Generated At: $(date)
Output File: $output_filename.zip
Output Size: $zip_size bytes
Deployment Mode: ECS Only (Windows Testing)

File Statistics:
- SDC Files Generated: $sdc_files
- Total Files in outputs/: $outputs_files
- Total Files in logs/: $logs_files
- Total Files in rpts/: $rpts_files
- Total Files Packaged: $total_files

Generated SDC Files:
$(find outputs/ -name "*.sdc" 2>/dev/null | head -10)

Log Files:
$(find logs/ -type f 2>/dev/null | head -5)

Report Files:
$(find rpts/ -type f 2>/dev/null | head -5)

All Files in Package:
$(find outputs/ logs/ rpts/ -type f 2>/dev/null | head -30)
EOF

    log "Result summary created - Total files packaged: $total_files (SDC: $sdc_files)"
}

# ECS Only模式不需要OSS上传
upload_to_oss() {
    log "ECS Only mode - skipping OSS upload, files stored locally"
}

# 主执行函数
main() {
    log "Starting SDC Generator Tool execution (ECS Only Windows Testing)..."
    log "Task ID: ${TASK_ID:-unknown}"
    log "Module Name: ${SDC_MOD_NAME:-unknown}"
    log "Flatten Mode: ${SDC_IS_FLAT:-unknown}"
    log "User Permission Type: ${USER_PERMISSION_TYPE:-unknown}"
    log "Deployment Mode: ECS Only (Windows Testing)"

    # 调试：输出所有环境变量
    log "=== Environment Variables Debug ==="
    env | grep -E "(TASK_ID|SDC_|USER_|JOB_|DEPLOYMENT_MODE)" | sort
    log "=== End Environment Variables ==="

    # 执行各个步骤
    check_env_vars
    check_input_files
    # place_config_files  # 先复制配置文件（ECS Only模式下已在外部完成）
    init_workspace      # 初始化工作空间（创建必要的目录结构）
    check_input_info
    generate_sdc
    check_sdc_files
    package_output
    upload_to_oss

    log "SDC Generator Tool execution completed successfully!"
    exit 0
}

# 处理帮助信息
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
SDC Generator Tool Docker Container (ECS Only Windows Testing)

Environment Variables:
  SDC_MOD_NAME     - Module name for SDC generation
  SDC_IS_FLAT      - Flatten mode (true/false)
  JOB_INPUT_DIR    - Input files directory
  JOB_OUTPUT_DIR   - Output files directory
  JOB_LOG_DIR      - Log files directory
  TASK_ID          - Task identifier

Required Input Files:
  - hier.yaml      - Hierarchy configuration
  - vlog.v         - Verilog design file
  - dcont.xlsx     - Design constraints

Output Files:
  - result_{taskid}_sdcgen_{timestamp}.zip - Generated SDC files
  - result_summary.txt - Execution summary

Configuration:
  - Config File: app/backend/.env.local
  - Tool Scripts: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\sdcgen
  - Upload Data: E:\stone\work\webapp\augment\LogicCore\test_data\upload_data\sdcgen
  - Task Storage: E:\stone\work\webapp\augment\LogicCore\jobs
EOF
    exit 0
fi

# 执行主函数
main "$@"
