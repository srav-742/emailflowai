const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const enterpriseSyncService = require('../services/oauth/enterpriseSyncService');

const enterpriseSyncWorker = new Worker(
  'enterprise-sync',
  async (job) => {
    const { userId, email } = job.data;
    if (!userId || !email) {
      throw new Error('Missing userId or email in enterprise sync job data');
    }

    console.log(`[EnterpriseSyncWorker] Processing sync job for ${email}`);
    const result = await enterpriseSyncService.syncAccount(userId, email);
    
    if (result.status === 'failed') {
      throw new Error(`Sync failed: ${result.error || result.reason}`);
    }

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 multi-account syncs concurrently
  }
);

enterpriseSyncWorker.on('completed', (job, returnvalue) => {
  console.log(`[EnterpriseSyncWorker] Job ${job.id} completed. Status: ${returnvalue.status}`);
});

enterpriseSyncWorker.on('failed', (job, err) => {
  console.error(`[EnterpriseSyncWorker] Job ${job.id} failed:`, err.message);
});

module.exports = { enterpriseSyncWorker };
