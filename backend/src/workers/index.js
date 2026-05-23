/**
 * workers/index.js — Worker Startup Script
 *
 * Initializes all BullMQ workers. Run with:
 *   npm run worker
 *
 * This loads dotenv and then imports all worker modules,
 * which auto-register their event handlers and start processing.
 */

require('dotenv').config();

console.log('🚀 [Workers] Starting all BullMQ workers...');
console.log('================================================');

// Import all workers — they self-register on import
const { aiWorker } = require('./ai.worker');
const { gmailWorker } = require('./gmail.worker');
const { mailSyncWorker } = require('./mail-sync.worker');
const { analyticsWorker } = require('./analytics.worker');
const { notificationWorker } = require('./notification.worker');
const { schedulerWorker } = require('./scheduler.worker');

console.log('================================================');
console.log('✅ [Workers] All workers started successfully:');
console.log(`  🤖 AI Worker         (ai-processing)        — status: active | concurrency: 5`);
console.log(`  📧 Gmail Worker      (gmail-sync)            — status: active | concurrency: 3`);
console.log(`  📬 Mail Sync Worker  (mail-sync)             — status: active | concurrency: 3`);
console.log(`  📊 Analytics Worker  (analytics-processing)  — status: active | concurrency: 2`);
console.log(`  🔔 Notification Worker (notification-delivery) — status: active | concurrency: 10`);
console.log(`  ⏰ Scheduler Worker  (scheduler)             — status: active | concurrency: 2`);
console.log('================================================');
console.log('📈 [Monitoring] Bull Board: http://localhost:10000/admin/queues');

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n🛑 [Workers] Received ${signal}. Shutting down gracefully...`);
  
  await Promise.allSettled([
    aiWorker.close(),
    gmailWorker.close(),
    mailSyncWorker.close(),
    analyticsWorker.close(),
    notificationWorker.close(),
    schedulerWorker.close(),
  ]);

  console.log('✅ [Workers] All workers shut down.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
