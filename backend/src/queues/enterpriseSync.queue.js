const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

// V2 isolated queue for Enterprise Sync to avoid disrupting existing mail-sync
const enterpriseSyncQueue = new Queue('enterprise-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

module.exports = { enterpriseSyncQueue };
