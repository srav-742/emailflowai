/**
 * scheduler.worker.js — BullMQ Worker for Scheduled / Recurring Jobs
 *
 * Processes jobs from the 'scheduler' queue.
 * This worker dispatches recurring tasks to the appropriate queues.
 *
 * At startup, it registers repeatable jobs:
 *   - Gmail periodic sync: every 5 minutes
 *   - Analytics daily aggregation: every 24 hours
 *   - Digest check: every 15 minutes
 *   - Follow-up detection: every 1 hour
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const { gmailQueue } = require('../queues/gmail.queue');
const { analyticsQueue } = require('../queues/analytics.queue');
const { schedulerQueue } = require('../queues/scheduler.queue');

// --- Register Repeatable Jobs on Load ---
async function registerScheduledJobs() {
  console.log('⏰ [Scheduler] Registering repeatable jobs...');

  // Gmail periodic sync — every 5 minutes
  await gmailQueue.add(
    'gmail-periodic-sync',
    { type: 'periodic-sync' },
    {
      repeat: { every: 5 * 60 * 1000 },  // 300000 ms = 5 minutes
      jobId: 'gmail-periodic-sync',       // Prevent duplicates
    }
  );
  console.log('  ✅ Gmail periodic sync: every 5 minutes');

  // Analytics daily aggregation — every 24 hours
  await analyticsQueue.add(
    'daily-aggregation',
    { type: 'daily-aggregation' },
    {
      repeat: { every: 24 * 60 * 60 * 1000 },  // 86400000 ms = 24 hours
      jobId: 'analytics-daily-aggregation',
    }
  );
  console.log('  ✅ Analytics daily aggregation: every 24 hours');

  // Digest check — every 15 minutes
  await schedulerQueue.add(
    'digest-check',
    { type: 'digest-check' },
    {
      repeat: { every: 15 * 60 * 1000 },  // 900000 ms = 15 minutes
      jobId: 'digest-periodic-check',
    }
  );
  console.log('  ✅ Digest check: every 15 minutes');

  // Follow-up detection — every 1 hour
  await schedulerQueue.add(
    'follow-up-detection',
    { type: 'follow-up-detection' },
    {
      repeat: { every: 60 * 60 * 1000 },  // 3600000 ms = 1 hour
      jobId: 'follow-up-periodic-detection',
    }
  );
  console.log('  ✅ Follow-up detection: every 1 hour');

  console.log('⏰ [Scheduler] All repeatable jobs registered.');
}

// --- Scheduler Worker ---
const schedulerWorker = new Worker(
  'scheduler',
  async (job) => {
    console.log(`⏰ [Scheduler Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type } = job.data;

    try {
      switch (type) {
        case 'gmail-sync': {
          console.log(`[Scheduler Worker] Dispatching Gmail Periodic Sync`);
          await gmailQueue.add('periodic-sync', { type: 'periodic-sync' });
          return { success: true, dispatched: 'gmail-sync' };
        }

        case 'analytics': {
          console.log(`[Scheduler Worker] Running Analytics Aggregation`);
          const { aggregateDailyStats } = require('../services/analyticsService');
          await aggregateDailyStats();
          return { success: true, processed: 'analytics' };
        }

        case 'digest':
        case 'digest-check': {
          console.log(`[Scheduler Worker] Running digest check`);
          const digestService = require('../services/digestService');
          await digestService.checkAndTriggerDigests();
          return { success: true, processed: 'digest' };
        }

        case 'follow-up-detection': {
          console.log(`[Scheduler Worker] Running follow-up detection`);
          // const { detectFollowUps } = require('../services/followUpService');
          // await detectFollowUps();
          return { success: true, type: 'follow-up-detection' };
        }

        case 'style-learning': {
          console.log(`[Scheduler Worker] Running Style Learning Job`);
          const prisma = require('../config/database');
          const { styleLearningQueue } = require('../queues/style-learning.queue');
          
          const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const usersToLearn = await prisma.user.findMany({
            where: {
              OR: [
                { createdAt: { gte: tenDaysAgo } },
                { styleProfile: { lastLearnedAt: { lte: sevenDaysAgo } } }
              ]
            }
          });

          for (const user of usersToLearn) {
            await styleLearningQueue.add('build-profile', { type: 'build-profile', userId: user.id });
          }
          return { success: true, processed: 'style-learning', count: usersToLearn.length };
        }

        default: {
          console.warn(`[Scheduler Worker] Unknown job type: ${type || job.name}`);
          return { success: false, error: `Unknown job type: ${type || job.name}` };
        }
      }
    } catch (error) {
      console.error(`[Scheduler Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

schedulerWorker.on('completed', (job, result) => {
  console.log(`✅ [Scheduler Worker] Job completed: ${job.id}`, result);
});

schedulerWorker.on('failed', (job, err) => {
  console.error(`❌ [Scheduler Worker] Job failed: ${job?.id}`, err.message);
});

schedulerWorker.on('error', (err) => {
  console.error('❌ [Scheduler Worker] Worker error:', err.message);
});

// Register the scheduled jobs when this module is loaded
// Note: Moved to server.js initBackgroundServices -> initRepeatableJobs() for cleaner startup
/*
registerScheduledJobs().catch((err) => {
  console.error('❌ [Scheduler] Failed to register scheduled jobs:', err.message);
});
*/

module.exports = { schedulerWorker, registerScheduledJobs };
