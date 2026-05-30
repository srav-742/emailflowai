/**
 * style-learning.queue.js — BullMQ Queue for Style Learning Jobs
 *
 * Handles:
 *   - User writing style extraction
 *   - Style profile updates
 *
 * Default retry: 5 attempts with exponential backoff starting at 5s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const styleLearningQueue = new Queue('style-learning', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

module.exports = { styleLearningQueue };
