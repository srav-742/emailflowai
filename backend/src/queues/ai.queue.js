/**
 * ai.queue.js — BullMQ Queue for AI Processing Jobs
 *
 * Handles:
 *   - AI email generation
 *   - Morning brief generation
 *   - Style training
 *   - Inbox summary
 *   - Analytics summary
 *
 * Default retry: 5 attempts with exponential backoff starting at 5s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const aiQueue = new Queue('ai-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 50,       // Keep last 50 failed jobs
  },
});

module.exports = { aiQueue };
