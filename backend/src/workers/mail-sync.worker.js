/**
 * mail-sync.worker.js — BullMQ Worker for Universal IMAP/SMTP Mail Sync
 *
 * Processes jobs from the 'mail-sync' queue.
 * Handles: IMAP inbox sync, connection testing, periodic sync scheduling.
 *
 * This worker uses the ConnectorFactory to route sync operations to the
 * correct connector (Gmail App Password, Outlook IMAP, custom IMAP, etc.)
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const prisma = require('../config/database');
const ConnectorFactory = require('../services/connector');
const { syncImapAccount } = require('../services/imapSyncService');

const mailSyncWorker = new Worker(
  'mail-sync',
  async (job) => {
    console.log(`📬 [Mail Sync Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type, userId, accountId, data } = job.data;

    try {
      switch (type) {
        case 'sync-imap': {
          console.log(`[Mail Sync Worker] IMAP sync for user: ${userId}, account: ${accountId}`);
          return await syncImapAccount(userId, accountId);
        }

        case 'test-connection': {
          console.log(`[Mail Sync Worker] Testing connection for account: ${accountId}`);
          return await testAccountConnection(accountId);
        }

        case 'periodic-sync': {
          console.log(`[Mail Sync Worker] Running periodic IMAP sync...`);
          return await periodicImapSync();
        }

        default: {
          console.warn(`[Mail Sync Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`❌ [Mail Sync Worker] Error processing job ${job.id}:`, error.message);

      // Mark account for reconnect on auth failures
      if (isAuthError(error) && accountId) {
        try {
          await prisma.emailAccount.update({
            where: { id: accountId },
            data: { requiresReconnect: true },
          });
          console.warn(`⚠️ [Mail Sync Worker] Marked account ${accountId} for reconnect.`);
        } catch (dbErr) {
          console.error(`❌ [Mail Sync Worker] Failed to update reconnect status:`, dbErr.message);
        }
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

/**
 * Test an account's connection credentials.
 */
async function testAccountConnection(accountId) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found.`);
  }

  const connector = ConnectorFactory.getConnector(account);
  return await connector.testConnection();
}

/**
 * Run periodic sync for all IMAP-connected accounts.
 */
async function periodicImapSync() {
  const { mailSyncQueue } = require('../queues/mail-sync.queue');

  const imapAccounts = await prisma.emailAccount.findMany({
    where: {
      syncEnabled: true,
      connectionType: { in: ['imap', 'app_password'] },
      requiresReconnect: false,
    },
    select: { id: true, userId: true, email: true },
  });

  let jobsQueued = 0;

  for (const account of imapAccounts) {
    await mailSyncQueue.add('sync-imap', {
      type: 'sync-imap',
      userId: account.userId,
      accountId: account.id,
    });
    jobsQueued++;
  }

  return {
    success: true,
    type: 'periodic-sync',
    accountsCount: imapAccounts.length,
    jobsQueued,
  };
}

/**
 * Check if an error is an authentication/credential error.
 */
function isAuthError(error) {
  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('authentication failed') ||
    msg.includes('invalid credentials') ||
    msg.includes('login failed') ||
    msg.includes('auth') ||
    msg.includes('wrong password') ||
    msg.includes('no password')
  );
}

// --- Event Handlers ---

mailSyncWorker.on('completed', (job, result) => {
  console.log(`✅ [Mail Sync Worker] Job completed: ${job.id} | Type: ${job.name}`, result);
});

mailSyncWorker.on('failed', async (job, err) => {
  console.error(`❌ [Mail Sync Worker] Job failed: ${job?.id} | Attempt: ${job?.attemptsMade}/${job?.opts?.attempts}`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    console.error(`💀 [Mail Sync Worker] Job permanently failed (DLQ): ${job.id}`);

    try {
      await prisma.failedJob.create({
        data: {
          jobId: job.id,
          queueName: 'mail-sync',
          jobName: job.name,
          payload: job.data,
          error: err.message,
          attempts: job.attemptsMade,
        },
      });
    } catch (dbError) {
      console.error(`❌ [Mail Sync Worker] Failed to save DLQ job:`, dbError.message);
    }
  }
});

mailSyncWorker.on('error', (err) => {
  console.error('❌ [Mail Sync Worker] Worker error:', err.message);
});

module.exports = { mailSyncWorker };
