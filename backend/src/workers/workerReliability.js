const { QueueEvents } = require('bullmq');
const logger = require('../config/logger');
const prisma = require('../config/database');
const { createRedisConnection } = require('../config/redis');
const { getDeadLetterQueue } = require('../queues/dead-letter.queue');

const workerHealth = new Map();
const queueEventHandles = new Map();

const defaultWorkerOptions = {
  lockDuration: Number(process.env.BULLMQ_LOCK_DURATION_MS || 300000),
  stalledInterval: Number(process.env.BULLMQ_STALLED_INTERVAL_MS || 30000),
  maxStalledCount: Number(process.env.BULLMQ_MAX_STALLED_COUNT || 2),
};

function getAttempts(job, fallbackAttempts) {
  return Number(job?.opts?.attempts || fallbackAttempts || 1);
}

function initializeHealth({ queueName, workerName, concurrency }) {
  const state = {
    queueName,
    workerName,
    concurrency,
    status: 'starting',
    startedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    lastCompletedAt: null,
    lastFailedAt: null,
    lastErrorAt: null,
    lastError: null,
    processed: 0,
    failed: 0,
    terminalFailures: 0,
    retriesScheduled: 0,
    stalled: 0,
  };

  workerHealth.set(queueName, state);
  return state;
}

function touchHealth(queueName, updates = {}) {
  const current = workerHealth.get(queueName) || {};
  workerHealth.set(queueName, {
    ...current,
    ...updates,
    lastHeartbeatAt: new Date().toISOString(),
  });
}

async function persistTerminalFailure({ queueName, job, error }) {
  const attempts = Number(job?.attemptsMade || 0);
  const payload = {
    originalJobId: String(job.id),
    originalQueue: queueName,
    originalJobName: job.name,
    originalPayload: job.data,
    failedReason: error.message,
    stack: error.stack,
    attempts,
    failedAt: new Date().toISOString(),
  };

  try {
    const existing = await prisma.failedJob.findFirst({
      where: {
        jobId: String(job.id),
        queueName,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.failedJob.create({
        data: {
          jobId: String(job.id),
          queueName,
          jobName: job.name,
          payload: job.data || {},
          error: error.message,
          attempts,
        },
      });
    }
  } catch (dbError) {
    logger.error('[Worker Reliability] Failed to persist failed job.', {
      queueName,
      jobId: job?.id,
      error: dbError,
    });
  }

  try {
    const deadLetterQueue = getDeadLetterQueue(queueName);
    await deadLetterQueue.add('dead-letter', payload, {
      jobId: `dlq:${queueName}:${job.id}:${attempts}`,
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  } catch (queueError) {
    logger.error('[Worker Reliability] Failed to enqueue dead-letter job.', {
      queueName,
      jobId: job?.id,
      error: queueError,
    });
  }
}

function registerQueueEvents(queueName) {
  if (queueEventHandles.has(queueName)) {
    return queueEventHandles.get(queueName);
  }

  const queueEvents = new QueueEvents(queueName, {
    connection: createRedisConnection(`queue-events:${queueName}`),
  });

  queueEvents.on('waiting', ({ jobId }) => {
    logger.debug('[Queue Events] Job waiting.', { queueName, jobId });
  });

  queueEvents.on('delayed', ({ jobId, delay }) => {
    logger.debug('[Queue Events] Job delayed.', { queueName, jobId, delay });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.warn('[Queue Events] Job failed.', { queueName, jobId, failedReason });
  });

  queueEvents.on('error', (error) => {
    touchHealth(queueName, {
      status: 'queue-events-error',
      lastErrorAt: new Date().toISOString(),
      lastError: error.message,
    });
    logger.error('[Queue Events] Error.', { queueName, error });
  });

  queueEventHandles.set(queueName, queueEvents);
  return queueEvents;
}

function attachWorkerReliability(worker, options) {
  const {
    queueName,
    workerName,
    concurrency,
    attempts,
    logPrefix = workerName || queueName,
  } = options;

  initializeHealth({ queueName, workerName, concurrency });
  registerQueueEvents(queueName);

  worker.on('ready', () => {
    touchHealth(queueName, { status: 'ready' });
    logger.info(`[${logPrefix}] Worker ready.`, { queueName, concurrency });
  });

  worker.on('active', (job) => {
    touchHealth(queueName, { status: 'active', activeJobId: String(job.id) });
    logger.info(`[${logPrefix}] Job active.`, {
      queueName,
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
      attempts: getAttempts(job, attempts),
    });
  });

  worker.on('completed', (job, result) => {
    const current = workerHealth.get(queueName);
    touchHealth(queueName, {
      status: 'ready',
      activeJobId: null,
      lastCompletedAt: new Date().toISOString(),
      processed: Number(current?.processed || 0) + 1,
    });

    logger.info(`[${logPrefix}] Job completed.`, {
      queueName,
      jobId: job.id,
      jobName: job.name,
      result,
    });
  });

  worker.on('failed', async (job, error) => {
    const current = workerHealth.get(queueName);
    const maxAttempts = getAttempts(job, attempts);
    const terminalFailure = job && job.attemptsMade >= maxAttempts;

    touchHealth(queueName, {
      status: terminalFailure ? 'terminal-failure-recorded' : 'retry-pending',
      activeJobId: null,
      lastFailedAt: new Date().toISOString(),
      failed: Number(current?.failed || 0) + 1,
      retriesScheduled: Number(current?.retriesScheduled || 0) + (terminalFailure ? 0 : 1),
      terminalFailures: Number(current?.terminalFailures || 0) + (terminalFailure ? 1 : 0),
      lastError: error.message,
    });

    logger.error(`[${logPrefix}] Job failed.`, {
      queueName,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      attempts: maxAttempts,
      terminalFailure,
      error,
    });

    if (terminalFailure) {
      await persistTerminalFailure({ queueName, job, error });
    }
  });

  worker.on('stalled', (jobId) => {
    const current = workerHealth.get(queueName);
    touchHealth(queueName, {
      status: 'stalled',
      stalled: Number(current?.stalled || 0) + 1,
      activeJobId: null,
    });
    logger.warn(`[${logPrefix}] Job stalled.`, { queueName, jobId });
  });

  worker.on('error', (error) => {
    touchHealth(queueName, {
      status: 'error',
      lastErrorAt: new Date().toISOString(),
      lastError: error.message,
    });
    logger.error(`[${logPrefix}] Worker error.`, { queueName, error });
  });

  worker.on('closed', () => {
    touchHealth(queueName, { status: 'closed', activeJobId: null });
    logger.warn(`[${logPrefix}] Worker closed.`, { queueName });
  });

  return worker;
}

async function closeQueueEvents() {
  await Promise.allSettled(
    Array.from(queueEventHandles.values()).map((queueEvents) => queueEvents.close())
  );
}

function getWorkerHealth() {
  return Array.from(workerHealth.values()).map((entry) => ({ ...entry }));
}

module.exports = {
  defaultWorkerOptions,
  attachWorkerReliability,
  closeQueueEvents,
  getWorkerHealth,
};
