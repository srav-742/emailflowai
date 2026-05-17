/**
 * analytics.queue.js — BullMQ Queue for Analytics Jobs
 *
 * Handles:
 *   - Daily stats aggregation
 *   - Usage tracking
 *   - Report generation
 *
 * Default retry: 3 attempts with exponential backoff starting at 10s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const analyticsQueue = new Queue('analytics-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

module.exports = { analyticsQueue };
