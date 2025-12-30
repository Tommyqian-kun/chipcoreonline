# 环境变量配置说明

## 开发环境

在开发环境中，应用会使用默认值，无需创建 .env 文件。

### 默认配置
- `JWT_SECRET`: 使用开发默认值
- `PORT`: 5000
- `NODE_ENV`: development
- `FRONTEND_URL`: http://localhost:3000

## 生产环境

在生产环境中，必须设置以下环境变量：

### 必需的环境变量
```bash
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
DATABASE_URL="postgresql://user:password@localhost:5432/chip_tools"
REDIS_URL="redis://localhost:6379"
NODE_ENV="production"
PORT=5000
FRONTEND_URL="https://your-domain.com"
SESSION_SECRET="your-session-secret-key"
```

## 如何设置环境变量

### Windows PowerShell
```powershell
$env:JWT_SECRET="your-secret-key"
$env:PORT="5000"
npm run dev
```

### Linux/macOS
```bash
export JWT_SECRET="your-secret-key"
export PORT="5000"
npm run dev
```

### Docker
```dockerfile
ENV JWT_SECRET="your-secret-key"
ENV PORT="5000"
```

## .env 文件（可选）

如果需要使用 .env 文件，请创建 `backend/.env` 文件：

```env
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
DATABASE_URL="postgresql://user:password@localhost:5432/chip_tools"
REDIS_URL="redis://localhost:6379"
NODE_ENV="development"
PORT=5000
FRONTEND_URL="http://localhost:3000"
SESSION_SECRET="your-session-secret-key"
```

注意：.env 文件会被 git 忽略，这是安全最佳实践。 