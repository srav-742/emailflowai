// src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) return true;
    return false;
  },
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error('❌ Redis error:', err));
redis.on('reconnecting', () => logger.warn('🔄 Redis reconnecting...'));

// ── Cache helpers ──────────────────────────────────────────────────────────

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  },
};

// ── Session / token store ─────────────────────────────────────────────────
export const tokenStore = {
  async storeRefreshToken(userId: string, token: string, ttlSeconds = 30 * 24 * 3600): Promise<void> {
    await redis.setex(`refresh:${userId}`, ttlSeconds, token);
  },

  async getRefreshToken(userId: string): Promise<string | null> {
    return redis.get(`refresh:${userId}`);
  },

  async deleteRefreshToken(userId: string): Promise<void> {
    await redis.del(`refresh:${userId}`);
  },

  async blacklistToken(token: string, ttlSeconds = 7 * 24 * 3600): Promise<void> {
    await redis.setex(`blacklist:${token}`, ttlSeconds, '1');
  },

  async isBlacklisted(token: string): Promise<boolean> {
    const val = await redis.get(`blacklist:${token}`);
    return val === '1';
  },
};