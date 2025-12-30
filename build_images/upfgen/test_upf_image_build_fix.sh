#!/bin/bash

# 测试UPF镜像构建修复
# 验证多页面镜像构建和链接是否正确工作

set -e

echo "🔍 测试UPF镜像构建修复"
echo "=========================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 1. 检查当前Docker镜像状态
log "1. 检查当前Docker镜像状态..."
echo ""
echo "UPF Generator镜像:"
docker images logiccore/upf-generator --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}" || true
echo ""
echo "UPF Generator Multi镜像:"
docker images logiccore/upf-generator-multi --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}" || true

# 2. 清理现有镜像（可选）
read -p "是否清理现有UPF镜像？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "清理现有UPF镜像..."
    docker rmi logiccore/upf-generator:latest 2>/dev/null || true
    docker rmi logiccore/upf-generator:v1.0.0 2>/dev/null || true
    docker rmi logiccore/upf-generator-multi:v1.0.0 2>/dev/null || true
    success "镜像清理完成"
fi

# 3. 测试多页面镜像构建
log "2. 测试多页面镜像构建..."
echo ""

if ./build_upf_image_ecsonly_win.sh build multi; then
    success "✓ 多页面镜像构建成功"
else
    error "✗ 多页面镜像构建失败"
    exit 1
fi

# 4. 验证镜像链接
log "3. 验证镜像链接..."
echo ""

# 检查所有预期的镜像是否存在
expected_images=(
    "logiccore/upf-generator-multi:v1.0.0"
    "logiccore/upf-generator:v1.0.0"
    "logiccore/upf-generator:latest"
)

all_images_exist=true

for image in "${expected_images[@]}"; do
    if docker images "$image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$image"; then
        success "✓ 镜像存在: $image"
    else
        error "✗ 镜像缺失: $image"
        all_images_exist=false
    fi
done

if [ "$all_images_exist" = true ]; then
    success "✓ 所有预期镜像都存在"
else
    error "✗ 部分镜像缺失"
    exit 1
fi

# 5. 验证镜像ID一致性
log "4. 验证镜像ID一致性..."
echo ""

source_id=$(docker images "logiccore/upf-generator-multi:v1.0.0" --format "{{.ID}}")
target_id=$(docker images "logiccore/upf-generator:v1.0.0" --format "{{.ID}}")
latest_id=$(docker images "logiccore/upf-generator:latest" --format "{{.ID}}")

log "镜像ID对比:"
log "  Source (multi): $source_id"
log "  Target (v1.0.0): $target_id"
log "  Latest: $latest_id"

if [[ "$source_id" == "$target_id" && "$source_id" == "$latest_id" ]]; then
    success "✓ 所有镜像ID一致，链接正确"
else
    error "✗ 镜像ID不一致，链接可能有问题"
    exit 1
fi

# 6. 测试镜像保存功能
log "5. 测试镜像保存功能..."
echo ""

if ./build_upf_image_ecsonly_win.sh save; then
    success "✓ 镜像保存成功"
else
    error "✗ 镜像保存失败"
    exit 1
fi

# 7. 验证保存的文件
log "6. 验证保存的文件..."
echo ""

expected_files=(
    "../../docker/images/upf/logiccore_upf-generator_v1.0.0.tar"
    "../../docker/images/upf/logiccore_upf-generator_latest.tar"
)

for file in "${expected_files[@]}"; do
    if [[ -f "$file" ]]; then
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "unknown")
        success "✓ 文件存在: $file (大小: $size 字节)"
    else
        error "✗ 文件缺失: $file"
        exit 1
    fi
done

# 8. 最终状态检查
log "7. 最终状态检查..."
echo ""

echo "最终Docker镜像状态:"
docker images logiccore/upf-generator --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"
docker images logiccore/upf-generator-multi --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}\t{{.ID}}"

echo ""
success "🎉 UPF镜像构建修复测试完成！"
echo ""
echo "✅ 修复验证结果:"
echo "  ✓ 多页面镜像构建成功"
echo "  ✓ 镜像链接创建正确"
echo "  ✓ 镜像ID一致性验证通过"
echo "  ✓ 镜像保存功能正常"
echo "  ✓ 所有预期文件都已生成"
echo ""
echo "🚀 现在可以使用修复后的UPF工具镜像了！"
