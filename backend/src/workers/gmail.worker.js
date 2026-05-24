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
          const { syncInbox } = require('../services/inboxSyncService');
          const result = await syncInbox(userId, 25, { returnMeta: true, accountId });
          return { 
            success: true, 
            type: 'sync-inbox', 
            userId, 
            accountId,
            emailsCount: result.emails?.length || 0,
            newEmailsCount: result.newEmails?.length || 0
          };
        }

        case 'refresh-token': {
          console.log(`[Gmail Worker] Refreshing token for user: ${userId}, account: ${accountId || 'primary'}`);
          if (accountId) {
            const { refreshGoogleAccountToken } = require('../services/tokenRefreshService');
            const result = await refreshGoogleAccountToken(userId, accountId);
            return { success: true, type: 'refresh-token', userId, accountId, ...result };
          }

          const { refreshExpiringGoogleTokens } = require('../services/tokenRefreshService');
          const results = await refreshExpiringGoogleTokens();
          return { success: true, type: 'refresh-token', userId, refreshedCount: results.filter((item) => item.refreshed).length };
        }

        case 'sync-calendar': {
          console.log(`[Gmail Worker] Syncing calendar for user: ${userId}`);
          const { syncCalendar } = require('../services/calendarService');
          await syncCalendar(userId, accountId);
          return { success: true, type: 'sync-calendar', userId, accountId };
        }

        case 'periodic-sync': {
          console.log(`[Gmail Worker] Running periodic sync to queue accounts...`);
          const { gmailQueue } = require('../queues/gmail.queue');
          
          const users = await prisma.user.findMany({
            where: {
              OR: [
                { accessToken: { not: null } },
                { refreshToken: { not: null } },
                {
                  emailAccounts: {
                    some: {
                      provider: 'google',
                      syncEnabled: true,
                      OR: [
                        { accessToken: { not: null } },
                        { refreshToken: { not: null } },
                      ],
                    },
                  },
                },
                {
                  oauthTokens: {
                    some: {},
                  },
                },
              ],
            },
            select: { id: true, email: true, accessToken: true, refreshToken: true }
          });

          let jobsQueued = 0;
          for (const user of users) {
            const accounts = await prisma.emailAccount.findMany({
              where: {
                userId: user.id,
                provider: 'google',
                syncEnabled: true,
                requiresReconnect: false,
              },
              select: { id: true, email: true }
            });

            if (accounts.length > 0) {
              for (const account of accounts) {
                await gmailQueue.add('sync-inbox', {
                  type: 'sync-inbox',
                  userId: user.id,
                  accountId: account.id,
                });
                await gmailQueue.add('sync-calendar', {
                  type: 'sync-calendar',
                  userId: user.id,
                  accountId: account.id,
                });
                await gmailQueue.add('refresh-token', {
                  type: 'refresh-token',
                  userId: user.id,
                  accountId: account.id,
                });
                jobsQueued++;
              }
            } else if (user.accessToken || user.refreshToken) {
              await gmailQueue.add('sync-inbox', {
                type: 'sync-inbox',
                userId: user.id,
                accountId: null,
              });
              jobsQueued++;
            }
          }
          return { success: true, type: 'periodic-sync', usersCount: users.length, jobsQueued };
        }

        default: {
          console.warn(`[Gmail Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`❌ [Gmail Worker] Error processing job ${job.id}:`, error.message);

      // --- Handle Invalid Grant (Token Revoked/Expired) ---
      if (
        error.message?.includes('invalid_grant') ||
        error.message?.includes('unauthorized_client') ||
        error.message?.includes('refresh_token') ||
        error.message?.toLowerCase?.().includes('reconnect')
      ) {
        console.warn(`⚠️ [Gmail Worker] OAuth Revoked for User: ${userId}. Marking for reconnect.`);
        try {
          if (accountId) {
            await prisma.emailAccount.update({
              where: { id: accountId },
              data: { requiresReconnect: true },
            });
          } else {
            await prisma.emailAccount.updateMany({
              where: {
                userId,
                provider: { in: ['gmail', 'google'] },
              },
              data: { requiresReconnect: true },
            });
          }
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
