/**
 * mail-sync.queue.js — BullMQ Queue for Universal Mail Sync Jobs
 *
 * Handles sync jobs for IMAP/App Password-connected accounts.
 * OAuth-connected Gmail accounts continue to use gmail.queue.js.
 *
 * Job types:
 *   - sync-imap       Incremental IMAP inbox sync
 *   - test-connection  Validate IMAP/SMTP credentials
 *   - periodic-sync    Scheduled sync across all IMAP accounts
 *
 * Default retry: 3 attempts with exponential backoff starting at 5s.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const mailSyncQueue = new Queue('mail-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

module.exports = { mailSyncQueue };
