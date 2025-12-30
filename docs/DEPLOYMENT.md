# LogicCore EDA Tools - Linux生产部署指南

## 📋 系统要求

### 硬件要求
- **CPU**: 4核心以上 (推荐8核心)
- **内存**: 8GB以上 (推荐16GB)
- **存储**: 100GB以上可用空间
- **网络**: 稳定的互联网连接

### 软件要求
- **操作系统**: Rocky Linux 8.10+ / CentOS 8+ / Ubuntu 20.04+
- **Docker**: 26.1.3+
- **Docker Compose**: 2.0+
- **Node.js**: 22.19.0+ (LTS)
- **Python**: 3.11+
- **PostgreSQL**: 11+ (可通过Docker部署)
- **Redis**: 5+ (可通过Docker部署)

## 🚀 快速部署 (ECS Only模式)

### 步骤1: 系统准备

```bash
# 更新系统
sudo yum update -y  # Rocky Linux/CentOS
# 或
sudo apt update && sudo apt upgrade -y  # Ubuntu

# 安装基础工具
sudo yum install -y git curl wget unzip  # Rocky Linux/CentOS
# 或
sudo apt install -y git curl wget unzip  # Ubuntu
```

### 步骤2: 安装Docker

```bash
# 安装Docker (Rocky Linux/CentOS)
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动Docker服务
sudo systemctl start docker
sudo systemctl enable docker

# 添加用户到docker组
sudo usermod -aG docker $USER
newgrp docker
```

### 步骤3: 安装Node.js

```bash
# 安装NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装Node.js 22.19.0
nvm install v22.19.0
nvm use v22.19.0
nvm alias default v22.19.0

# 验证安装
node --version  # 应显示 v22.19.0
npm --version   # 应显示 10.9.3+
```

### 步骤4: 安装Python 3.11和系统依赖

```bash
# Rocky Linux/CentOS
sudo yum install -y python3.11 python3.11-pip python3.11-devel python3.11-tkinter

# Ubuntu (如果需要)
sudo apt install -y python3.11 python3.11-pip python3.11-dev python3-tk

# 验证安装
python3.11 --version  # 应显示 Python 3.11.x
python3.11 -c "import tkinter; print('tkinter OK')"  # 验证tkinter
```

### 步骤5: 克隆项目

```bash
# 克隆项目到生产目录
sudo mkdir -p /opt/logiccore
sudo chown $USER:$USER /opt/logiccore
cd /opt/logiccore

git clone <your-repository-url> .
# 或者上传项目文件到此目录
```

### 步骤6: 安装Python依赖

```bash
# 安装Python依赖
python3.11 -m pip install --user -r requirements.txt

# 验证关键依赖
python3.11 -c "import redis, docker, psycopg2, openpyxl, pandas; print('✅ Python依赖安装成功')"
```

### 步骤7: 安装Node.js依赖

```bash
# 进入应用目录
cd /opt/logiccore/app

# 安装所有依赖
npm run install:all

# 验证安装
npm list --depth=0
```

### 步骤8: 配置环境变量

```bash
# 复制环境配置文件
cd /opt/logiccore/app/backend
cp .env.example .env.local

# 编辑配置文件
nano .env.local
```

**关键配置项**:
```env
# 数据库配置
DATABASE_URL="postgresql://logiccore:your_password@localhost:5432/logiccore"

# Redis配置
REDIS_URL="redis://localhost:6379/0"

# 部署模式
DEPLOYMENT_MODE="ecs_only"

# 服务端口
BACKEND_PORT=8080
FRONTEND_PORT=3000

# JWT密钥
JWT_SECRET="your-super-secret-jwt-key"

# 邮件配置
SMTP_HOST="smtp.126.com"
SMTP_PORT=465
SMTP_USER="your-email@126.com"
SMTP_PASS="your-smtp-password"

# 文件存储路径
TEMP_UPLOAD_DIR="/opt/logiccore/temp"
TASK_LOGS_DIR="/opt/logiccore/logs"
ECS_TEMPLATES_DIR="/opt/logiccore/templates"
ECS_JOBS_DIR="/opt/logiccore/jobs"
ECS_DOCKER_DIR="/opt/logiccore/docker"
```

### 步骤9: 启动数据库服务

```bash
# 启动PostgreSQL和Redis (Docker方式)
cd /opt/logiccore/app
docker-compose up -d

# 等待服务启动
sleep 10

# 验证服务状态
docker-compose ps
```

### 步骤10: 初始化数据库

```bash
# 运行数据库迁移
npm run db:migrate

# 运行数据库种子
npm run db:seed

# 初始化SDC多页面数据库
cd /opt/logiccore/app/backend
npm run init:sdc-thrpages-db
```

### 步骤11: 构建应用

```bash
# 构建前端应用
cd /opt/logiccore/app
npm run build
```

### 步骤12: 启动应用

```bash
# 启动生产服务
npm run start

# 或者使用PM2管理进程
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔧 生产环境优化

### 系统服务配置

创建systemd服务文件:

```bash
sudo nano /etc/systemd/system/logiccore.service
```

```ini
[Unit]
Description=LogicCore EDA Tools Service
After=network.target docker.service

[Service]
Type=simple
User=logiccore
WorkingDirectory=/opt/logiccore/app
Environment=NODE_ENV=production
ExecStart=/home/logiccore/.nvm/versions/node/v22.19.0/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 启用服务
sudo systemctl daemon-reload
sudo systemctl enable logiccore
sudo systemctl start logiccore
```

### 反向代理配置 (Nginx)

```bash
# 安装Nginx
sudo yum install -y nginx  # Rocky Linux/CentOS
# 或
sudo apt install -y nginx  # Ubuntu

# 配置Nginx
sudo nano /etc/nginx/conf.d/logiccore.conf
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间用于长时间运行的工具
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket支持
    location /socket.io/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 📊 监控和日志

### 日志管理

```bash
# 查看应用日志
tail -f /opt/logiccore/logs/app.log

# 查看Docker服务日志
docker-compose logs -f

# 查看系统服务日志
sudo journalctl -u logiccore -f
```

### 健康检查

```bash
# 检查服务状态
curl http://localhost:8080/health

# 检查前端
curl http://localhost:3000

# 检查数据库连接
docker exec -it app_postgres_1 psql -U logiccore -d logiccore -c "SELECT 1;"

# 检查Redis连接
docker exec -it app_redis_1 redis-cli ping
```

## 🔒 安全配置

### 防火墙设置

```bash
# 开放必要端口
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

### SSL证书 (Let's Encrypt)

```bash
# 安装Certbot
sudo yum install -y certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🚨 故障排除

### 常见问题

1. **Python命令找不到**
   ```bash
   # 确保使用python3
   which python3.11
   python3.11 --version
   ```

2. **Docker权限问题**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **端口占用**
   ```bash
   sudo netstat -tlnp | grep :8080
   sudo lsof -i :3000
   ```

4. **数据库连接失败**
   ```bash
   docker-compose ps
   docker-compose logs postgres
   ```

### 性能优化

1. **增加系统资源限制**
   ```bash
   # 编辑 /etc/security/limits.conf
   logiccore soft nofile 65536
   logiccore hard nofile 65536
   ```

2. **优化Docker资源**
   ```bash
   # 编辑 docker-compose.yml
   # 增加内存和CPU限制
   ```

## 📞 支持

如遇到部署问题，请检查：
1. 系统日志: `sudo journalctl -u logiccore`
2. 应用日志: `/opt/logiccore/logs/`
3. Docker日志: `docker-compose logs`

---

**部署完成后，访问 http://your-domain.com 开始使用LogicCore EDA工具！**
