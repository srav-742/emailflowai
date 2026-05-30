/**
 * Stage 4: Production Addon API Routes for AI Omnichannel Hub
 * Completely isolated to avoid changing any existing code files.
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const OmnichannelProductionHub = require('../services/omnichannelProductionHub');
const QueueSystem = require('../queues/omnichannelQueues');

const router = express.Router();

/**
 * 1. Twilio Outbound Message Delivery Status Tracking Webhook
 * Twilio triggers this callback when an SMS or WhatsApp message transitions state
 */
router.post('/webhooks/twilio/status', asyncHandler(async (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
  console.log(`📡 [Twilio Outbound Webhook] SID: ${MessageSid} | Status: ${MessageStatus}`);

  // Update status in the database via the production hub service
  const updateResult = await OmnichannelProductionHub.updateDeliveryStatus(MessageSid, MessageStatus, req.body);

  // Notify active front-end sessions in real-time via Socket.IO if mounted
  const io = req.app.get('io');
  if (io && updateResult.success) {
    console.log(`📡 [Realtime Event] Dispatching socket event: omnichannel_msg_status for: ${updateResult.messageId}`);
    io.emit('omnichannel_msg_status', {
      messageId: updateResult.messageId,
      externalId: MessageSid,
      status: MessageStatus,
      timestamp: new Date().toISOString(),
      error: ErrorMessage || null
    });
  }

  res.status(200).send('OK');
}));

/**
 * 2. Enterprise Delivery Analytics & Health Monitoring Dashboard
 * Secure endpoint to query latency, delivery rates, and failed logs
 */
router.get('/monitoring/analytics', authenticate, asyncHandler(async (req, res) => {
  const metrics = await OmnichannelProductionHub.getMonitoringDashboardMetrics();
  res.status(200).json({
    success: true,
    ...metrics
  });
}));

/**
 * 3. Diagnostics: Fetch current retry / DLQ queue depth and details
 * Exposes live data of BullMQ or fallback In-Memory retry brokers
 */
router.get('/monitoring/retry-queue', authenticate, asyncHandler(async (req, res) => {
  const isRedisBullMQ = !!(QueueSystem.queues && QueueSystem.queues.retryQueue);
  let retryJobs = [];

  try {
    if (isRedisBullMQ) {
      const jobs = await QueueSystem.queues.retryQueue.getJobs(['waiting', 'active', 'delayed', 'failed']);
      retryJobs = jobs.map(j => ({
        id: j.id,
        name: j.name,
        data: {
          targetChannel: j.data?.targetChannel,
          originalMessageSender: j.data?.originalMessage?.sender?.name,
          urgency: j.data?.aiAnalysis?.urgency
        },
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        timestamp: j.timestamp
      }));
    } else {
      // In-Memory broker fallback queue array
      retryJobs = (QueueSystem.inMemoryQueues?.retryQueue || []).map((j, idx) => ({
        id: `mem_retry_${idx}`,
        name: 'In-Memory Retry Job',
        data: {
          targetChannel: j.targetChannel,
          originalMessageSender: j.originalMessage?.sender?.name,
          urgency: j.aiAnalysis?.urgency
        },
        attemptsMade: j.attempts || 1,
        failedReason: j.error || 'Network connection refused',
        timestamp: j.timestamp || Date.now()
      }));
    }
  } catch (error) {
    console.error('⚠️ [Retry Queue Diagnostics] Failed to read queue:', error.message);
  }

  res.status(200).json({
    success: true,
    engine: isRedisBullMQ ? 'BullMQ (Redis)' : 'Resilient Sandbox Event Loop (In-Memory)',
    depth: retryJobs.length,
    jobs: retryJobs
  });
}));

module.exports = router;
