/**
 * ai.worker.js — BullMQ Worker for AI Processing
 *
 * Processes jobs from the 'ai-processing' queue.
 * Handles: email generation, morning briefs, style training, inbox summaries.
 *
 * Dead-letter handling: failed jobs are logged with full context for debugging.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const prisma = require('../config/database');
const { attachWorkerReliability, defaultWorkerOptions } = require('./workerReliability');

const aiWorker = new Worker(
  'ai-processing',
  async (job) => {
    console.log(`🤖 [AI Worker] Processing job: ${job.id} | Type: ${job.name}`);

    const { type, userId, prompt, data } = job.data;

    try {
      switch (type || job.name) {
        case 'generate-ai-response': {
          console.log('🚀 [AI Worker] Processing Test AI Job:', job.id);
          console.log(job.data);
          
          if (job.data.fail) {
            console.log(`⚠️ [AI Worker] Simulating failure for job ${job.id}`);
            throw new Error('Test Failure Triggered');
          }

          // Simulate AI processing
          await new Promise((resolve) => setTimeout(resolve, 3000));
          console.log('✅ [AI Worker] Test AI Processing Finished');
          return { success: true };
        }
        case 'generate-email': {
          console.log(`[AI Worker] Generating email for user: ${userId || 'Test'}`);
          
          if (job.data.fail) {
            console.log(`⚠️ [AI Worker] Simulating failure for job ${job.id}`);
            throw new Error('Retry System Test Failure');
          }

          // Simulate AI processing delay
          await new Promise((resolve) => setTimeout(resolve, 3000));
          
          return { 
            success: true, 
            type: 'generate-email',
            output: `Processed: ${prompt || 'No prompt provided'}`
          };
        }

        case 'morning-brief': {
          console.log(`[AI Worker] Generating morning brief for user: ${userId}`);
          // Placeholder: Call your existing briefService here
          // const brief = await briefService.generateBrief(userId);
          return { success: true, type: 'morning-brief' };
        }

        case 'train-style': {
          console.log(`[AI Worker] Training style for user: ${userId}`);
          // Placeholder: Call your existing styleService here
          // await styleService.trainStyle(userId, data);
          return { success: true, type: 'train-style' };
        }

        case 'inbox-summary': {
          console.log(`[AI Worker] Generating inbox summary for user: ${userId}`);
          // Placeholder: Call your existing inboxSummaryService here
          // const summary = await inboxSummaryService.generateSummary(userId);
          return { success: true, type: 'inbox-summary' };
        }

        case 'analytics-summary': {
          console.log(`[AI Worker] Generating analytics summary for user: ${userId}`);
          return { success: true, type: 'analytics-summary' };
        }

        default: {
          console.warn(`[AI Worker] Unknown job type: ${type}`);
          return { success: false, error: `Unknown job type: ${type}` };
        }
      }
    } catch (error) {
      console.error(`[AI Worker] Error processing job ${job.id}:`, error.message);
      throw error; // Re-throw to trigger BullMQ retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,  // Process up to 5 AI jobs concurrently
    ...defaultWorkerOptions,
  }
);

attachWorkerReliability(aiWorker, {
  queueName: 'ai-processing',
  workerName: 'ai-worker',
  concurrency: 5,
  attempts: 5,
});

module.exports = { aiWorker };
