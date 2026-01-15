# agent-browser 使用指南 - LogicCore SDC/UPF 测试

## 一、agent-browser 简介

**agent-browser** 是 Vercel Labs 开发的专门为 AI Agents 设计的浏览器自动化 CLI 工具。

### 核心特点
- Rust 原生 CLI，性能优越
- 专门为 AI Agents 设计
- 使用引用系统 (@e1, @e2, ...) 精确定位元素
- 支持 JavaScript 执行（用于 API 注入）

---

## 二、核心命令速查

### 2.1 基础工作流程（最重要）

```bash
1. agent-browser open <url>       # 打开页面
2. agent-browser snapshot -i      # 获取可交互元素快照（带 refs）
3. agent-browser click @e1        # 使用 ref 点击元素
4. agent-browser fill @e2 "text"  # 使用 ref 填写文本
5. agent-browser snapshot -i      # 页面变化后重新快照
6. agent-browser close            # 关闭浏览器

# from https://github.com/vercel-labs/agent-browser
#Commands
#Core Commands
agent-browser open <url>              # Navigate to URL (aliases: goto, navigate)
agent-browser click <sel>             # Click element
agent-browser dblclick <sel>          # Double-click element
agent-browser focus <sel>             # Focus element
agent-browser type <sel> <text>       # Type into element
agent-browser fill <sel> <text>       # Clear and fill
agent-browser press <key>             # Press key (Enter, Tab, Control+a) (alias: key)
agent-browser keydown <key>           # Hold key down
agent-browser keyup <key>             # Release key
agent-browser hover <sel>             # Hover element
agent-browser select <sel> <val>      # Select dropdown option
agent-browser check <sel>             # Check checkbox
agent-browser uncheck <sel>           # Uncheck checkbox
agent-browser scroll <dir> [px]       # Scroll (up/down/left/right)
agent-browser scrollintoview <sel>    # Scroll element into view (alias: scrollinto)
agent-browser drag <src> <tgt>        # Drag and drop
agent-browser upload <sel> <files>    # Upload files
agent-browser screenshot [path]       # Take screenshot (--full for full page)
agent-browser pdf <path>              # Save as PDF
agent-browser snapshot                # Accessibility tree with refs (best for AI)
agent-browser eval <js>               # Run JavaScript
agent-browser close                   # Close browser (aliases: quit, exit)

#Get Info
agent-browser get text <sel>          # Get text content
agent-browser get html <sel>          # Get innerHTML
agent-browser get value <sel>         # Get input value
agent-browser get attr <sel> <attr>   # Get attribute
agent-browser get title               # Get page title
agent-browser get url                 # Get current URL
agent-browser get count <sel>         # Count matching elements
agent-browser get box <sel>           # Get bounding box

#Check State
agent-browser is visible <sel>        # Check if visible
agent-browser is enabled <sel>        # Check if enabled
agent-browser is checked <sel>        # Check if checked
Find Elements (Semantic Locators)
agent-browser find role <role> <action> [value]       # By ARIA role
agent-browser find text <text> <action>               # By text content
agent-browser find label <label> <action> [value]     # By label
agent-browser find placeholder <ph> <action> [value]  # By placeholder
agent-browser find alt <text> <action>                # By alt text
agent-browser find title <text> <action>              # By title attr
agent-browser find testid <id> <action> [value]       # By data-testid
agent-browser find first <sel> <action> [value]       # First match
agent-browser find last <sel> <action> [value]        # Last match
agent-browser find nth <n> <sel> <action> [value]     # Nth match
Actions: click, fill, check, hover, text

#Examples:
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "test@test.com"
agent-browser find first ".item" click
agent-browser find nth 2 "a" text

#Wait
agent-browser wait <selector>         # Wait for element to be visible
agent-browser wait <ms>               # Wait for time (milliseconds)
agent-browser wait --text "Welcome"   # Wait for text to appear
agent-browser wait --url "**/dash"    # Wait for URL pattern
agent-browser wait --load networkidle # Wait for load state
agent-browser wait --fn "window.ready === true"  # Wait for JS condition
# Load states: load, domcontentloaded, networkidle

# Mouse Control
agent-browser mouse move <x> <y>      # Move mouse
agent-browser mouse down [button]     # Press button (left/right/middle)
agent-browser mouse up [button]       # Release button
agent-browser mouse wheel <dy> [dx]   # Scroll wheel

#Browser Settings
agent-browser set viewport <w> <h>    # Set viewport size
agent-browser set device <name>       # Emulate device ("iPhone 14")
agent-browser set geo <lat> <lng>     # Set geolocation
agent-browser set offline [on|off]    # Toggle offline mode
agent-browser set headers <json>      # Extra HTTP headers
agent-browser set credentials <u> <p> # HTTP basic auth
agent-browser set media [dark|light]  # Emulate color scheme

#Cookies & Storage
agent-browser cookies                 # Get all cookies
agent-browser cookies set <name> <val> # Set cookie
agent-browser cookies clear           # Clear cookies

agent-browser storage local           # Get all localStorage
agent-browser storage local <key>     # Get specific key
agent-browser storage local set <k> <v>  # Set value
agent-browser storage local clear     # Clear all

agent-browser storage session         # Same for sessionStorage

#Network
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body <json>  # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests

#Tabs & Windows
agent-browser tab                     # List tabs
agent-browser tab new [url]           # New tab (optionally with URL)
agent-browser tab <n>                 # Switch to tab n
agent-browser tab close [n]           # Close tab
agent-browser window new              # New window

#Frames
agent-browser frame <sel>             # Switch to iframe
agent-browser frame main              # Back to main frame

#Dialogs
agent-browser dialog accept [text]    # Accept (with optional prompt text)
agent-browser dialog dismiss          # Dismiss

#Debug
agent-browser trace start [path]      # Start recording trace
agent-browser trace stop [path]       # Stop and save trace
agent-browser console                 # View console messages
agent-browser console --clear         # Clear console
agent-browser errors                  # View page errors
agent-browser errors --clear          # Clear errors
agent-browser highlight <sel>         # Highlight element
agent-browser state save <path>       # Save auth state
agent-browser state load <path>       # Load auth state

#Navigation
agent-browser back                    # Go back
agent-browser forward                 # Go forward
agent-browser reload                  # Reload page

#Setup
agent-browser install                 # Download Chromium browser
agent-browser install --with-deps     # Also install system deps (Linux)

#Sessions
Run multiple isolated browser instances:

# Different sessions
agent-browser --session agent1 open site-a.com
agent-browser --session agent2 open site-b.com

# Or via environment variable
AGENT_BROWSER_SESSION=agent1 agent-browser click "#btn"

# List active sessions
agent-browser session list
# Output:
# Active sessions:
# -> default
#    agent1

# Show current session
agent-browser session
Each session has its own:

Browser instance
Cookies and storage
Navigation history
Authentication state
Snapshot Options
The snapshot command supports filtering to reduce output size:

agent-browser snapshot                    # Full accessibility tree
agent-browser snapshot -i                 # Interactive elements only (buttons, inputs, links)
agent-browser snapshot -c                 # Compact (remove empty structural elements)
agent-browser snapshot -d 3               # Limit depth to 3 levels
agent-browser snapshot -s "#main"         # Scope to CSS selector
agent-browser snapshot -i -c -d 5         # Combine options
Option	Description
-i, --interactive	Only show interactive elements (buttons, links, inputs)
-c, --compact	Remove empty structural elements
-d, --depth <n>	Limit tree depth
-s, --selector <sel>	Scope to CSS selector
Options
Option	Description
--session <name>	Use isolated session (or AGENT_BROWSER_SESSION env)
--headers <json>	Set HTTP headers scoped to the URL's origin
--executable-path <path>	Custom browser executable (or AGENT_BROWSER_EXECUTABLE_PATH env)
--json	JSON output (for agents)
--full, -f	Full page screenshot
--name, -n	Locator name filter
--exact	Exact text match
--headed	Show browser window (not headless)
--debug	Debug output
Selectors
Refs (Recommended for AI)
Refs provide deterministic element selection from snapshots:

# 1. Get snapshot with refs
agent-browser snapshot
# Output:
# - heading "Example Domain" [ref=e1] [level=1]
# - button "Submit" [ref=e2]
# - textbox "Email" [ref=e3]
# - link "Learn more" [ref=e4]

# 2. Use refs to interact
agent-browser click @e2                   # Click the button
agent-browser fill @e3 "test@example.com" # Fill the textbox
agent-browser get text @e1                # Get heading text
agent-browser hover @e4                   # Hover the link
Why use refs?

Deterministic: Ref points to exact element from snapshot
Fast: No DOM re-query needed
AI-friendly: Snapshot + ref workflow is optimal for LLMs
CSS Selectors
agent-browser click "#id"
agent-browser click ".class"
agent-browser click "div > button"
Text & XPath
agent-browser click "text=Submit"
agent-browser click "xpath=//button"
Semantic Locators
agent-browser find role button click --name "Submit"
agent-browser find label "Email" fill "test@test.com"
Agent Mode
Use --json for machine-readable output:

agent-browser snapshot --json
# Returns: {"success":true,"data":{"snapshot":"...","refs":{"e1":{"role":"heading","name":"Title"},...}}}

agent-browser get text @e1 --json
agent-browser is visible @e2 --json
Optimal AI Workflow
# 1. Navigate and get snapshot
agent-browser open example.com
agent-browser snapshot -i --json   # AI parses tree and refs

# 2. AI identifies target refs from snapshot
# 3. Execute actions using refs
agent-browser click @e2
agent-browser fill @e3 "input text"

# 4. Get new snapshot if page changed
agent-browser snapshot -i --json
Headed Mode
Show the browser window for debugging:

agent-browser open example.com --headed
This opens a visible browser window instead of running headless.
```

### 2.2 完整命令列表

#### 导航操作
| 命令 | 说明 |
|------|------|
| `open <url>` | 导航到 URL |
| `back` | 后退 |
| `forward` | 前进 |
| `reload` | 刷新页面 |

#### 元素交互
| 命令 | 说明 |
|------|------|
| `click <sel>` | 点击元素（支持 @ref） |
| `dblclick <sel>` | 双击元素 |
| `type <sel> <text>` | 输入文本（追加） |
| `fill <sel> <text>` | 清空并填写 |
| `check <sel>` | 勾选复选框 |
| `uncheck <sel>` | 取消勾选 |
| `select <sel> <val>` | 选择下拉选项 |
| `upload <sel> <files...>` | 上传文件 |
| `press <key>` | 按键（Enter, Tab, Control+a） |

#### 查找元素
| 命令 | 说明 |
|------|------|
| `snapshot -i` | 获取可交互元素快照（带 refs） |
| `find role button click --name Submit` | 查找并点击按钮 |
| `get text @e1` | 获取元素文本 |

#### 等待和调试
| 命令 | 说明 |
|------|------|
| `wait @e1` | 等待元素出现 |
| `wait 3000` | 等待 3 毫秒 |
| `screenshot [path]` | 截图 |
| `eval <js>` | 执行 JavaScript |

---

## 三、SDC 工具完整测试流程

### 3.1 测试前准备

```bash
# 1. 启动所有服务
cd app
npm run dev

# 2. 确认agent-browser 已安装，不需要重复安装
# agent-browser install
```

### 3.2 完整测试步骤

```bash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 1: 打开浏览器并导航到登录页
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser open http://localhost:3000/login

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 2: 获取页面快照（查看可交互元素）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser snapshot -i

输出示例：
document
  [textbox] "邮箱" name="email" @e1
  [textbox] "密码" name="password" @e2
  [button] "登录" @e3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 3: 填写登录表单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser fill @e1 "aic_qlj816@126.com"
agent-browser fill @e2 "qw1234"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 4: 点击登录按钮
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser click @e3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 5: 导航到 SDC 工具页面
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser open http://localhost:3000/tools/sdc-generator

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 6: 获取初始化页面快照
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser snapshot -i

输出示例：
document
  [textbox] "模块名" name="xde" @e1
  [checkbox] "IsFlat" name="isFlat" @e2
  [button] "上传 hier.yaml" @e3
  [button] "上传 vlog.v" @e4
  [button] "保存并下一步" @e5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 7: 填写初始化表单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 填写模块名
agent-browser fill @e1 "jpeg_top_wrapx"

# 取消勾选 IsFlat（如果需要）
agent-browser uncheck @e2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 8: 上传文件（关键步骤）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 方式1: 点击上传按钮后上传
agent-browser click @e3
agent-browser upload @e3 /home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/hier.yaml

agent-browser click @e4
agent-browser upload @e4 /home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/vlog.v

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 9: 点击"保存并下一步"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser click @e5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 10: 等待页面跳转并获取新快照
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 等待页面变化
agent-browser wait 5000

# 重新获取快照
agent-browser snapshot -i

输出示例：
document
  [button] "DataSav" @e1
  [button] "DataChk" @e2
  [button] "提交任务" @e3
  [tab] "VarDef" @e5
  [tab] "ClkDef" @e6

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 11: API 注入测试数据（推荐方案）⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 请务必理解并follow文档最后部分内容：详细解释步骤11的API注入测试数据流程，

# 使用 eval 命令执行 JavaScript 注入数据
agent-browser eval '
  const response = await fetch("/api/v1/sdc-thrpages/data-sav", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: window.location.pathname.split("/")[4],
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
    })
  });
  await response.json();
'

# 刷新页面查看数据
agent-browser reload

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 12: DataSav - 保存数据
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser snapshot -i
agent-browser click @e1
agent-browser wait 2000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 13: DataChk - 数据检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser click @e2
agent-browser wait 30000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 14: Submit - 提交任务
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser click @e3
agent-browser wait 5000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 15: 等待任务完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 使用循环检查状态
agent-browser eval '
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const text = document.body.innerText;
    if (text.includes("COMPLETED")) break;
  }
'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 16: 下载结果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser snapshot -i
agent-browser click @e10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
步骤 17: 关闭浏览器
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent-browser close
```

---

## 四、UPF 工具测试流程

UPF 工具的测试流程与 SDC 类似，主要区别：

1. **页面 URL**: `http://localhost:3000/tools/upf-generator`
2. **上传文件**: 4 个文件
   - `hier.yaml`
   - `pvlog.v`
   - `pobj.tcl`
   - `pcell.yaml`
3. **API 端点**: `/api/v1/upf-thrpages/data-sav`
4. **表格数据**: PMVAR, PMDOMAIN, PMISO 等

---

## 五、高级用法

### 5.1 调试技巧

```bash
# 显示浏览器窗口（非 headless 模式）
agent-browser --headed open http://localhost:3000

# 截图保存
agent-browser screenshot /tmp/debug.png

# 查看控制台日志
agent-browser console

# 查看页面错误
agent-browser errors

# 高亮元素
agent-browser highlight @e1
```

### 5.2 使用查找命令

```bash
# 查找并点击按钮
agent-browser find role button click --name "提交任务"

# 查找并填写文本框
agent-browser find textbox fill --label "邮箱" "test@example.com"

# 查找并选择下拉选项
agent-browser find combobox select --name "status" "active"
```

### 5.3 复杂 JavaScript 注入

```bash
# 使用 eval 执行复杂操作
agent-browser eval '
  // 获取 taskId
  const taskId = window.location.pathname.split("/")[4];

  // 读取 Excel 数据并注入
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
                { HD_MOD_NAME: "test_module", HD_STAGE: "RTL", HD_TOOL: "DC WLM" },
                { HD_MOD_NAME: "test_module", HD_STAGE: "GATE", HD_TOOL: "PT WLM" }
              ]
            }
          }
        ]
      }
    ]
  };

  // 调用 API
  const response = await fetch("/api/v1/sdc-thrpages/data-sav", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: taskId,
      dirtySheetData: excelData.dirtySheetData
    })
  });

  const result = await response.json();
  console.log("注入结果:", result);
  return result;
'
```

### 5.4 会话管理

```bash
# 使用命名会话（多个独立浏览器实例）
agent-browser --session test1 open http://localhost:3000
agent-browser --session test2 open http://localhost:3000

# 使用环境变量设置默认会话
export AGENT_BROWSER_SESSION=my_session
agent-browser open http://localhost:3000
```

### 5.5 JSON 输出

```bash
# 获取快照的 JSON 格式输出
agent-browser snapshot -i --json

# 获取元素文本
agent-browser get text @e1 --json

# 获取页面 URL
agent-browser get url --json
```

---

## 六、常见问题

### Q1: 如何处理动态加载的内容？

```bash
# 等待特定元素出现
agent-browser wait @e1

# 或等待固定时间
agent-browser wait 5000
```

### Q2: 如何处理 iframe？

```bash
# agent-browser 目前不支持直接切换 iframe
# 使用 eval 在 iframe 中操作
agent-browser eval 'document.querySelector("iframe").contentWindow.document.querySelector(".btn").click()'
```

### Q3: 如何并发测试多个任务？

```bash
# 使用不同的会话
agent-browser --session task1 open http://localhost:3000
agent-browser --session task2 open http://localhost:3000
agent-browser --session task3 open http://localhost:3000
```

---

## 七、快速参考

### 核心工作流程总结

```
open → snapshot -i → click/fill → wait → snapshot -i → ... → close
```

### 测试流程对照表

| 测试阶段 | agent-browser 命令 |
|---------|-------------------|
| 登录 | `open` → `snapshot -i` → `fill` → `click` |
| 初始化 | `open` → `snapshot -i` → `fill` → `upload` → `click` |
| 数据注入 | `eval` (JavaScript 调用 API) |
| DataSav | `snapshot -i` → `click` → `wait` |
| DataChk | `click` → `wait` |
| Submit | `click` → `wait` |
| 等待完成 | `eval` (循环检查) 或 `wait` |
| 下载结果 | `snapshot -i` → `click` |

---

## 八、与测试策略文档的对应

根据 `ecsonly_auto_test_stategy_method.md`：

| 文档方案 | agent-browser 实现 |
|---------|-------------------|
| **方案 A: 预填充 Excel** | 复杂，不推荐 |
| **方案 B: API 注入** ⭐ | 使用 `eval` 命令调用 DataSav API |
| **方案 C: Playwright 填写** | 使用 `click`, `fill` 逐个填写 |

**推荐**: 方案 B（API 注入）+ agent-browser

---






## 详细解释步骤11的API注入测试数据流程：

  API注入测试数据详细说明

  回答您的核心问题

  是的，测试数据是从 /home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/dcont.xlsx 获取的。

  ---
  完整执行过程

  流程图

  ┌─────────────────────────────────────────────────────────────────────┐
  │ 步骤 11: API 注入测试数据                                           │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  1. 读取 dcont.xlsx                                                  │
  │     └─ 使用 XLSX-Populate 库读取 Excel 文件                         │
  │                                                                      │
  │  2. 解析 Excel 数据结构                                              │
  │     └─ 提取每个 Sheet 的表格数据（VarDef, ClkDef, IODly, Exp）      │
  │     └─ 转换为 API 需要的 JSON 格式                                   │
  │                                                                      │
  │  3. 调用 DataSav API                                                │
  │     POST /api/v1/sdc-thrpages/data-sav                              │
  │     Body: { taskId, dirtySheetData }                                │
  │                                                                      │
  │  4. 数据存储到数据库                                                 │
  │     └─ 更新 TableData 模型的 rowData 字段                          │
  │     └─ 保留 columnsSchema 和 dropdownData                          │
  │                                                                      │
  │  5. 刷新页面                                                         │
  │     └─ 前端从数据库重新加载并展示注入的数据                         │
  │                                                                      │
  └─────────────────────────────────────────────────────────────────────┘

  ---
  使用的技术和脚本

  方案对比
  ┌────────────────────┬────────────────────────────┬─────────────────┐
  │        方案        │            说明            │  是否需要脚本   │
  ├────────────────────┼────────────────────────────┼─────────────────┤
  │ 方案 A：简单注入   │ 手动构造 JSON 数据调用 API │ ❌ 不需要脚本   │
  ├────────────────────┼────────────────────────────┼─────────────────┤
  │ 方案 B：Excel 解析 │ 从 dcont.xlsx 读取并注入   │ ✅ 需要辅助脚本 │
  └────────────────────┴────────────────────────────┴─────────────────┘
  推荐：方案 B - 因为 dcont.xlsx 已包含正确的测试数据

  ---
  方案 A：简单注入（无需额外脚本），不采用这个方案，

  使用 agent-browser eval 直接构造数据：

  agent-browser eval '
    const taskId = window.location.pathname.split("/")[4];

    const response = await fetch("/api/v1/sdc-thrpages/data-sav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: taskId,
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
                    { 
                      HD_MOD_NAME: "jpeg_top_wrapx", 
                      HD_STAGE: "RTL", 
                      HD_TOOL: "DC WLM" 
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    });

    const result = await response.json();
    console.log("注入结果:", result);
    return result;
  '

  优点：简单直接，无需额外依赖
  缺点：需要手动构造 JSON，数据不灵活

  ---
  方案 B：Excel 解析注入（推荐），请使用该方案来测试，

  需要创建辅助脚本：tests/helpers/excel-injector.js

  // tests/helpers/excel-injector.js
  const XlsxPopulate = require('xlsx-populate');
  const fs = require('fs');

  /**
   * 从 dcont.xlsx 读取测试数据并注入
   * 
   * @param {string} taskId - 任务ID
   * @param {string} excelPath - Excel文件路径
   */
  async function injectTestDataFromExcel(taskId, excelPath) {
    console.log(`📂 读取Excel文件: ${excelPath}`);

    // 1. 读取 Excel 文件
    const workbook = await XlsxPopulate.fromFileAsync(excelPath);

    // 2. 解析每个 Sheet 的数据
    const dirtySheetData = [];

    // SDC 工具的 Sheet 定义
    const sdcSheets = [
      { name: 'VarDef', tables: ['TMVAR'] },
      { name: 'ClkDef', tables: ['TMCLK'] },
      { name: 'IODly', tables: ['TMIODLY'] },
      { name: 'Exp', tables: ['TMIOEXP', 'TMINOUT', 'TMINTEXP', 'TMSTPGATE'] }
    ];

    for (const sheetDef of sdcSheets) {
      const sheet = workbook.sheet(sheetDef.name);
      if (!sheet) continue;

      const tables = [];

      for (const tableName of sheetDef.tables) {
        const tableData = extractTableData(sheet, tableName);
        if (tableData.rows.length > 0) {
          tables.push({
            tableId: tableName,
            tableName: tableName,
            data: { rows: tableData.rows }
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

    // 3. 返回可用于注入的数据
    return {
      taskId: taskId,
      dirtySheetData: dirtySheetData
    };
  }

  /**
   * 从 Sheet 中提取表格数据
   * 需要根据 dcont.xlsx 的实际结构来实现
   */
  function extractTableData(sheet, tableName) {
    const rows = [];

    // 查找表格标识符（通常表格有一个标题行）
    const usedRange = sheet.usedRange();

    // 遍历行，查找表格开始位置
    let tableStartRow = -1;
    let headerRowIndex = -1;

    for (let row = 1; row <= usedRange._rowCount; row++) {
      const cellValue = sheet.cell(row, 1).value();
      if (cellValue === tableName) {
        tableStartRow = row + 1; // 数据从标题行下一行开始
        headerRowIndex = row;
        break;
      }
    }

    if (tableStartRow === -1) {
      return { rows }; // 未找到表格
    }

    // 读取列名（从标题行）
    const columns = [];
    for (let col = 1; col <= usedRange._columnCount; col++) {
      const cellValue = sheet.cell(headerRowIndex, col).value();
      if (cellValue) {
        columns.push(cellValue);
      } else {
        break; // 遇到空列停止
      }
    }

    // 读取数据行
    for (let row = tableStartRow; row <= usedRange._rowCount; row++) {
      const rowData = {};
      let hasData = false;

      for (let col = 0; col < columns.length; col++) {
        const cellValue = sheet.cell(row, col + 1).value();
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          rowData[columns[col]] = cellValue;
          hasData = true;
        }
      }

      if (hasData) {
        rows.push(rowData);
      } else {
        break; // 遇到空行停止
      }
    }

    return { rows };
  }

  // 导出函数
  module.exports = { injectTestDataFromExcel };

  ---
  使用 agent-browser + Excel 注入的完整流程

  ### 步骤 1: 准备辅助脚本（只需一次）
  cd /home/tommy2025/work/LogicCore
  npm install xlsx-populate

  ### 步骤 2: 打开浏览器并初始化任务
  agent-browser open http://localhost:3000/login
  agent-browser snapshot -i
  agent-browser fill @e1 "aic_qlj816@126.com"
  agent-browser fill @e2 "qw1234"
  agent-browser click @e3

  #### 导航到 SDC 工具并初始化
  agent-browser open http://localhost:3000/tools/sdc-generator
  agent-browser snapshot -i
  agent-browser fill @e1 "jpeg_top_wrapx"
  agent-browser uncheck @e2
  agent-browser upload @e3 /home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/hier.yaml
  agent-browser upload @e4 /home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/vlog.v
  agent-browser click @e5

  ### 步骤 3: 等待跳转并注入数据
  agent-browser wait 5000

  #### 使用 eval 读取 Excel 并注入（集成解析逻辑）
  agent-browser eval '
    // 获取 taskId
    const taskId = window.location.pathname.split("/")[4];
    
    // 调用后端 API，由后端读取 Excel 文件并注入
    const response = await fetch("/api/v1/sdc-thrpages/inject-excel-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: taskId,
        excelPath: "/home/tommy2025/work/LogicCore/test_data/upload_data/sdcgen/dcont.xlsx"
      })
    });
    
    const result = await response.json();
    console.log("注入结果:", result);
    return result;
  '

  ---
  关键技术说明

  数据注入的限制

  根据文档第 790-794 行的关键结论：
  ┌─────────────────────────────┬────────────────┬─────────────────┐
  │          数据类型           │    存储位置    │    能否注入     │
  ├─────────────────────────────┼────────────────┼─────────────────┤
  │ 列结构 (columnsSchema)      │ Table 模型     │ ❌ 不能修改     │
  ├─────────────────────────────┼────────────────┼─────────────────┤
  │ 下拉选项定义                │ Excel 数据验证 │ ❌ 不能修改     │
  ├─────────────────────────────┼────────────────┼─────────────────┤
  │ 下拉选项缓存 (dropdownData) │ TableData 模型 │ ✅ 保留初始化值 │
  ├─────────────────────────────┼────────────────┼─────────────────┤
  │ 单元格填写值 (rowData)      │ TableData 模型 │ ✅ 可以注入     │
  └─────────────────────────────┴────────────────┴─────────────────┘
  重要：API 注入只修改单元格的实际填写值，不会改变表格结构和下拉选项。

  ---
  
  对于 agent-browser 测试，不使用下面方案 A（简单注入）：

  ### 直接在 eval 中构造数据
  agent-browser eval '
    const taskId = window.location.pathname.split("/")[4];
    
    const response = await fetch("/api/v1/sdc-thrpages/data-sav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: taskId,
        dirtySheetData: [
          {
            sheetName: "VarDef",
            sheetId: "VarDef", 
            tables: [{
              tableId: "TMVAR",
              tableName: "TMVAR",
              data: {
                rows: [
                  { HD_MOD_NAME: "jpeg_top_wrapx", HD_STAGE: "RTL", HD_TOOL: "DC WLM" }
                ]
              }
            }]
          }
        ]
      })
    });
    
    return await response.json();
  '

  这样无需额外的脚本依赖，直接使用 agent-browser 即可完成测试。




**文档版本**: v1.0
**最后更新**: 2026-01-13
**相关文档**: `ecsonly_auto_test_stategy_method.md`
