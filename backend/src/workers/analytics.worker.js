/**
 * analytics.worker.js — BullMQ Worker for Analytics Processing
 *
 * Processes jobs from the 'analytics-processing' queue.
 * Handles: daily stats aggregation, usage tracking, report generation.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');

const analyticsWorker = new Worker(
  'analytics-processing',
  async (job) => {
    console.log(`📊 [Analytics Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type, userId, data } = job.data;

    try {
      switch (type) {
        case 'daily-aggregation': {
          console.log(`[Analytics Worker] Running daily stats aggregation`);
          // Placeholder: Call your existing analyticsService here
          // const { aggregateDailyStats } = require('../services/analyticsService');
          // await aggregateDailyStats();
          return { success: true, type: 'daily-aggregation' };
        }

        case 'user-analytics': {
          console.log(`[Analytics Worker] Computing analytics for user: ${userId}`);
          return { success: true, type: 'user-analytics', userId };
        }

        default: {
          console.warn(`[Analytics Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`[Analytics Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

analyticsWorker.on('completed', (job, result) => {
  console.log(`✅ [Analytics Worker] Job completed: ${job.id}`, result);
});

analyticsWorker.on('failed', (job, err) => {
  console.error(`❌ [Analytics Worker] Job failed: ${job?.id}`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    console.error(`💀 [Analytics Worker] Job permanently failed (DLQ): ${job.id}`, {
      jobId: job.id,
      queue: 'analytics-processing',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

analyticsWorker.on('error', (err) => {
  console.error('❌ [Analytics Worker] Worker error:', err.message);
});

module.exports = { analyticsWorker };
