# SDC工具文件上传检查项详细文档 (ECS Only模式)

## 📋 当前文件检查项分析

### 🔍 SDC工具需要的文件

| 文件名 | 类型 | 必需性 | 格式要求 | 用途 |
|--------|------|--------|----------|------|
| hier.yaml | YAML | ✅ 必需 | .yaml/.yml | 层次结构定义 |
| vlog.v | Verilog | ✅ 必需 | .v/.sv | Verilog模块定义 |
| dcont.xlsx | Excel | ✅ 必需 | .xlsx/.xls | 设计约束配置 |

### 📝 当前检查项详细列表

#### 1. hier.yaml 文件检查项

**基础检查**:
- ✅ 文件扩展名验证: 必须以 `.yaml` 或 `.yml` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件非空检查: 文件内容不能为空
- ✅ 基本YAML格式: 必须包含键值对结构 (包含 `:`)

**SDC特定检查**:
- ✅ 必需字段验证: 必须包含 `pwr:` 或 `hier:` 字段
- ❌ **缺失**: YAML语法验证 (当前只做基础格式检查)
- ❌ **缺失**: 层次结构完整性验证
- ❌ **缺失**: 模块名称一致性检查 (与ModName参数对比)

**代码位置**: 
```typescript
// app/frontend/src/pages/tools/SdcGeneratorPage.tsx:193-198
if (!content.includes('pwr:') && !content.includes('hier:')) {
    resolve({ valid: false, error: `${file.name} 不符合hier.yaml模板格式，缺少必要的pwr或hier字段` });
    return;
}
```

#### 2. vlog.v 文件检查项

**基础检查**:
- ✅ 文件扩展名验证: 必须以 `.v` 或 `.sv` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件内容检查: 允许空文件或包含module声明

**SDC特定检查**:
- ✅ Module声明验证: 非空文件必须包含 `module` 关键字
- ❌ **缺失**: Verilog语法验证
- ❌ **缺失**: 模块名称一致性检查 (与ModName参数对比)
- ❌ **缺失**: 端口定义完整性检查

**代码位置**:
```typescript
// app/frontend/src/pages/tools/SdcGeneratorPage.tsx:199-204
if (content.trim() !== '' && !content.includes('module')) {
    resolve({ valid: false, error: `${file.name} 不符合Verilog格式，应包含module声明或为空文件` });
    return;
}
```

#### 3. dcont.xlsx 文件检查项

**基础检查**:
- ✅ 文件扩展名验证: 必须以 `.xlsx` 或 `.xls` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件大小验证: 文件大小不能小于 100 bytes

**SDC特定检查**:
- ❌ **缺失**: Excel文件结构验证
- ❌ **缺失**: 必需工作表检查
- ❌ **缺失**: 约束数据格式验证
- ❌ **缺失**: 数据完整性检查

**代码位置**:
```typescript
// app/frontend/src/pages/tools/SdcGeneratorPage.tsx:205-210
if (file.size < 100) {
    resolve({ valid: false, error: `${file.name} 文件过小，可能不是有效的Excel文件` });
    return;
}
```

### 🔄 当前验证时机

**当前实现**: 延迟验证 (点击Submission时)
```typescript
// app/frontend/src/pages/tools/SdcGeneratorPage.tsx:255-269
// 4. 检查文件内容和格式
const hierValidation = await validateFileContent(hierYamlFile, 'yaml');
const vlogValidation = await validateFileContent(vlogFile, 'verilog');
const dcontValidation = await validateFileContent(dcontFile, 'excel');
```

### 📊 文件间一致性检查

**当前状态**: ❌ **完全缺失**

**需要的一致性检查**:
1. **ModName一致性**: ModName参数与hier.yaml中的顶层模块名称一致
2. **模块定义一致性**: vlog.v中的模块名称与hier.yaml中定义的模块一致
3. **约束覆盖性**: dcont.xlsx中的约束覆盖hier.yaml中定义的所有模块

### 🚨 当前问题和限制

#### 1. 验证深度不足
- **YAML解析**: 只检查基本格式，不验证YAML语法
- **Verilog解析**: 只检查module关键字，不验证语法
- **Excel解析**: 只检查文件大小，不验证内容结构

#### 2. 业务逻辑验证缺失
- **模块名称一致性**: 无法确保文件间的模块名称一致
- **层次结构完整性**: 无法验证层次结构的完整性
- **约束完整性**: 无法验证约束配置的完整性

#### 3. 用户体验问题
- **延迟反馈**: 用户需要等到提交时才知道文件问题
- **错误定位**: 错误信息不够具体，难以定位问题
- **修复指导**: 缺少具体的修复建议

### 🎯 优化建议

#### 1. 立即验证优化
- **文件选择时**: 立即进行基础格式验证
- **内容解析**: 实时解析文件内容并验证结构
- **一致性检查**: 在所有文件选择完成后进行一致性验证

#### 2. 验证深度增强
- **YAML解析器**: 使用js-yaml库进行完整的YAML解析
- **Verilog解析器**: 基础的Verilog语法检查
- **Excel解析器**: 使用xlsx库验证Excel结构

#### 3. 业务逻辑验证
- **模块名称映射**: 建立文件间的模块名称映射关系
- **层次结构验证**: 验证层次结构的完整性和一致性
- **约束覆盖验证**: 确保约束配置覆盖所有必需的模块

### 📈 验证流程优化方案

#### 阶段1: 立即基础验证
```typescript
// 文件选择时立即执行
1. 文件扩展名检查
2. 文件大小检查
3. 基础格式检查
4. 内容非空检查
```

#### 阶段2: 深度内容验证
```typescript
// 文件内容解析完成后执行
1. YAML/Verilog/Excel语法验证
2. 必需字段/结构验证
3. 数据格式验证
```

#### 阶段3: 一致性验证
```typescript
// 所有文件选择完成后执行
1. 模块名称一致性检查
2. 层次结构完整性验证
3. 约束覆盖性验证
```

### 🔧 实现优先级

**高优先级** (立即实现):
1. 文件选择时的立即基础验证
2. 改进的错误提示和用户反馈
3. YAML和Verilog的基础语法检查

**中优先级** (后续实现):
1. Excel文件结构验证
2. 模块名称一致性检查
3. 层次结构完整性验证

**低优先级** (长期优化):
1. 深度业务逻辑验证
2. 智能修复建议
3. 可视化验证结果展示
