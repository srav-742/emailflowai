/**
 * otpMail.queue.js — BullMQ Queue for OTP Email Delivery Jobs
 *
 * Handles:
 *   - Secure async delivery of verification emails
 *   - Auto-retry failed deliveries
 *
 * Default retry: 5 attempts with exponential backoff starting at 3s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const otpMailQueue = new Queue('otp-mail-delivery', {
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

module.exports = { otpMailQueue };
