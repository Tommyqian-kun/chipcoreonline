# GitHub 功能使用指南

本文档详细介绍GitHub各项功能在LogicCore项目中的应用场景和使用方法。

---

## 目录

1. [Issues - 问题追踪](#1-issues---问题追踪)
2. [Pull Requests - 代码审查与合并](#2-pull-requests---代码审查与合并)
3. [Actions - 自动化工作流](#3-actions---自动化工作流)
4. [Projects - 项目管理](#4-projects---项目管理)
5. [Security - 安全管理](#5-security---安全管理)
6. [Insights - 项目分析](#6-insights---项目分析)

---

## 1. Issues - 问题追踪

### 📋 功能概述

Issues是GitHub的任务追踪系统，用于记录bug、功能需求、技术债务、文档改进等所有需要处理的事项。

### 🎯 应用场景

#### 场景1：Bug报告
```markdown
标题：[Bug] Excel多页面保存时丢失下拉数据

**描述**：
在保存多页面Excel表单时，原有的dropdownData被清空

**重现步骤**：
1. 创建SDC多页面任务
2. 在Sheet1中设置下拉选项
3. 保存任务
4. 重新打开任务
5. 发现下拉选项消失

**期望行为**：
下拉选项应该被保留

**实际行为**：
下拉选项全部丢失

**环境信息**：
- 版本：v12
- 浏览器：Chrome 120
- 部署模式：ECS-only

**相关代码**：
`app/backend/src/services/excel_thrpages.service.ts:2301-2358`

**优先级**：P0 - 严重
**标签**：bug, excel, data-loss
```

#### 场景2：功能需求
```markdown
标题：[Feature] 支持UPF工具导出PDF报告

**需求描述**：
用户希望将UPF生成结果导出为PDF格式的技术报告

**业务价值**：
- 方便与团队成员分享
- 满足企业文档归档要求
- 提升专业性

**技术方案**：
1. 后端使用puppeteer生成PDF
2. 前端添加"导出PDF"按钮
3. 支持自定义报告模板

**接受标准**：
- [ ] 支持导出PDF格式
- [ ] PDF包含所有表单数据
- [ ] 支持中文显示
- [ ] 文件大小<5MB

**优先级**：P2 - 中等
**标签**：enhancement, upf, export
```

#### 场景3：技术债务
```markdown
标题：[Tech Debt] 重构Excel服务以提升性能

**问题描述**：
当前excel_thrpages.service.ts文件过大（>2000行），
包含过多业务逻辑，维护困难

**改进方案**：
1. 按功能模块拆分为多个服务
2. 提取公共逻辑到工具类
3. 优化数据库查询（减少N+1）

**预期收益**：
- 提升代码可维护性
- 减少50%的数据库查询
- 降低服务启动时间

**优先级**：P3 - 低
**标签**：tech-debt, refactor, performance
```

### 📖 使用方法

#### 创建Issue
```bash
# 方式1：通过Web界面
1. 访问 https://github.com/logiccore/onlineEDA/issues
2. 点击 "New issue" 按钮
3. 选择模板（Bug Report / Feature Request / Custom）
4. 填写标题和内容
5. 添加标签、指派人员、设置里程碑
6. 点击 "Submit new issue"

# 方式2：通过命令行（需安装gh）
gh issue create --title "[Bug] 描述" --body "详细内容"
```

#### Issue管理最佳实践
```markdown
1. 使用标签分类
   - bug：缺陷
   - enhancement：新功能
   - documentation：文档
   - performance：性能优化
   - security：安全问题
   - P0/P1/P2/P3：优先级

2. 使用里程碑规划版本
   - v1.1.0 - Q1 2026
   - v1.2.0 - Q2 2026

3. 使用模板规范内容
   - Bug模板：包含重现步骤、环境信息
   - Feature模板：包含业务价值、技术方案

4. 关联代码提交
   - 在commit中使用 "fixes #123" 自动关闭issue
   - 在PR中使用 "closes #123" 关联issue
```

---

## 2. Pull Requests - 代码审查与合并

### 📋 功能概述

Pull Request（PR）是代码审查和合并的核心机制，确保代码质量和团队协作。

### 🎯 应用场景

#### 场景1：功能开发PR
```markdown
标题：feat: 添加用户任务导出Excel功能

**变更内容**：
- 新增 TaskExportService 服务
- 添加 /api/v1/tasks/export 接口
- 前端添加"导出Excel"按钮
- 使用 ExcelJS 生成工作簿

**关联Issue**：
Closes #123

**测试情况**：
- [x] 单元测试通过（覆盖率95%）
- [x] 集成测试通过
- [x] 手动测试通过

**性能影响**：
- 导出1000条任务耗时：<2秒
- 内存占用增加：<50MB

**截图**：
![导出按钮](./screenshots/export-button.png)

**Checklist**：
- [x] 代码遵循项目规范
- [x] 添加了必要的测试
- [x] 更新了相关文档
- [x] 通过了所有CI检查
- [x] 无安全漏洞
```

#### 场景2：Bug修复PR
```markdown
标题：fix: 修复Excel多页面保存时丢失下拉数据

**问题描述**：
保存多页面时，原有的dropdownData被删除

**根本原因**：
在删除旧数据后，未保存原有的dropdownData和validationData

**修复方案**：
1. 删除前先查询保存原有数据
2. 创建快速查找Map
3. 优先使用前端值，无则保留原值

**影响范围**：
仅影响 excel_thrpages.service.ts 的 saveTaskSheets 方法

**测试验证**：
- [x] 修复了issue #123中描述的问题
- [x] 新增单元测试覆盖修复逻辑
- [x] 手动验证多页面保存功能

**Fixes**：#123
```

#### 场景3：重构PR
```markdown
标题：refactor: 拆分excel服务以提升可维护性

**重构内容**：
将 excel_thrpages.service.ts 拆分为：
- ExcelParserService：解析Excel文件
- ExcelValidatorService：数据验证
- ExcelStorageService：数据存储
- ExcelExportService：导出Excel

**重构原则**：
- 单一职责原则
- 保持原有API不变
- 100%向后兼容

**变更统计**：
- 1个文件 → 4个文件
- 2300行 → 每个文件<600行
- 新增测试覆盖率：90%

**性能测试**：
- 解析速度：提升15%
- 内存占用：减少20%
- 响应时间：无变化

**风险评估**：
- 风险级别：低
- 已通过完整回归测试
- 已在测试环境验证2周
```

### 📖 使用方法

#### 创建Pull Request
```bash
# 1. 创建功能分支
git checkout -b feature/task-export

# 2. 开发并提交代码
git add .
git commit -m "feat: add task export feature"

# 3. 推送到远程
git push origin feature/task-export

# 4. 在GitHub上创建PR
# 访问仓库页面，点击 "Compare & pull request"
# 或使用命令行
gh pr create --title "feat: 添加任务导出功能" \
  --body "详细描述..." \
  --base master \
  --head feature/task-export
```

#### PR审查流程
```markdown
1. 代码审查（Code Review）
   - 审查者检查代码质量、逻辑正确性
   - 提出改进建议（Comment）
   - 批准（Approve）或请求修改（Request changes）

2. CI自动检查
   - 运行单元测试
   - 运行集成测试
   - 代码质量检查（ESLint、TSC）
   - 安全扫描

3. 修改反馈
   - 开发者根据反馈修改代码
   - 推送新的提交
   - 重新请求审查

4. 合并策略
   - Squash and merge：压缩所有提交为一个（推荐用于功能分支）
   - Rebase and merge：保持线性历史
   - Merge commit：保留所有提交历史（推荐用于重要合并）
```

#### PR模板配置
```bash
# 在项目根目录创建 .github/pull_request_template.md
```

```markdown
## 变更类型
- [ ] Bug修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新
- [ ] 性能优化

## 变更描述


## 关联Issue
Closes #

## 测试情况
- [ ] 单元测试
- [ ] 集成测试
- [ ] 手动测试

## Checklist
- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 通过了所有CI检查
```

---

## 3. Actions - 自动化工作流

### 📋 功能概述

GitHub Actions是CI/CD自动化平台，可以自动执行测试、构建、部署等任务。

### 🎯 应用场景

#### 场景1：持续集成（CI）

**目的**：确保每次代码提交都不会破坏项目

```yaml
# .github/workflows/ci.yml
name: Continuous Integration

on:
  push:
    branches: [ master, dev ]
  pull_request:
    branches: [ master, dev ]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: logiccore_test
        ports:
          - 5432:5432
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 设置 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.19.0'
          cache: 'npm'
      
      - name: 安装依赖
        run: |
          cd app/backend
          npm ci
      
      - name: 运行数据库迁移
        run: |
          cd app/backend
          npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/logiccore_test
      
      - name: 运行TypeScript类型检查
        run: |
          cd app/backend
          npx tsc --noEmit
      
      - name: 运行ESLint检查
        run: |
          cd app/backend
          npm run lint
      
      - name: 运行单元测试
        run: |
          cd app/backend
          npm run test:unit
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/logiccore_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
      
      - name: 运行集成测试
        run: |
          cd app/backend
          npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/logiccore_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
      
      - name: 上传测试覆盖率报告
        uses: codecov/codecov-action@v3
        with:
          files: ./app/backend/coverage/lcov.info
          flags: backend

  test-frontend:
    runs-on: ubuntu-latest
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 设置 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.19.0'
          cache: 'npm'
      
      - name: 安装依赖
        run: |
          cd app/frontend
          npm ci
      
      - name: 运行TypeScript类型检查
        run: |
          cd app/frontend
          npx tsc --noEmit
      
      - name: 运行单元测试
        run: |
          cd app/frontend
          npm run test:unit
      
      - name: 构建生产版本
        run: |
          cd app/frontend
          npm run build
      
      - name: 上传构建产物
        uses: actions/upload-artifact@v3
        with:
          name: frontend-build
          path: app/frontend/dist

  e2e-test:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 设置 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.19.0'
      
      - name: 安装 Playwright
        run: |
          npm install -g playwright
          playwright install chromium
      
      - name: 启动测试环境
        run: |
          npm run test:env:up
      
      - name: 运行E2E测试
        run: |
          npm run test:e2e
      
      - name: 上传测试截图
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-screenshots
          path: tests/e2e/screenshots
```

#### 场景2：持续部署（CD）

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ master ]
    tags:
      - 'v*.*.*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 登录阿里云容器镜像服务
        uses: docker/login-action@v3
        with:
          registry: registry.cn-hangzhou.aliyuncs.com
          username: ${{ secrets.ALIYUN_REGISTRY_USERNAME }}
          password: ${{ secrets.ALIYUN_REGISTRY_PASSWORD }}
      
      - name: 构建Docker镜像
        run: |
          docker build -t registry.cn-hangzhou.aliyuncs.com/logiccore/backend:${{ github.sha }} \
            -f app/backend/Dockerfile app/backend
          docker build -t registry.cn-hangzhou.aliyuncs.com/logiccore/frontend:${{ github.sha }} \
            -f app/frontend/Dockerfile app/frontend
      
      - name: 推送镜像
        run: |
          docker push registry.cn-hangzhou.aliyuncs.com/logiccore/backend:${{ github.sha }}
          docker push registry.cn-hangzhou.aliyuncs.com/logiccore/frontend:${{ github.sha }}
      
      - name: 部署到ECS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.ECS_HOST }}
          username: ${{ secrets.ECS_USERNAME }}
          key: ${{ secrets.ECS_PRIVATE_KEY }}
          script: |
            cd /opt/logiccore
            docker-compose pull
            docker-compose up -d
            docker image prune -f
      
      - name: 健康检查
        run: |
          sleep 10
          curl -f https://api.logiccore.com/health || exit 1
      
      - name: 发送部署通知
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: '部署完成！版本: ${{ github.sha }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        if: always()
```

#### 场景3：定时任务

```yaml
# .github/workflows/scheduled-tasks.yml
name: Scheduled Tasks

on:
  schedule:
    # 每天凌晨2点清理过期任务
    - cron: '0 2 * * *'
    # 每周一生成周报
    - cron: '0 9 * * 1'

jobs:
  cleanup-expired-tasks:
    runs-on: ubuntu-latest
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 清理过期任务
        run: |
          # 调用清理API
          curl -X POST https://api.logiccore.com/admin/cleanup \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}"
  
  generate-weekly-report:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 9 * * 1'
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 生成周报
        run: |
          node scripts/generate-weekly-report.js
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      
      - name: 发送周报
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: ${{ secrets.EMAIL_USERNAME }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: LogicCore 周报
          to: team@logiccore.com
          from: noreply@logiccore.com
          body: file://weekly-report.html
```

#### 场景4：代码质量检查

```yaml
# .github/workflows/code-quality.yml
name: Code Quality

on:
  pull_request:
    branches: [ master, dev ]

jobs:
  lint:
    runs-on: ubuntu-latest
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 运行ESLint
        run: |
          npm run lint
      
      - name: 运行Prettier检查
        run: |
          npm run format:check
  
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 运行安全扫描
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: 上传扫描结果
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
  
  dependency-check:
    runs-on: ubuntu-latest
    
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 检查依赖漏洞
        run: |
          npm audit --production
```

### 📖 使用方法

#### 设置Secrets
```markdown
1. 进入仓库 Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加敏感信息：
   - DATABASE_URL
   - ALIYUN_REGISTRY_USERNAME
   - ALIYUN_REGISTRY_PASSWORD
   - ECS_HOST
   - ADMIN_API_TOKEN
   等
```

#### 查看工作流运行
```markdown
1. 点击仓库顶部的 "Actions" 标签
2. 查看所有工作流运行历史
3. 点击具体运行查看详细日志
4. 下载构建产物（artifacts）
```

#### 手动触发工作流
```yaml
# 在workflow中添加
on:
  workflow_dispatch:
    inputs:
      environment:
        description: '部署环境'
        required: true
        type: choice
        options:
          - development
          - staging
          - production
```

---

## 4. Projects - 项目管理

### 📋 功能概述

GitHub Projects提供看板式项目管理，支持敏捷开发流程。

### 🎯 应用场景

#### 场景1：Sprint规划看板

**看板结构**：
```
📋 Backlog (待办事项)
├── [Feature] 用户任务导出Excel #123
├── [Feature] UPF工具PDF导出 #124
├── [Tech Debt] 重构Excel服务 #125
└── [Bug] 修复并发槽位泄露 #126

🔄 In Progress (进行中)
├── [Feature] 添加支付宝支付 #127
└── [Bug] 修复多页面保存问题 #128

👀 In Review (代码审查)
├── PR #45: feat: 添加任务导出功能
└── PR #46: fix: 修复Excel数据丢失

✅ Done (已完成)
├── [Feature] 引入测试框架 #110
└── [Bug] 修复Redis连接池问题 #111
```

#### 场景2：功能开发路线图

**视图：Roadmap（时间线）**
```
2026 Q1
├── v1.1.0 (2026-03)
│   ├── 多租户支持
│   ├── 权限系统重构
│   └── 性能优化

2026 Q2
├── v1.2.0 (2026-06)
│   ├── 微服务架构迁移
│   ├── 分布式任务调度
│   └── 实时协作编辑

2026 Q3
└── v1.3.0 (2026-09)
    ├── AI辅助设计
    ├── 云端仿真
    └── 移动端支持
```

#### 场景3：Bug追踪看板

**看板字段**：
```markdown
| Issue | 优先级 | 状态 | 指派人 | 标签 | 里程碑 |
|-------|--------|------|--------|------|--------|
| #126 | P0 | In Progress | @tommy | bug | v1.0.1 |
| #128 | P1 | In Review | @alice | bug | v1.0.1 |
| #130 | P2 | Backlog | - | bug | v1.1.0 |
```

### 📖 使用方法

#### 创建项目
```markdown
1. 点击仓库的 "Projects" 标签
2. 点击 "New project"
3. 选择模板：
   - Board：看板视图（适合敏捷开发）
   - Table：表格视图（适合详细跟踪）
   - Roadmap：时间线视图（适合长期规划）
4. 设置项目名称和描述
5. 添加自定义字段（优先级、状态、估时等）
```

#### 管理看板
```markdown
1. 添加卡片
   - 从已有Issue添加
   - 创建新的Draft卡片
   - 从Pull Request添加

2. 移动卡片
   - 拖拽卡片到不同列
   - 自动触发Issue状态变更

3. 筛选和排序
   - 按优先级筛选
   - 按指派人筛选
   - 按标签筛选
   - 自定义排序规则

4. 自动化规则
   - 当Issue关闭时，自动移到Done列
   - 当PR合并时，自动关闭关联Issue
   - 新Issue自动添加到Backlog
```

#### 最佳实践
```markdown
1. Sprint计划
   - 每两周一个Sprint
   - Sprint开始时，从Backlog挑选任务到Sprint
   - 每日站会更新看板状态

2. WIP限制（Work In Progress）
   - In Progress列最多3个任务/人
   - 鼓励先完成再开始新任务

3. 定期回顾
   - Sprint结束时Review Done列
   - 分析完成情况和阻塞点
   - 调整下个Sprint计划
```

---

## 5. Security - 安全管理

### 📋 功能概述

GitHub Security提供安全漏洞扫描、依赖管理、代码安全分析等功能。

### 🎯 应用场景

#### 场景1：依赖漏洞扫描（Dependabot）

**自动化依赖更新**：
```yaml
# .github/dependabot.yml
version: 2
updates:
  # 后端npm依赖
  - package-ecosystem: "npm"
    directory: "/app/backend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    reviewers:
      - "tommy2025"
    assignees:
      - "tommy2025"
    labels:
      - "dependencies"
      - "backend"
    commit-message:
      prefix: "chore"
      include: "scope"
    # 仅更新安全补丁
    versioning-strategy: increase-if-necessary
  
  # 前端npm依赖
  - package-ecosystem: "npm"
    directory: "/app/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "frontend"
  
  # Python依赖
  - package-ecosystem: "pip"
    directory: "/app/backend/src/workers"
    schedule:
      interval: "weekly"
  
  # Docker镜像
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

**处理依赖告警**：
```markdown
1. 查看安全告警
   - Security → Dependabot alerts
   - 查看漏洞详情（CVE编号、严重程度）

2. 评估影响
   - Critical/High：立即修复
   - Medium：本周修复
   - Low：计划修复

3. 修复方式
   - 接受Dependabot的PR（自动创建）
   - 手动更新依赖版本
   - 暂时忽略（如果不影响）

4. 验证修复
   - 运行测试套件
   - 部署到测试环境验证
   - 合并PR
```

#### 场景2：代码安全扫描（CodeQL）

```yaml
# .github/workflows/codeql.yml
name: "CodeQL Security Scan"

on:
  push:
    branches: [ master, dev ]
  pull_request:
    branches: [ master ]
  schedule:
    - cron: '0 0 * * 0'  # 每周日扫描

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    
    strategy:
      fail-fast: false
      matrix:
        language: [ 'javascript', 'python', 'typescript' ]
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: ${{ matrix.language }}
          queries: security-extended,security-and-quality
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v2
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2
        with:
          category: "/language:${{matrix.language}}"
```

**处理安全漏洞**：
```markdown
典型安全问题示例：

1. SQL注入
   问题：直接拼接SQL字符串
   修复：使用Prisma参数化查询

2. XSS攻击
   问题：直接渲染用户输入
   修复：使用React自动转义，或DOMPurify清理

3. 路径遍历
   问题：未验证文件路径
   修复：使用sanitizeFilePath验证

4. 敏感信息泄露
   问题：日志中输出密码
   修复：过滤敏感字段

5. 不安全的加密
   问题：使用MD5哈希密码
   修复：使用bcrypt
```

#### 场景3：Secret扫描

```markdown
**功能**：
自动扫描代码中的敏感信息：
- API密钥
- 密码
- 私钥
- Token
- 数据库连接串

**处理步骤**：
1. GitHub检测到Secret后会创建告警
2. 立即轮换泄露的凭证
3. 从Git历史中移除Secret：
   ```bash
   # 使用git-filter-repo
   git filter-repo --invert-paths --path config/secrets.yml
   ```
4. 配置Secret扫描预防：
   - 使用.env文件（已在.gitignore）
   - 使用GitHub Secrets存储
   - 代码提交前检查（pre-commit hook）
```

#### 场景4：安全策略

创建 `SECURITY.md` 文件：
```markdown
# Security Policy

## 支持的版本

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## 报告漏洞

如果您发现安全漏洞，请遵循以下流程：

### 不要公开披露

请不要在GitHub Issues中公开报告安全漏洞。

### 报告方式

发送邮件至：security@logiccore.com

邮件中请包含：
1. 漏洞描述
2. 重现步骤
3. 潜在影响
4. 建议的修复方案（如果有）

### 响应时间

- 确认收到：24小时内
- 初步评估：72小时内
- 修复计划：1周内
- 发布补丁：根据严重程度（P0: 24h, P1: 1周, P2: 2周）

### 奖励计划

严重漏洞发现者将获得：
- 致谢（如果您同意）
- 漏洞赏金（根据严重程度）
```

### 📖 使用方法

#### 启用安全功能
```markdown
1. 进入 Settings → Security
2. 启用以下功能：
   ✅ Dependabot alerts
   ✅ Dependabot security updates
   ✅ Dependabot version updates
   ✅ Code scanning (CodeQL)
   ✅ Secret scanning
   ✅ Secret scanning push protection

3. 配置通知方式
   - Email通知
   - Slack集成
   - 自定义webhook
```

---

## 6. Insights - 项目分析

### 📋 功能概述

Insights提供仓库的各种数据分析和可视化，帮助了解项目健康度。

### 🎯 应用场景

#### 场景1：贡献者统计

**查看内容**：
```markdown
Contributors（贡献者）
- 提交次数排名
- 代码增删统计
- 活跃度时间线

Pulse（脉搏）
- 最近活动概览
- 合并的PR
- 关闭的Issue
- 新增的贡献者

Traffic（流量）
- 访问量统计
- Clone次数
- 访客来源

Community（社区）
- README完整度
- 行为准则
- 贡献指南
- Issue模板
- PR模板
```

#### 场景2：代码频率分析

```markdown
Code frequency（代码频率）
- 每周新增/删除代码行数
- 长期趋势分析
- 活跃度周期

Commit activity（提交活动）
- 每周提交次数
- 活跃时段分布
- 季节性模式

Network（网络图）
- 分支关系可视化
- Fork关系
- 代码流向
```

#### 场景3：依赖关系

```markdown
Dependency graph（依赖图）
- 直接依赖列表
- 间接依赖关系
- 被依赖情况

Dependencies（依赖项）
- npm包依赖
- Python包依赖
- 版本兼容性
- 已知漏洞标注
```

#### 场景4：自定义分析

使用GitHub API获取数据：

```javascript
// 获取提交统计
const stats = await fetch(
  'https://api.github.com/repos/logiccore/onlineEDA/stats/contributors',
  {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`
    }
  }
);

// 分析PR合并时间
const prs = await fetch(
  'https://api.github.com/repos/logiccore/onlineEDA/pulls?state=closed',
  {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`
    }
  }
);

const mergeTimes = prs
  .filter(pr => pr.merged_at)
  .map(pr => {
    const created = new Date(pr.created_at);
    const merged = new Date(pr.merged_at);
    return (merged - created) / (1000 * 60 * 60); // 小时
  });

const avgMergeTime = mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length;
console.log(`平均PR合并时间: ${avgMergeTime.toFixed(2)} 小时`);
```

### 📖 使用方法

#### 查看Insights
```markdown
1. 点击仓库的 "Insights" 标签
2. 选择具体的分析视图：
   - Pulse：快速了解最近活动
   - Contributors：查看贡献者
   - Community：检查项目完整度
   - Traffic：了解项目热度
   - Commits：分析提交模式
   - Code frequency：代码变化趋势
   - Dependency graph：依赖关系
   - Network：分支可视化
```

#### 生成定期报告
```javascript
// scripts/generate-insights-report.js
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function generateWeeklyReport() {
  const owner = 'logiccore';
  const repo = 'onlineEDA';
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // 获取本周的PR
  const { data: prs } = await octokit.pulls.list({
    owner,
    repo,
    state: 'all',
    since
  });
  
  // 获取本周的Issue
  const { data: issues } = await octokit.issues.listForRepo({
    owner,
    repo,
    since
  });
  
  // 获取本周的提交
  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    since
  });
  
  const report = {
    week: new Date().toISOString().slice(0, 10),
    prs: {
      opened: prs.filter(pr => pr.created_at >= since).length,
      closed: prs.filter(pr => pr.closed_at >= since).length,
      merged: prs.filter(pr => pr.merged_at >= since).length
    },
    issues: {
      opened: issues.filter(i => !i.pull_request && i.created_at >= since).length,
      closed: issues.filter(i => !i.pull_request && i.closed_at >= since).length
    },
    commits: commits.length,
    contributors: [...new Set(commits.map(c => c.author.login))].length
  };
  
  console.log('📊 本周项目报告');
  console.log('================');
  console.log(`PR: 创建${report.prs.opened} | 关闭${report.prs.closed} | 合并${report.prs.merged}`);
  console.log(`Issue: 创建${report.issues.opened} | 关闭${report.issues.closed}`);
  console.log(`提交: ${report.commits}次`);
  console.log(`贡献者: ${report.contributors}人`);
  
  return report;
}

generateWeeklyReport();
```

---

## 📚 综合使用示例

### 完整的功能开发流程

```markdown
1. 需求阶段
   ├── 在Issues中创建Feature Request (#150)
   ├── 在Projects中添加到Backlog
   └── 标记优先级和里程碑

2. 设计阶段
   ├── 在Issue中讨论技术方案
   ├── 更新Issue描述（技术方案部分）
   └── 移动到 "In Progress"

3. 开发阶段
   ├── 创建功能分支：git checkout -b feature/task-export
   ├── 提交代码：git commit -m "feat: add export feature"
   ├── 推送到远程：git push origin feature/task-export
   └── Actions自动运行测试

4. 审查阶段
   ├── 创建PR：关联Issue (#150)
   ├── 触发CI/CD流程（Actions）
   ├── 代码审查（Pull Request）
   ├── Security扫描通过
   └── 移动到 "In Review" (Projects)

5. 部署阶段
   ├── 合并PR到master
   ├── Actions自动部署到生产环境
   ├── 健康检查通过
   ├── 关闭Issue (#150)
   └── 移动到 "Done" (Projects)

6. 监控阶段
   ├── Insights查看影响
   ├── Security持续扫描
   ├── Dependabot更新依赖
   └── 收集用户反馈（新Issue）
```

---

## 🎓 学习资源

### 官方文档
- [GitHub Docs](https://docs.github.com)
- [GitHub Skills](https://skills.github.com) - 交互式教程
- [GitHub Blog](https://github.blog)

### 视频教程
- YouTube: "GitHub Actions Tutorial"
- YouTube: "GitHub Projects Guide"
- Bilibili: "GitHub从入门到精通"

### 最佳实践
- [Conventional Commits](https://www.conventionalcommits.org) - 提交消息规范
- [Semantic Versioning](https://semver.org) - 语义化版本
- [GitHub Flow](https://guides.github.com/introduction/flow/) - 工作流规范

---

## 📞 获取帮助

如果您在使用GitHub功能时遇到问题：

1. 查阅本文档
2. 查看[GitHub官方文档](https://docs.github.com)
3. 在项目中创建Issue寻求帮助
4. 联系项目维护者：tommy_zeroic2025@126.com

---

*文档创建时间: 2026-01-22*
*最后更新: 2026-01-22*
*文档版本: v1.0.0*
