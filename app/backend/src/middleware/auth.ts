import { Response, NextFunction, Request } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database';
import { JwtPayload } from '../types/auth';
import { Role } from '@prisma/client';
import { JwtBlacklistService } from '../services/jwt-blacklist.service';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;

  if (!token) {
    console.log(`🔍 [AUTH] 访问令牌缺失 - URL: ${req.path}, IP: ${req.ip}`);
    return res.status(401).json({ message: '访问令牌缺失' });
  }

  try {
    // 1. 检查令牌是否在黑名单中
    const isBlacklisted = await JwtBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      res.clearCookie('access_token');
      return res.status(401).json({ message: 'Token has been revoked.' });
    }

    // 2. 验证JWT签名和结构
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    
    // 3. 检查用户是否因为密码重置等原因导致所有令牌失效
    const tokenIssuedAt = decoded.iat || 0;
    const isUserTokenInvalidated = await JwtBlacklistService.isUserTokenInvalidated(decoded.id, tokenIssuedAt);
    if (isUserTokenInvalidated) {
      res.clearCookie('access_token');
      return res.status(401).json({ message: 'Token has been invalidated due to security reasons.' });
    }
    
    // 4. 验证用户是否仍然存在
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      res.clearCookie('access_token');
      return res.status(401).json({ message: 'Authentication failed: User not found.' });
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    
    next();
  } catch (error) {
    console.log(`🔍 [AUTH] Token验证失败 - URL: ${req.path}, Error: ${error instanceof Error ? error.message : 'Unknown error'}, IP: ${req.ip}`);
    res.clearCookie('access_token');
    return res.status(403).json({ message: 'Invalid token.' });
  }
};

export const requireRole = (requiredRole: Role) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ message: '权限不足' });
    }

    next();
  };
};