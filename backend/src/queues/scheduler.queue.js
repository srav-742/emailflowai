/**
 * scheduler.queue.js — BullMQ Queue for Scheduled / Recurring Jobs
 *
 * Handles:
 *   - Periodic Gmail sync (every 5 minutes)
 *   - Daily analytics aggregation
 *   - Digest checks (every 15 minutes)
 *   - Follow-up detection (every hour)
 *
 * This queue is used to ADD repeatable jobs at startup.
 * The actual processing is dispatched to the relevant queue (gmail, analytics, etc).
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const schedulerQueue = new Queue('scheduler', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

module.exports = { schedulerQueue };
