/**
 * Stage 4: Smart Drip Campaigns REST API Routes
 * Mounts campaign creation, contact uploads, telemetry analytics, and LLM text generation endpoints.
 */
const express = require('express');
const crypto = require('crypto');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

// Load isolated campaign engines
const CampaignDatabase = require('../campaigns/database');
const QueueSystem = require('../campaigns/campaignQueues');
const Scheduler = require('../campaigns/scheduler/sequenceScheduler');
const AIEngine = require('../campaigns/ai/campaignAIEngine');
const DeliveryWorker = require('../campaigns/delivery/deliveryWorker');
const Tracker = require('../campaigns/tracking/trackingPixel');
const Compliance = require('../campaigns/compliance/compliance');

const router = express.Router();

// ==========================================
// 1. BOOTSTRAP MIDDLEWARE (Run once on first request)
// ==========================================
let campaignsBootstrapped = false;
router.use(asyncHandler(async (req, res, next) => {
  if (!campaignsBootstrapped) {
    const io = req.app.get('io');

    // Initialize Database Tables
    await CampaignDatabase.initialize();

    // Map Queue handlers
    const queueHandlers = {
      processCampaign: async () => {
        await Scheduler.runSchedulerTick();
      },
      processAI: async (jobData) => {
        const { contact, nextStep } = jobData;
        console.log(`🤖 [Queue AI Worker] Personalizing for contact: ${contact.email}`);
        
        // Fetch last emails for CRM/history thread synchronization (if step > 1)
        const threadHistory = [];
        if (contact.currentStep > 0) {
          const sentMails = await prisma.email.findMany({
            where: {
              recipients: { has: contact.email },
              isSentByUser: true
            },
            orderBy: { receivedAt: 'desc' },
            take: 3
          });
          threadHistory.push(...sentMails);
        }

        const personalized = await AIEngine.personalizeMessage({
          contact,
          sequenceStep: nextStep,
          threadHistory
        });

        // Enqueue to delivery worker queue
        await QueueSystem.addJob('sendQueue', {
          contact,
          nextStep,
          personalized
        });
      },
      processSend: async (jobData) => {
        await DeliveryWorker.processSendJob(jobData);
      },
      processTracking: async (jobData) => {
        console.log('📈 [Queue Tracking Worker] Logging engagement telemetry event: ', jobData);
      }
    };

    // Initialize Queues
    await QueueSystem.init(io, queueHandlers);

    // Boot a repeatable job / interval scheduler to tick every 1 minute
    setInterval(async () => {
      await Scheduler.runSchedulerTick().catch(err => {
        console.error('⚠️ [Scheduler Cron] Tick error: ', err.message);
      });
    }, 60000); // 1 minute interval

    campaignsBootstrapped = true;
    console.log('🚀 [Campaign Engine] Successfully bootstrapped database & queue schedulers.');
  }
  next();
}));

// ==========================================
// 2. PUBLIC TRACKING ROUTE ENDPOINTS
// ==========================================

// Invisible pixel trigger for opens
router.get('/tracking/pixel/:contactId/:stepOrder', asyncHandler(Tracker.handleOpenPixel));

// Redirect node for link clicks
router.get('/tracking/click', asyncHandler(Tracker.handleClickRedirect));

// Unsubscribe redirection
router.get('/tracking/unsubscribe', asyncHandler(Tracker.handleUnsubscribe));


// ==========================================
// 3. CAMPAIGN CRUD & CONTROL APIs (Protected)
// ==========================================

router.use(authenticate);

/**
 * Lists all active drip campaigns for a user
 */
router.get('/list', asyncHandler(async (req, res) => {
  const campaigns = await prisma.$queryRawUnsafe(`
    SELECT c.*, 
      (SELECT COUNT(*)::int FROM campaign_contacts WHERE campaign_id = c.id) as contact_count,
      (SELECT COUNT(*)::int FROM campaign_contacts WHERE campaign_id = c.id AND status = 'active') as active_count,
      (SELECT COUNT(*)::int FROM campaign_contacts WHERE campaign_id = c.id AND status = 'replied') as reply_count
    FROM campaigns c
    WHERE c.user_id = $1::uuid
    ORDER BY c.created_at DESC;
  `, req.user.id);

  res.json({ success: true, campaigns });
}));

/**
 * Generates email copy using Groq LLM
 */
router.post('/generate-ai', asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, error: 'Prompt is required.' });
  }

  const generated = await AIEngine.generateSequenceFromPrompt(prompt);
  res.json({ success: true, ...generated });
}));

/**
 * Creates a brand new visual drip campaign sequence
 */
router.post('/create', asyncHandler(async (req, res) => {
  const { name, campaignType, settings, steps } = req.body;

  if (!name || !campaignType || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ success: false, error: 'Missing name, type, or sequence steps.' });
  }

  const campaignId = crypto.randomUUID();

  // Create Campaign (Safe SQL Transaction equivalent)
  await prisma.$executeRawUnsafe(`
    INSERT INTO campaigns (id, user_id, name, campaign_type, status, settings, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, $3, $4, 'paused', $5::jsonb, $6, $7);
  `, 
    campaignId, 
    req.user.id, 
    name, 
    campaignType, 
    JSON.stringify(settings || {}), 
    new Date(), 
    new Date()
  );

  // Insert steps into campaign_sequences
  for (const step of steps) {
    const stepId = crypto.randomUUID();
    const messageTemplate = {
      subject: step.subject || 'Follow up',
      body: step.body || '',
      variants: step.variants || []
    };

    await prisma.$executeRawUnsafe(`
      INSERT INTO campaign_sequences (id, campaign_id, step_order, delay_hours, message_template, conditions, created_at)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7);
    `,
      stepId,
      campaignId,
      parseInt(step.step_order || '1', 10),
      parseInt(step.delay_hours || '24', 10),
      JSON.stringify(messageTemplate),
      JSON.stringify(step.conditions || {}),
      new Date()
    );
  }

  res.status(201).json({
    success: true,
    campaignId,
    message: 'Drip campaign and sequences successfully registered.'
  });
}));

/**
 * Launches/starts a drip campaign
 */
router.post('/start', asyncHandler(async (req, res) => {
  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required.' });

  await prisma.$executeRawUnsafe(`
    UPDATE campaigns SET status = 'active', updated_at = NOW()
    WHERE id = $1::uuid AND user_id = $2::uuid;
  `, campaignId, req.user.id);

  // Force-trigger active due scheduler contacts scan
  await Scheduler.runSchedulerTick();

  res.json({ success: true, message: 'Drip campaign is now actively running.' });
}));

/**
 * Pauses a running drip campaign
 */
router.post('/pause', asyncHandler(async (req, res) => {
  const { campaignId } = req.body;
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required.' });

  await prisma.$executeRawUnsafe(`
    UPDATE campaigns SET status = 'paused', updated_at = NOW()
    WHERE id = $1::uuid AND user_id = $2::uuid;
  `, campaignId, req.user.id);

  res.json({ success: true, message: 'Drip campaign has been paused.' });
}));

/**
 * Tests personalization on the first step for a dry-run contact
 */
router.post('/test', asyncHandler(async (req, res) => {
  const { subject, body, contactMetadata } = req.body;

  const mockContact = {
    email: 'test@emailflowai.com',
    metadata: contactMetadata || { firstName: 'Sravya', company: 'EmailFlow AI', role: 'CTO' }
  };
  const mockStep = {
    message_template: { subject, body }
  };

  const output = await AIEngine.personalizeMessage({
    contact: mockContact,
    sequenceStep: mockStep
  });

  res.json({
    success: true,
    preview: output
  });
}));

// ==========================================
// 4. CONTACTS IMPORT & LIST APIs (Protected)
// ==========================================

/**
 * Fetches contacts registered in a campaign
 */
router.get('/:id/contacts', asyncHandler(async (req, res) => {
  const contacts = await prisma.$queryRawUnsafe(`
    SELECT * FROM campaign_contacts
    WHERE campaign_id = $1::uuid
    ORDER BY created_at DESC;
  `, req.params.id);

  res.json({ success: true, contacts });
}));

/**
 * Imports a batch of contacts into a campaign
 */
router.post('/:id/contacts/import', asyncHandler(async (req, res) => {
  const campaignId = req.params.id;
  const { contacts } = req.body; // Array of { email, firstName, company, role, metadata }

  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Contacts array is required.' });
  }

  // Ensure campaign belongs to active authenticated user
  const campaignOwner = await prisma.$queryRawUnsafe(`
    SELECT id FROM campaigns WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1;
  `, campaignId, req.user.id);

  if (!campaignOwner?.[0]) {
    return res.status(403).json({ error: 'Unauthorized or campaign not found.' });
  }

  let imported = 0;
  let skipped = 0;

  for (const rawContact of contacts) {
    const email = rawContact.email;
    if (!Compliance.validateEmail(email)) {
      skipped++;
      continue;
    }

    // Safety checks: Global unsubscribes & duplicates check
    const isSuppressed = await Compliance.isSuppressed(email, req.user.id);
    const safety = await Compliance.verifySafety(email, campaignId);

    if (isSuppressed || !safety.allowed) {
      skipped++;
      continue;
    }

    const contactId = crypto.randomUUID();
    const metadata = {
      firstName: rawContact.firstName || rawContact.name || '',
      company: rawContact.company || '',
      role: rawContact.role || '',
      ...rawContact.metadata
    };

    // Add contact: set next execution to instantly fire
    await prisma.$executeRawUnsafe(`
      INSERT INTO campaign_contacts (id, campaign_id, email, metadata, status, current_step, next_execution_at, created_at)
      VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, 'active', 0, NOW(), NOW());
    `,
      contactId,
      campaignId,
      email.trim().toLowerCase(),
      JSON.stringify(metadata)
    );

    // Log the "scheduled" import event
    await prisma.$executeRawUnsafe(`
      INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
      VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'scheduled', '{}'::jsonb, NOW());
    `, campaignId, contactId);

    imported++;
  }

  // Auto trigger the scheduling queue instantly on import to process them
  await Scheduler.runSchedulerTick();

  res.json({
    success: true,
    message: `Uploaded contacts: Imported ${imported}, skipped/suppressed ${skipped}.`
  });
}));

// ==========================================
// 5. ANALYTICS & TELEMETRY APIs (Protected)
// ==========================================

/**
 * Returns complete marketing telemetry for the user's dashboard
 */
router.get('/analytics', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // 1. Overall aggregated campaign event telemetry counts
  const counts = await prisma.$queryRawUnsafe(`
    SELECT 
      COUNT(CASE WHEN event_type = 'sent' THEN 1 END)::int as sent,
      COUNT(CASE WHEN event_type = 'open' THEN 1 END)::int as opened,
      COUNT(CASE WHEN event_type = 'click' THEN 1 END)::int as clicked,
      COUNT(CASE WHEN event_type = 'reply' THEN 1 END)::int as replied,
      COUNT(CASE WHEN event_type = 'fail' THEN 1 END)::int as bounced,
      COUNT(CASE WHEN event_type = 'unsubscribe' THEN 1 END)::int as unsubscribed
    FROM campaign_events ce
    JOIN campaigns c ON ce.campaign_id = c.id
    WHERE c.user_id = $1::uuid;
  `, userId);

  const stats = counts?.[0] || { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 };

  // 2. Fetch daily timeline activity for chart rendering
  const timeline = await prisma.$queryRawUnsafe(`
    SELECT 
      DATE_TRUNC('day', ce.created_at) as date,
      COUNT(CASE WHEN ce.event_type = 'sent' THEN 1 END)::int as sent,
      COUNT(CASE WHEN ce.event_type = 'open' THEN 1 END)::int as opened,
      COUNT(CASE WHEN ce.event_type = 'reply' THEN 1 END)::int as replied
    FROM campaign_events ce
    JOIN campaigns c ON ce.campaign_id = c.id
    WHERE c.user_id = $1::uuid
      AND ce.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY date
    ORDER BY date ASC;
  `, userId);

  res.json({
    success: true,
    stats,
    timeline
  });
}));

module.exports = router;
