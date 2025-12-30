# UPF工具DataChk问题修复总结

## 🔍 **问题分析**

### **原始问题**
1. **JSON文件生成不完整**：UPF工具DataChk只生成了`vardef.json`，缺少其他3个JSON文件（`pdomain.json`、`pstrategy.json`、`pmode.json`）
2. **数据同步失败**：从数据库同步到Excel时，所有表格数据行数都为0，导致Excel文件中的表格单元值为空
3. **验证失败**：Excel与数据库数据不一致，出现94个差异

### **根本原因分析**

#### **问题1：JSON文件映射不完整**
在`generateSheetJsonFiles`函数中，`sheetToJsonMap`只包含SDC工具的映射：
```typescript
const sheetToJsonMap: { [key: string]: string } = {
  'VarDef': 'vardef.json',
  'ClkDef': 'clkdef.json',
  'IODly': 'iodly.json',
  'Exp': 'exp.json'
  // 缺少UPF工具的映射
};
```

#### **问题2：数据库查询逻辑不一致**
在`syncDatabaseToExcel`和`generateJsonFiles`函数中，数据库查询逻辑与验证函数不一致：

**错误的查询（同步时）**：
```typescript
const sheets = await prisma.sheet.findMany({
  where: { toolType: normalizedToolType },
  include: {
    tables: {  // 没有taskId过滤
      include: {
        tableData: { where: { taskId } }
      }
    }
  }
});
```

**正确的查询（验证时）**：
```typescript
if (normalizedToolType === 'upf') {
  sheets = await prisma.sheet.findMany({
    where: { toolType: normalizedToolType },
    include: {
      tables: {
        where: { taskId: taskId },  // UPF需要任务特定表结构
        include: {
          tableData: { where: { taskId } }
        }
      }
    }
  });
}
```

## 🔧 **修复方案**

### **修复1：完善JSON文件映射**
在`generateSheetJsonFiles`函数中添加UPF工具的映射：
```typescript
const sheetToJsonMap: { [key: string]: string } = {
  // SDC工具的映射
  'VarDef': 'vardef.json',
  'ClkDef': 'clkdef.json',
  'IODly': 'iodly.json',
  'Exp': 'exp.json',
  // UPF工具的映射
  'PDomain': 'pdomain.json',
  'PStrategy': 'pstrategy.json',
  'PMode': 'pmode.json'
};
```

### **修复2：统一数据库查询逻辑**
在`syncDatabaseToExcel`和`generateJsonFiles`函数中，使用与验证函数相同的查询逻辑：
```typescript
let sheets: any[];

if (normalizedToolType === 'upf') {
  // UPF工具：使用任务特定的表结构（包含动态电源列）
  sheets = await prisma.sheet.findMany({
    where: { toolType: normalizedToolType },
    include: {
      tables: {
        where: { taskId: taskId } as any,
        include: {
          tableData: {
            where: { taskId },
            orderBy: { rowNumber: 'asc' }
          }
        }
      }
    }
  });
} else {
  // SDC工具：使用模板表结构
  sheets = await prisma.sheet.findMany({
    where: { toolType: normalizedToolType },
    include: {
      tables: {
        where: { taskId: null } as any,
        include: {
          tableData: {
            where: { taskId },
            orderBy: { rowNumber: 'asc' }
          }
        }
      }
    }
  });
}
```

## ✅ **修复验证**

### **验证结果**
- ✅ **JSON映射完整性**: 通过
- ✅ **数据查询正确性**: 通过
- ✅ **数据库查询**: 成功查询到113行数据
- ✅ **Sheet映射**: 4个UPF sheets全部正确映射

### **预期效果**
修复后，UPF工具DataChk功能将能够：
1. **生成所有4个JSON文件**：`vardef.json`、`pdomain.json`、`pstrategy.json`、`pmode.json`
2. **正确同步数据库数据到Excel文件**：所有表格数据正确写入Excel
3. **通过数据一致性验证**：Excel与数据库数据完全一致

## 🎯 **技术要点**

### **UPF工具与SDC工具的关键差异**
- **SDC工具**：使用模板表结构（`taskId: null`），所有任务共享相同的表结构
- **UPF工具**：使用任务特定表结构（`taskId: taskId`），每个任务有独立的表结构（支持动态电源列）

### **数据库设计理念**
- **表结构（tables）**：UPF工具每个任务都有独立的表结构副本，支持动态列
- **表数据（tableData）**：所有工具都使用taskId关联具体的数据行

### **一致性原则**
所有涉及数据库查询的函数（同步、验证、JSON生成）必须使用相同的查询逻辑，确保数据一致性。

## 📝 **修改文件**
- `app/backend/src/services/excel_thrpages.service.ts`
  - 修复`generateSheetJsonFiles`函数的JSON映射
  - 修复`syncDatabaseToExcel`函数的查询逻辑
  - 修复`generateJsonFiles`函数的查询逻辑

## 🚀 **后续测试建议**
1. 重新测试UPF工具的DataChk功能
2. 验证所有4个JSON文件是否正确生成
3. 检查Excel文件中的数据是否完整
4. 确认数据一致性验证通过
