/**
 * gmail.worker.js — BullMQ Worker for Gmail Sync
 *
 * Processes jobs from the 'gmail-sync' queue.
 * Handles: inbox sync per user, token refresh, etc.
 * Uses workerReliability for DLQ, retry metrics, and health tracking.
 */

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { attachWorkerReliability, defaultWorkerOptions } = require('./workerReliability');

const queueName = 'gmail-sync';

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`📧 [Gmail Worker] Processing job: ${job.id} | Type: ${job.name}`);
    const { type, userId } = job.data;

    try {
      switch (type || job.name) {
        case 'periodic-sync':
          // Placeholder for business logic:
          // await gmailSyncService.syncAllUsers();
          return { success: true, type: 'periodic-sync' };
          
        case 'sync-user':
          // Placeholder for business logic:
          // await gmailSyncService.syncUser(userId);
          return { success: true, type: 'sync-user', userId };

        default:
          console.warn(`[Gmail Worker] Unknown job type: ${type || job.name}`);
          return { success: false, error: `Unknown job type: ${type || job.name}` };
      }
    } catch (error) {
      console.error(`[Gmail Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: createRedisConnection(`worker:${queueName}`),
    concurrency: 3,
    ...defaultWorkerOptions,
  }
);

attachWorkerReliability(worker, {
  queueName,
  workerName: 'gmail-worker',
  concurrency: 3,
  attempts: 5,
});

module.exports = { gmailWorker: worker };
