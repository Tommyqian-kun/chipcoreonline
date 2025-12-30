// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Request } from 'express';
import { JwtPayload } from './auth';

declare global {
  namespace Express {
    export interface Request {
      user?: JwtPayload;
    }
  }
} 