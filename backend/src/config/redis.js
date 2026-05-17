/**
 * redis.js — Centralized Redis Connection for BullMQ
 *
 * This is the SINGLE Redis connection used by all BullMQ queues and workers.
 * It reuses the same REDIS_URL from .env that the existing redisClient.js uses,
 * but is configured specifically for BullMQ compatibility:
 *   - maxRetriesPerRequest: null  (required by BullMQ)
 *   - enableReadyCheck: false     (required for Upstash compatibility)
 *
 * The existing src/redisClient.js is NOT modified. This file provides a
 * separate connection exclusively for the queue infrastructure.
 */

const IORedis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ [BullMQ Redis] REDIS_URL is not set in environment variables!');
  process.exit(1);
}

const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,   // Required by BullMQ
  enableReadyCheck: false,      // Required for Upstash
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
});

redisConnection.on('connect', () => {
  console.log('✅ [BullMQ Redis] Connected');
});

redisConnection.on('error', (err) => {
  console.error('❌ [BullMQ Redis] Error:', err.message);
});

module.exports = { redisConnection };
