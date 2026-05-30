/**
 * redis.js - Centralized Redis connection manager for BullMQ.
 *
 * Keeps BullMQ-compatible connection options in one place and allows workers
 * to reconnect automatically after Redis restarts without crashing the process.
 */

const IORedis = require('ioredis');
const logger = require('./logger');

const redisUrl = process.env.REDIS_URL;
const connectTimeout = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10000);
const maxReconnectDelay = Number(process.env.REDIS_RECONNECT_MAX_DELAY_MS || 30000);

const redisState = {
  status: 'initializing',
  lastConnectedAt: null,
  lastErrorAt: null,
  lastError: null,
  reconnects: 0,
};

function requireRedisUrl() {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for BullMQ queue infrastructure.');
  }
}

function createRetryStrategy(role) {
  return (attempt) => {
    redisState.reconnects += 1;
    const delay = Math.min(attempt * 1000, maxReconnectDelay);

    logger.warn('[BullMQ Redis] Reconnect scheduled.', {
      role,
      attempt,
      delayMs: delay,
    });

    return delay;
  };
}

function createRedisConnection(role = 'bullmq') {
  requireRedisUrl();

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    connectTimeout,
    keepAlive: 30000,
    lazyConnect: false,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    retryStrategy: createRetryStrategy(role),
    reconnectOnError: (error) => {
      const message = String(error?.message || '').toLowerCase();
      return message.includes('readonly') || message.includes('connection') || message.includes('socket');
    },
  });

  connection.on('connect', () => {
    redisState.status = 'connected';
    redisState.lastConnectedAt = new Date().toISOString();
    logger.info('[BullMQ Redis] Connected.', { role });
  });

  connection.on('ready', () => {
    redisState.status = 'ready';
    logger.info('[BullMQ Redis] Ready.', { role });
  });

  connection.on('reconnecting', () => {
    redisState.status = 'reconnecting';
    logger.warn('[BullMQ Redis] Reconnecting.', { role });
  });

  connection.on('close', () => {
    redisState.status = 'closed';
    logger.warn('[BullMQ Redis] Connection closed.', { role });
  });

  connection.on('end', () => {
    redisState.status = 'ended';
    logger.warn('[BullMQ Redis] Connection ended.', { role });
  });

  connection.on('error', (error) => {
    redisState.status = 'error';
    redisState.lastErrorAt = new Date().toISOString();
    redisState.lastError = error.message;
    logger.error('[BullMQ Redis] Error.', { role, error });
  });

  return connection;
}

const redisConnection = createRedisConnection('bullmq-shared');

async function checkRedisHealth() {
  const startedAt = Date.now();
  const response = await redisConnection.ping();

  return {
    ok: response === 'PONG',
    response,
    latencyMs: Date.now() - startedAt,
    status: redisConnection.status,
    state: getRedisStatus(),
  };
}

function getRedisStatus() {
  return {
    ...redisState,
    clientStatus: redisConnection.status,
  };
}

module.exports = {
  redisConnection,
  createRedisConnection,
  checkRedisHealth,
  getRedisStatus,
};
