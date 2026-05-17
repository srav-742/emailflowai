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
  }
);

// --- Event Handlers ---

aiWorker.on('completed', (job, result) => {
  console.log(`✅ [AI Worker] Job completed: ${job.id} | Type: ${job.name}`, result);
});

aiWorker.on('failed', async (job, err) => {
  console.error(`❌ [AI Worker] Job failed: ${job?.id} | Attempt: ${job?.attemptsMade}/${job?.opts?.attempts}`, err.message);

  // Dead-letter queue handling: save failed jobs to database for later analysis
  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    console.error(`💀 [AI Worker] Job permanently failed (DLQ): ${job.id}`);

    try {
      await prisma.failedJob.create({
        data: {
          jobId: job.id,
          queueName: 'ai-processing',
          jobName: job.name,
          payload: job.data,
          error: err.message,
          attempts: job.attemptsMade,
        },
      });
      console.log(`📥 [AI Worker] Saved failed job ${job.id} to FailedJob table.`);
    } catch (dbError) {
      console.error(`❌ [AI Worker] Failed to save DLQ job to DB:`, dbError.message);
    }
  }
});

aiWorker.on('error', (err) => {
  console.error('❌ [AI Worker] Worker error:', err.message);
});

module.exports = { aiWorker };
