/**
 * config/initRepeatableJobs.js — BullMQ Scheduler Setup
 * 
 * Registers all recurring background jobs.
 */

const { schedulerQueue } = require('../queues/scheduler.queue');

async function initRepeatableJobs() {
  console.log('⏰ [Scheduler] Initializing repeatable jobs...');

  try {
    // 1. Gmail Periodic Sync — every 5 minutes
    await schedulerQueue.add(
      'periodic-sync',
      { type: 'gmail-sync' },
      { 
        repeat: { every: 5 * 60 * 1000 },
        jobId: 'gmail-periodic-sync' // Consistent ID prevents duplicates
      }
    );

    // 2. Analytics Daily Aggregation — once a day
    await schedulerQueue.add(
      'analytics-aggregation',
      { type: 'analytics' },
      { 
        repeat: { pattern: '0 0 * * *' }, // Midnight
        jobId: 'analytics-daily'
      }
    );

    // 3. Daily Digest Checks — every 15 minutes
    await schedulerQueue.add(
      'digest-check',
      { type: 'digest' },
      { 
        repeat: { every: 15 * 60 * 1000 },
        jobId: 'digest-check-interval'
      }
    );

    // 4. Style Learning — daily at 2 AM
    await schedulerQueue.add(
      'style-learning',
      { type: 'style-learning' },
      { 
        repeat: { pattern: '0 2 * * *' },
        jobId: 'style-learning-daily'
      }
    );

    console.log('✅ [Scheduler] Repeatable jobs registered.');
  } catch (error) {
    console.error('❌ [Scheduler] Error registering repeatable jobs:', error.message);
  }
}

module.exports = { initRepeatableJobs };
