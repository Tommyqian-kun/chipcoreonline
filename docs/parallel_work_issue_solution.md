# 多用户并行工作数据安全问题分析与解决方案

## 1. 问题概述

经过系统性深入分析，发现当前SDC和UPF工具在多用户并行工作场景下存在严重的数据安全问题。这些问题违反了任务级别数据隔离的基本要求，可能导致数据丢失、数据混乱和功能异常。

## 2. 核心问题分析

### 2.1 数据库设计层面的根本缺陷

#### 问题1：表结构缺乏任务级别隔离
```sql
-- 当前Table表结构
model Table {
  id            String      @id @default(cuid())
  sheetId       String      @map("sheet_id")
  toolType      String      @map("tool_type")  -- 只有工具类型，缺少taskId
  tableName     String      @map("table_name")
  columnsSchema Json        @map("columns_schema")
  -- 缺少 taskId 字段，导致所有任务共享表结构
}
```

**影响**：所有相同工具类型的任务共享表结构定义，无法实现任务级别的表结构隔离。

#### 问题2：TableData表虽有隔离但依赖全局表结构
```sql
-- TableData表有正确的隔离设计
model TableData {
  userId           String   @map("user_id")     -- ✅ 用户隔离
  taskId           String   @map("task_id")     -- ✅ 任务隔离
  tableId          String   @map("table_id")    -- ❌ 依赖全局Table
}
```

**影响**：虽然数据层面有隔离，但依赖的表结构是全局共享的。

### 2.2 全局数据清理逻辑的严重风险

#### 风险1：SDC工具的全局数据清理
**位置**：`app/backend/src/services/excel_thrpages.service.ts:273-277`
```typescript
// 清理现有数据（如果存在）
console.log(`🧹 清理现有${toolType}数据...`);
await prisma.tableData.deleteMany({ where: { table: { toolType } } });
await prisma.table.deleteMany({ where: { toolType } });
await prisma.sheet.deleteMany({ where: { toolType } });
```

**严重性**：🔴 极其严重 - 删除所有用户的所有数据
**触发条件**：系统启动时检测到无表结构时
**影响范围**：所有SDC用户的所有任务数据

#### 风险2：UPF工具的全局表结构修改
**位置**：`app/backend/src/services/excel_thrpages.service.ts:729-739`
```typescript
await prisma.table.updateMany({
  where: {
    toolType: 'upf',
    tableName: tableName  // 没有taskId限制
  },
  data: {
    columnsSchema: {
      columns: finalColumns
    }
  }
});
```

**严重性**：🟡 严重 - 影响所有用户的表结构
**触发条件**：每个UPF任务的第二次初始化
**影响范围**：所有UPF用户的表结构定义

### 2.3 任务清理逻辑的数据安全问题

#### 问题1：SDC任务清理逻辑错误
**位置**：`app/backend/src/controllers/sdc_thrpages.controller.ts:1254-1256`
```typescript
await prisma.tableData.deleteMany({
  where: { tableId: table.id }  // ❌ 没有taskId限制
});
```

**问题**：清理时删除了该表格的所有数据，不仅仅是当前任务的数据。

#### 问题2：UPF任务清理逻辑相同错误
**位置**：`app/backend/src/controllers/upf_thrpages.controller.ts:794-796`
```typescript
await prisma.tableData.deleteMany({
  where: { tableId: table.id }  // ❌ 没有taskId限制
});
```

**问题**：与SDC工具相同的错误逻辑。

### 2.4 系统启动时的初始化风险

#### 风险1：系统启动时的全局初始化
**位置**：`app/backend/src/index.ts:274-284`
```typescript
if (existingSdcSheets.length === 0) {
  logger.info('🔄 Initializing SDC multi-page database schema...');
  await ExcelThrpagesService.initializeDatabaseSchema('sdc');
}
```

**问题**：系统启动时如果检测不到表结构，会触发全局数据清理。

## 3. 详细解决方案

### 3.1 立即移除全局数据清理逻辑

#### 问题根源确认
**当前状态**：
- ✅ **系统启动初始化逻辑正确**：使用动态解析模板Excel文件
- ✅ **TableData表有taskId字段**：数据层面已有任务隔离
- ❌ **Table表缺少taskId字段**：表结构层面缺乏任务隔离
- ❌ **全局数据清理逻辑**：第984-988行会删除所有用户数据

#### 解决方案1：修改动态初始化函数的全局清理逻辑
**文件**：`app/backend/src/services/excel_thrpages.service.ts`

```typescript
// 修改前（第984-988行）
// 清理现有数据（如果存在）
console.log(`🧹 清理现有${toolType}数据...`);
await prisma.tableData.deleteMany({ where: { table: { toolType } } });
await prisma.table.deleteMany({ where: { toolType } });
await prisma.sheet.deleteMany({ where: { toolType } });

// 修改后
// 系统启动时的初始化不应该清理任何现有数据
// 这个函数只在系统首次部署或数据库为空时执行
console.log(`🔧 开始初始化${toolType}工具基础表结构（不清理现有数据）...`);

// 检查是否已存在基础表结构
const existingSheets = await prisma.sheet.findMany({
  where: { toolType }
});

if (existingSheets.length > 0) {
  console.log(`✅ ${toolType}工具基础表结构已存在，跳过初始化`);
  return;
}

console.log(`� 创建${toolType}工具基础表结构...`);
```

#### 解决方案2：系统启动初始化逻辑已正确
**文件**：`app/backend/src/index.ts` (第274-284行)

当前逻辑已经正确：
```typescript
// 检查是否已初始化，如果已存在则跳过
const existingSdcSheets = await prisma.sheet.findMany({
  where: { toolType: 'sdc' }
});

if (existingSdcSheets.length === 0) {
  // 只有在没有数据时才初始化
  await ExcelThrpagesService.initializeDatabaseSchema('sdc');
}
```

**这个逻辑是安全的，问题在于initializeDatabaseSchema函数内部的全局清理。**

### 3.2 实现任务级别的表结构管理

#### 核心理解：正确的工具执行逻辑

**SDC工具执行逻辑**：
1. **系统启动时**：解析`templates/sdcgen/dcont_org.xlsx`创建基础表结构（无taskId）
2. **用户点击初始化**：将taskId添加到TableData表，使用现有Table结构
3. **后续操作**：所有数据操作都基于taskId隔离

**UPF工具执行逻辑**：
1. **系统启动时**：解析`templates/upfgen/pcont_org.xlsx`创建基础表结构（无taskId）
2. **用户点击初始化**：
   - 将taskId添加到TableData表
   - **第二次初始化**：解析`temp/<taskid>/pcont.xlsx`更新表结构（需要taskId隔离）
3. **后续操作**：所有数据操作都基于taskId隔离

#### 解决方案1：修改数据库Schema
**文件**：`app/backend/prisma/schema.prisma`

```prisma
model Table {
  id            String      @id @default(cuid())
  sheetId       String      @map("sheet_id")
  toolType      String      @map("tool_type")
  tableName     String      @map("table_name")
  columnsSchema Json        @map("columns_schema")
  displayOrder  Int         @map("display_order")
  taskId        String?     @map("task_id")        // 新增：任务级别隔离
  isTemplate    Boolean     @default(false)       // 新增：标记是否为基础模板
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  sheet         Sheet       @relation(fields: [sheetId], references: [id], onDelete: Cascade)
  tableData     TableData[]

  @@unique([sheetId, tableName, taskId])  // 修改：添加taskId到唯一约束
  @@index([toolType])
  @@index([sheetId])
  @@index([taskId])                       // 新增：taskId索引
  @@map("tables")
}
```

**说明**：
- `taskId = null` 且 `isTemplate = true`：系统启动时创建的基础模板
- `taskId != null` 且 `isTemplate = false`：特定任务的表结构副本

#### 解决方案2：SDC工具的正确执行流程
**文件**：`app/backend/src/controllers/sdc_thrpages.controller.ts`

```typescript
export const initializePage = async (req: Request, res: Response) => {
  const { userId } = req.user as any;
  const { modName, isFlat } = req.body;

  try {
    // 1. 创建任务记录
    const task = await prisma.task.create({
      data: {
        userId,
        toolId: 'sdc-generator',
        status: 'DRAFT',
        parameters: { toolType: 'sdc', modName, isFlat }
      }
    });

    // 2. 生成dcont.xlsx文件
    const dcontPath = await generateDcontFile(task.id, modName, isFlat);

    // 3. 解析Excel文件并同步到数据库（使用基础表结构，数据绑定taskId）
    await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, dcontPath, 'sdc');

    // 4. 验证数据一致性
    const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
      task.id, userId, dcontPath
    );

    if (!validation.isConsistent) {
      throw new Error(`数据验证失败: 发现 ${validation.differences.length} 处不一致`);
    }

    res.json({
      success: true,
      message: '任务初始化成功',
      taskId: task.id,
      data: { taskId: task.id, modName, isFlat, status: 'DRAFT' }
    });

  } catch (error) {
    console.error('SDC任务初始化失败:', error);
    res.status(500).json({
      success: false,
      message: '任务初始化失败',
      error: error.message
    });
  }
};
```

**关键点**：SDC工具不需要创建任务特定的表结构副本，直接使用基础表结构，数据通过taskId隔离。

#### 解决方案3：UPF工具的正确执行流程
**文件**：`app/backend/src/controllers/upf_thrpages.controller.ts`

```typescript
export const initializePage = async (req: Request, res: Response) => {
  const { userId } = req.user as any;
  const { modName, isFlat } = req.body;

  try {
    // 1. 创建任务记录
    const task = await prisma.task.create({
      data: {
        userId,
        toolId: 'upf-generator',
        status: 'DRAFT',
        parameters: { toolType: 'upf', modName, isFlat }
      }
    });

    // 2. 生成pcont.xlsx文件
    const pcontPath = await generatePcontFile(task.id, modName, isFlat);

    // 3. 为当前任务创建表结构副本（UPF需要任务特定的表结构）
    await ExcelThrpagesService.createTaskSpecificTableStructure(task.id, userId, 'upf');

    // 4. UPF特有：第二次初始化 - 更新任务特定的动态列
    await ExcelThrpagesService.updateTaskSpecificDynamicTableColumns(task.id, pcontPath);

    // 5. 解析Excel文件并同步到任务特定的表结构
    await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, pcontPath, 'upf');

    // 6. 验证数据一致性
    const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
      task.id, userId, pcontPath
    );

    if (!validation.isConsistent) {
      throw new Error(`数据验证失败: 发现 ${validation.differences.length} 处不一致`);
    }

    res.json({
      success: true,
      message: '任务初始化成功',
      taskId: task.id,
      data: { taskId: task.id, modName, isFlat, status: 'DRAFT' }
    });

  } catch (error) {
    console.error('UPF任务初始化失败:', error);
    res.status(500).json({
      success: false,
      message: '任务初始化失败',
      error: error.message
    });
  }
};
```

#### 解决方案4：创建任务特定表结构的服务函数
**文件**：`app/backend/src/services/excel_thrpages.service.ts`

```typescript
/**
 * 为UPF任务创建表结构副本（SDC不需要，直接使用基础表结构）
 */
static async createTaskSpecificTableStructure(taskId: string, userId: string, toolType: string): Promise<void> {
  try {
    console.log(`🔧 为任务 ${taskId} 创建 ${toolType} 工具的表结构副本...`);

    // 1. 获取基础模板表结构
    const templateSheets = await prisma.sheet.findMany({
      where: { toolType },
      include: {
        tables: {
          where: {
            taskId: null,  // 基础模板表结构
            isTemplate: true
          }
        }
      }
    });

    // 2. 为当前任务创建表结构副本
    for (const sheet of templateSheets) {
      for (const table of sheet.tables) {
        await prisma.table.create({
          data: {
            sheetId: table.sheetId,
            toolType: table.toolType,
            tableName: table.tableName,
            columnsSchema: table.columnsSchema,
            displayOrder: table.displayOrder,
            taskId: taskId,  // 关键：绑定到特定任务
            isTemplate: false
          }
        });
      }
    }

    console.log(`✅ 任务 ${taskId} 的表结构副本创建完成`);
  } catch (error) {
    console.error(`❌ 创建任务表结构副本失败:`, error);
    throw error;
  }
}

/**
 * 更新任务特定的UPF动态列结构
 */
static async updateTaskSpecificDynamicTableColumns(taskId: string, pcontExcelPath: string): Promise<void> {
  try {
    console.log(`� [UPF-DYNAMIC] 更新任务 ${taskId} 的动态列结构...`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(pcontExcelPath);

    // 更新PMDOMAIN表格的列结构（任务特定）
    await this.updateTaskSpecificDynamicTableColumns(taskId, workbook, 'PDomain', 'PMDOMAIN');

    // 更新PMMODE表格的列结构（任务特定）
    await this.updateTaskSpecificDynamicTableColumns(taskId, workbook, 'PMode', 'PMMODE');

    console.log(`✅ [UPF-DYNAMIC] 任务 ${taskId} 的动态列结构更新完成`);
  } catch (error) {
    console.error('更新任务特定动态列结构时出错:', error);
    throw error;
  }
}

/**
 * 更新单个任务特定表格的动态列结构
 */
private static async updateTaskSpecificDynamicTableColumns(
  taskId: string,
  workbook: ExcelJS.Workbook,
  sheetName: string,
  tableName: string
): Promise<void> {
  try {
    // ... 解析逻辑保持不变 ...

    // 关键修改：只更新当前任务的表结构
    await prisma.table.updateMany({
      where: {
        toolType: 'upf',
        tableName: tableName,
        taskId: taskId  // 关键：只更新当前任务的表结构
      },
      data: {
        columnsSchema: {
          columns: finalColumns
        }
      }
    });

    console.log(`✅ [UPF-DYNAMIC] 任务 ${taskId} 的表格 ${tableName} 列结构更新完成`);
  } catch (error) {
    console.error(`更新任务 ${taskId} 表格 ${tableName} 列结构时出错:`, error);
    throw error;
  }
}
```

### 3.3 修复任务清理逻辑

#### 当前问题：清理逻辑删除所有用户数据
**SDC清理函数问题**：`app/backend/src/controllers/sdc_thrpages.controller.ts:1254-1256`
**UPF清理函数问题**：`app/backend/src/controllers/upf_thrpages.controller.ts:794-796`

```typescript
// 当前错误逻辑
await prisma.tableData.deleteMany({
  where: { tableId: table.id }  // ❌ 删除该表格的所有数据
});
```

#### 解决方案1：修改SDC任务清理函数
**文件**：`app/backend/src/controllers/sdc_thrpages.controller.ts`

```typescript
// 修改前（第1254-1256行）
await prisma.tableData.deleteMany({
  where: { tableId: table.id }
});

// 修改后
await prisma.tableData.deleteMany({
  where: {
    taskId: taskId  // 关键：直接按taskId删除，更简单安全
  }
});
```

#### 解决方案2：修改UPF任务清理函数
**文件**：`app/backend/src/controllers/upf_thrpages.controller.ts`

```typescript
// 修改前（第794-796行）
await prisma.tableData.deleteMany({
  where: { tableId: table.id }
});

// 修改后
await prisma.tableData.deleteMany({
  where: {
    taskId: taskId  // 关键：直接按taskId删除
  }
});
```

#### 解决方案3：统一的任务清理服务
**文件**：`app/backend/src/services/task-cleanup.service.ts`

```typescript
export class TaskCleanupService {
  /**
   * 安全清理任务数据
   */
  static async safeCleanupTask(taskId: string, toolType: 'sdc' | 'upf'): Promise<void> {
    try {
      console.log(`🧹 开始清理任务 ${taskId} (${toolType})...`);

      // 1. 清理任务数据（所有工具通用）
      const deletedDataCount = await prisma.tableData.deleteMany({
        where: { taskId }
      });
      console.log(`🗑️ 删除了 ${deletedDataCount.count} 条任务数据`);

      // 2. 清理任务特定的表结构（仅UPF需要）
      if (toolType === 'upf') {
        const deletedTableCount = await prisma.table.deleteMany({
          where: {
            taskId,
            isTemplate: false
          }
        });
        console.log(`🗑️ 删除了 ${deletedTableCount.count} 个任务表结构`);
      }

      // 3. 清理文件系统中的任务文件
      await this.cleanupTaskFiles(taskId);

      console.log(`✅ 任务 ${taskId} 清理完成`);
    } catch (error) {
      console.error(`❌ 清理任务 ${taskId} 失败:`, error);
      throw error;
    }
  }
}
```

## 4. 数据备份和恢复机制

### 4.1 实现数据备份服务
**文件**：`app/backend/src/services/backup.service.ts`

```typescript
export class BackupService {
  /**
   * 备份任务数据
   */
  static async backupTaskData(taskId: string): Promise<string> {
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        taskId,
        tableData: await prisma.tableData.findMany({
          where: { taskId },
          include: {
            table: {
              include: {
                sheet: true
              }
            }
          }
        }),
        tables: await prisma.table.findMany({
          where: { taskId }
        })
      };

      const backupPath = `backups/task_${taskId}_${Date.now()}.json`;
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      
      return backupPath;
    } catch (error) {
      console.error('备份任务数据失败:', error);
      throw error;
    }
  }

  /**
   * 恢复任务数据
   */
  static async restoreTaskData(backupPath: string): Promise<void> {
    try {
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));
      
      // 恢复表结构
      for (const table of backupData.tables) {
        await prisma.table.upsert({
          where: { id: table.id },
          update: table,
          create: table
        });
      }

      // 恢复数据
      for (const data of backupData.tableData) {
        await prisma.tableData.upsert({
          where: { id: data.id },
          update: data,
          create: data
        });
      }
    } catch (error) {
      console.error('恢复任务数据失败:', error);
      throw error;
    }
  }
}
```



### 4.2 自动备份机制
**文件**：`app/backend/src/services/excel_thrpages.service.ts`

```typescript
/**
 * 在关键操作前自动备份
 */
static async autoBackupBeforeOperation(taskId: string, operation: string): Promise<void> {
  try {
    console.log(`📦 执行 ${operation} 前自动备份任务 ${taskId} 数据...`);

    const backupPath = await BackupService.backupTaskData(taskId);

    // 记录备份信息到数据库
    await prisma.taskBackup.create({
      data: {
        taskId,
        operation,
        backupPath,
        createdAt: new Date()
      }
    });

    console.log(`✅ 自动备份完成: ${backupPath}`);
  } catch (error) {
    console.error('自动备份失败:', error);
    // 备份失败不应阻止主操作，但需要记录警告
  }
}
```

### 4.3 数据一致性检查
**文件**：`app/backend/src/services/data-integrity.service.ts`

```typescript
export class DataIntegrityService {
  /**
   * 检查任务数据完整性
   */
  static async checkTaskDataIntegrity(taskId: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // 1. 检查表结构是否存在
      const tables = await prisma.table.findMany({
        where: { taskId }
      });

      if (tables.length === 0) {
        issues.push(`任务 ${taskId} 缺少表结构定义`);
      }

      // 2. 检查数据是否与表结构匹配
      for (const table of tables) {
        const dataCount = await prisma.tableData.count({
          where: {
            taskId,
            tableId: table.id
          }
        });

        const columnsSchema = table.columnsSchema as any;
        if (columnsSchema?.columns) {
          // 检查数据字段是否与表结构匹配
          const sampleData = await prisma.tableData.findFirst({
            where: {
              taskId,
              tableId: table.id
            }
          });

          if (sampleData) {
            const dataFields = Object.keys(sampleData.rowData as any);
            const schemaFields = columnsSchema.columns.map((c: any) => c.name);

            const missingFields = schemaFields.filter((f: string) => !dataFields.includes(f));
            if (missingFields.length > 0) {
              issues.push(`表格 ${table.tableName} 缺少字段: ${missingFields.join(', ')}`);
            }
          }
        }
      }

      // 3. 检查孤立数据
      const orphanedData = await prisma.tableData.findMany({
        where: {
          taskId,
          table: null
        }
      });

      if (orphanedData.length > 0) {
        issues.push(`发现 ${orphanedData.length} 条孤立数据记录`);
      }

      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      issues.push(`数据完整性检查失败: ${error.message}`);
      return {
        isValid: false,
        issues
      };
    }
  }
}
```

## 4. 实施计划和优先级

### 4.1 紧急修复（立即执行）

#### 修复1：移除全局数据清理逻辑
**文件**：`app/backend/src/services/excel_thrpages.service.ts`
**位置**：第984-988行
**优先级**：🔴 最高优先级

```typescript
// 立即修改这段代码
// 修改前
console.log(`🧹 清理现有${toolType}数据...`);
await prisma.tableData.deleteMany({ where: { table: { toolType } } });
await prisma.table.deleteMany({ where: { toolType } });
await prisma.sheet.deleteMany({ where: { toolType } });

// 修改后
console.log(`🔧 检查${toolType}工具基础表结构...`);
const existingSheets = await prisma.sheet.findMany({
  where: { toolType }
});

if (existingSheets.length > 0) {
  console.log(`✅ ${toolType}工具基础表结构已存在，跳过初始化`);
  return;
}

console.log(`📝 创建${toolType}工具基础表结构...`);
```

#### 修复2：修复任务清理逻辑
**文件**：`app/backend/src/controllers/sdc_thrpages.controller.ts` 和 `upf_thrpages.controller.ts`
**优先级**：🔴 最高优先级

```typescript
// SDC清理函数修改（第1254-1256行）
await prisma.tableData.deleteMany({
  where: { taskId: taskId }  // 只删除当前任务的数据
});

// UPF清理函数修改（第794-796行）
await prisma.tableData.deleteMany({
  where: { taskId: taskId }  // 只删除当前任务的数据
});
```

### 4.2 结构性改进（1-2周内）

#### 改进1：数据库Schema修改
**优先级**：🟡 高优先级

1. **添加taskId字段到Table表**
2. **添加isTemplate字段标记基础模板**
3. **修改唯一约束包含taskId**

#### 改进2：UPF动态列更新逻辑修改
**文件**：`app/backend/src/services/excel_thrpages.service.ts`
**位置**：第729-739行
**优先级**：🟡 高优先级

```typescript
// 修改UPF动态列更新逻辑
await prisma.table.updateMany({
  where: {
    toolType: 'upf',
    tableName: tableName,
    taskId: taskId  // 添加taskId限制
  },
  data: {
    columnsSchema: {
      columns: finalColumns
    }
  }
});
```

### 5.2 UPF工具安全执行流程
**文件**：`app/backend/src/controllers/upf_thrpages.controller.ts`

```typescript
export const initializePage = async (req: Request, res: Response) => {
  const { userId } = req.user as any;
  const { modName, isFlat } = req.body;

  try {
    // 1. 创建任务记录
    const task = await prisma.task.create({
      data: {
        userId,
        toolId: 'upf-generator',
        status: 'DRAFT',
        parameters: { toolType: 'upf', modName, isFlat }
      }
    });

    // 2. 自动备份（如果有现有数据）
    await ExcelThrpagesService.autoBackupBeforeOperation(task.id, 'initialize');

    // 3. 检查并创建模板表结构（安全检查）
    await ExcelThrpagesService.ensureTemplateTableStructure('upf');

    // 4. 为当前任务创建独立的表结构副本
    await ExcelThrpagesService.createTaskSpecificTableStructure(task.id, userId, 'upf');

    // 5. 生成pcont.xlsx文件
    const pcontPath = await generatePcontFile(task.id, modName, isFlat);

    // 6. UPF特有：第二次初始化 - 更新任务特定的动态列
    await ExcelThrpagesService.updateTaskSpecificDynamicTableColumns(task.id, pcontPath);

    // 7. 解析Excel文件并同步到任务特定的表结构
    await ExcelThrpagesService.parseTaskExcelFile(task.id, userId, pcontPath, 'upf');

    // 8. 验证数据一致性
    const validation = await ExcelThrpagesService.validateExcelDatabaseConsistency(
      task.id, userId, pcontPath
    );

    if (!validation.isConsistent) {
      throw new Error(`数据验证失败: 发现 ${validation.differences.length} 处不一致`);
    }

    // 9. 数据完整性检查
    const integrityCheck = await DataIntegrityService.checkTaskDataIntegrity(task.id);
    if (!integrityCheck.isValid) {
      console.warn(`任务 ${task.id} 数据完整性问题:`, integrityCheck.issues);
    }

    res.json({
      success: true,
      message: '任务初始化成功',
      taskId: task.id,
      data: { taskId: task.id, modName, isFlat, status: 'DRAFT' }
    });

  } catch (error) {
    console.error('UPF任务初始化失败:', error);
    res.status(500).json({
      success: false,
      message: '任务初始化失败',
      error: error.message
    });
  }
};
```

### 5.3 安全的任务清理流程
**文件**：`app/backend/src/services/task-cleanup.service.ts`

```typescript
export class TaskCleanupService {
  /**
   * 安全清理任务数据
   */
  static async safeCleanupTask(taskId: string): Promise<void> {
    try {
      console.log(`🧹 开始安全清理任务 ${taskId}...`);

      // 1. 备份任务数据
      const backupPath = await BackupService.backupTaskData(taskId);
      console.log(`📦 任务数据已备份到: ${backupPath}`);

      // 2. 清理任务数据（只删除该任务的数据）
      const deletedDataCount = await prisma.tableData.deleteMany({
        where: { taskId }
      });
      console.log(`🗑️ 删除了 ${deletedDataCount.count} 条任务数据`);

      // 3. 清理任务特定的表结构（保留模板）
      const deletedTableCount = await prisma.table.deleteMany({
        where: {
          taskId,
          isTemplate: false
        }
      });
      console.log(`🗑️ 删除了 ${deletedTableCount.count} 个任务表结构`);

      // 4. 清理文件系统中的任务文件
      await this.cleanupTaskFiles(taskId);

      // 5. 更新任务状态
      await prisma.task.update({
        where: { id: taskId },
        data: {
          cleanedAt: new Date(),
          status: 'CLEANED'
        }
      });

      console.log(`✅ 任务 ${taskId} 清理完成`);
    } catch (error) {
      console.error(`❌ 清理任务 ${taskId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 清理任务文件
   */
  private static async cleanupTaskFiles(taskId: string): Promise<void> {
    try {
      const taskDir = path.join(process.cwd(), '../../temp', taskId);
      if (fs.existsSync(taskDir)) {
        await fs.rm(taskDir, { recursive: true, force: true });
        console.log(`🗑️ 删除任务目录: ${taskDir}`);
      }
    } catch (error) {
      console.error(`清理任务文件失败:`, error);
      // 文件清理失败不应阻止数据库清理
    }
  }
}
```

## 6. 数据库迁移脚本

### 6.1 添加taskId字段的迁移
**文件**：`app/backend/prisma/migrations/add_task_isolation/migration.sql`

```sql
-- 添加taskId字段到tables表
ALTER TABLE "tables" ADD COLUMN "task_id" TEXT;
ALTER TABLE "tables" ADD COLUMN "is_template" BOOLEAN DEFAULT false;

-- 创建索引
CREATE INDEX "tables_task_id_idx" ON "tables"("task_id");

-- 更新现有数据为模板
UPDATE "tables" SET "is_template" = true WHERE "task_id" IS NULL;

-- 修改唯一约束
ALTER TABLE "tables" DROP CONSTRAINT "tables_sheet_id_table_name_key";
ALTER TABLE "tables" ADD CONSTRAINT "tables_sheet_id_table_name_task_id_key"
  UNIQUE ("sheet_id", "table_name", "task_id");

-- 添加备份表
CREATE TABLE "task_backups" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "backup_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_backups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_backups_task_id_idx" ON "task_backups"("task_id");
```

## 7. 监控和告警机制

### 7.1 数据安全监控
**文件**：`app/backend/src/services/security-monitor.service.ts`

```typescript
export class SecurityMonitorService {
  /**
   * 监控全局数据操作
   */
  static async monitorGlobalDataOperations(): Promise<void> {
    // 监控是否有全局删除操作
    const globalDeleteOperations = await this.detectGlobalDeleteOperations();

    if (globalDeleteOperations.length > 0) {
      await this.sendSecurityAlert('检测到全局数据删除操作', globalDeleteOperations);
    }

    // 监控表结构修改
    const tableStructureChanges = await this.detectTableStructureChanges();

    if (tableStructureChanges.length > 0) {
      await this.sendSecurityAlert('检测到表结构修改', tableStructureChanges);
    }
  }

  /**
   * 发送安全告警
   */
  private static async sendSecurityAlert(message: string, details: any[]): Promise<void> {
    console.error(`🚨 安全告警: ${message}`, details);

    // 这里可以集成邮件、短信或其他告警系统
    // await emailService.sendAlert(message, details);
  }
}
```

## 5. 正确的工具执行逻辑总结

### 5.1 SDC工具执行逻辑（正确理解）

#### 系统启动时（一次性）：
1. **检查基础表结构**：查询`toolType='sdc'`的Sheet是否存在
2. **如果不存在**：解析`templates/sdcgen/dcont_org.xlsx`创建基础表结构
3. **如果存在**：跳过初始化，不影响现有数据

#### 用户点击初始化时：
1. **创建任务记录**：生成taskId
2. **生成dcont.xlsx**：基于用户参数
3. **解析并同步数据**：使用基础表结构，数据绑定taskId
4. **验证数据一致性**

**关键点**：SDC不需要任务特定的表结构，直接使用基础表结构，通过taskId隔离数据。

### 5.2 UPF工具执行逻辑（正确理解）

#### 系统启动时（一次性）：
1. **检查基础表结构**：查询`toolType='upf'`的Sheet是否存在
2. **如果不存在**：解析`templates/upfgen/pcont_org.xlsx`创建基础表结构
3. **如果存在**：跳过初始化，不影响现有数据

#### 用户点击初始化时：
1. **创建任务记录**：生成taskId
2. **生成pcont.xlsx**：基于用户参数
3. **创建任务特定表结构**：复制基础表结构并绑定taskId
4. **第二次初始化**：解析`temp/<taskid>/pcont.xlsx`更新任务特定的动态列
5. **解析并同步数据**：使用任务特定的表结构
6. **验证数据一致性**

**关键点**：UPF需要任务特定的表结构，因为每个任务的动态电源列可能不同。

### 5.3 核心差异总结

| 方面 | SDC工具 | UPF工具 |
|------|---------|---------|
| **基础表结构** | 固定，系统启动时创建 | 固定，系统启动时创建 |
| **任务表结构** | ❌ 不需要，直接使用基础表结构 | ✅ 需要，复制并修改基础表结构 |
| **动态列** | ❌ 无动态列 | ✅ 有动态电源列 |
| **数据隔离** | 通过taskId在TableData层面隔离 | 通过taskId在Table和TableData层面隔离 |
| **第二次初始化** | ❌ 不需要 | ✅ 需要，更新动态列 |

## 6. 结论

### 6.1 问题根源确认
1. **✅ 系统启动逻辑正确**：使用动态解析，有安全检查
2. **❌ 全局数据清理逻辑错误**：initializeDatabaseSchema函数内部清理所有数据
3. **❌ Table表缺少taskId字段**：无法实现UPF工具的任务级别表结构隔离
4. **❌ 任务清理逻辑错误**：删除所有用户数据而非当前任务数据
5. **❌ UPF动态列更新逻辑错误**：修改全局表结构而非任务特定表结构

### 6.2 修复优先级
1. **🔴 紧急修复**：移除全局数据清理逻辑，修复任务清理逻辑
2. **🟡 结构性改进**：添加taskId字段，实现UPF任务级别表结构管理
3. **🟢 增强功能**：备份恢复机制，监控告警系统

### 6.3 预期效果
通过实施上述解决方案，将确保：
1. **SDC工具**：安全的多用户并行工作，数据通过taskId隔离
2. **UPF工具**：安全的多用户并行工作，表结构和数据都通过taskId隔离
3. **系统稳定性**：消除数据丢失风险，提供完整的数据安全保障
