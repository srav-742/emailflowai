const { QueueEvents } = require('bullmq');
const { redisConnection } = require('../config/redis');
const { gmailQueue } = require('../queues/gmail.queue');
const { getUserSocketRoom } = require('../utils/socketRooms');

function emitGoogleSyncResult(io, job, eventName, payload = {}) {
  const userId = job?.data?.userId;
  if (!userId) return;

  io.to(getUserSocketRoom(userId)).emit(eventName, {
    type: job.data.type || job.name,
    accountId: job.data.accountId || null,
    userId,
    ...payload,
  });
}

function registerGoogleSyncRealtime(io) {
  try {
    const queueEvents = new QueueEvents('gmail-sync', { connection: redisConnection });

    queueEvents.on('completed', async ({ jobId }) => {
      const job = await gmailQueue.getJob(jobId);
      if (!job) return;

      const type = job.data?.type || job.name;
      if (type === 'sync-inbox') {
        emitGoogleSyncResult(io, job, 'sync:complete', { emailsCount: job.returnvalue?.emailsCount || 0 });
        if ((job.returnvalue?.newEmailsCount || 0) > 0) {
          emitGoogleSyncResult(io, job, 'email:new', { count: job.returnvalue.newEmailsCount });
        }
      }

      if (type === 'sync-calendar') {
        emitGoogleSyncResult(io, job, 'calendar:updated');
      }
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = await gmailQueue.getJob(jobId);
      if (!job) return;

      const reason = String(failedReason || '');
      const reconnectRequired = /invalid_grant|revoked|refresh_token|reconnect/i.test(reason);
      emitGoogleSyncResult(io, job, reconnectRequired ? 'account:reauth' : 'sync:error', {
        message: reason || 'Google sync failed.',
      });
    });

    queueEvents.on('error', (error) => {
      console.error('[Realtime] Google sync queue event error:', error.message);
    });

    return queueEvents;
  } catch (error) {
    console.error('[Realtime] Failed to register Google sync events:', error.message);
    return null;
  }
}

module.exports = { registerGoogleSyncRealtime };
