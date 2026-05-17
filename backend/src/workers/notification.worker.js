/**
 * notification.worker.js — BullMQ Worker for Notification Delivery
 *
 * Processes jobs from the 'notification-delivery' queue.
 * Handles: push notifications, digest emails, in-app notifications.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');

const notificationWorker = new Worker(
  'notification-delivery',
  async (job) => {
    console.log(`🔔 [Notification Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type, userId, data } = job.data;

    try {
      switch (type) {
        case 'push-notification': {
          console.log(`[Notification Worker] Sending push to user: ${userId}`);
          // Placeholder: Call your existing pushService here
          // const { sendPushToUser } = require('../services/pushService');
          // await sendPushToUser(userId, data);
          return { success: true, type: 'push-notification', userId };
        }

        case 'digest-email': {
          console.log(`[Notification Worker] Sending digest to user: ${userId}`);
          // Placeholder: Call your existing digestService here
          return { success: true, type: 'digest-email', userId };
        }

        case 'in-app': {
          console.log(`[Notification Worker] Creating in-app notification for user: ${userId}`);
          return { success: true, type: 'in-app', userId };
        }

        default: {
          console.warn(`[Notification Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`[Notification Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,  // Notifications can be highly concurrent
  }
);

notificationWorker.on('completed', (job, result) => {
  console.log(`✅ [Notification Worker] Job completed: ${job.id}`, result);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ [Notification Worker] Job failed: ${job?.id}`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    console.error(`💀 [Notification Worker] Job permanently failed (DLQ): ${job.id}`, {
      jobId: job.id,
      queue: 'notification-delivery',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

notificationWorker.on('error', (err) => {
  console.error('❌ [Notification Worker] Worker error:', err.message);
});

module.exports = { notificationWorker };
