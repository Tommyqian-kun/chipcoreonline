/**
 * 管理员权限验证中间件
 * 用于保护需要管理员权限的路由
 */

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

/**
 * 要求管理员权限的中间件
 * 必须在authenticateToken中间件之后使用
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).json({ 
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }

    if (req.user.role !== Role.ADMIN) {
        return res.status(403).json({ 
            message: 'Admin access required',
            code: 'ADMIN_ACCESS_REQUIRED',
            userRole: req.user.role
        });
    }

    next();
};
