/**
 * notification.queue.js — BullMQ Queue for Notification Jobs
 *
 * Handles:
 *   - Push notification delivery
 *   - Digest email notifications
 *   - In-app notification creation
 *
 * Default retry: 3 attempts with exponential backoff starting at 2s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const notificationQueue = new Queue('notification-delivery', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 200,
    removeOnFail: 50,
  },
});

module.exports = { notificationQueue };
