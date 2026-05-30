/**
 * bullBoard.js — Bull Board Dashboard Configuration
 *
 * Provides a visual monitoring dashboard for all BullMQ queues.
 * Accessible at: /admin/queues
 *
 * Shows:
 *   - Active jobs
 *   - Failed jobs
 *   - Retries
 *   - Completed jobs
 *   - Worker states
 *   - Repeatable/scheduled jobs
 */

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// Import all queues
const { aiQueue } = require('../queues/ai.queue');
const { gmailQueue } = require('../queues/gmail.queue');
const { mailSyncQueue } = require('../queues/mail-sync.queue');
const { briefingQueue } = require('../queues/briefing.queue');
const { styleLearningQueue } = require('../queues/style-learning.queue');
const { analyticsQueue } = require('../queues/analytics.queue');
const { notificationQueue } = require('../queues/notification.queue');
const { schedulerQueue } = require('../queues/scheduler.queue');

// Create Express adapter for Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Register all queues with Bull Board
createBullBoard({
  queues: [
    new BullMQAdapter(aiQueue),
    new BullMQAdapter(gmailQueue),
    new BullMQAdapter(mailSyncQueue),
    new BullMQAdapter(briefingQueue),
    new BullMQAdapter(styleLearningQueue),
    new BullMQAdapter(analyticsQueue),
    new BullMQAdapter(notificationQueue),
    new BullMQAdapter(schedulerQueue),
  ],
  serverAdapter,
});

console.log('📊 [Bull Board] Dashboard configured at /admin/queues');

module.exports = { serverAdapter };
