/**
 * style-learning.worker.js — BullMQ Worker for Style Learning
 *
 * Processes jobs from the 'style-learning' queue.
 * Uses workerReliability for DLQ, retry metrics, and health tracking.
 */

const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { attachWorkerReliability, defaultWorkerOptions } = require('./workerReliability');

const queueName = 'style-learning';

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`🧠 [Style Learning Worker] Processing job: ${job.id} | Type: ${job.name}`);
    const { type, userId } = job.data;

    try {
      switch (type || job.name) {
        case 'build-profile':
          const { buildStyleProfile } = require('../services/styleService');
          await buildStyleProfile(userId);
          return { success: true, type: 'build-profile', userId };

        default:
          console.warn(`[Style Learning Worker] Unknown job type: ${type || job.name}`);
          return { success: false, error: `Unknown job type: ${type || job.name}` };
      }
    } catch (error) {
      console.error(`[Style Learning Worker] Error processing job ${job.id}:`, error.message);
      throw error;
    }
  },
  {
    connection: createRedisConnection(`worker:${queueName}`),
    concurrency: 1, // Keep concurrency low for ML/intensive tasks
    ...defaultWorkerOptions,
  }
);

attachWorkerReliability(worker, {
  queueName,
  workerName: 'style-learning-worker',
  concurrency: 1,
  attempts: 5,
});

module.exports = { styleLearningWorker: worker };
