/**
 * gmail.worker.js — BullMQ Worker for Gmail Sync
 *
 * Processes jobs from the 'gmail-sync' queue.
 * Handles: inbox sync, token refresh, thread updates, calendar sync.
 *
 * This worker bridges into the existing emailSyncService and tokenService
 * without modifying them.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const prisma = require('../config/database');

const gmailWorker = new Worker(
  'gmail-sync',
  async (job) => {
    console.log(`📧 [Gmail Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type, userId, accountId, data } = job.data;

    try {
      switch (type) {
        case 'sync-inbox': {
          console.log(`[Gmail Worker] Syncing inbox for user: ${userId}, account: ${accountId || 'primary'}`);
          // Placeholder: Call your existing syncInbox here
          // const { syncInbox } = require('../services/inboxSyncService');
          // const result = await syncInbox(userId, 25, { returnMeta: true, accountId });
          return { success: true, type: 'sync-inbox', userId };
        }

        case 'refresh-token': {
          console.log(`[Gmail Worker] Refreshing token for user: ${userId}`);
          // Placeholder: Call your existing tokenService here
          // const { getValidAccessToken } = require('../services/tokenService');
          // await getValidAccessToken(userId, accountId);
          return { success: true, type: 'refresh-token', userId };
        }

        case 'sync-calendar': {
          console.log(`[Gmail Worker] Syncing calendar for user: ${userId}`);
          // Placeholder: Call your existing calendarService here
          // const { syncCalendar } = require('../services/calendarService');
          // await syncCalendar(userId);
          return { success: true, type: 'sync-calendar', userId };
        }

        case 'periodic-sync': {
          console.log(`[Gmail Worker] Running periodic sync`);
          // This is the scheduled recurring job
          // Placeholder: Trigger full inbox poll
          return { success: true, type: 'periodic-sync' };
        }

        default: {
          console.warn(`[Gmail Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`❌ [Gmail Worker] Error processing job ${job.id}:`, error.message);

      // --- Handle Invalid Grant (Token Revoked/Expired) ---
      if (error.message?.includes('invalid_grant') || error.message?.includes('refresh_token')) {
        console.warn(`⚠️ [Gmail Worker] OAuth Revoked for User: ${userId}. Marking for reconnect.`);
        try {
          await prisma.emailAccount.updateMany({
            where: { userId, provider: 'gmail' },
            data: { requiresReconnect: true },
          });
        } catch (dbErr) {
          console.error(`❌ [Gmail Worker] Failed to update reconnect status:`, dbErr.message);
        }
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,  // Process up to 3 Gmail sync jobs concurrently
  }
);

// --- Event Handlers ---

gmailWorker.on('completed', (job, result) => {
  console.log(`✅ [Gmail Worker] Job completed: ${job.id} | Type: ${job.name}`, result);
});

gmailWorker.on('failed', async (job, err) => {
  console.error(`❌ [Gmail Worker] Job failed: ${job?.id} | Attempt: ${job?.attemptsMade}/${job?.opts?.attempts}`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    console.error(`💀 [Gmail Worker] Job permanently failed (DLQ): ${job.id}`);

    try {
      await prisma.failedJob.create({
        data: {
          jobId: job.id,
          queueName: 'gmail-sync',
          jobName: job.name,
          payload: job.data,
          error: err.message,
          attempts: job.attemptsMade,
        },
      });
      console.log(`📥 [Gmail Worker] Saved failed job ${job.id} to FailedJob table.`);
    } catch (dbError) {
      console.error(`❌ [Gmail Worker] Failed to save DLQ job to DB:`, dbError.message);
    }
  }
});

gmailWorker.on('error', (err) => {
  console.error('❌ [Gmail Worker] Worker error:', err.message);
});

module.exports = { gmailWorker };
