// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis';
import { sendError } from '../utils/apiResponse';

// ── General API rate limit ─────────────────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: 'Too many requests from this IP',
  handler: (_req, res) => sendError(res, 'Too many requests. Please try again later.', 429),
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth endpoints rate limit ──────────────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts',
  handler: (_req, res) => sendError(res, 'Too many login attempts. Try again in 15 minutes.', 429),
});

// ── AI actions rate limit (per user) ──────────────────────────────────────
export const aiLimiter = async (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  const key = `ai_rate:${userId}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }

  if (current > 30) {
    sendError(res, 'AI rate limit exceeded. Max 30 AI actions per hour.', 429);
    return;
  }

  next();
};