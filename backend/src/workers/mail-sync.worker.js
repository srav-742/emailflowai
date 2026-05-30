/**
 * mail-sync.worker.js — BullMQ Worker for Universal Mail Sync
 *
 * Processes jobs from the 'mail-sync' queue.
 * Handles IMAP/SMTP accounts.
 * Uses workerReliability for DLQ, retry metrics, and health tracking.
 */

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { attachWorkerReliability, defaultWorkerOptions } = require('./workerReliability');

const queueName = 'mail-sync';

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`📬 [Mail Sync Worker] Processing job: ${job.id} | Type: ${job.name}`);
    const { type, accountId } = job.data;

    try {
      switch (type || job.name) {
        case 'sync-imap':
          // Placeholder for business logic:
          // await imapSyncService.syncAccount(accountId);
          return { success: true, type: 'sync-imap', accountId };
          
        case 'test-connection':
          // Placeholder for business logic:
          return { success: true, type: 'test-connection', accountId };

        default:
          console.warn(`[Mail Sync Worker] Unknown job type: ${type || job.name}`);
          return { success: false, error: `Unknown job type: ${type || job.name}` };
      }
    } catch (error) {
      console.error(`[Mail Sync Worker] Error processing job ${job.id}:`, error.message);
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
  workerName: 'mail-sync-worker',
  concurrency: 3,
  attempts: 3,
});

module.exports = { mailSyncWorker: worker };
