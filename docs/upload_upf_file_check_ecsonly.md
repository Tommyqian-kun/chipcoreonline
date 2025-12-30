# UPF工具文件上传检查项详细文档 (ECS Only模式)

## 📋 当前文件检查项分析

### 🔍 UPF工具需要的文件

| 文件名 | 类型 | 必需性 | 格式要求 | 用途 |
|--------|------|--------|----------|------|
| hier.yaml | YAML | ✅ 必需 | .yaml/.yml | 功耗域层次结构定义 |
| pvlog.v | Verilog | ✅ 必需 | .v/.sv | 功耗相关Verilog模块 |
| pobj.tcl | TCL | ✅ 必需 | .tcl | UPF功耗对象定义脚本 |
| pcont.xlsx | Excel | ✅ 必需 | .xlsx/.xls | 功耗控制配置表 |

### 📝 当前检查项详细列表

#### 1. hier.yaml 文件检查项

**基础检查** (通用文件验证):
- ✅ 文件扩展名验证: 必须以 `.yaml` 或 `.yml` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件非空检查: 文件内容不能为空
- ✅ 基本YAML格式: 必须包含键值对结构 (包含 `:`)

**UPF特定检查**:
- ❌ **缺失**: 功耗域定义验证 (power_domains字段)
- ❌ **缺失**: 顶层模块验证 (top_module字段)
- ❌ **缺失**: 功耗域层次结构完整性检查
- ❌ **缺失**: 模块名称一致性检查 (与ModName参数对比)

**代码位置**: 
```typescript
// app/frontend/src/utils/fileValidation.ts:14-37
// 使用通用YAML验证，无UPF特定检查
```

#### 2. pvlog.v 文件检查项

**基础检查** (通用文件验证):
- ✅ 文件扩展名验证: 必须以 `.v` 或 `.sv` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件非空检查: 文件内容不能为空
- ✅ Module声明验证: 必须包含 `module` 关键字

**UPF特定检查**:
- ❌ **缺失**: 功耗相关端口验证 (VDD, VSS, power_ctrl等)
- ❌ **缺失**: 功耗域模块定义检查
- ❌ **缺失**: 模块名称一致性检查 (与ModName参数对比)
- ❌ **缺失**: 功耗管理信号验证

**代码位置**:
```typescript
// app/frontend/src/utils/fileValidation.ts:42-65
// 使用通用Verilog验证，无UPF特定检查
```

#### 3. pobj.tcl 文件检查项

**基础检查** (通用文件验证):
- ✅ 文件扩展名验证: 必须以 `.tcl` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件非空检查: 文件内容不能为空
- ✅ TCL命令验证: 包含基本TCL命令 (set, proc, if, for, while, puts, source)

**UPF特定检查**:
- ❌ **缺失**: UPF命令验证 (create_power_domain, set_domain_supply_net等)
- ❌ **缺失**: 功耗对象定义完整性检查
- ❌ **缺失**: 功耗域配置验证
- ❌ **缺失**: UPF版本兼容性检查

**代码位置**:
```typescript
// app/frontend/src/utils/fileValidation.ts:104-132
// 检查基本TCL命令，但无UPF特定命令检查
const tclKeywords = ['set', 'proc', 'if', 'for', 'while', 'puts', 'source'];
```

#### 4. pcont.xlsx 文件检查项

**基础检查** (通用文件验证):
- ✅ 文件扩展名验证: 必须以 `.xlsx` 或 `.xls` 结尾
- ✅ 文件大小限制: 不超过 5MB
- ✅ 文件非空检查: 文件大小不能为0
- ✅ Excel魔数验证: XLSX文件ZIP格式头部检查

**UPF特定检查**:
- ❌ **缺失**: 功耗控制表结构验证
- ❌ **缺失**: 必需工作表检查 (Power_Domains, Supply_Nets等)
- ❌ **缺失**: 功耗配置数据格式验证
- ❌ **缺失**: 功耗域配置完整性检查

**代码位置**:
```typescript
// app/frontend/src/utils/fileValidation.ts:70-99
// 使用通用Excel验证，无UPF特定结构检查
```

### 🔄 当前验证时机

**当前实现**: 延迟验证 (点击Submission时)
```typescript
// app/frontend/src/hooks/useToolExecution.ts:227-270
// 使用submitTaskWithValidation进行统一验证
await submitTaskWithValidation(taskData, upfValidationConfig, formData);
```

**UPF验证配置**:
```typescript
// app/frontend/src/pages/tools/UPFGeneratorPage.tsx:37-46
const upfValidationConfig: ValidationConfig = {
    modNameRequired: true,
    requiredFiles: [
        { fieldName: 'hierYamlFile', fileName: 'hier.yaml', fileType: 'yaml', required: true },
        { fieldName: 'pvlogFile', fileName: 'pvlog.v', fileType: 'verilog', required: true },
        { fieldName: 'pobjTclFile', fileName: 'pobj.tcl', fileType: 'tcl', required: true },
        { fieldName: 'pcontXlsxFile', fileName: 'pcont.xlsx', fileType: 'excel', required: true }
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
};
```

### 📊 UPF文件间一致性检查

**当前状态**: ❌ **完全缺失**

**需要的UPF一致性检查**:
1. **ModName一致性**: ModName参数与hier.yaml中的顶层模块名称一致
2. **功耗域一致性**: hier.yaml中定义的功耗域与pobj.tcl中的功耗对象一致
3. **模块定义一致性**: pvlog.v中的模块与hier.yaml中定义的功耗域模块一致
4. **配置覆盖性**: pcont.xlsx中的配置覆盖所有定义的功耗域
5. **UPF版本一致性**: 所有文件使用相同的UPF版本规范

### 🚨 UPF特有问题和限制

#### 1. UPF特定验证缺失
- **功耗域定义**: 无法验证功耗域的完整性和正确性
- **UPF命令验证**: TCL文件中的UPF命令未验证
- **功耗配置验证**: Excel中的功耗配置格式未验证
- **版本兼容性**: 不同UPF版本(2.0/2.1/3.0)的兼容性未检查

#### 2. 4文件复杂性
- **文件依赖关系**: 4个文件之间的复杂依赖关系未验证
- **数据一致性**: 跨文件的数据一致性检查缺失
- **完整性验证**: 无法确保4文件组合的完整性

#### 3. UPF业务逻辑验证缺失
- **功耗域层次**: 功耗域的层次结构完整性未验证
- **供电网络**: 供电网络配置的正确性未检查
- **功耗策略**: 功耗管理策略的一致性未验证

### 🎯 UPF优化建议

#### 1. UPF特定验证增强
```typescript
// hier.yaml UPF特定检查
- design_hierarchy.top_module 字段验证
- design_hierarchy.power_domains 数组验证
- 功耗域名称和层次结构验证

// pobj.tcl UPF命令检查
- create_power_domain 命令验证
- set_domain_supply_net 命令验证
- UPF版本兼容性检查

// pcont.xlsx UPF配置验证
- Power_Domains 工作表验证
- Supply_Nets 工作表验证
- 功耗配置数据格式验证
```

#### 2. 4文件一致性验证
```typescript
// 跨文件一致性检查
1. 功耗域名称一致性 (hier.yaml ↔ pobj.tcl ↔ pcont.xlsx)
2. 模块名称一致性 (hier.yaml ↔ pvlog.v)
3. 供电网络一致性 (pobj.tcl ↔ pcont.xlsx)
4. 功耗策略一致性 (所有文件)
```

#### 3. UPF版本管理
```typescript
// UPF版本特定验证
- UPF 2.0: 基础功耗域支持
- UPF 2.1: 增强功耗管理
- UPF 3.0: 高级功耗优化
```

### 📈 UPF验证流程优化方案

#### 阶段1: 立即基础验证
```typescript
// 文件选择时立即执行
1. 文件扩展名和大小检查
2. 基础格式检查 (YAML/Verilog/TCL/Excel)
3. 文件内容非空检查
4. UPF特定关键字检查
```

#### 阶段2: UPF深度验证
```typescript
// 文件内容解析完成后执行
1. YAML功耗域结构验证
2. TCL UPF命令验证
3. Excel功耗配置表验证
4. Verilog功耗模块验证
```

#### 阶段3: 4文件一致性验证
```typescript
// 所有文件选择完成后执行
1. 功耗域名称一致性检查
2. 模块定义一致性验证
3. 供电网络配置一致性
4. UPF版本兼容性验证
```

### 🔧 UPF实现优先级

**高优先级** (立即实现):
1. 文件选择时的立即基础验证
2. UPF特定关键字检查 (power_domain, create_power_domain等)
3. 改进的错误提示和用户反馈

**中优先级** (后续实现):
1. 功耗域结构完整性验证
2. 4文件间的基础一致性检查
3. UPF版本兼容性验证

**低优先级** (长期优化):
1. 深度UPF业务逻辑验证
2. 智能功耗配置建议
3. 可视化功耗域结构展示
