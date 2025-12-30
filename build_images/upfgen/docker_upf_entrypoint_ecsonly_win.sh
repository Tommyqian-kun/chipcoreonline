#!/bin/bash

# UPF Generator Tool Entrypoint Script for ECS Only Windows Testing
# 实现UPF工具的完整执行流程 - 针对Windows环境下ECS Only部署模式测试
# 配置文件: app/backend/.env.local
# 工具脚本路径: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\upfgen
# 用户上传数据: E:\stone\work\webapp\augment\LogicCore\test_data\upload_data\upfgen
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
        "UPF_MOD_NAME"
        "UPF_IS_FLAT"
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
        "$JOB_INPUT_DIR/pvlog.v"
        "$JOB_INPUT_DIR/pcont.xlsx"
        "$JOB_INPUT_DIR/pobj.tcl"
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
    python3 /app/upfgen/upfgen.py upfgen -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -gen_dir ./ -blocks "$UPF_MOD_NAME" -setup

    
    if [[ $? -ne 0 ]]; then
        error_exit "Failed to setup directory structure"
    fi
    
    # 检查目录是否创建成功
    if [[ ! -d "$UPF_MOD_NAME" ]]; then
        error_exit "Module directory $UPF_MOD_NAME was not created"
    fi
    
    log "Directory structure created successfully"
}

# 放置配置文件
place_config_files() {
    log "Placing configuration files..."

    # 步骤2: 放置配置文件到 <ModName>/upfgen/inputs/
    local input_dir="/data/work/$UPF_MOD_NAME/upfgen/inputs"

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
            cp "$file" "$input_dir/pvlog.v"
            log "Copied verilog file: $(basename "$file") -> pvlog.v"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    # 查找并复制Excel文件
    for file in "$JOB_INPUT_DIR"/*.xlsx "$JOB_INPUT_DIR"/*.xls; do
        if [[ -f "$file" ]]; then
            cp "$file" "$input_dir/pcont.xlsx"
            log "Copied constraint file: $(basename "$file") -> pcont.xlsx"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    # 查找并复制TCL文件
    for file in "$JOB_INPUT_DIR"/*.tcl; do
        if [[ -f "$file" ]]; then
            cp "$file" "$input_dir/pobj.tcl"
            log "Copied TCL file: $(basename "$file") -> pobj.tcl"
            files_copied=$((files_copied + 1))
            break
        fi
    done

    if [[ $files_copied -lt 4 ]]; then
        error_exit "Not all required input files found. Expected: hier.yaml, pvlog.v, pcont.xlsx, pobj.tcl"
    fi

    log "Configuration files placed in $input_dir ($files_copied files)"
}

# 检查输入信息
check_input_info() {
    log "Step 3: Checking input information..."
    
    cd /data/work
    
    python3 /app/upfgen/upfgen.py upfgen -gen_dir ./ -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -check_only -blocks "$UPF_MOD_NAME"
    
    if [[ $? -ne 0 ]]; then
        error_exit "Input information check failed"
    fi
    
    log "Input information check passed"
}

# 生成UPF文件
generate_upf() {
    log "Step 4: Generating UPF files..."

    cd /data/work

    # 获取用户权限类型，默认为free
    local user_permission="${USER_PERMISSION_TYPE:-fre}"
    log "User permission type: $user_permission"

    if [[ "$UPF_IS_FLAT" == "true" ]]; then
        log "Generating UPF with flatten mode and user permission: $user_permission"
        python3 /app/upfgen/upfgen.py upfgen -gen_dir ./ -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -blocks "$UPF_MOD_NAME" -upf -flatten -usr "$user_permission"
    else
        log "Generating UPF with block-only mode and user permission: $user_permission"
        python3 /app/upfgen/upfgen.py upfgen -gen_dir ./ -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -blocks "$UPF_MOD_NAME" -upf -usr "$user_permission"
    fi

    if [[ $? -ne 0 ]]; then
        error_exit "UPF generation failed"
    fi

    log "UPF generation completed"
}

# 检查UPF文件
check_upf_files() {
    log "Step 5: Checking generated UPF files..."
    
    cd /data/work
    
    if [[ "$UPF_IS_FLAT" == "true" ]]; then
        log "Checking UPF files in flatten mode..."
        python3 /app/upfgen/upfgen.py upfgen -gen_dir ./ -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -blocks "$UPF_MOD_NAME" -check_upf -flatten
    else
        log "Checking UPF files in block-only mode..."
        python3 /app/upfgen/upfgen.py upfgen -gen_dir ./ -hier_yaml "$UPF_MOD_NAME/upfgen/inputs/hier.yaml" -blocks "$UPF_MOD_NAME" -check_upf
    fi
    
    if [[ $? -ne 0 ]]; then
        log "WARNING: UPF file check failed, but continuing..."
    else
        log "UPF file check passed"
    fi
}

# 打包输出文件
package_output() {
    log "Packaging output files..."

    cd /data/work

    # 检查UPF目录结构
    local upf_base_dir="$UPF_MOD_NAME/upfgen"
    if [[ ! -d "$upf_base_dir" ]]; then
        error_exit "UPF base directory not found: $upf_base_dir"
    fi

    # 需要打包的三个目录
    local output_dir="$upf_base_dir/outputs"
    local logs_dir="$upf_base_dir/logs"
    local rpts_dir="$upf_base_dir/rpts"

    # 检查必需的outputs目录
    if [[ ! -d "$output_dir" ]]; then
        error_exit "UPF outputs directory not found: $output_dir"
    fi

    # 创建logs和rpts目录（如果不存在）
    mkdir -p "$logs_dir" "$rpts_dir"

    # 生成符合要求的输出文件名：result_{taskid}_{tool_type}_{timestamp}.zip
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local output_filename="result_${TASK_ID}_upfgen_${timestamp}.zip"
    local output_zip="/data/output/$output_filename"

    log "Generated output filename: $output_filename"

    # 进入UPF目录并打包三个子目录
    cd "$upf_base_dir"

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
    local upf_files=$(find outputs/ -name "*.upf" 2>/dev/null | wc -l)
    local total_files=$((outputs_files + logs_files + rpts_files))

    # 创建详细的结果摘要
    cat > /data/output/result_summary.txt << EOF
UPF Generation Results (ECS Only Windows Testing)
=================================================
Task ID: $TASK_ID
Module Name: $UPF_MOD_NAME
Flatten Mode: $UPF_IS_FLAT
Generated At: $(date)
Output File: $output_filename.zip
Output Size: $zip_size bytes
Deployment Mode: ECS Only (Windows Testing)

File Statistics:
- UPF Files Generated: $upf_files
- Total Files in outputs/: $outputs_files
- Total Files in logs/: $logs_files
- Total Files in rpts/: $rpts_files
- Total Files Packaged: $total_files

Generated UPF Files:
$(find outputs/ -name "*.upf" 2>/dev/null | head -10)

Log Files:
$(find logs/ -type f 2>/dev/null | head -5)

Report Files:
$(find rpts/ -type f 2>/dev/null | head -5)

All Files in Package:
$(find outputs/ logs/ rpts/ -type f 2>/dev/null | head -30)
EOF

    log "Result summary created - Total files packaged: $total_files (UPF: $upf_files)"
}

# ECS Only模式不需要OSS上传
upload_to_oss() {
    log "ECS Only mode - skipping OSS upload, files stored locally"
}

# 主执行函数
main() {
    log "Starting UPF Generator Tool execution (ECS Only Windows Testing)..."
    log "Task ID: ${TASK_ID:-unknown}"
    log "Module Name: ${UPF_MOD_NAME:-unknown}"
    log "Flatten Mode: ${UPF_IS_FLAT:-unknown}"
    log "Deployment Mode: ECS Only (Windows Testing)"
    
    # 执行各个步骤
    check_env_vars
    check_input_files
    init_workspace
    # place_config_files
    check_input_info
    generate_upf
    check_upf_files
    package_output
    upload_to_oss
    
    log "UPF Generator Tool execution completed successfully!"
    exit 0
}

# 处理帮助信息
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
UPF Generator Tool Docker Container (ECS Only Windows Testing)

Environment Variables:
  UPF_MOD_NAME     - Module name for UPF generation
  UPF_IS_FLAT      - Flatten mode (true/false)
  JOB_INPUT_DIR    - Input files directory
  JOB_OUTPUT_DIR   - Output files directory
  JOB_LOG_DIR      - Log files directory
  TASK_ID          - Task identifier

Required Input Files:
  - hier.yaml      - Hierarchy configuration
  - vlog.v         - Verilog design file
  - dcont.xlsx     - Design constraints

Output Files:
  - upf_result.zip - Generated UPF files
  - result_summary.txt - Execution summary

Configuration:
  - Config File: app/backend/.env.local
  - Tool Scripts: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\upfgen
  - Upload Data: E:\stone\work\webapp\augment\LogicCore\test_data\upload_data\upfgen
  - Task Storage: E:\stone\work\webapp\augment\LogicCore\jobs
EOF
    exit 0
fi

# 执行主函数
main "$@"
