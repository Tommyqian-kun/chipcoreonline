# 数据库迁移问题详细分析与解决方案

## 🔍 问题分析

### 1. 主要问题类型

#### 1.1 CONCURRENTLY索引问题
**问题描述**：PostgreSQL的`CREATE INDEX CONCURRENTLY`不能在事务中运行
```sql
-- ❌ 错误的写法（在迁移文件中）
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
```

**错误信息**：
```
CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

**原因**：Prisma迁移默认在事务中运行，而`CONCURRENTLY`索引创建需要在事务外执行。

#### 1.2 外键约束冲突
**问题描述**：修改表结构时违反现有外键约束
```sql
-- ❌ 可能导致问题的操作
ALTER TABLE "Subscription" ALTER COLUMN "orderId" DROP NOT NULL;
```

**错误信息**：
```
Foreign key constraint violated: `Subscription_userId_fkey (index)`
```

**原因**：现有数据不符合新的约束条件，或者删除顺序不正确。

#### 1.3 DATABASE_URL环境变量加载失败
**问题描述**：Prisma无法正确加载DATABASE_URL环境变量
```bash
npx prisma db push
# 输出: Environment variables loaded from .env
# 但实际上DATABASE_URL没有被正确加载，导致连接失败
```

**错误信息**：
```
Error: connect ETIMEDOUT
Error: Environment variable not found: DATABASE_URL
```

**原因**：
1. **环境变量优先级问题**：系统环境变量 > .env.local > .env
2. **文件编码问题**：.env文件可能存在BOM或特殊字符
3. **PowerShell语法问题**：临时环境变量设置语法不正确
4. **.env vs .env.local优先级**：项目使用.env.local但Prisma默认加载.env

#### 1.4 数据库重置导致的数据丢失
**问题描述**：迁移失败时Prisma建议重置数据库
```
? We need to reset the PostgreSQL database "logiccore" at "localhost:5432"
Do you want to continue? All data will be lost.
```

### 2. 根本原因分析

#### 2.1 开发环境特点
- **频繁的模型变更**：开发阶段经常修改数据库模型
- **测试数据可接受丢失**：开发环境的数据不是生产数据
- **快速迭代需求**：需要快速验证新功能

#### 2.2 Prisma迁移机制
- **自动生成迁移**：基于schema.prisma的变更自动生成SQL
- **事务性执行**：默认在事务中执行迁移，确保原子性
- **状态跟踪**：通过`_prisma_migrations`表跟踪迁移状态

## 🛠️ 解决方案

### 1. 立即解决方案

#### 1.1 修复CONCURRENTLY索引问题
```sql
-- ✅ 正确的写法（移除CONCURRENTLY）
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
```

#### 1.2 DATABASE_URL环境变量问题解决
```powershell
# 方案1：临时环境变量设置（推荐用于迁移）
$env:DATABASE_URL="postgresql://postgres:password@localhost:5432/chipcore_dev"
npx prisma db push

# 方案2：文件同步方案
copy .env .env.backup
copy .env.local .env
npx prisma db push
copy .env.backup .env

# 方案3：使用dotenv-cli
npm install -g dotenv-cli
dotenv -e .env.local -- npx prisma db push
```

#### 1.3 安全的数据库重置流程
```bash
# 1. 备份重要数据（如果有）
pg_dump -h localhost -U postgres -d logiccore > backup.sql

# 2. 重置数据库
npx prisma migrate reset --force

# 3. 重新初始化数据
npx tsx scripts/update-plans-ecs-only.ts
```

### 2. 长期解决方案

#### 2.1 开发环境迁移策略
```bash
# 开发环境：使用db push代替migrate dev
npx prisma db push

# 优点：
# - 不生成迁移文件
# - 直接同步schema到数据库
# - 适合快速原型开发
```

#### 2.2 生产环境迁移策略
```bash
# 生产环境：使用正式迁移
npx prisma migrate deploy

# 特点：
# - 使用经过测试的迁移文件
# - 确保数据安全
# - 可回滚
```

#### 2.3 混合策略
```bash
# 开发阶段：使用db push
npx prisma db push

# 功能稳定后：生成正式迁移
npx prisma migrate dev --name feature_name

# 清理开发迁移：重置并生成最终迁移
npx prisma migrate reset
npx prisma migrate dev --name final_schema
```

### 3. 最佳实践

#### 3.1 迁移文件编写规范
```sql
-- ✅ 好的迁移文件
-- 1. 添加注释说明
-- 2. 使用IF NOT EXISTS避免重复
-- 3. 避免CONCURRENTLY关键字
-- 4. 考虑数据兼容性

-- 创建索引
CREATE INDEX IF NOT EXISTS "idx_table_column" ON "Table"("column");

-- 修改列（考虑现有数据）
ALTER TABLE "Table" ALTER COLUMN "column" DROP NOT NULL;
```

#### 3.2 数据库模型设计原则
```prisma
// ✅ 好的模型设计
model Subscription {
  id      String  @id @default(cuid())
  userId  String  @unique
  planId  String
  orderId String? @unique  // 可选字段，避免强制约束
  
  // 关系定义
  user  User   @relation(fields: [userId], references: [id])
  plan  Plan   @relation(fields: [planId], references: [id])
  order Order? @relation(fields: [orderId], references: [id])
  
  @@index([status, endDate])  // 复合索引
}
```

## 🚀 推荐的工作流程

### 1. 开发阶段
```bash
# 1. 修改schema.prisma
# 2. 同步到数据库
npx prisma db push

# 3. 重新生成客户端
npx prisma generate

# 4. 测试功能
npm run test
```

### 2. 功能完成阶段
```bash
# 1. 生成正式迁移
npx prisma migrate dev --name descriptive_name

# 2. 检查迁移文件
cat prisma/migrations/*/migration.sql

# 3. 测试迁移
npx prisma migrate reset
npx prisma migrate dev
```

### 3. 生产部署阶段
```bash
# 1. 备份生产数据库
pg_dump production_db > backup.sql

# 2. 在测试环境验证迁移
npx prisma migrate deploy

# 3. 部署到生产环境
npx prisma migrate deploy
```

## 🔧 故障排除

### 1. 迁移失败时的处理
```bash
# 1. 查看迁移状态
npx prisma migrate status

# 2. 标记迁移为已应用（如果手动修复了）
npx prisma migrate resolve --applied "migration_name"

# 3. 重置开发数据库（开发环境）
npx prisma migrate reset --force
```

### 2. 索引创建失败
```sql
-- 手动创建索引（在数据库中直接执行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_name" ON "Table"("column");

-- 然后标记迁移为已应用
-- npx prisma migrate resolve --applied "migration_name"
```

### 3. 外键约束问题
```sql
-- 1. 临时禁用外键检查
SET foreign_key_checks = 0;

-- 2. 执行修改
ALTER TABLE "Table" MODIFY COLUMN "column" ...;

-- 3. 重新启用外键检查
SET foreign_key_checks = 1;
```

## 📋 检查清单

### 迁移前检查
- [ ] 备份重要数据
- [ ] 检查迁移文件语法
- [ ] 确认没有CONCURRENTLY关键字
- [ ] 验证外键约束兼容性
- [ ] 测试回滚方案

### 迁移后验证
- [ ] 检查表结构正确性
- [ ] 验证索引创建成功
- [ ] 测试应用功能正常
- [ ] 确认数据完整性
- [ ] 更新相关文档
