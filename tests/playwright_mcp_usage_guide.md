# Playwright MCP 工具使用指南 - SDC/UPF 网页表格测试

## 一、工具选择说明

### 可用的 MCP 工具

根据您的环境，有两个浏览器自动化工具可用：

1. **Playwright MCP** (`mcp__playwright__*`) - 推荐使用
   - 功能完整，支持所有浏览器操作
   - 专为 E2E 测试设计
   - 支持 snapshot（可访问性树快照）优于截图

2. **Chrome DevTools MCP** (`mcp__chrome-devtools__*`)
   - 基于 Chrome DevTools Protocol
   - 更适合调试和性能分析

**推荐：使用 Playwright MCP 进行 SDC/UPF 测试**

---

## 二、Playwright MCP 核心操作流程

### 2.1 基本操作命令

```javascript
// 1. 导航到页面
mcp__playwright__browser_navigate({ url: "http://localhost:3000/login" })

// 2. 获取页面快照（用于了解页面结构）
mcp__playwright__browser_snapshot()

// 3. 填写表单字段
mcp__playwright__browser_type({
  element: "邮箱输入框",
  ref: "从 snapshot 获取的引用",
  text: "test@example.com"
})

// 4. 点击按钮
mcp__playwright__browser_click({
  element: "登录按钮",
  ref: "从 snapshot 获取的引用"
})

// 5. 等待元素出现
mcp__playwright__browser_wait_for({
  text: "VarDef",
  timeout: 10000  // 可选，默认超时
})

// 6. 上传文件
mcp__playwright__browser_file_upload({
  paths: ["/absolute/path/to/hier.yaml"]
})

// 7. 获取控制台日志（调试用）
mcp__playwright__browser_console_messages()
```

---

## 三、SDC 工具完整测试流程

### 3.1 测试前准备

确保服务已启动：
```bash
# 1. 启动数据库和 Redis
npm run docker:up

# 2. 启动后端 API
npm run dev:backend

# 3. 启动前端
npm run dev:frontend

# 4. 启动 Worker
npm run dev:worker
```

### 3.2 测试数据准备

测试文件位置：
- `test_data/upload_data/sdcgen/hier.yaml`
- `test_data/upload_data/sdcgen/vlog.v`
- `test_data/upload_data/sdcgen/dcont.xlsx`（预填充的测试数据）

### 3.3 完整测试步骤

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 1: 打开浏览器并导航到登录页
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_navigate
参数: { url: "http://localhost:3000/login" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 2: 获取页面快照，了解表单结构
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_snapshot
返回: 页面可访问性树，包含所有可交互元素的引用

示例输出：
[button] "登录"
  [textbox] "邮箱" name="email"
  [textbox] "密码" name="password"
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 3: 填写登录表单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_type
参数: {
  element: "邮箱输入框",
  ref: "从 snapshot 获取的 email 输入框引用",
  text: "test@example.com"
}

调用: mcp__playwright__browser_type
参数: {
  element: "密码输入框",
  ref: "从 snapshot 获取的 password 输入框引用",
  text: "your-password"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 4: 点击登录按钮
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_click
参数: {
  element: "登录按钮",
  ref: "从 snapshot 获取的登录按钮引用"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 5: 导航到 SDC 工具页面
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_navigate
参数: { url: "http://localhost:3000/tools/sdc-generator" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 6: 填写 SDC 初始化表单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_snapshot
// 获取页面结构，找到表单字段

调用: mcp__playwright__browser_type
参数: {
  element: "模块名输入框",
  ref: "modName 输入框引用",
  text: "test_module"
}

// 如果 isFlat 是复选框
调用: mcp__playwright__browser_click
参数: {
  element: "IsFlat 复选框",
  ref: "isFlat 复选框引用"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 7: 上传文件（重点）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_snapshot
// 找到文件上传按钮

// 方法1: 直接点击文件输入框（如果可见）
调用: mcp__playwright__browser_click
参数: {
  element: "hier.yaml 文件上传按钮",
  ref: "文件上传引用"
}

调用: mcp__playwright__browser_file_upload
参数: {
  paths: ["/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/hier.yaml"]
}

// 重复上传 vlog.v
调用: mcp__playwright__browser_file_upload
参数: {
  paths: ["/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/vlog.v"]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 8: 点击"保存并下一步"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_click
参数: {
  element: "保存并下一步按钮",
  ref: "按钮引用"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 9: 等待页面跳转到数据填写页面
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_wait_for
参数: {
  text: "VarDef",
  timeout: 15000
}

调用: mcp__playwright__browser_snapshot
// 获取数据填写页面的结构

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 10: 表格数据操作（重点难点）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

根据测试策略文档，有两种方案：

方案 A: Playwright 手动填写表格（复杂，不推荐）
  - 逐个点击单元格
  - 填写数据
  - 添加行
  - 优点：真实模拟用户操作
  - 缺点：复杂、慢、难维护

方案 B: API 注入预填充数据（推荐）⭐
  - 使用预填充的 dcont.xlsx
  - 通过 API 注入数据到数据库
  - 刷新页面查看结果

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 11: DataSav - 保存数据
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_snapshot
// 找到 DataSav 按钮

调用: mcp__playwright__browser_click
参数: {
  element: "DataSav 按钮",
  ref: "按钮引用"
}

调用: mcp__playwright__browser_wait_for
参数: {
  text: "保存成功",
  timeout: 5000
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 12: DataChk - 数据检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_click
参数: {
  element: "DataChk 按钮",
  ref: "按钮引用"
}

调用: mcp__playwright__browser_wait_for
参数: {
  text: "检查通过",
  timeout: 30000
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 13: Submit - 提交任务
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_click
参数: {
  element: "提交任务按钮",
  ref: "按钮引用"
}

调用: mcp__playwright__browser_wait_for
参数: {
  text: "RUNNING",
  timeout: 30000
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 14: 等待任务完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_wait_for
参数: {
  text: "COMPLETED",
  timeout: 180000
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 15: 下载结果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

调用: mcp__playwright__browser_click
参数: {
  element: "下载结果按钮",
  ref: "按钮引用"
}
```

---

## 四、API 注入方案详解（推荐）

### 4.1 为什么推荐 API 注入？

1. **表格结构复杂**: SDC/UPF 有多级表格、下拉选项、引用关系
2. **Playwright 填写困难**: 需要处理动态生成的单元格、自定义编辑器
3. **测试数据可复用**: 预填充的 Excel 可以保证数据正确性
4. **维护成本低**: 数据集中管理，修改方便

### 4.2 API 注入实现

使用 Playwright MCP 的 `browser_evaluate` 功能：

```javascript
// 在页面中执行 JavaScript，直接调用 API
mcp__playwright__browser_evaluate({
  function: `async () => {
    // 读取预填充的 Excel 数据
    const excelData = {
      dirtySheetData: [
        {
          sheetName: "VarDef",
          sheetId: "VarDef",
          tables: [
            {
              tableId: "TMVAR",
              tableName: "TMVAR",
              data: {
                rows: [
                  { HD_MOD_NAME: "test_module", HD_STAGE: "RTL", HD_TOOL: "DC WLM" }
                ]
              }
            }
          ]
        }
      ]
    };

    // 获取当前页面的 taskId
    const url = window.location.href;
    const taskId = url.match(/([a-f0-9-]+)\\/VarDef/)?.[1];

    // 调用 DataSav API
    const response = await fetch('/api/v1/sdc-thrpages/data-sav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskId,
        dirtySheetData: excelData.dirtySheetData
      })
    });

    return await response.json();
  }`
})
```

### 4.3 使用 XLSX-Populate 读取 Excel

更好的方式是创建一个辅助脚本：

```javascript
// tests/helpers/playwright-excel-injector.ts
import XlsxPopulate from 'xlsx-populate';

export async function injectExcelDataViaPlaywright(page, taskId, excelPath) {
  // 1. 读取 Excel 文件
  const workbook = await XlsxPopulate.fromFileAsync(excelPath);

  // 2. 解析数据为 API 格式
  const dirtySheetData = parseExcelToApiFormat(workbook);

  // 3. 通过 Playwright 在页面中执行注入
  await page.evaluate((data) => {
    return fetch('/api/v1/sdc-thrpages/data-sav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json());
  }, {
    taskId,
    dirtySheetData
  });

  // 4. 刷新页面
  await page.reload({ waitUntil: 'networkidle' });
}
```

---

## 五、实战示例：完整测试脚本

### 5.1 创建测试辅助文件

创建 `tests/e2e/helpers/playwright-sdc-test.ts`：

```typescript
import { chromium } from 'playwright';

export class SdcE2ETester {
  private browser;
  private page;

  async setup() {
    this.browser = await chromium.launch({
      headless: false,  // 显示浏览器窗口
      slowMo: 1000      // 每个操作延迟1秒，便于观察
    });
    this.page = await this.browser.newPage();
  }

  async goto(url: string) {
    await this.page.goto(url);
  }

  async login(email: string, password: string) {
    await this.page.fill('[name="email"]', email);
    await this.page.fill('[name="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL(/\/$/, { timeout: 5000 });
  }

  async initializeSdcTask(params: {
    modName: string;
    isFlat: boolean;
    hierYamlPath: string;
    vlogPath: string;
  }) {
    // 导航到 SDC 工具
    await this.page.goto('/tools/sdc-generator');

    // 填写表单
    await this.page.fill('[name="modName"]', params.modName);

    if (params.isFlat) {
      await this.page.check('[name="isFlat"]');
    } else {
      await this.page.uncheck('[name="isFlat"]');
    }

    // 上传文件
    await this.page.setInputFiles('[name="hierYamlFile"]', params.hierYamlPath);
    await this.page.setInputFiles('[name="vlogFile"]', params.vlogPath);

    // 点击保存并下一步
    await this.page.click('button:has-text("保存并下一步")');

    // 等待跳转
    await this.page.waitForURL(/\/tools\/sdc-generator\/[a-f0-9-]+\/VarDef/, {
      timeout: 10000
    });

    // 返回 taskId
    const url = this.page.url();
    const match = url.match(/([a-f0-9-]+)\/VarDef/);
    return match ? match[1] : null;
  }

  async injectTestData(taskId: string, excelPath: string) {
    // 使用 API 注入测试数据
    const XlsxPopulate = require('xlsx-populate');
    const workbook = await XlsxPopulate.fromFileAsync(excelPath);
    const dirtySheetData = this.parseExcelData(workbook);

    // 在页面中执行注入
    await this.page.evaluate(async ({ taskId, dirtySheetData }) => {
      const response = await fetch('/api/v1/sdc-thrpages/data-sav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, dirtySheetData })
      });
      return await response.json();
    }, { taskId, dirtySheetData });

    // 刷新页面
    await this.page.reload({ waitUntil: 'networkidle' });
  }

  async dataSav() {
    const button = this.page.locator('button:has-text("DataSav")');
    const isDisabled = await button.isDisabled();

    if (!isDisabled) {
      await button.click();
      await this.page.waitForSelector('text=/保存|成功/i', { timeout: 5000 });
    }
  }

  async dataChk() {
    await this.page.click('button:has-text("DataChk")');
    await this.page.waitForSelector('text=检查通过', { timeout: 30000 });
  }

  async submitTask() {
    await this.page.click('button:has-text("提交任务")');
    await this.page.waitForSelector('text=RUNNING', { timeout: 30000 });
    await this.page.waitForSelector('text=COMPLETED', { timeout: 180000 });
  }

  async downloadResult() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.click('button:has-text("下载结果")');
    const download = await downloadPromise;
    return download.suggestedFilename();
  }

  private parseExcelData(workbook: any): any[] {
    // Excel 解析逻辑
    // 根据实际的 Excel 结构实现
    return [];
  }

  async teardown() {
    await this.browser.close();
  }
}

// 使用示例
async function runTest() {
  const tester = new SdcE2ETester();

  try {
    await tester.setup();

    // 1. 登录
    await tester.goto('http://localhost:3000/login');
    await tester.login('test@example.com', 'password');

    // 2. 初始化任务
    const taskId = await tester.initializeSdcTask({
      modName: 'test_module',
      isFlat: false,
      hierYamlPath: '/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/hier.yaml',
      vlogPath: '/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/vlog.v'
    });

    console.log('Task ID:', taskId);

    // 3. 注入测试数据
    await tester.injectTestData(
      taskId,
      '/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/dcont.xlsx'
    );

    // 4. DataSav
    await tester.dataSav();

    // 5. DataChk
    await tester.dataChk();

    // 6. Submit
    await tester.submitTask();

    // 7. 下载结果
    const filename = await tester.downloadResult();
    console.log('Downloaded:', filename);

  } finally {
    await tester.teardown();
  }
}
```

---

## 六、关键注意事项

### 6.1 文件路径

- Playwright 需要绝对路径
- WSL2 环境使用 `/home/tommy2025/...` 格式
- 不要使用 Windows 路径（如 `C:\...`）

### 6.2 浏览器选择

```bash
# 确保 WSL2 中安装了 Chromium
wsl --update

# 或安装 Chrome
sudo apt install chromium-browser
```

### 6.3 快照使用

每次操作前调用 `browser_snapshot()` 获取当前页面结构：
- 找到元素的引用（ref）
- 了解页面的可访问性结构
- 确认元素是否可见和可交互

### 6.4 等待策略

```javascript
// 等待文本出现
browser_wait_for({ text: "VarDef" })

// 等待文本消失
browser_wait_for({ textGone: "加载中..." })

// 等待固定时间
browser_wait_for({ time: 2 })
```

### 6.5 调试技巧

```javascript
// 查看控制台日志
browser_console_messages({ level: "error" })

// 查看网络请求
browser_network_requests()

// 截图（用于调试）
browser_take_screenshot({ filename: "debug-page.png" })
```

---

## 七、快速开始示例

### 最简单的测试流程

```bash
# 1. 启动所有服务
npm run dev

# 2. 在另一个终端，使用 Claude Code 执行：
```

```
用户输入: "帮我使用 Playwright 测试 SDC 工具"

Claude 会执行：
1. browser_navigate → 打开登录页
2. browser_snapshot → 获取页面结构
3. browser_type → 填写邮箱密码
4. browser_click → 点击登录
5. browser_navigate → 导航到 SDC 工具
6. browser_type → 填写 modName
7. browser_file_upload → 上传文件
8. browser_click → 保存并下一步
9. browser_wait_for → 等待数据页面
10. browser_evaluate → API 注入数据
11. browser_click → DataSav
12. browser_click → DataChk
13. browser_click → Submit
14. browser_wait_for → 等待完成
15. browser_click → 下载结果
```

---

## 八、与测试策略文档的对应关系

| 测试策略文档章节 | Playwright MCP 操作 |
|----------------|---------------------|
| 第二步：初始化 | `browser_navigate` + `browser_type` + `browser_file_upload` |
| 第三步：API 注入 | `browser_evaluate` 调用 DataSav API |
| 第五步：DataSav | `browser_click` 点击 DataSav 按钮 |
| 第六步：DataChk | `browser_click` 点击 DataChk 按钮 |
| 第七步：Submit | `browser_click` 点击提交按钮 |
| 第八步：等待完成 | `browser_wait_for` 等待 COMPLETED 状态 |

---

## 九、下一步行动建议

1. **先手动执行一次完整流程**，了解每个步骤的页面结构
2. **使用 browser_snapshot()** 记录每个页面的元素引用
3. **准备测试数据**：确保 dcont.xlsx 包含正确的测试数据
4. **编写辅助函数**：创建 `SdcE2ETester` 类封装常用操作
5. **逐步自动化**：从简单的登录测试开始，逐步添加复杂操作

---

## 十、快速参考：常用 Playwright MCP 命令

```bash
# 导航
mcp__playwright__browser_navigate({ url: "..." })

# 快照（获取页面结构）
mcp__playwright__browser_snapshot()

# 填写文本
mcp__playwright__browser_type({ element: "...", ref: "...", text: "..." })

# 点击
mcp__playwright__browser_click({ element: "...", ref: "..." })

# 上传文件
mcp__playwright__browser_file_upload({ paths: ["..."] })

# 等待
mcp__playwright__browser_wait_for({ text: "...", timeout: ... })

# 执行 JavaScript
mcp__playwright__browser_evaluate({ function: "..." })

# 控制台日志
mcp__playwright__browser_console_messages()

# 网络请求
mcp__playwright__browser_network_requests()

# 截图
mcp__playwright__browser_take_screenshot({ filename: "..." })

# 标签页管理
mcp__playwright__browser_tabs({ action: "list|new|close|select" })

# 调整窗口大小
mcp__playwright__browser_resize({ width: ..., height: ... })
```

---

**文档版本**: v1.0
**最后更新**: 2026-01-13
**相关文档**: `ecsonly_auto_test_stategy_method.md`
