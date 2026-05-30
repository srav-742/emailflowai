/**
 * briefing.worker.js — BullMQ Worker for Briefing Generation
 *
 * Processes jobs from the 'briefing' queue.
 * Handles: morning briefs, executive briefings.
 * Uses workerReliability for DLQ, retry metrics, and health tracking.
 */

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { attachWorkerReliability, defaultWorkerOptions } = require('./workerReliability');

const queueName = 'briefing';

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`📝 [Briefing Worker] Processing job: ${job.id} | Type: ${job.name}`);
    const { type, userId, emails } = job.data;

    try {
      switch (type || job.name) {
        case 'morning-brief':
          // Placeholder for business logic:
          // const brief = await briefService.generateBrief(userId);
          return { success: true, type: 'morning-brief', userId };
          
        case 'batch-summary':
          // Placeholder for business logic:
          // const { summarizeBatchEmails } = require('../services/inboxSummaryService');
          // await summarizeBatchEmails(emails, userId);
          return { success: true, type: 'batch-summary', userId };

        default:
          console.warn(`[Briefing Worker] Unknown job type: ${type || job.name}`);
          return { success: false, error: `Unknown job type: ${type || job.name}` };
      }
    } catch (error) {
      console.error(`[Briefing Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: createRedisConnection(`worker:${queueName}`),
    concurrency: 2,
    ...defaultWorkerOptions,
  }
);

attachWorkerReliability(worker, {
  queueName,
  workerName: 'briefing-worker',
  concurrency: 2,
  attempts: 5,
});

module.exports = { briefingWorker: worker };
