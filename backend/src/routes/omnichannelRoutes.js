/**
 * Stage 4: AI Omnichannel Hub API Routes
 * Completely isolated route definition.
 */
const express = require('express');
const crypto = require('crypto');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const OmnichannelService = require('../services/stage4_omnichannelService');
const QueueSystem = require('../queues/omnichannelQueues');
const RoutingEngine = require('../routing/routingEngine');
const MessageNormalizer = require('../normalization/messageNormalizer');
const OmnichannelAIEngine = require('../ai/omnichannelAIEngine');

const router = express.Router();

// Middleware to ensure DB and Queues are initialized on the first request
let appBootstrapped = false;
router.use(asyncHandler(async (req, res, next) => {
  if (!appBootstrapped) {
    const io = req.app.get('io');
    await OmnichannelService.initialize();
    await QueueSystem.init(io);
    appBootstrapped = true;
  }
  next();
}));

// ==========================================
// 1. WEBHOOK ENDPOINTS (Publicly Reachable)
// ==========================================

/**
 * Public Webhook for incoming Slack events
 */
router.post('/webhooks/slack', asyncHandler(async (req, res) => {
  console.log('📡 [Slack Webhook] Received payload');

  // Handle Slack Url Verification Handshake challenge
  if (req.body.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }

  // Find workspace owner (defaulting to the first user in database)
  const firstUser = await prisma.user.findFirst();
  if (!firstUser) {
    return res.status(404).json({ error: 'No user registered to map webhook.' });
  }

  // Queue background message processing
  await QueueSystem.addJob('inboundQueue', {
    ...req.body,
    channel: 'slack',
    userId: firstUser.id
  });

  res.status(200).send('OK');
}));

/**
 * Public Webhook for Twilio SMS & WhatsApp messages
 */
router.post('/webhooks/twilio', asyncHandler(async (req, res) => {
  console.log('📡 [Twilio Webhook] Received SMS/WhatsApp hook parameters');

  const firstUser = await prisma.user.findFirst();
  if (!firstUser) {
    return res.status(404).send('No user database records found.');
  }

  const isWhatsApp = String(req.body.From || '').startsWith('whatsapp:');
  const channelType = isWhatsApp ? 'whatsapp' : 'twilio-sms';

  await QueueSystem.addJob('inboundQueue', {
    ...req.body,
    channel: channelType,
    userId: firstUser.id
  });

  res.status(200).send('OK');
}));

/**
 * Public Webhook for Telegram bot events
 */
router.post('/webhooks/telegram', asyncHandler(async (req, res) => {
  console.log('📡 [Telegram Webhook] Bot event hook');

  const firstUser = await prisma.user.findFirst();
  if (!firstUser) {
    return res.status(404).send('No user registered.');
  }

  await QueueSystem.addJob('inboundQueue', {
    ...req.body,
    channel: 'telegram',
    userId: firstUser.id
  });

  res.status(200).send('OK');
}));

// ==========================================
// 2. CHANNEL APIs (Protected)
// ==========================================

/**
 * Connects a new communication channel (Slack, Twilio SMS, WhatsApp, etc.)
 */
router.post('/channels/connect', authenticate, asyncHandler(async (req, res) => {
  const { channel_type, provider, external_account_id, access_token, refresh_token, metadata } = req.body;
  const userId = req.user.id;

  if (!channel_type) {
    return res.status(400).json({ error: 'channel_type is a required parameter.' });
  }

  const channelId = crypto.randomUUID();
  const encryptedToken = OmnichannelService.encryptToken(access_token);
  const encryptedRefreshToken = OmnichannelService.encryptToken(refresh_token);

  await prisma.$executeRawUnsafe(`
    INSERT INTO communication_channels (id, user_id, channel_type, provider, external_account_id, access_token, refresh_token, metadata, created_at)
    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9)
  `,
    channelId,
    userId,
    channel_type,
    provider || channel_type,
    external_account_id || '',
    encryptedToken,
    encryptedRefreshToken,
    JSON.stringify(metadata || {}),
    new Date()
  );

  res.status(201).json({
    success: true,
    channelId,
    message: `${channel_type.toUpperCase()} integration connected successfully.`
  });
}));

/**
 * Lists connected integrations and health statistics
 */
router.get('/channels/list', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const connectedChannels = await prisma.$queryRawUnsafe(`
    SELECT id, channel_type, provider, external_account_id, metadata, created_at 
    FROM communication_channels
    WHERE user_id = $1::uuid;
  `, userId);

  const healthMetrics = await OmnichannelService.getChannelHealth();

  // Combine connected state database rows with live simulated statistics
  const list = healthMetrics.map(h => {
    const config = connectedChannels.find(c => c.channel_type === h.channel);
    return {
      ...h,
      id: config?.id || null,
      isConnected: !!config,
      metadata: config?.metadata || {},
      created_at: config?.created_at || null
    };
  });

  res.json({ success: true, channels: list });
}));

/**
 * Disconnects a connected integration channel
 */
router.post('/channels/disconnect', authenticate, asyncHandler(async (req, res) => {
  const { channel_id } = req.body;
  const userId = req.user.id;

  if (!channel_id) {
    return res.status(400).json({ error: 'channel_id is required.' });
  }

  await prisma.$executeRawUnsafe(`
    DELETE FROM communication_channels
    WHERE id = $1::uuid AND user_id = $2::uuid;
  `, channel_id, userId);

  res.json({ success: true, message: 'Integration channel disconnected successfully.' });
}));

// ==========================================
// 3. MESSAGING APIs (Protected)
// ==========================================

/**
 * Dispatches an outbound normalized message through the queue system
 */
router.post('/messages/send', authenticate, asyncHandler(async (req, res) => {
  const { channel_type, recipient_id, text } = req.body;
  const userId = req.user.id;

  if (!channel_type || !recipient_id || !text) {
    return res.status(400).json({ error: 'channel_type, recipient_id, and text are required fields.' });
  }

  const userRecord = await prisma.user.findUnique({ where: { id: userId } });
  
  const mockOriginalMsg = {
    id: crypto.randomUUID(),
    channel_type: 'email', // Escalated out from internal email brief
    sender: {
      name: userRecord.name || 'Workspace Owner',
      id: userRecord.email
    },
    content: { text }
  };

  // Push straight to background deliveryQueue for instant throttled routing
  await QueueSystem.addJob('deliveryQueue', {
    targetChannel: channel_type,
    originalMessage: mockOriginalMsg,
    aiAnalysis: {
      urgency: 85,
      briefing: `Manual message dispatch: "${text.substring(0, 30)}..."`,
      recommendedReply: text
    },
    userId
  });

  res.json({ success: true, message: 'Outbound job enqueued for delivery.' });
}));

/**
 * Fetches unified timeline conversations ordered by latest activity
 */
router.get('/messages/conversations', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const list = await prisma.$queryRawUnsafe(`
    SELECT * FROM conversations
    WHERE user_id = $1::uuid
    ORDER BY updated_at DESC;
  `, userId);

  res.json({ success: true, conversations: list });
}));

/**
 * Fetches chronological message history inside a conversation thread
 */
router.get('/messages/thread/:id', authenticate, asyncHandler(async (req, res) => {
  const conversationId = req.params.id;

  const messagesList = await prisma.$queryRawUnsafe(`
    SELECT * FROM messages
    WHERE conversation_id = $1::uuid
    ORDER BY created_at ASC;
  `, conversationId);

  res.json({ success: true, messages: messagesList });
}));

// ==========================================
// 4. AUTOMATION & SIMULATOR APIs (Protected)
// ==========================================

/**
 * Compiles a natural language routing statement using Groq/Llama
 */
router.post('/routing/rules', authenticate, asyncHandler(async (req, res) => {
  const { ruleText } = req.body;

  if (!ruleText) {
    return res.status(400).json({ error: 'ruleText parameter is required.' });
  }

  const compiled = await RoutingEngine.compileRule(ruleText);
  res.json({ success: true, rule: compiled });
}));

/**
 * Lists active rules in the engine
 */
router.get('/routing/rules', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, rules: RoutingEngine.getRules() });
}));

/**
 * Resets active rules list
 */
router.post('/routing/reset', authenticate, asyncHandler(async (req, res) => {
  const rules = RoutingEngine.resetRules();
  res.json({ success: true, rules });
}));

/**
 * Test & Run simulated message flows, executing validation, normalization, and routing traces
 */
router.post('/routing/test', authenticate, asyncHandler(async (req, res) => {
  const { channel, text, sender } = req.body;
  const userId = req.user.id;

  if (!channel || !text) {
    return res.status(400).json({ error: 'channel and text are required to test simulation.' });
  }

  // 1. Verify signatures & normalize
  const payload = {
    channel,
    text,
    sender: { id: 'test-sender-101', name: sender || 'VIP Customer' }
  };
  
  const normalized = MessageNormalizer.normalize(payload);

  // 2. Run AI Prioritization (Urgency, Sentiment, smart replies)
  const aiAnalysis = await OmnichannelAIEngine.analyzeMessage(normalized);

  // 3. Match against the routing engine rules
  const routingResult = RoutingEngine.evaluateRouting(normalized, aiAnalysis);

  // 4. Dispatch a simulated Socket event to real-time command centers
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${userId}`).emit('omnichannel_msg', {
      message: {
        id: crypto.randomUUID(),
        channel_type: channel,
        sender: normalized.sender,
        content: normalized.content,
        urgency: aiAnalysis.urgency,
        sentiment: aiAnalysis.sentiment,
        recommendedReply: aiAnalysis.recommendedReply,
        actionItems: aiAnalysis.actionItems,
        created_at: new Date()
      },
      conversation: {
        id: 'test-conversation-uuid',
        unified_thread_id: 'test-thread',
        primary_channel: channel,
        participants: [normalized.sender],
        ai_summary: aiAnalysis.briefing
      },
      routingTrace: routingResult.logs
    });
  }

  res.json({
    success: true,
    normalized,
    aiAnalysis,
    routingResult,
    trace: [
      '🔍 Validating inbound message parameters...',
      '✅ Normalization successful: converted to Universal standard schema.',
      `🐘 Correlating timeline graph for sender: ${normalized.sender.name}`,
      `🤖 Calling Chief of Staff LLM (Groq: llama-3.3-70b-versatile)...`,
      `⭐ Priority extracted: ${aiAnalysis.urgency}/100 Urgency Index.`,
      `🎯 SLA Risk Index: ${(aiAnalysis.slaRisk * 100).toFixed(0)}%. Sentiment: ${aiAnalysis.sentiment.toUpperCase()}`,
      `📝 Action Items: ${aiAnalysis.actionItems.join(', ') || 'None'}`,
      '⚡ Running rules evaluation loop...',
      ...routingResult.logs,
      `🎉 Execution trace finished. Routed channels: [${routingResult.channels.join(', ')}]`
    ]
  });
}));

module.exports = router;
