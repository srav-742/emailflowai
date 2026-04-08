// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { tokenStore } from '../config/redis';
import { sendError } from '../utils/apiResponse';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 'No token provided', 401);
      return;
    }

    const token = authHeader.split(' ')[1];

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await tokenStore.isBlacklisted(token);
    if (isBlacklisted) {
      sendError(res, 'Token has been revoked', 401);
      return;
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    sendError(res, 'Invalid or expired token', 401);
  }
};

export const requirePro = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.plan !== 'PRO') {
    sendError(res, 'This feature requires a Pro subscription', 403);
    return;
  }
  next();
};