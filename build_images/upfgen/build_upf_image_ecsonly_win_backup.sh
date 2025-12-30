#!/bin/bash

# UPF工具Docker镜像构建脚本 (ECS Only Windows测试环境)
# 专门用于Windows环境下的ECS Only部署模式测试
# 配置文件: app/backend/.env.local
# 工具脚本路径: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\upfgen
# 镜像存储路径: E:\stone\work\webapp\augment\LogicCore\docker\images\upf

set -e  # 遇到错误立即退出

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"  # 从build_images/upfgen回到项目根目录
IMAGE_NAME="logiccore/upf-generator"
VERSION="${1:-latest}"
DOCKERFILE_PATH="$SCRIPT_DIR/docker_upf_generator_ecsonly_win_Dockerfile"

# 🔥 关键新增：多页面支持参数
PAGE_MODE="${2:-single}"  # 默认为single，可以是single或multi

# 根据页面模式设置镜像名称
setup_image_names() {
    if [[ "$PAGE_MODE" == "multi" ]]; then
        # 多页面模式：生成带multi后缀的镜像，然后link为标准名称
        BUILD_IMAGE_NAME="logiccore/upf-generator-multi"
        FINAL_IMAGE_NAME="logiccore/upf-generator"
        log "Multi-page mode: Building $BUILD_IMAGE_NAME, linking to $FINAL_IMAGE_NAME"
    else
        # 单页面模式：直接使用标准名称
        BUILD_IMAGE_NAME="logiccore/upf-generator"
        FINAL_IMAGE_NAME="logiccore/upf-generator"
        log "Single-page mode: Building $BUILD_IMAGE_NAME"
    fi
}

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

# Windows测试环境路径 - 自动检测WSL环境
if [[ -n "${WSL_DISTRO_NAME:-}" ]] || [[ "$(uname -r)" == *microsoft* ]] || [[ "$(uname -r)" == *WSL* ]]; then
    # WSL环境：使用/mnt/e路径
    DOCKER_STORAGE_DIR="/mnt/e/stone/work/webapp/augment/LogicCore/docker"
    log "Detected WSL environment, using WSL path format"
else
    # 原生Windows环境：使用E:/路径
    DOCKER_STORAGE_DIR="E:/stone/work/webapp/augment/LogicCore/docker"
    log "Detected native Windows environment, using Windows path format"
fi
IMAGES_DIR="$DOCKER_STORAGE_DIR/images/upf"

# 🔥 关键新增：多页面镜像链接函数
create_multi_page_link() {
    local source_image="$BUILD_IMAGE_NAME:$VERSION"
    local target_latest="$FINAL_IMAGE_NAME:latest"

    log "Creating multi-page image link..."
    log "  Source: $source_image"
    log "  Target: $target_latest (only latest, no version tag)"

    # 显示当前所有镜像用于调试
    log "Current Docker images before linking:"
    docker images "$BUILD_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}"

    # 检查源镜像是否存在
    if ! docker images "$source_image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$source_image"; then
        error "Source image not found: $source_image"
        log "Available images:"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}"
        return 1
    fi

    success "✓ Source image found: $source_image"

    # 删除现有的latest标签（如果存在）
    if docker images "$target_latest" --format "{{.Repository}}:{{.Tag}}" | grep -q "$target_latest"; then
        log "Removing existing latest tag..."
        docker rmi "$target_latest" >/dev/null 2>&1 || true
    fi

    # 创建latest标签链接（多页面模式只创建latest，不创建版本标签）
    log "Creating latest tag: $source_image -> $target_latest"
    if docker tag "$source_image" "$target_latest" 2>&1; then
        success "✓ Latest link created: $BUILD_IMAGE_NAME:$VERSION -> $FINAL_IMAGE_NAME:latest"
    else
        error "✗ Failed to create latest link"
        log "Docker tag command failed for latest link"
        return 1
    fi

    # 验证latest链接是否成功创建
    log "Verifying created latest link..."

    if ! docker images "$target_latest" --format "{{.Repository}}:{{.Tag}}" | grep -q "$target_latest"; then
        error "Latest image not found after linking: $target_latest"
        return 1
    fi

    # 验证镜像ID是否相同
    local source_id=$(docker images "$source_image" --format "{{.ID}}")
    local latest_id=$(docker images "$target_latest" --format "{{.ID}}")

    if [[ "$source_id" == "$latest_id" ]]; then
        success "✓ Latest link verified: same ID ($source_id)"
        log "Final images after linking:"
        docker images "$FINAL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}"
    else
        error "✗ Link verification failed: different IDs"
        log "  Source ID: $source_id"
        log "  Latest ID: $latest_id"
        return 1
    fi
}

# 跨平台Docker镜像标签链接函数（保持兼容性）
create_latest_link() {
    local source_version="$1"
    local source_image="$FINAL_IMAGE_NAME:$source_version"
    local target_image="$FINAL_IMAGE_NAME:latest"

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
    local target_image="$FINAL_IMAGE_NAME:$target_version"

    log "Rolling back to version: $target_version"

    # 检查目标版本是否存在
    if ! docker images "$target_image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$target_image"; then
        error "Target version not found: $target_image"
        log "Available versions:"
        docker images "$FINAL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
        return 1
    fi

    # 创建latest链接到目标版本
    create_latest_link "$target_version"

    if [[ $? -eq 0 ]]; then
        success "✓ Successfully rolled back to version: $target_version"

        # 更新latest tar文件
        local latest_file="$IMAGES_DIR/logiccore_upf-generator_latest.tar"
        log "Updating latest tar file..."

        if docker save "$FINAL_IMAGE_NAME:latest" -o "$latest_file"; then
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
    log "Available UPF Generator versions:"
    docker images "$FINAL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"

    # 如果是多页面模式，也显示构建镜像
    if [[ "$PAGE_MODE" == "multi" ]]; then
        log "Available UPF Generator Multi-page build versions:"
        docker images "$BUILD_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
    fi
}

# 检查必需的文件
check_files() {
    log "Checking required files for ECS Only Windows testing..."
    
    local required_files=(
        "$DOCKERFILE_PATH"
        "$PROJECT_ROOT/build_images/upfgen/docker_upf_entrypoint_ecsonly_win.sh"
        "$PROJECT_ROOT/test_data/tools_collection/upfgen/upfgen.py"
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
    
    # 创建upf子目录
    log "Creating UPF images subdirectory..."
    if mkdir -p "$IMAGES_DIR"; then
        success "UPF images directory created: $IMAGES_DIR"
    else
        error "Failed to create UPF images directory: $IMAGES_DIR"
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

    local full_image_name="$BUILD_IMAGE_NAME:$VERSION"

    log "Build configuration:"
    log "  - Page mode: $PAGE_MODE"
    log "  - Build image name: $full_image_name"
    log "  - Final image name: $FINAL_IMAGE_NAME:$VERSION"
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
        "$PROJECT_ROOT/test_data/tools_collection/upfgen/upfgen.py"
        "$PROJECT_ROOT/build_images/upfgen/docker_upf_entrypoint_ecsonly_win.sh"
    )
    
    for file in "${key_files[@]}"; do
        if [[ -f "$file" ]]; then
            success "✓ Source file found: $(basename "$file")"
        else
            error "✗ Source file missing: $file"
            exit 1
        fi
    done
    
    # 开始构建（构建到BUILD_IMAGE_NAME）
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

    # 验证构建镜像是否创建
    log "Verifying built image..."
    if docker images "$BUILD_IMAGE_NAME" --format "{{.Repository}}:{{.Tag}}" | grep -q "$full_image_name"; then
        success "✓ Build image verified: $full_image_name"
    else
        error "✗ Build image not found: $full_image_name"
        exit 1
    fi

    # 根据页面模式创建最终镜像链接
    if [[ "$PAGE_MODE" == "multi" ]]; then
        # 多页面模式：创建链接到标准名称
        log "Creating multi-page image links..."
        if create_multi_page_link; then
            success "✓ Multi-page image links created successfully"
        else
            error "✗ Failed to create multi-page image links"
            exit 1
        fi
    else
        # 单页面模式：创建latest标签
        log "Creating latest link for single-page mode..."
        if create_latest_link "$VERSION"; then
            success "✓ Latest link created successfully"
        else
            error "✗ Failed to create latest link"
            exit 1
        fi
    fi

    # 显示详细的镜像信息
    log "Built images summary:"
    docker images "$BUILD_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
    if [[ "$PAGE_MODE" == "multi" ]]; then
        log "Final images summary:"
        docker images "$FINAL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
    fi

    # 显示镜像层信息
    log "Image layers information:"
    docker history "$full_image_name" --format "table {{.CreatedBy}}\t{{.Size}}" | head -10
}

# 测试镜像
test_image() {
    log "Testing Docker image..."

    local test_image_name="$FINAL_IMAGE_NAME:$VERSION"

    # 测试帮助命令
    if docker run --rm "$test_image_name" --help >/dev/null 2>&1; then
        success "Image test passed"
    else
        warning "Image test failed, but this might be expected for ECS Only testing"
    fi
}

# 保存镜像到本地文件
save_image_to_file() {
    log "Saving image to local file for ECS Only mode..."

    local version_image_name="$FINAL_IMAGE_NAME:$VERSION"
    local latest_image_name="$FINAL_IMAGE_NAME:latest"
    local image_file="$IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar"
    local latest_file="$IMAGES_DIR/logiccore_upf-generator_latest.tar"

    log "Image save details:"
    log "  - Page mode: $PAGE_MODE"
    log "  - Version source image: $version_image_name"
    log "  - Latest source image: $latest_image_name"
    log "  - Version target file: $image_file"
    log "  - Latest target file: $latest_file"
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
    log "Checking if Docker images exist..."
    if docker images "$version_image_name" --format "{{.Repository}}:{{.Tag}}" | grep -q "$version_image_name"; then
        success "Version Docker image found: $version_image_name"
    else
        error "Version Docker image not found: $version_image_name"
        log "Available images:"
        docker images "$FINAL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
        exit 1
    fi

    if docker images "$latest_image_name" --format "{{.Repository}}:{{.Tag}}" | grep -q "$latest_image_name"; then
        success "Latest Docker image found: $latest_image_name"
    else
        error "Latest Docker image not found: $latest_image_name"
        exit 1
    fi

    # 保存版本标签镜像
    log "Saving versioned image: $version_image_name -> $image_file"
    if docker save "$version_image_name" -o "$image_file"; then
        success "Versioned image saved successfully"
        
        # 验证文件是否真的创建了
        if [[ -f "$image_file" ]]; then
            local file_size=$(stat -c%s "$image_file" 2>/dev/null || stat -f%z "$image_file" 2>/dev/null || wc -c < "$image_file" 2>/dev/null || echo "unknown")
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
    log "Saving latest image: $latest_image_name -> $latest_file"
    if docker save "$latest_image_name" -o "$latest_file"; then
        success "Latest image saved successfully"
        
        # 验证文件是否真的创建了
        if [[ -f "$latest_file" ]]; then
            local file_size=$(stat -c%s "$latest_file" 2>/dev/null || stat -f%z "$latest_file" 2>/dev/null || wc -c < "$latest_file" 2>/dev/null || echo "unknown")
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
    
    local image_file="$IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar"
    
    if [[ -f "$image_file" ]]; then
        local file_size=$(stat -c%s "$image_file" 2>/dev/null || stat -f%z "$image_file" 2>/dev/null || echo "unknown")
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

        # 清理最终镜像
        docker rmi "$FINAL_IMAGE_NAME:$VERSION" || true
        docker rmi "$FINAL_IMAGE_NAME:latest" || true

        # 如果是多页面模式，也清理构建镜像
        if [[ "$PAGE_MODE" == "multi" ]]; then
            docker rmi "$BUILD_IMAGE_NAME:$VERSION" || true
        fi

        success "Temporary images cleaned up"
    else
        log "Keeping temporary images for testing (set CLEANUP_TEMP=true to remove)"
    fi
}

# 显示使用说明
show_usage() {
    cat << EOF
Usage: $0 [VERSION] [PAGE_MODE]
       $0 --rollback <VERSION>
       $0 --list
       $0 --help

Build UPF Generator Docker image for ECS Only Windows testing environment

Commands:
  [VERSION] [PAGE_MODE]   Build image with specified version and page mode
  --rollback <VERSION>    Rollback latest tag to specified version
  --list                  List all available versions
  --help, -h              Show this help message

Arguments:
  VERSION                 Image version tag (default: latest)
  PAGE_MODE              Page mode: single or multi (default: single)

Environment Variables:
  CLEANUP_TEMP           Set to 'true' to remove temporary images after saving

Configuration:
  - Config File: app/backend/.env.local
  - Tool Scripts: E:\stone\work\webapp\augment\LogicCore\test_data\tools_collection\upfgen
  - Image Storage: E:\stone\work\webapp\augment\LogicCore\docker\images\upf

Examples:
  # Single-page mode (default)
  $0                           # Build latest single-page version
  $0 v1.0.0                    # Build v1.0.0 single-page version
  $0 v1.0.0 single             # Build v1.0.0 single-page version (explicit)

  # Multi-page mode
  $0 latest multi              # Build latest multi-page version, link to logiccore/upf-generator:latest
  $0 v1.0.0 multi              # Build v1.0.0 multi-page version, link to logiccore/upf-generator:v1.0.0

  # Version management
  $0 --list                    # List all available versions
  $0 --rollback v1.0.0         # Rollback latest to v1.0.0

  # With cleanup
  CLEANUP_TEMP=true $0 v1.0.0 multi

Output:
  Single-page mode:
    - Docker image: logiccore/upf-generator:VERSION
    - Saved file: {IMAGES_DIR}/logiccore_upf-generator_VERSION.tar

  Multi-page mode:
    - Build image: logiccore/upf-generator-multi:VERSION
    - Final image: logiccore/upf-generator:VERSION (linked)
    - Final image: logiccore/upf-generator:latest (linked)
    - Saved file: {IMAGES_DIR}/logiccore_upf-generator_VERSION.tar
    - Saved file: {IMAGES_DIR}/logiccore_upf-generator_latest.tar

Multi-page Mode Benefits:
  - Generates multi-page UPF tool image
  - Links to standard name (logiccore/upf-generator:latest) for database compatibility
  - No database changes required - uses existing logiccore_upf-generator_latest name

EOF
}

# 版本验证和处理
validate_version() {
    local version="$1"

    # 如果是latest，直接通过
    if [[ "$version" == "latest" ]]; then
        success "Version validated: $version"
        return 0
    fi

    # 检查版本格式是否为 vX.Y.Z
    if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        error "Invalid version format: $version"
        error "Version must be 'latest' or in format: vX.Y.Z (e.g., v1.0.0, v2.1.3)"
        echo ""
        show_usage
        exit 1
    fi

    success "Version format validated: $version"
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
            echo "UPF Generator Available Versions"
            echo "========================================"
            setup_image_names  # 需要设置镜像名称以正确显示
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
            setup_image_names  # 需要设置镜像名称

            echo "========================================"
            echo "UPF Generator Version Rollback"
            echo "========================================"

            log "Rollback configuration:"
            log "  - Target version: $2"
            log "  - Image name: $FINAL_IMAGE_NAME:$2"
            log "  - Storage directory: $IMAGES_DIR"

            echo "========================================"

            # 执行回滚
            if rollback_to_version "$2"; then
                success "Rollback completed successfully!"
                echo ""
                log "Current latest version:"
                docker images "$FINAL_IMAGE_NAME:latest" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
            else
                error "Rollback failed!"
                exit 1
            fi
            exit 0
            ;;
        "")
            error "Version parameter is required!"
            echo ""
            show_usage
            exit 1
            ;;
        *)
            # 正常构建流程 - VERSION和PAGE_MODE已在文件开头设置
            # VERSION="$1" (已设置)
            # PAGE_MODE="$2" (已设置)
            validate_version "$VERSION"

            # 验证页面模式
            if [[ "$PAGE_MODE" != "single" && "$PAGE_MODE" != "multi" ]]; then
                error "Invalid page mode: $PAGE_MODE"
                error "Page mode must be 'single' or 'multi'"
                show_usage
                exit 1
            fi

            # 设置镜像名称
            setup_image_names
            ;;
    esac
    
    echo "========================================"
    echo "UPF Generator Docker Image Build"
    echo "ECS Only Windows Testing Environment"
    echo "========================================"

    log "Build configuration summary:"
    log "  - Version: $VERSION"
    log "  - Page mode: $PAGE_MODE"
    log "  - Build image name: $BUILD_IMAGE_NAME:$VERSION"
    log "  - Final image name: $FINAL_IMAGE_NAME:$VERSION"
    if [[ "$PAGE_MODE" == "multi" ]]; then
        log "  - Multi-page linking: $BUILD_IMAGE_NAME:$VERSION -> $FINAL_IMAGE_NAME:$VERSION"
        log "  - Latest linking: $BUILD_IMAGE_NAME:$VERSION -> $FINAL_IMAGE_NAME:latest"
    else
        log "  - Latest link: $FINAL_IMAGE_NAME:latest -> $FINAL_IMAGE_NAME:$VERSION"
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
    success "UPF Generator Docker image build completed successfully!"
    echo "========================================"

    log "Build results summary:"
    if [[ "$PAGE_MODE" == "multi" ]]; then
        echo "  ✓ Multi-page Docker image built: $BUILD_IMAGE_NAME:$VERSION"
        echo "  ✓ Final image linked: $FINAL_IMAGE_NAME:$VERSION"
        echo "  ✓ Latest link created: $FINAL_IMAGE_NAME:latest -> $BUILD_IMAGE_NAME:$VERSION"
    else
        echo "  ✓ Single-page Docker image built: $FINAL_IMAGE_NAME:$VERSION"
        echo "  ✓ Latest link created: $FINAL_IMAGE_NAME:latest -> $FINAL_IMAGE_NAME:$VERSION"
    fi
    echo "  ✓ Version image saved to: $IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar"
    echo "  ✓ Latest image saved to: $IMAGES_DIR/logiccore_upf-generator_latest.tar"
    echo "  ✓ Storage directory: $IMAGES_DIR"
    
    # 最终验证
    log "Final verification:"
    if [[ -f "$IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar" ]]; then
        local file_size=$(stat -c%s "$IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar" 2>/dev/null || stat -f%z "$IMAGES_DIR/logiccore_upf-generator_${VERSION}.tar" 2>/dev/null || echo "unknown")
        success "✓ Version image file exists (size: $file_size bytes)"
    else
        error "✗ Version image file missing!"
    fi
    
    if [[ -f "$IMAGES_DIR/logiccore_upf-generator_latest.tar" ]]; then
        local file_size=$(stat -c%s "$IMAGES_DIR/logiccore_upf-generator_latest.tar" 2>/dev/null || stat -f%z "$IMAGES_DIR/logiccore_upf-generator_latest.tar" 2>/dev/null || echo "unknown")
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
    echo "  2. Database Tool table uses: logiccore/upf-generator:latest (no update needed)"
    echo "  3. Start backend service: cd app/backend && DEPLOYMENT_MODE=ecs_only npm run dev"
    echo "  4. Test UPF tool execution through web interface"
    echo "  5. Monitor task execution in: E:/stone/work/webapp/augment/LogicCore/jobs/"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check directory: ls -la $IMAGES_DIR"
    echo "  - Verify Docker images: docker images $FINAL_IMAGE_NAME"
    if [[ "$PAGE_MODE" == "multi" ]]; then
        echo "  - Verify build images: docker images $BUILD_IMAGE_NAME"
    fi
    echo "  - Test image load: docker load -i $IMAGES_DIR/logiccore_upf-generator_latest.tar"
}

# 运行主函数
main "$@"
