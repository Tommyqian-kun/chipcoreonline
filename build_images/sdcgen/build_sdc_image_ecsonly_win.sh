#!/bin/bash

# SDC工具Docker镜像构建脚本 (ECS Only Windows测试环境)
# 专门用于Windows环境下的ECS Only部署模式测试
# 配置文件: app/backend/.env.local
# 工具脚本路径: /home/master/stone/proj/onlineEDA\test_data\tools_collection\sdcgen
# 镜像存储路径: /home/master/stone/proj/onlineEDA\docker\images\sdc

set -e  # 遇到错误立即退出

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"  # 从build_images/sdcgen回到项目根目录
IMAGE_NAME="logiccore/sdc-generator"
DOCKERFILE_PATH="$SCRIPT_DIR/docker_sdc_generator_ecsonly_win_Dockerfile"

# 工具交互模式（默认为单页面）
INTERACTION_MODE="single"

# 版本验证和处理
validate_version() {
    local version="$1"

    # 检查版本格式是否为 vX.Y.Z
    if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        error "Invalid version format: $version"
        error "Version must be in format: vX.Y.Z (e.g., v1.0.0, v2.1.3)"
        echo ""
        show_usage
        exit 1
    fi

    success "Version format validated: $version"
}

# 交互模式验证和处理
validate_interaction_mode() {
    local mode="$1"

    if [[ "$mode" != "single" && "$mode" != "multi" ]]; then
        error "Invalid interaction mode: $mode"
        error "Mode must be either 'single' or 'multi'"
        echo ""
        show_usage
        exit 1
    fi

    success "Interaction mode validated: $mode"
}

# VERSION变量将在main函数中设置

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 跨平台文件大小获取函数
get_file_size() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        echo "0"
        return
    fi

    # 尝试不同的stat命令格式
    if stat -c%s "$file" 2>/dev/null; then
        # Linux格式
        return
    elif stat -f%z "$file" 2>/dev/null; then
        # macOS格式
        return
    elif wc -c < "$file" 2>/dev/null; then
        # 通用格式
        return
    else
        echo "unknown"
    fi
}

# 跨平台路径检测 - 支持Windows、WSL和Linux环境
if [[ -n "${WSL_DISTRO_NAME:-}" ]] || [[ "$(uname -r)" == *microsoft* ]] || [[ "$(uname -r)" == *WSL* ]]; then
    # WSL环境：检查是否存在Windows项目路径
    if [[ -d "/mnt/e/stone/work/webapp/augment/LogicCore" ]]; then
        DOCKER_STORAGE_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/docker"
        log "Detected WSL environment with Windows project path"
    else
        # WSL环境但项目在Linux路径
        DOCKER_STORAGE_DIR="$PROJECT_ROOT/docker"
        log "Detected WSL environment with Linux project path"
    fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    # 原生Windows环境
    DOCKER_STORAGE_DIR="$PROJECT_ROOT/docker"
    log "Detected native Windows environment"
else
    # 纯Linux环境
    DOCKER_STORAGE_DIR="$PROJECT_ROOT/docker"
    log "Detected Linux environment"
fi
IMAGES_DIR="$DOCKER_STORAGE_DIR/images/sdc"

# 跨平台Docker镜像标签链接函数
create_latest_link() {
    local source_version="$1"

    # 根据交互模式确定源镜像名称
    local source_image
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        source_image="$IMAGE_NAME-multi:$source_version"
    else
        source_image="$IMAGE_NAME:$source_version"
    fi

    local target_image="$IMAGE_NAME:latest"

    log "Creating latest link: $source_image -> $target_image"

    # 检查源镜像是否存在
    if ! docker images "$source_image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$source_image"; then
        error "Source image not found: $source_image"
        return 1
    fi

    # 删除现有的latest标签（如果存在）
    if docker images "$target_image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$target_image"; then
        log "Removing existing latest tag..."
        docker rmi "$target_image" >/dev/null 2>&1 || true
    fi

    # 创建新的latest标签
    if docker tag "$source_image" "$target_image"; then
        success "✓ Latest link created: $source_version -> latest"

        # 验证链接
        local source_id=$(docker images "$source_image" --format "{{.ID}}")
        local target_id=$(docker images "$target_image" --format "{{.ID}}")

        if [[ "$source_id" == "$target_id" ]]; then
            success "✓ Link verified: both images have same ID ($source_id)"
        else
            warning "⚠ Link verification failed: different IDs (source: $source_id, target: $target_id)"
        fi
    else
        error "✗ Failed to create latest link"
        return 1
    fi
}

# 版本回滚功能
rollback_to_version() {
    local target_version="$1"
    local target_image="$IMAGE_NAME:$target_version"

    log "Rolling back to version: $target_version"

    # 检查目标版本是否存在
    if ! docker images "$target_image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$target_image"; then
        error "Target version not found: $target_image"
        log "Available versions:"
        docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
        return 1
    fi

    # 创建latest链接到目标版本
    create_latest_link "$target_version"

    if [[ $? -eq 0 ]]; then
        success "✓ Successfully rolled back to version: $target_version"

        # 更新latest tar文件
        local latest_file="$IMAGES_DIR/logiccore_sdc-generator-multi_latest.tar"
        log "Updating latest tar file..."

        if docker save "$IMAGE_NAME:latest" -o "$latest_file"; then
            success "✓ Latest tar file updated"
        else
            warning "⚠ Failed to update latest tar file"
        fi

        return 0
    else
        error "✗ Failed to rollback to version: $target_version"
        return 1
    fi
}

# 列出所有可用版本
list_versions() {
    log "Available SDC Generator versions:"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
}

# 检查必需的文件
check_files() {
    log "Checking required files for ECS Only Windows testing..."
    
    local required_files=(
        "$DOCKERFILE_PATH"
        "$SCRIPT_DIR/docker_sdc_entrypoint_ecsonly_win.sh"
        "$PROJECT_ROOT/test_data/tools_collection/sdcgen/sdcgen.py"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            error "Required file not found: $file"
            exit 1
        fi
    done
    
    success "All required files found"
}

# 检查Docker是否运行
check_docker() {
    log "Checking Docker..."
    
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running or not accessible"
        exit 1
    fi
    
    success "Docker is running"
}

# 创建存储目录
create_storage_dirs() {
    log "Creating storage directories..."
    log "Target directories:"
    log "  - Docker storage root: $DOCKER_STORAGE_DIR"
    log "  - Images directory: $IMAGES_DIR"
    log "  - Volumes directory: $DOCKER_STORAGE_DIR/volumes"

    # 创建Docker存储根目录
    log "Creating Docker storage root directory..."
    if mkdir -p "$DOCKER_STORAGE_DIR"; then
        success "Docker storage root created: $DOCKER_STORAGE_DIR"
    else
        error "Failed to create Docker storage root: $DOCKER_STORAGE_DIR"
        exit 1
    fi

    # 验证根目录是否存在
    if [[ ! -d "$DOCKER_STORAGE_DIR" ]]; then
        error "Docker storage root directory does not exist after creation: $DOCKER_STORAGE_DIR"
        exit 1
    fi

    # 创建images目录
    log "Creating images directory..."
    if mkdir -p "$DOCKER_STORAGE_DIR/images"; then
        success "Images directory created: $DOCKER_STORAGE_DIR/images"
    else
        error "Failed to create images directory: $DOCKER_STORAGE_DIR/images"
        exit 1
    fi

    # 创建sdc子目录
    log "Creating SDC images subdirectory..."
    if mkdir -p "$IMAGES_DIR"; then
        success "SDC images directory created: $IMAGES_DIR"
    else
        error "Failed to create SDC images directory: $IMAGES_DIR"
        exit 1
    fi

    # 创建volumes目录
    log "Creating volumes directory..."
    if mkdir -p "$DOCKER_STORAGE_DIR/volumes"; then
        success "Volumes directory created: $DOCKER_STORAGE_DIR/volumes"
    else
        error "Failed to create volumes directory: $DOCKER_STORAGE_DIR/volumes"
        exit 1
    fi

    # 验证所有目录都已创建
    log "Verifying created directories..."
    local required_dirs=(
        "$DOCKER_STORAGE_DIR"
        "$DOCKER_STORAGE_DIR/images"
        "$IMAGES_DIR"
        "$DOCKER_STORAGE_DIR/volumes"
    )

    local missing_dirs=0
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            success "✓ Directory exists: $dir"
        else
            error "✗ Directory missing: $dir"
            missing_dirs=$((missing_dirs + 1))
        fi
    done

    if [[ $missing_dirs -eq 0 ]]; then
        success "All storage directories created and verified successfully!"

        # 显示目录结构
        log "Directory structure:"
        if command -v tree >/dev/null 2>&1; then
            tree "$DOCKER_STORAGE_DIR" -L 3 2>/dev/null || ls -la "$DOCKER_STORAGE_DIR"
        else
            ls -la "$DOCKER_STORAGE_DIR"
            ls -la "$DOCKER_STORAGE_DIR/images" 2>/dev/null || echo "  images/ (empty)"
        fi
    else
        error "Failed to create $missing_dirs directories"
        exit 1
    fi
}

# 构建Docker镜像
build_image() {
    log "Building Docker image for ECS Only Windows testing..."

    # 根据交互模式生成镜像名称
    local full_image_name
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        # 多页面交互模式：版本标签包含-multi后缀
        full_image_name="$IMAGE_NAME-multi:$VERSION"
    else
        # 单页面交互模式：标准版本标签
        full_image_name="$IMAGE_NAME:$VERSION"
    fi

    log "Build configuration:"
    log "  - Interaction mode: $INTERACTION_MODE"
    log "  - Image name: $full_image_name"
    log "  - Dockerfile: $DOCKERFILE_PATH"
    log "  - Build context: $PROJECT_ROOT"
    log "  - Target environment: ECS Only Windows Testing"

    # 验证构建前的必要文件
    log "Verifying build prerequisites..."
    if [[ ! -f "$DOCKERFILE_PATH" ]]; then
        error "Dockerfile not found: $DOCKERFILE_PATH"
        exit 1
    fi
    success "✓ Dockerfile found: $DOCKERFILE_PATH"

    if [[ ! -d "$PROJECT_ROOT" ]]; then
        error "Build context directory not found: $PROJECT_ROOT"
        exit 1
    fi
    success "✓ Build context found: $PROJECT_ROOT"

    # 检查关键的源文件
    local key_files=(
        "$PROJECT_ROOT/test_data/tools_collection/sdcgen/sdcgen.py"
        "$SCRIPT_DIR/docker_sdc_entrypoint_ecsonly_win.sh"
    )

    for file in "${key_files[@]}"; do
        if [[ -f "$file" ]]; then
            success "✓ Source file found: $(basename "$file")"
        else
            error "✗ Source file missing: $file"
            exit 1
        fi
    done

    # 开始构建（只构建版本标签，不直接构建latest）
    log "Starting Docker build process..."
    log "Build command: docker build -f $DOCKERFILE_PATH -t $full_image_name $PROJECT_ROOT"

    if docker build \
        -f "$DOCKERFILE_PATH" \
        -t "$full_image_name" \
        "$PROJECT_ROOT"; then
        success "Docker image built successfully: $full_image_name"
    else
        error "Failed to build Docker image"
        log "Build failed. Please check the output above for errors."
        exit 1
    fi

    # 验证版本镜像是否创建
    log "Verifying built image..."
    # 根据交互模式使用正确的镜像名进行验证
    local verify_image_name
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        verify_image_name="$IMAGE_NAME-multi"
    else
        verify_image_name="$IMAGE_NAME"
    fi

    if docker images "$verify_image_name" --format "{{.Repository}}:{{.Tag}}" | grep -q "$full_image_name"; then
        success "✓ Versioned image verified: $full_image_name"
    else
        error "✗ Versioned image not found: $full_image_name"
        log "Available images:"
        docker images "$verify_image_name" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
        exit 1
    fi

    # 创建latest标签链接
    create_latest_link "$VERSION"

    # 显示详细的镜像信息
    log "Built images summary:"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"

    # 显示镜像层信息
    log "Image layers information:"
    docker history "$full_image_name" --format "table {{.CreatedBy}}\t{{.Size}}" | head -10
}

# 测试镜像
test_image() {
    log "Testing Docker image..."
    
    local full_image_name="$IMAGE_NAME:$VERSION"
    
    # 测试帮助命令
    if docker run --rm "$full_image_name" --help >/dev/null 2>&1; then
        success "Image test passed"
    else
        warning "Image test failed, but this might be expected for ECS Only testing"
    fi
}

# 保存镜像到本地文件
save_image_to_file() {
    log "Saving image to local file for ECS Only mode..."

    # 根据交互模式生成镜像名称和文件名
    local full_image_name
    local image_file
    local latest_file

    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        # 多页面交互模式
        full_image_name="$IMAGE_NAME-multi:$VERSION"
        image_file="$IMAGES_DIR/logiccore_sdc-generator-multi_${VERSION}.tar"
        latest_file="$IMAGES_DIR/logiccore_sdc-generator_latest.tar"  # latest文件名保持标准格式
    else
        # 单页面交互模式
        full_image_name="$IMAGE_NAME:$VERSION"
        image_file="$IMAGES_DIR/logiccore_sdc-generator_${VERSION}.tar"
        latest_file="$IMAGES_DIR/logiccore_sdc-generator_latest.tar"
    fi

    log "Image save details:"
    log "  - Interaction mode: $INTERACTION_MODE"
    log "  - Source image: $full_image_name"
    log "  - Target file: $image_file"
    log "  - Latest file: $latest_file"
    log "  - Target directory: $IMAGES_DIR"

    # 再次验证目标目录存在
    if [[ ! -d "$IMAGES_DIR" ]]; then
        error "Target directory does not exist: $IMAGES_DIR"
        log "Attempting to create directory..."
        if mkdir -p "$IMAGES_DIR"; then
            success "Directory created: $IMAGES_DIR"
        else
            error "Failed to create directory: $IMAGES_DIR"
            exit 1
        fi
    fi

    # 检查镜像是否存在
    log "Checking if Docker image exists..."
    if docker images "$full_image_name" --format "{{.Repository}}:{{.Tag}}" | grep -q "$full_image_name"; then
        success "Docker image found: $full_image_name"
    else
        error "Docker image not found: $full_image_name"
        log "Available images:"
        docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
        exit 1
    fi

    # 保存版本标签镜像
    log "Saving versioned image: $full_image_name -> $image_file"
    if docker save "$full_image_name" -o "$image_file"; then
        success "Versioned image saved successfully"

        # 验证文件是否真的创建了
        if [[ -f "$image_file" ]]; then
            local file_size=$(get_file_size "$image_file")
            success "✓ File verified: $image_file (size: $file_size bytes)"
        else
            error "✗ File not found after save: $image_file"
            exit 1
        fi
    else
        error "Failed to save versioned image"
        exit 1
    fi

    # 保存latest标签镜像
    log "Saving latest image: $IMAGE_NAME:latest -> $latest_file"
    if docker save "$IMAGE_NAME:latest" -o "$latest_file"; then
        success "Latest image saved successfully"

        # 验证文件是否真的创建了
        if [[ -f "$latest_file" ]]; then
            local file_size=$(get_file_size "$latest_file")
            success "✓ File verified: $latest_file (size: $file_size bytes)"
        else
            error "✗ File not found after save: $latest_file"
            exit 1
        fi
    else
        error "Failed to save latest image"
        exit 1
    fi

    # 显示详细的文件信息
    log "Saved image files summary:"
    if command -v ls >/dev/null 2>&1; then
        ls -lh "$image_file" "$latest_file" 2>/dev/null || {
            log "Using alternative file listing..."
            echo "Files in $IMAGES_DIR:"
            find "$IMAGES_DIR" -name "*.tar" -exec ls -lh {} \; 2>/dev/null || echo "No .tar files found"
        }
    fi

    # 显示目录内容
    log "Contents of images directory:"
    ls -la "$IMAGES_DIR" 2>/dev/null || echo "Directory listing failed"
}

# 验证保存的镜像
verify_saved_image() {
    log "Verifying saved image..."

    # 根据交互模式确定文件名
    local image_file
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        image_file="$IMAGES_DIR/logiccore_sdc-generator-multi_${VERSION}.tar"
    else
        image_file="$IMAGES_DIR/logiccore_sdc-generator_${VERSION}.tar"
    fi
    
    if [[ -f "$image_file" ]]; then
        local file_size=$(get_file_size "$image_file")
        success "Image file verified: $image_file (size: $file_size bytes)"
        
        # 测试加载镜像
        log "Testing image load..."
        if docker load -i "$image_file" >/dev/null 2>&1; then
            success "Image can be loaded successfully"
        else
            warning "Image load test failed"
        fi
    else
        error "Image file not found: $image_file"
        exit 1
    fi
}

# 清理临时镜像（可选）
cleanup_temp_images() {
    if [[ "$CLEANUP_TEMP" == "true" ]]; then
        log "Cleaning up temporary images..."
        
        docker rmi "$IMAGE_NAME:$VERSION" || true
        docker rmi "$IMAGE_NAME:latest" || true
        
        success "Temporary images cleaned up"
    else
        log "Keeping temporary images for testing (set CLEANUP_TEMP=true to remove)"
    fi
}

# 显示使用说明
show_usage() {
    cat << EOF
Usage: $0 <VERSION> <MODE> [OPTIONS]
       $0 --rollback <VERSION>
       $0 --list
       $0 --help

Build SDC Generator Docker image for ECS Only Windows testing environment

Commands:
  <VERSION> <MODE>    Build image with specified version and interaction mode (REQUIRED)
  --rollback <VERSION> Rollback latest tag to specified version
  --list              List all available versions
  --help, -h          Show this help message

Arguments:
  VERSION             Image version tag in format vX.Y.Z (e.g., v1.0.0, v2.1.3)
  MODE                Interaction mode: 'single' (单页面交互) or 'multi' (多页面交互)

Environment Variables:
  CLEANUP_TEMP        Set to 'true' to remove temporary images after saving

Configuration:
  - Config File: app/backend/.env.local
  - Tool Scripts: /home/master/stone/proj/onlineEDA\test_data\tools_collection\sdcgen
  - Image Storage: /home/master/stone/proj/onlineEDA\docker\images\sdc

Examples:
  # Build single-page interaction version
  $0 v1.0.0 single             # Build standard version: logiccore/sdc-generator:latest
  $0 v1.2.3 single             # Build standard version: logiccore/sdc-generator:v1.2.3

  # Build multi-page interaction version
  $0 v1.0.0 multi              # Build multi version: logiccore/sdc-generator:latest + logiccore/sdc-generator-multi:v1.0.0
  $0 v1.2.3 multi              # Build multi version: logiccore/sdc-generator:latest + logiccore/sdc-generator-multi:v1.2.3

  # Version management
  $0 --list                    # List all available versions
  $0 --rollback v1.0.0         # Rollback latest to v1.0.0

  # With cleanup
  CLEANUP_TEMP=true $0 v1.0.0

Output:
  - Docker image: logiccore/sdc-generator-multi:VERSION (versioned)
  - Docker image: logiccore/sdc-generator-multi:latest (linked to latest version)
  - Saved file: {IMAGES_DIR}/logiccore_sdc-generator-multi_VERSION.tar
  - Saved file: {IMAGES_DIR}/logiccore_sdc-generator-multi_latest.tar

Version Management:
  - All versions are preserved (no automatic deletion)
  - Latest tag always points to the most recently built version
  - Use --rollback to change which version latest points to
  - Both Windows and Linux Docker tag linking supported

EOF
}

# 主函数
main() {
    # 处理命令行参数
    case "$1" in
        "--help"|"-h")
            show_usage
            exit 0
            ;;
        "--list")
            echo "========================================"
            echo "SDC Generator Available Versions"
            echo "========================================"
            list_versions
            exit 0
            ;;
        "--rollback")
            if [[ -z "$2" ]]; then
                error "Rollback version is required!"
                echo ""
                show_usage
                exit 1
            fi

            validate_version "$2"

            echo "========================================"
            echo "SDC Generator Version Rollback"
            echo "========================================"

            log "Rollback configuration:"
            log "  - Target version: $2"
            log "  - Image name: $IMAGE_NAME:$2"
            log "  - Storage directory: $IMAGES_DIR"

            echo "========================================"

            # 执行回滚
            if rollback_to_version "$2"; then
                success "Rollback completed successfully!"
                echo ""
                log "Current latest version:"
                docker images "$IMAGE_NAME:latest" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
            else
                error "Rollback failed!"
                exit 1
            fi
            exit 0
            ;;
        "")
            error "Version and interaction mode parameters are required!"
            echo ""
            show_usage
            exit 1
            ;;
        *)
            # 正常构建流程
            VERSION="$1"
            INTERACTION_MODE="$2"

            # 验证参数
            if [[ -z "$VERSION" ]]; then
                error "Version parameter is required!"
                echo ""
                show_usage
                exit 1
            fi

            if [[ -z "$INTERACTION_MODE" ]]; then
                error "Interaction mode parameter is required!"
                echo ""
                show_usage
                exit 1
            fi

            validate_version "$VERSION"
            validate_interaction_mode "$INTERACTION_MODE"
            ;;
    esac

    echo "========================================"
    echo "SDC Generator Docker Image Build"
    echo "ECS Only Windows Testing Environment"
    echo "========================================"

    log "Build configuration summary:"
    log "  - Version: $VERSION"
    log "  - Interaction mode: $INTERACTION_MODE"
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        log "  - Version image: $IMAGE_NAME-multi:$VERSION"
        log "  - Latest link: $IMAGE_NAME:latest -> $IMAGE_NAME-multi:$VERSION"
    else
        log "  - Version image: $IMAGE_NAME:$VERSION"
        log "  - Latest link: $IMAGE_NAME:latest -> $IMAGE_NAME:$VERSION"
    fi
    log "  - Target environment: ECS Only Windows Testing"
    log "  - Storage directory: $IMAGES_DIR"
    log "  - Project root: $PROJECT_ROOT"
    log "  - Dockerfile: $DOCKERFILE_PATH"

    echo "========================================"

    # 执行所有步骤，每步都有详细输出
    log "Step 1/8: Checking required files..."
    check_files
    echo ""

    log "Step 2/8: Checking Docker environment..."
    check_docker
    echo ""

    log "Step 3/8: Creating storage directories..."
    create_storage_dirs
    echo ""

    log "Step 4/8: Building Docker image..."
    build_image
    echo ""

    log "Step 5/8: Testing built image..."
    test_image
    echo ""

    log "Step 6/8: Saving image to local files..."
    save_image_to_file
    echo ""

    log "Step 7/8: Verifying saved images..."
    verify_saved_image
    echo ""

    log "Step 8/8: Cleaning up temporary images..."
    cleanup_temp_images
    echo ""

    echo "========================================"
    success "SDC Generator Docker image build completed successfully!"
    echo "========================================"

    # 根据交互模式确定文件名
    local version_file
    local latest_file
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        version_file="$IMAGES_DIR/logiccore_sdc-generator-multi_${VERSION}.tar"
        latest_file="$IMAGES_DIR/logiccore_sdc-generator_latest.tar"
    else
        version_file="$IMAGES_DIR/logiccore_sdc-generator_${VERSION}.tar"
        latest_file="$IMAGES_DIR/logiccore_sdc-generator_latest.tar"
    fi

    log "Build results summary:"
    echo "  ✓ Docker image built: $IMAGE_NAME:$VERSION"
    echo "  ✓ Latest link created: $IMAGE_NAME:latest -> $IMAGE_NAME:$VERSION"
    echo "  ✓ Version image saved to: $version_file"
    echo "  ✓ Latest image saved to: $latest_file"
    echo "  ✓ Storage directory: $IMAGES_DIR"

    # 最终验证
    log "Final verification:"
    if [[ -f "$version_file" ]]; then
        local file_size=$(get_file_size "$version_file")
        success "✓ Version image file exists (size: $file_size bytes)"
    else
        error "✗ Version image file missing!"
    fi

    if [[ -f "$latest_file" ]]; then
        local file_size=$(get_file_size "$latest_file")
        success "✓ Latest image file exists (size: $file_size bytes)"
    else
        error "✗ Latest image file missing!"
    fi

    echo ""
    log "Version management commands:"
    echo "  - List versions: $0 --list"
    echo "  - Rollback: $0 --rollback vX.Y.Z"
    echo ""
    log "Next steps for ECS Only Windows testing:"
    echo "  1. Verify files in: $IMAGES_DIR"
    echo "  2. Database Tool table uses: logiccore/sdc-generator:latest (no update needed)"
    echo "  3. Start backend service: cd app/backend && DEPLOYMENT_MODE=ecs_only npm run dev"
    if [[ "$INTERACTION_MODE" == "multi" ]]; then
        echo "  4. Test multi-page interaction SDC tool through web interface"
    else
        echo "  4. Test single-page interaction SDC tool through web interface"
    fi
    echo "  5. Monitor task execution in: /home/master/stone/proj/onlineEDA/jobs/"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check directory: ls -la $IMAGES_DIR"
    echo "  - Verify Docker images: docker images $IMAGE_NAME"
    echo "  - Test image load: docker load -i $IMAGES_DIR/logiccore_sdc-generator_latest.tar"
}

# 运行主函数
main "$@"
