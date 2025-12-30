import { Request } from 'express';
import { JwtPayload as BaseJwtPayload } from 'jsonwebtoken';
import { Role } from '@prisma/client';

/**
 * Defines the structure of the JWT payload, extending the base payload from jsonwebtoken.
 * This is the object that is encoded into the JWT and decoded by middleware.
 */
export interface JwtPayload extends BaseJwtPayload {
  id: string;
  email: string;
  role: Role;
}

/**
 * Extends the default Express Request interface to include the decoded JWT payload (user).
 * This is attached by the authentication middleware.
 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  file?: Express.Multer.File;
} 