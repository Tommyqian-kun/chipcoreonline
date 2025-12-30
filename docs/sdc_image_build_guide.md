# SDC镜像构建脚本使用指南

## 📋 概述

优化后的SDC镜像构建脚本支持完整的版本管理功能，包括：
- 强制版本格式验证（vX.Y.Z）
- 版本镜像保留（不自动删除）
- 自动latest标签链接
- 版本回滚功能
- 跨平台支持（Windows/Linux）

## 🚀 脚本位置

```bash
build_images/sdcgen/build_sdc_image_ecsonly_win.sh
```

## 📝 命令格式

### 1. 构建新版本镜像

```bash
# 基本构建命令
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.0.0

# 带清理的构建
CLEANUP_TEMP=true bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.2.3
```

**版本格式要求**：
- ✅ 正确格式：`v1.0.0`, `v2.1.3`, `v10.5.2`
- ❌ 错误格式：`1.0.0`, `v1.0`, `latest`, `v1.0.0.1`

### 2. 版本管理命令

```bash
# 列出所有可用版本
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh --list

# 版本回滚（将latest指向指定版本）
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh --rollback v1.0.0

# 显示帮助信息
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh --help
```

## 🔧 功能特性

### 版本管理策略

1. **版本镜像保留**：
   - 所有构建的版本都会保留
   - 不会自动删除旧版本
   - 支持多版本并存

2. **Latest标签管理**：
   - 每次构建新版本时，自动将latest指向新版本
   - 支持通过回滚命令改变latest指向
   - 跨平台Docker标签链接支持

3. **文件输出**：
   ```
   docker/images/sdc/
   ├── logiccore_sdc-generator_v1.0.0.tar    # 版本镜像文件
   ├── logiccore_sdc-generator_v1.2.3.tar    # 版本镜像文件
   └── logiccore_sdc-generator_latest.tar     # Latest镜像文件
   ```

### 跨平台支持

脚本自动检测运行环境，支持：
- ✅ Windows (WSL/Git Bash)
- ✅ Linux
- ✅ macOS

Docker标签链接使用标准的`docker tag`命令，确保跨平台兼容性。

## 📊 使用示例

### 示例1：构建第一个版本

```bash
# 构建v1.0.0版本
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.0.0
```

**输出结果**：
- Docker镜像：`logiccore/sdc-generator:v1.0.0`
- Docker镜像：`logiccore/sdc-generator:latest` → `v1.0.0`
- 文件：`logiccore_sdc-generator_v1.0.0.tar`
- 文件：`logiccore_sdc-generator_latest.tar`

### 示例2：构建新版本

```bash
# 构建v1.1.0版本
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.1.0
```

**输出结果**：
- Docker镜像：`logiccore/sdc-generator:v1.0.0` (保留)
- Docker镜像：`logiccore/sdc-generator:v1.1.0` (新建)
- Docker镜像：`logiccore/sdc-generator:latest` → `v1.1.0` (更新)

### 示例3：版本回滚

```bash
# 回滚到v1.0.0
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh --rollback v1.0.0
```

**输出结果**：
- Docker镜像：`logiccore/sdc-generator:latest` → `v1.0.0` (回滚)
- 文件：`logiccore_sdc-generator_latest.tar` (更新为v1.0.0)

### 示例4：查看版本列表

```bash
# 列出所有版本
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh --list
```

**输出示例**：
```
REPOSITORY                TAG       SIZE      CREATED AT                      IMAGE ID
logiccore/sdc-generator   v1.1.0    674MB     2025-08-27 09:00:00 +0800 CST   abc123def456
logiccore/sdc-generator   v1.0.0    674MB     2025-08-27 08:00:00 +0800 CST   def456abc123
logiccore/sdc-generator   latest    674MB     2025-08-27 08:00:00 +0800 CST   def456abc123
```

## 🎯 数据库配置

**重要**：数据库Tool表中的配置保持不变：

```sql
-- 数据库配置始终使用latest标签
dockerImage = "logiccore/sdc-generator:latest"
version = "latest"
```

这样确保：
- ✅ 代码无需修改
- ✅ 版本管理通过Docker标签实现
- ✅ 系统始终使用最新版本（或回滚指定的版本）

## ⚠️ 注意事项

1. **版本格式严格**：必须使用`vX.Y.Z`格式
2. **版本唯一性**：不能重复构建相同版本号
3. **磁盘空间**：旧版本不会自动删除，注意磁盘空间
4. **回滚安全**：回滚前确认目标版本存在

## 🔍 故障排除

### 常见错误

1. **版本格式错误**：
   ```
   [ERROR] Invalid version format: 1.0.0
   [ERROR] Version must be in format: vX.Y.Z
   ```
   **解决**：使用正确格式，如`v1.0.0`

2. **版本已存在**：
   ```
   [ERROR] Image already exists: logiccore/sdc-generator:v1.0.0
   ```
   **解决**：使用新的版本号

3. **回滚版本不存在**：
   ```
   [ERROR] Target version not found: logiccore/sdc-generator:v1.0.0
   ```
   **解决**：使用`--list`查看可用版本

### 验证命令

```bash
# 验证Docker镜像
docker images logiccore/sdc-generator

# 验证文件
ls -la docker/images/sdc/

# 验证latest链接
docker images logiccore/sdc-generator:latest
```

## 🎉 总结

优化后的构建脚本完全满足您的要求：

1. ✅ **强制版本输入**：必须提供vX.Y.Z格式的版本
2. ✅ **版本镜像保留**：所有版本都保留，不删除
3. ✅ **Latest自动链接**：新版本自动成为latest
4. ✅ **跨平台支持**：Windows和Linux都支持
5. ✅ **版本回滚**：支持将latest指向任意历史版本
6. ✅ **原有功能保留**：所有原始功能都保持不变
