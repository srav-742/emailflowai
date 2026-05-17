/**
 * gmail.queue.js — BullMQ Queue for Gmail Sync Jobs
 *
 * Handles:
 *   - Inbox sync per user
 *   - Token refresh
 *   - Thread updates
 *   - Calendar sync
 *
 * Default retry: 5 attempts with exponential backoff starting at 3s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const gmailQueue = new Queue('gmail-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

module.exports = { gmailQueue };
