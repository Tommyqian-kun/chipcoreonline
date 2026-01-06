# LogicCore 项目自动化测试策略方案

## 一、测试目标概述

根据需求，自动化测试需要覆盖以下四个方面：

1. **端到端功能测试 (E2E Testing)** - 模拟真实用户操作流程
2. **API和业务逻辑测试 (Integration Testing)** - 测试后端核心逻辑
3. **组件和单元测试 (Unit Testing)** - 测试前端组件和独立模块
4. **性能和压力测试 (Performance Testing)** - 测试并发和系统负载

## 二、现有测试数据盘点

### 2.1 已有测试文件

**SDC工具测试数据** (`test_data/upload_data/sdcgen/`):
- `hier.yaml` - 层次结构文件
- `vlog.v` - Verilog网表文件
- `dcont.xlsx` - Excel模板（包含多页面表单）

**UPF工具测试数据** (`test_data/upload_data/upfgen/`):
- `hier.yaml` - 层次结构文件
- `pvlog.v` - 功耗Verilog文件
- `pobj.tcl` - TCL对象文件
- `pcell.yaml` - 功耗单元文件
- `pcont.xlsx` - Excel模板（包含多页面表单）

### 2.2 表单数据结构

**SDC工具表单** (dcont.xlsx):
- VarDef (变量定义) - TMVAR表格
- ClkDef (时钟定义) - TMCLK表格
- IODly (IO延迟) - TMIODLY表格
- Exp (表达式) - TMIOEXP, TMINOUT, TMINTEXP, TMSTPGATE表格

**UPF工具表单** (pcont.xlsx):
- VarDef (变量定义) - PMVAR, PMCELL表格
- PDomain (功耗域) - PMDOMAIN, PMNETWORK, PMBOUNDARY表格
- PStrategy (功耗策略) - PMISO, PMLS, PMPSW, PMRET表格
- PMode (功耗模式) - PMMODE表格

## 三、核心问题待确认

### 3.1 表单数据填写方式

这是端到端测试的关键问题，有以下几种方案：

**方案A：预填充Excel文件**
- 优点：简单直接，一次性准备
- 缺点：数据固定，难以覆盖多种场景

**方案B：API直接填充**
- 优点：快速、可控、易于覆盖多种场景
- 缺点：绕过前端，无法测试前端表单逻辑

**方案C：Playwright自动化填写**
- 优点：真实模拟用户操作，覆盖前端逻辑
- 缺点：需要维护选择器和填写逻辑

**方案D：混合方案（推荐）**
- API测试：使用方案B，快速验证业务逻辑
- E2E测试：使用方案A+C，预填充基础数据 + Playwright验证关键流程

采用Playwright自动上传 + 预填充Excel + API注入方案，后面第8章会有详细阐述。

### 3.2 测试数据准备策略

需要准备以下级别的测试数据：

1. **最小数据集** - 快速验证功能
   - SDC: 1个时钟定义、1个IO延迟
   - UPF: 1个功耗域、1个电源策略

2. **标准数据集** - 覆盖常见场景
   - SDC: 3-5个时钟、多种延迟类型、基本表达式
   - UPF: 2-3个功耗域、完整的策略定义、2种电源模式

3. **边界数据集** - 测试边界条件
   - 空数据、超长数据、特殊字符
   - 必填字段缺失、数据类型错误

4. **压力数据集** - 性能测试
   - 大量表格行（100+行）
   - 复杂的引用关系

## 四、测试工具链

### 4.1 已安装MCP工具
- `playwright` - 浏览器自动化测试
- `chrome-devtools` - 浏览器调试和控制

### 4.2 需要安装的工具

**前端测试**:
- Vitest - 单元测试框架（Vite原生支持）
- React Testing Library - React组件测试
- @playwright/test - Playwright测试框架

**后端测试**:
- Jest/Supertest - API测试
- Docker Compose - 测试环境管理

**性能测试**:
- Artillery/k6 - 负载测试
- 自定义并发测试脚本

### 4.3 辅助工具
- `openpyxl` - Excel文件读写（用于准备测试数据）
- `xlsx-populate` - Node.js Excel操作

## 五、测试环境配置

### 5.1 环境要求

**必需服务**:
- PostgreSQL 14+ (测试数据库)
- Redis 7+ (测试队列)
- Docker (工具容器执行)
- Chrome/Chromium (浏览器测试)

**环境变量** (.env.test):
```env
DATABASE_URL="postgresql://test:test@localhost:5433/logiccore_test"
REDIS_URL="redis://localhost:6380"
DEPLOYMENT_MODE="ecs_only"
JWT_SECRET="test-secret-key"
PORT=8081
FRONTEND_PORT=3001
```

### 5.2 Docker Compose测试环境

```yaml
# docker-compose.test.yml
services:
  test-postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: logiccore_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"

  test-redis:
    image: redis:7
    ports:
      - "6380:6379"

  test-worker:
    build: ./app/backend
    command: python src/workers/toolWorker.py
    environment:
      DEPLOYMENT_MODE: ecs_only
```

## 六、测试项目结构

```
tests/
├── e2e/                          # 端到端测试
│   ├── fixtures/                 # 测试数据
│   │   ├── sdc/
│   │   │   ├── minimal.xlsx     # 最小数据集
│   │   │   └── standard.xlsx    # 标准数据集
│   │   └── upf/
│   │       ├── minimal.xlsx
│   │       └── standard.xlsx
│   ├── auth.spec.ts             # 认证测试
│   ├── sdc-tool.spec.ts         # SDC工具E2E测试
│   ├── upf-tool.spec.ts         # UPF工具E2E测试
│   └── helpers/                 # 测试辅助函数
│       ├── browser.ts
│       └── data.ts
│
├── integration/                  # 集成测试 (API)
│   ├── auth/                    # 认证相关
│   ├── tasks/                   # 任务管理
│   ├── sdc-thrpages/            # SDC多页面API
│   └── upf-thrpages/            # UPF多页面API
│
├── unit/                         # 单元测试
│   ├── frontend/                # 前端单元
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── backend/                 # 后端单元
│       ├── services/
│       └── workers/
│
├── performance/                  # 性能测试
│   ├── concurrent-tasks/
│   └── load-testing/
│
├── setup/                        # 测试环境设置
│   ├── db-seed.ts              # 数据库种子数据
│   └── test-env.ts             # 环境初始化
│
└── ecsonly_auto_test_stategy_method.md  # 本文档
```

## 七、具体测试项清单

### 7.1 端到端测试 (E2E)

**用户认证流程**:
- [ ] 用户注册
- [ ] 用户登录
- [ ] JWT token验证
- [ ] 自动登录
- [ ] 登出

**SDC工具完整流程**:
- [ ] 初始化页面填写
  - [ ] ModName输入与验证
  - [ ] IsFlat选择
  - [ ] hier.yaml上传
  - [ ] vlog.v上传与模块名提取
- [ ] 数据保存与TaskID生成
- [ ] 多页面表单展示
  - [ ] VarDef页面展示
  - [ ] ClkDef页面展示
  - [ ] IODly页面展示
  - [ ] Exp页面展示
- [ ] 表单数据操作
  - [ ] 添加行
  - [ ] 编辑行
  - [ ] 删除行
  - [ ] 下拉选择
  - [ ] 数据保存
- [ ] 数据检查
- [ ] 任务提交
- [ ] 任务执行监控
  - [ ] 状态更新
  - [ ] WebSocket推送
- [ ] 结果下载

**UPF工具完整流程**:
- [ ] 类似SDC流程
- [ ] 4个文件上传验证
- [ ] 功耗域管理
- [ ] 电源策略配置
- [ ] 电源模式定义

**权限控制**:
- [ ] 任务访问权限
- [ ] 结果下载权限
- [ ] 订阅级别限制

### 7.2 API集成测试

**认证API** (`/api/v1/auth/`):
- [ ] POST /register
- [ ] POST /login
- [ ] GET /me
- [ ] POST /refresh

**任务API** (`/api/v1/tasks/`):
- [ ] POST /create
- [ ] GET /:id
- [ ] GET /list
- [ ] PUT /:id
- [ ] DELETE /:id
- [ ] POST /:id/submit
- [ ] GET /:id/download

**SDC多页面API** (`/api/v1/sdc-thrpages/`):
- [ ] POST /initialize
- [ ] POST /data-sav
- [ ] POST /data-chk
- [ ] GET /sheets
- [ ] GET /sheets/:sheetId/tables
- [ ] GET /tables/:tableId/data

**UPF多页面API** (`/api/v1/upf-thrpages/`):
- [ ] 类似SDC API

**文件上传API**:
- [ ] 文件大小限制
- [ ] 文件类型验证
- [ ] 文件内容解析

### 7.3 单元测试

**前端组件**:
- [ ] SdcGeneratorInitialize组件
- [ ] SdcGeneratorFormPage组件
- [ ] TableEditor组件
- [ ] FormField组件
- [ ] FileUpload组件
- [ ] TaskMonitor组件

**前端Hooks**:
- [ ] useAuth
- [ ] useTask
- [ ] useWebSocket
- [ ] useFormValidation

**后端服务**:
- [ ] AuthService
- [ ] TaskService
- [ ] ExcelThrpagesService
- [ ] TaskStateManagerService
- [ ] FileStorageService

**后端Worker**:
- [ ] toolWorker.py
- [ ] container_manager.py

### 7.4 性能测试

**并发测试**:
- [ ] 10用户同时登录
- [ ] 5用户同时提交SDC任务
- [ ] 5用户同时提交UPF任务
- [ ] 混合场景（SDC+UPF并发）

**队列性能**:
- [ ] 48任务队列上限
- [ ] 任务处理速度
- [ ] Redis队列性能

**数据库性能**:
- [ ] 连接池管理
- [ ] 查询性能
- [ ] 事务处理

## 八、下一步行动

### 8.1 需要用户确认

1. **表单数据填写方式** - 选择方案A/B/C/D中的哪种？根据实际SDC/UPF工具的实际执行流程，采用Playwright自动上传 + 预填充Excel + API注入方案；
2. **测试数据准备** - 是否需要帮助准备不同级别的Excel测试文件？可以根据SDC/UPF不同工具业务场景要求，给出可以参考的不同级别的测试文件；
3. **测试工具安装** - 是否需要安装Vitest、Playwright等工具？已经安装playwright和chrome-devtools MCP工具；
4. **测试优先级** - 哪些测试项优先实现？SDC/UPF工具任务的自动化执行流程可以优先实现。

### 8.2 实施计划（混合方式）

#### 阶段1：基础设置（1-2天）

**任务清单**:
1. 安装测试依赖
   ```bash
   npm install -D vitest @vitest/ui @playwright/test
   npm install -D @testing-library/react @testing-library/jest-dom
   npm install -D supertest @types/supertest
   npm install -D xlsx-populate
   ```

2. 配置测试环境
   - 创建 `app/backend/.env.test`
   - 创建 `docker-compose.test.yml`
   - 配置 Vitest (`vitest.config.ts`)
   - 配置 Playwright (`playwright.config.ts`)

3. 准备测试数据
   - 修改现有Excel文件，创建最小数据集版本
   - 创建标准数据集版本
   - 创建边界数据集版本

#### 阶段2：API集成测试（2-3天）

**测试策略**：使用直接注入方式，快速验证业务逻辑

**关键文件**:
- `tests/integration/tasks/task-api.test.ts`
- `tests/integration/sdc-thrpages/sdc-api.test.ts`
- `tests/integration/upf-thrpages/upf-api.test.ts`

**测试数据准备**:
```typescript
// tests/integration/fixtures/sdc-data.ts
export const sdcMinimalData = {
  modName: 'test_module',
  isFlat: false,
  hierYaml: '/path/to/hier.yaml',
  vlogFile: '/path/to/vlog.v',
  tableData: {
    'TMVAR': {
      rows: [
        { HD_MOD_NAME: 'test_module', HD_STAGE: 'RTL', HD_TOOL: 'DC WLM' }
      ]
    },
    'TMCLK': {
      rows: [
        { ClkPin: 'clk', ClkName: 'sys_clk', ClkPeriod: 10 }
      ]
    }
  }
};
```

#### 阶段3：单元测试（2-3天）

**前端测试**:
- 组件测试：使用 Vitest + React Testing Library
- Hook测试：使用 @testing-library/react-hooks
- 工具函数测试：使用 Vitest

**后端测试**:
- Service测试：使用 Jest + 模拟数据库
- Controller测试：使用 Supertest
- Worker测试：使用 Jest + 模拟Docker

#### 阶段4：E2E测试（3-5天）

**测试策略**：使用预填充Excel + Playwright验证关键交互

**流程**:
1. 使用预填充的Excel文件（包含完整表单数据）
2. Playwright自动化上传文件
3. 验证前端展示和数据交互
4. 提交任务并验证结果

**关键文件**:
- `tests/e2e/auth.spec.ts` - 认证流程
- `tests/e2e/sdc-tool.spec.ts` - SDC完整流程
- `tests/e2e/upf-tool.spec.ts` - UPF完整流程

**示例代码**:
```typescript
// tests/e2e/sdc-tool.spec.ts
import { test, expect } from '@playwright/test';

test.describe('SDC Tool E2E', () => {
  test('complete workflow with pre-filled Excel', async ({ page }) => {
    // ========== 第一步：登录 ==========
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });

    // ========== 第二步：导航到SDC工具并初始化 ==========
    await page.goto('/tools/sdc-generator');

    // 填写初始化表单
    await page.fill('[name="modName"]', 'test_module');
    await page.uncheck('[name="isFlat"]'); // 或 check() 根据测试需求

    // 上传必需文件
    await page.setInputFiles('[name="hierYamlFile"]', 'test-data/fixtures/sdc/hier.yaml');
    await page.setInputFiles('[name="vlogFile"]', 'test-data/fixtures/sdc/vlog.v');

    // 点击"保存并下一步"按钮，触发initialize API
    await page.click('button:has-text("保存并下一步")');

    // 等待跳转到数据填写页面（应该包含taskId参数）
    await expect(page).toHaveURL(/\/tools\/sdc-generator\/[a-f0-9-]+\/VarDef/, { timeout: 10000 });

    // ========== 第三步：等待Excel生成和数据加载 ==========
    // 后端会调用sdc_dg_gen.py生成dcont.xlsx，解析后存储到数据库
    // 前端从数据库读取并展示表格数据
    await expect(page.locator('text=VarDef')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=ClkDef')).toBeVisible();

    // ========== 第四步：（可选）修改表格数据 ==========
    // 如果需要测试数据编辑功能，可以在此处操作表格
    // 例如：点击单元格、修改数据、添加行等

    // ========== 第五步：DataSav - 保存数据到数据库 ==========
    // 这是关键步骤！保存前端State的数据到数据库
    // API: POST /api/v1/sdc-thrpages/data-sav
    const dataSavButton = page.locator('button:has-text("DataSav")');
    await expect(dataSavButton).toBeVisible();

    // 检查按钮是否可点击（有isDirty数据时才能点击）
    const isDisabled = await dataSavButton.isDisabled();
    if (!isDisabled) {
      await dataSavButton.click();
      // 等待保存完成
      await expect(page.locator('text=保存成功') || page.locator('text=/保存/i')).toBeVisible({ timeout: 5000 });
    }

    // ========== 第六步：DataChk - 数据检查 ==========
    // API: POST /api/v1/sdc-thrpages/data-chk
    // 后端会将数据库数据同步到Excel，然后执行检查脚本
    await page.click('button:has-text("DataChk")');
    await expect(page.locator('text=检查通过')).toBeVisible({ timeout: 30000 });

    // ========== 第七步：提交任务 ==========
    // API: POST /api/v1/sdc-thrpages/:taskId/submit
    await page.click('button:has-text("提交任务")');
    await expect(page.locator('text=RUNNING')).toBeVisible({ timeout: 30000 });

    // ========== 第八步：等待任务完成 ==========
    // 任务状态会通过WebSocket实时推送
    await expect(page.locator('text=COMPLETED')).toBeVisible({ timeout: 180000 });

    // ========== 第九步：下载结果 ==========
    await page.click('button:has-text("下载结果")');
    // 验证下载...
  });
});
```

#### 阶段5：性能测试（1-2天）

**并发测试**:
```typescript
// tests/performance/concurrent-tasks.spec.ts
import { test } from 'vitest';
import { concurrentTaskSubmit } from './helpers/concurrent';

test('handle 5 concurrent SDC tasks', async () => {
  const results = await concurrentTaskSubmit({
    toolType: 'sdcgen',
    concurrentUsers: 5,
    testData: 'minimal'
  });

  expect(results.successCount).toBe(5);
  expect(results.maxCompletionTime).toBeLessThan(300000); // 5分钟
});
```

#### 阶段6：测试文档和CI集成（1天）

1. 编写测试运行文档
2. 添加测试命令到 package.json
3. （可选）配置GitHub Actions



### 重要说明：Excel测试数据处理和完整流程

## 项目工具任务实际流程深度分析

### 一、SDC/UPF工具的完整数据流转路径

基于对项目代码的深入分析（`app/backend/src/controllers/sdc_thrpages.controller.ts`），完整流程如下：

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Initialize阶段（初始化）                                          │
│    位置: sdc_thrpages.controller.ts:29-307                         │
├─────────────────────────────────────────────────────────────────────┤
│ ① 用户上传hier.yaml和vlog.v文件                                      │
│ ② 保存文件到 /opt/logiccore/temp/<taskId>/                          │
│ ③ 调用sdc_dg_gen.py生成空的dcont.xlsx（第191-238行）                │
│ ④ 【关键】调用ExcelThrpagesService.parseTaskExcelFile()（第266行）   │
│    └─ 解析dcont.xlsx并存储到数据库（Sheet/Table/TableData模型）      │
│ ⑤ 验证Excel↔数据库数据一致性（第271-287行）                          │
│ ⑥ 前端从数据库读取并展示空表格                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 数据填写阶段（用户交互）                                          │
│    位置: SdcGeneratorSubmit_thrpages.tsx                            │
├─────────────────────────────────────────────────────────────────────┤
│ ① 前端展示数据库中的表格数据                                         │
│ ② 用户在前端填写/修改表格数据                                        │
│ ③ 前端State维护isDirty状态（标记哪些sheet被修改）                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. DataSav阶段（保存数据）⭐ 必须执行                                │
│    API: POST /api/v1/sdc-thrpages/data-sav                          │
│    位置: sdc_thrpages.controller.ts:765-942                        │
├─────────────────────────────────────────────────────────────────────┤
│ ① 前端收集所有isDirty=true的sheet数据                                │
│ ② 调用DataSav API保存到数据库（saveDataToDatabase）                 │
│ ③ 更前端isDirty状态为false                                           │
│ ④ 返回保存成功消息                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. DataChk阶段（数据检查）⭐ 检查必须通过才能提交                    │
│    API: POST /api/v1/sdc-thrpages/data-chk                          │
│    位置: sdc_thrpages.controller.ts:947-591                        │
├─────────────────────────────────────────────────────────────────────┤
│ ① 【关键】调用ExcelThrpagesService.syncDatabaseToExcel()（第520行）  │
│    └─ 将数据库数据同步回dcont.xlsx文件                              │
│ ② 调用sdc_dg_chk.py检查dcont.xlsx（第526行）                        │
│ ③ 验证数据完整性、业务逻辑、引用关系等                               │
│ ④ 返回检查结果（通过/失败）                                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Submit阶段（提交任务）⭐ 只有检查通过才能提交                     │
│    API: POST /api/v1/sdc-thrpages/:taskId/submit                    │
│    位置: sdc_thrpages.controller.ts:600-757                        │
├─────────────────────────────────────────────────────────────────────┤
│ ① 检查用户并发限制                                                   │
│ ② 更新任务状态为QUEUED/RUNNING                                      │
│ ③ 任务进入Redis队列                                                 │
│ ④ Python Worker执行任务                                             │
│ ⑤ 实时推送进度到前端（WebSocket）                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 二、关键发现

**发现1：Excel文件的双重角色**
- **初始化时**：Excel → 数据库 → 前端展示
- **DataChk时**：数据库 → Excel → 检查脚本

**发现2：initialize API不接受Excel上传**
- 只接受hier.yaml和vlog.v文件
- dcont.xlsx由sdc_dg_gen.py自动生成

**发现3：test_data/upload_data的作用**
- 该目录下的dcont.xlsx包含**正确的、能通过检查的测试数据**
- 这些数据符合业务规则和检查逻辑
- 不能是空数据，否则DataChk会失败

### 三、测试数据处理策略

#### Q1: 能否直接上传预填充的Excel？

**答案：不能！** initialize API只接受hier.yaml和vlog.v，不接受Excel。

#### Q2: 那么如何使用test_data/upload_data下的测试数据？

**推荐方案：预填充Excel + API注入**

这是唯一能确保测试数据正确且符合业务规则的方案。

**完整测试流程**：

```
步骤1: 测试准备
  └─ 确保test_data/upload_data/sdcgen/dcont.xlsx包含正确的测试数据
     （数据符合检查规则，与hier.yaml/vlog.v关联正确）

步骤2: 初始化任务
  └─ 上传hier.yaml和vlog.v
  └─ 后端生成空dcont.xlsx并解析到数据库
  └─ 前端展示空表格

步骤3: API注入测试数据 ⭐ 关键步骤
  └─ 读取test_data/upload_data/sdcgen/dcont.xlsx
  └─ 调用DataSav API将数据注入数据库
  │   ⚠️【重要】API注入只能修改单元格的实际填写值（rowData），
  │      不会改变表格的列结构（columnsSchema）和下拉选项定义
  └─ 刷新前端页面，数据自动从数据库加载并展示

步骤4: DataSav ⭐ 必须执行
  └─ 点击DataSav按钮
  └─ 保存前端State数据到数据库
  └─ 验证保存成功

步骤5: DataChk ⭐ 检查必须通过
  └─ 点击DataChk按钮
  └─ 数据库数据同步到Excel
  └─ sdc_dg_chk.py检查数据
  └─ 验证检查通过

步骤6: Submit
  └─ 点击提交任务
  └─ 等待任务完成
```

### 四、完整测试代码示例

```typescript
// tests/e2e/sdc-tool-complete.spec.ts
import { test, expect } from '@playwright/test';
import { injectSdcTestData } from '../helpers/api-test-data';
import path from 'path';

test.describe('SDC Tool E2E - Complete Workflow', () => {
  test('complete workflow with preset test data', async ({ page }) => {
    // ========== 第一步：登录 ==========
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });

    // ========== 第二步：导航并初始化任务 ==========
    await page.goto('/tools/sdc-generator');
    await page.fill('[name="modName"]', 'test_module');
    await page.uncheck('[name="isFlat"]');
    await page.setInputFiles('[name="hierYamlFile"]', path.join(__dirname, '../fixtures/sdc/hier.yaml'));
    await page.setInputFiles('[name="vlogFile"]', path.join(__dirname, '../fixtures/sdc/vlog.v'));
    await page.click('button:has-text("保存并下一步")');

    // 等待跳转到数据页面并获取taskId
    await expect(page).toHaveURL(/\/tools\/sdc-generator\/([a-f0-9-]+)\/VarDef/, { timeout: 10000 });
    const url = page.url();
    const taskId = url.match(/([a-f0-9-]+)\/VarDef/)?.[1];
    console.log(`✅ 任务初始化成功，taskId: ${taskId}`);

    // ========== 第三步：API注入测试数据 ⭐ 关键 ==========
    // 从test_data/upload_data/sdcgen/dcont.xlsx读取预填充的测试数据
    // 并通过DataSav API注入到数据库
    if (taskId) {
      console.log(`📋 注入测试数据...`);
      await injectSdcTestData(taskId, 'test_data/upload_data/sdcgen/dcont.xlsx');

      // 刷新页面，前端从数据库重新加载数据
      await page.reload({ waitUntil: 'networkidle' });
      console.log(`✅ 测试数据已注入并加载`);
    }

    // ========== 第四步：验证数据展示 ==========
    // 验证预填充的数据已正确展示（根据实际测试数据调整）
    await expect(page.locator('text=VarDef')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ClkDef')).toBeVisible();

    // 如果预填充了特定数据，验证这些数据存在
    // await expect(page.locator('text=sys_clk')).toBeVisible();

    // ========== 第五步：DataSav - 保存数据 ⭐ 必须执行 ==========
    // 即使数据已通过API注入，仍需执行此步骤以模拟真实用户操作
    // 这确保前端State与数据库数据同步
    const dataSavButton = page.locator('button:has-text("DataSav")');

    // 检查按钮状态（如果有isDirty数据则可点击）
    const isDisabled = await dataSavButton.isDisabled();

    if (!isDisabled) {
      console.log(`💾 执行DataSav保存数据...`);
      await dataSavButton.click();

      // 等待保存成功提示
      await expect(page.locator('text=/保存|成功/i')).toBeVisible({ timeout: 5000 });
      console.log(`✅ DataSav保存成功`);
    } else {
      console.log(`ℹ️ DataSav按钮禁用（无isDirty数据），跳过`);
    }

    // ========== 第六步：DataChk - 数据检查 ⭐ 检查必须通过 ==========
    console.log(`🔍 执行DataChk数据检查...`);
    await page.click('button:has-text("DataChk")');

    // 等待检查完成（可能需要较长时间）
    await expect(page.locator('text=检查通过')).toBeVisible({ timeout: 30000 });
    console.log(`✅ DataChk检查通过`);

    // ========== 第七步：Submit - 提交任务 ==========
    console.log(`📤 提交任务...`);
    await page.click('button:has-text("提交任务")');

    // 等待任务状态变为RUNNING
    await expect(page.locator('text=RUNNING')).toBeVisible({ timeout: 30000 });
    console.log(`✅ 任务已提交，正在执行`);

    // ========== 第八步：等待任务完成 ==========
    // 任务状态通过WebSocket实时推送
    await expect(page.locator('text=COMPLETED')).toBeVisible({ timeout: 180000 });
    console.log(`✅ 任务执行完成`);

    // ========== 第九步：下载结果 ==========
    console.log(`📥 下载结果...`);
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("下载结果")');
    const download = await downloadPromise;

    // 验证下载文件
    expect(download.suggestedFilename()).toContain('.zip');
    console.log(`✅ 结果下载成功: ${download.suggestedFilename()}`);
  });
});
```

### 五、测试数据注入辅助函数与重要技术说明

#### 5.1 API注入技术原理分析

**关键代码位置**：`app/backend/src/services/excel_thrpages.service.ts:2240-2390`

**数据库模型结构**：
```
Table 模型（表结构定义 - 初始化时创建）:
├── columnsSchema: Json     - 列名、类型、索引
├── tableName: String
└── ⚠️ 不包含下拉选项定义

TableData 模型（用户填写的数据）:
├── rowData: Json          - 用户实际填写的值 ⭐
├── dropdownData: Json?    - 单元格的下拉选项缓存（从Excel解析时自动生成）
└── validationData: Json?  - 数据验证规则（从Excel解析时自动生成）
```

**saveDirtySheetData 方法行为**：
```typescript
// 第2301-2308行：只删除 TableData 记录（不影响 Table 模型）
await prisma.tableData.deleteMany({
  where: { taskId, userId, sheetId: dbSheet.id }
});

// 第2359-2362行：只创建 TableData 记录
await prisma.tableData.createMany({
  data: dataToInsert  // 只包含 TableData，不修改 Table
});
```

**关键结论**：
- ✅ **只能注入单元格的实际填写值** (rowData)
- ✅ **不会修改 Table 模型的 columnsSchema**（表格列结构）
- ✅ **不会改变下拉选项定义**（下拉选项定义在 Excel 文件的数据验证中，不在数据库）
- ✅ **初始化时已自动保存 dropdownData**（从 Excel 文件解析时自动提取）

#### 5.2 测试数据注入的正确实现

```typescript
// tests/helpers/api-test-data.ts
import { request } from '@playwright/test';
import XlsxPopulate from 'xlsx-populate';
import * as fs from 'fs';

/**
 * 从预填充的Excel文件读取数据并注入到数据库
 *
 * ⚠️【重要】此函数只注入单元格的实际填写值（rowData）
 *            不会改变表格的列结构（columnsSchema）和下拉选项定义
 *
 * @param taskId 任务ID
 * @param excelPath 预填充的Excel文件路径（如 test_data/upload_data/sdcgen/dcont.xlsx）
 */
export async function injectSdcTestData(taskId: string, excelPath: string) {
  const context = await request.newContext({
    baseURL: 'http://localhost:8080',
  });

  try {
    // 1. 读取预填充的Excel文件
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Excel文件不存在: ${excelPath}`);
    }

    const workbook = await XlsxPopulate.fromFileAsync(excelPath);
    console.log(`📂 读取Excel文件: ${excelPath}`);

    // 2. 解析每个Sheet的数据
    const dirtySheetData: any[] = [];

    // SDC工具的Sheet定义
    const sdcSheets = [
      { name: 'VarDef', tables: ['TMVAR'] },
      { name: 'ClkDef', tables: ['TMCLK'] },
      { name: 'IODly', tables: ['TMIODLY'] },
      { name: 'Exp', tables: ['TMIOEXP', 'TMINOUT', 'TMINTEXP', 'TMSTPGATE'] }
    ];

    for (const sheetDef of sdcSheets) {
      const sheet = workbook.sheet(sheetDef.name);
      if (!sheet) continue;

      const tables: any[] = [];

      for (const tableName of sheetDef.tables) {
        // 查找表格的起始位置（通过查找标识符行）
        const tableData = extractTableData(sheet, tableName);
        if (tableData.rows.length > 0) {
          tables.push({
            tableId: tableName,
            tableName: tableName,
            data: tableData.rows  // ⭐ 只包含 rowData，不包含 dropdownData
          });
        }
      }

      if (tables.length > 0) {
        dirtySheetData.push({
          sheetName: sheetDef.name,
          sheetId: sheetDef.name,
          tables: tables
        });
      }
    }

    // 3. 调用DataSav API保存到数据库
    // ⭐ 后端会保留初始化时生成的 dropdownData，不会覆盖
    if (dirtySheetData.length > 0) {
      const response = await context.post('/api/v1/sdc-thrpages/data-sav', {
        data: {
          taskId: taskId,
          dirtySheetData: dirtySheetData
        }
      });

      const result = await response.json();

      if (result.success) {
        console.log(`✅ 测试数据已注入数据库: ${result.message}`);
        console.log(`✅ 表格结构和下拉选项保持不变`);
      } else {
        throw new Error(`注入数据失败: ${result.error}`);
      }
    } else {
      console.log(`⚠️ Excel文件中没有找到有效数据`);
    }

  } catch (error) {
    console.error(`❌ 注入测试数据失败:`, error);
    throw error;
  } finally {
    await context.dispose();
  }
}

/**
 * 从Sheet中提取指定表格的数据
 *
 * ⚠️【重要】只提取单元格的实际填写值，不提取下拉选项
 */
function extractTableData(sheet: any, tableName: string) {
  // 实现表格数据提取逻辑
  // 需要根据实际的Excel结构来解析
  const rows: any[] = [];

  // TODO: 实现具体的表格数据提取逻辑
  // 这里需要根据dcont.xlsx的实际结构来解析
  // 只提取用户填写的值（rowData），不提取下拉选项（dropdownData）

  return { rows };
}

/**
 * 为UPF工具注入测试数据
 */
export async function injectUpfTestData(taskId: string, excelPath: string) {
  // 类似injectSdcTestData的实现，针对UPF工具的表格结构
  // UPF Sheet定义: VarDef(PMVAR,PMCELL), PDomain, PStrategy, PMode
}
```

#### 5.3 关键技术要点总结

| 数据类型 | 存储位置 | API注入时行为 |
|---------|---------|--------------|
| **列结构定义** (columnsSchema) | Table 模型 | ❌ 不修改，保持初始化时的定义 |
| **下拉选项定义** | Excel 文件的数据验证 | ❌ 不修改，保持 Excel 原有定义 |
| **下拉选项缓存** (dropdownData) | TableData 模型 | ✅ 保留初始化时自动生成的值 |
| **单元格填写值** (rowData) | TableData 模型 | ✅ 可以修改并注入新值 |
| **验证规则** (validationData) | TableData 模型 | ✅ 保留初始化时自动生成的值 |

**无需额外编写注入代码**：现有的 DataSav API (`/api/v1/sdc-thrpages/data-sav`) 已经完美满足需求，只需正确调用即可。

### 六、测试数据准备要求

**test_data/upload_data/sdcgen/dcont.xlsx 必须满足**：

1. **数据完整性**：所有必填字段必须填写
2. **数据关联性**：表格之间的引用关系必须正确
3. **文件一致性**：数据必须与hier.yaml和vlog.v的内容匹配
4. **检查规则符合性**：必须能通过sdc_dg_chk.py的检查

**最小测试数据示例**：
- VarDef/TMVAR: 至少1行，包含HD_MOD_NAME、HD_STAGE、HD_TOOL
- ClkDef/TMCLK: 至少1行，包含ClkPin、ClkName、ClkPeriod

**如果测试数据不符合要求**，DataChk会失败，导致无法Submit。因此建议：
1. 使用实际项目中的有效数据作为测试数据
2. 或者手动填写一次并通过检查后，保存该Excel作为测试数据

### 七、三种测试方案对比与技术要点

| 方案 | 优点 | 缺点 | 推荐场景 |
|------|------|------|----------|
| **方案A：空表格** | 简单快速 | 需要手动填写，DataChk可能失败 | 快速验证基本流程 |
| **方案B：API注入** ⭐ | 数据正确，流程完整，不影响表格结构和下拉选项 | 需要准备Excel和注入脚本 | 完整功能测试 |
| **方案C：Playwright填写** | 最真实，覆盖前端交互逻辑 | 复杂、慢、难维护 | 前端交互测试 |

**方案B（API注入）的技术要点**：
- ✅ **只注入单元格填写值** (rowData) - 符合真实用户操作
- ✅ **不修改表格结构** (columnsSchema) - 保持初始化定义
- ✅ **不改变下拉选项** (dropdownData 自动保留) - 保持业务逻辑约束
- ✅ **使用现有 DataSav API** - 无需额外编写代码

**推荐策略**：
- 主要使用**方案B**进行E2E测试（完整功能验证）
- 少量使用**方案C**验证前端交互（UI/UX测试）
- 方案A仅用于快速调试（开发阶段）


### 八、UPF工具测试说明

UPF工具的测试流程与SDC工具完全相同，只需要替换：

1. **API端点**：`/api/v1/sdc-thrpages/*` → `/api/v1/upf-thrpages/*`
2. **测试文件**：
   - 上传4个文件：hier.yaml、pvlog.v、pobj.tcl、pcell.yaml
   - Excel文件：pcont.xlsx（包含PMVAR、PMDOMAIN等表格）
3. **辅助函数**：`injectSdcTestData()` → `injectUpfTestData()`

测试流程保持不变：Initialize → API注入数据 → DataSav → DataChk → Submit。



### 九、测试命令示例

```bash
# 运行所有测试
npm run test

# 运行单元测试
npm run test:unit

# 运行API集成测试
npm run test:integration

# 运行E2E测试
npm run test:e2e

# 运行性能测试
npm run test:performance

# 运行特定测试文件
npm run test -- sdc-tool.spec.ts

# 测试覆盖率
npm run test:coverage

# 启动测试环境
npm run test:env:up

# 停止测试环境
npm run test:env:down
```

### 十、关键文件路径清单

#### 需要创建的文件

**测试配置**:
- `vitest.config.ts` - Vitest配置
- `playwright.config.ts` - Playwright配置
- `docker-compose.test.yml` - 测试环境Docker配置
- `app/backend/.env.test` - 测试环境变量

**测试辅助**:
- `tests/setup/test-env.ts` - 测试环境初始化
- `tests/setup/db-seed.ts` - 数据库种子数据
- `tests/helpers/api.ts` - API测试辅助函数
- `tests/helpers/browser.ts` - 浏览器测试辅助函数

**测试数据**:
- `tests/e2e/fixtures/sdc/minimal.xlsx` - SDC最小数据集
- `tests/e2e/fixtures/sdc/standard.xlsx` - SDC标准数据集
- `tests/e2e/fixtures/upf/minimal.xlsx` - UPF最小数据集
- `tests/e2e/fixtures/upf/standard.xlsx` - UPF标准数据集

#### 需要修改的文件

**package.json** - 添加测试脚本和依赖
**.gitignore** - 添加测试覆盖率报告目录


**文档状态**: 待用户确认后细化
**目标位置**: `/home/tommy2025/work/LogicCore/tests/ecsonly_auto_test_stategy_method.md`
