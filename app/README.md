# 芯片设计在线工具集

一个专为芯片设计工程师打造的在线工具平台，提供SDC约束生成、时钟树生成、Memory数据生成等自动化工具。

## 技术栈

### 前端
- **React 18** + **TypeScript** - 现代化的前端框架
- **Vite** - 快速的构建工具
- **Tailwind CSS** - 原子化CSS框架
- **shadcn/ui** - 高质量的UI组件库
- **Framer Motion** - 动画库
- **wouter** - 轻量级路由
- **React Query** - 数据获取和状态管理

### 后端
- **Node.js** + **Express** + **TypeScript** - 服务端框架
- **PostgreSQL** - 关系型数据库
- **Prisma** - 现代化ORM
- **Redis** - 缓存和消息队列
- **JWT** - 身份认证
- **bcryptjs** - 密码加密

## 项目结构

```
LogicCore/
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── components/      # UI组件
│   │   ├── pages/          # 页面组件
│   │   ├── contexts/       # React上下文
│   │   ├── services/       # API服务
│   │   ├── hooks/          # 自定义Hook
│   │   └── lib/            # 工具库
│   └── ...
├── backend/                 # 后端应用
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── services/       # 业务服务
│   │   ├── middleware/     # 中间件
│   │   ├── workers/        # 后台任务处理
│   │   └── utils/          # 工具函数
│   ├── prisma/             # 数据库Schema
│   └── ...
└── ...
```

## 快速开始

### 1. 环境准备

确保您的系统已安装：
- Node.js (>= 18.0.0)
- PostgreSQL (>= 13.0)
- Redis (>= 6.0)

### 2. 安装依赖

```bash
npm install
```

### 3. 环境配置

复制环境变量示例文件并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置数据库连接等信息。

### 4. 数据库设置

```bash
# 生成Prisma客户端
npm run db:generate

# 推送数据库Schema
npm run db:push

# 初始化数据
npm run db:seed
```

### 5. 启动开发服务器

```bash
# 启动主应用（前端+后端API）
npm run dev

# 在另一个终端启动工具执行Worker
npm run dev:worker
```

应用将在 http://localhost:5000 启动。

## 核心功能

### 🔧 工具集
- **SDC约束生成器** - 自动生成时序约束文件
- **时钟树生成器** - 生成时钟分配网络
- **Memory数据生成器** - 生成存储器初始化数据

### 👤 用户系统
- 用户注册/登录
- JWT身份认证
- 免费版/专业版权限管理

### 🚀 异步任务处理
- Redis消息队列
- 独立的Worker进程
- 实时状态更新

## 开发指南

### 数据库操作

```bash
# 查看数据库
npm run db:studio

# 创建迁移
npm run db:migrate

# 重置数据
npm run db:seed
```

### 添加新工具

1. 在 `backend/src/utils/seedData.ts` 中定义工具Schema
2. 在 `backend/src/workers/toolWorker.ts` 中实现工具逻辑
3. 在前端创建对应的工具界面

### API文档

主要API端点：

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/tools` - 获取工具列表
- `POST /api/tools/execute` - 执行工具
- `GET /api/tools/runs/:id` - 获取执行状态

## 部署

### 生产环境构建

```bash
npm run build
```

### Docker部署

```bash
# 构建镜像
docker build -t chip-tools .

# 运行容器
docker run -p 5000:5000 chip-tools
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。