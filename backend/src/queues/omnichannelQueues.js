/**
 * Stage 4: Event-Driven Queue & Background Worker Architecture
 * Implements BullMQ + Redis with an automatic In-Memory fallback for robustness.
 */
const { Queue, Worker } = require('bullmq');
const redisConnection = require('../redisClient');
const MessageNormalizer = require('../normalization/messageNormalizer');
const ThreadSyncEngine = require('../conversations/graphEngine');
const OmnichannelAIEngine = require('../ai/omnichannelAIEngine');
const RoutingEngine = require('../routing/routingEngine');

// Check if we can safely use BullMQ based on Redis state
let useBullMQ = false;

// Queue definitions
const queues = {};
const workers = [];

// Fallback in-memory queues if Redis is unavailable or restricted
const inMemoryQueues = {
  inboundQueue: [],
  routingQueue: [],
  deliveryQueue: [],
  aiQueue: [],
  retryQueue: []
};

// Queue throttling and rate limits
const RATE_LIMITS = {
  slack: { limit: 20, windowMs: 1000 },
  'twilio-sms': { limit: 1, windowMs: 1000 }, // Twilio SMS limit is 1/sec
  whatsapp: { limit: 2, windowMs: 1000 },
  push: { limit: 50, windowMs: 1000 }
};

class QueueSystem {
  /**
   * Initializes all Queues and registers Worker processes
   */
  static async init(ioInstance) {
    this.io = ioInstance;
    
    // Check connection state of ioredis client
    if (redisConnection.status === 'ready' || redisConnection.status === 'connect') {
      try {
        console.log('📦 [Queue Engine] Redis detected. Spin-up production BullMQ pipelines...');
        this.setupBullMQ();
        useBullMQ = true;
      } catch (err) {
        console.warn('⚠️ [Queue Engine] BullMQ bootstrap warning, falling back to In-Memory broker:', err.message);
        this.setupInMemoryBroker();
      }
    } else {
      console.log('💾 [Queue Engine] Redis offline or limited. Activating Resilient In-Memory event-bus...');
      this.setupInMemoryBroker();
    }
  }

  /**
   * Builds high-performance queues and workers using BullMQ
   */
  static setupBullMQ() {
    const queueNames = ['inboundQueue', 'routingQueue', 'deliveryQueue', 'aiQueue', 'retryQueue'];
    
    // 1. Create Queues
    for (const name of queueNames) {
      queues[name] = new Queue(name, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: true
        }
      });
    }

    // 2. Define standard inbound processing Worker
    const inboundWorker = new Worker('inboundQueue', async (job) => {
      await this.processInboundTask(job.data);
    }, { connection: redisConnection });

    // 3. Define routing Worker
    const routingWorker = new Worker('routingQueue', async (job) => {
      await this.processRoutingTask(job.data);
    }, { connection: redisConnection });

    // 4. Define delivery Worker
    const deliveryWorker = new Worker('deliveryQueue', async (job) => {
      await this.processDeliveryTask(job.data);
    }, { connection: redisConnection });

    workers.push(inboundWorker, routingWorker, deliveryWorker);
    
    console.log('✅ [Queue Engine] Production BullMQ Workers active.');
  }

  /**
   * Activates in-memory queues with automated async polling loops
   */
  static setupInMemoryBroker() {
    // In-memory loop triggers every 300ms to process items asynchronously
    setInterval(async () => {
      if (inMemoryQueues.inboundQueue.length > 0) {
        const data = inMemoryQueues.inboundQueue.shift();
        await this.processInboundTask(data).catch(e => console.error('Inbound queue error:', e.message));
      }
      if (inMemoryQueues.routingQueue.length > 0) {
        const data = inMemoryQueues.routingQueue.shift();
        await this.processRoutingTask(data).catch(e => console.error('Routing queue error:', e.message));
      }
      if (inMemoryQueues.deliveryQueue.length > 0) {
        const data = inMemoryQueues.deliveryQueue.shift();
        await this.processDeliveryTask(data).catch(e => console.error('Delivery queue error:', e.message));
      }
    }, 300);

    console.log('✅ [Queue Engine] Sandbox event loop active (polling speed: 300ms).');
  }

  /**
   * Adds a task/job to the requested queue
   */
  static async addJob(queueName, data) {
    if (useBullMQ && queues[queueName]) {
      await queues[queueName].add('job', data);
    } else {
      inMemoryQueues[queueName].push(data);
    }
  }

  // ==========================================
  // WORKER PIPELINE PROCESSORS
  // ==========================================

  /**
   * Process 1: Webhook Validation -> Message Normalization -> Correlation
   */
  static async processInboundTask(data) {
    console.log(`📥 [Inbound Worker] Processing raw payload for channel: ${data.channel || 'unknown'}`);
    
    // Normalize raw payload into standard universal schema
    const normalized = MessageNormalizer.normalize(data);
    
    // Correlate and sync message to DB conversations graph
    const { conversation, message } = await ThreadSyncEngine.syncMessage(normalized, data.userId);

    // Enqueue message to AI prioriter and router
    await this.addJob('routingQueue', { message, conversation, userId: data.userId });
  }

  /**
   * Process 2: AI Prioritization -> Sentiment analysis -> NL Routing Rules Engine
   */
  static async processRoutingTask(data) {
    const { message, conversation, userId } = data;
    console.log(`🧠 [Routing Worker] Running AI Prioritization & Routing for message: ${message.id}`);

    // Compute urgency, briefing, sentiment and Smart replies
    const aiAnalysis = await OmnichannelAIEngine.analyzeMessage(message);
    
    // Update conversation summary on the graph
    await ThreadSyncEngine.updateConversation(conversation.id, {
      aiSummary: aiAnalysis.briefing
    });

    // Evaluate against active channel routing policies
    const routingResult = RoutingEngine.evaluateRouting(message, aiAnalysis);

    // Notify Frontend client in real-time via Socket.IO
    if (this.io) {
      console.log(`📡 [Realtime Event] Dispatching socket event: omnichannel_msg for user: ${userId}`);
      this.io.to(`user_${userId}`).emit('omnichannel_msg', {
        message: {
          ...message,
          urgency: aiAnalysis.urgency,
          sentiment: aiAnalysis.sentiment,
          recommendedReply: aiAnalysis.recommendedReply,
          actionItems: aiAnalysis.actionItems
        },
        conversation: {
          ...conversation,
          ai_summary: aiAnalysis.briefing
        },
        routingTrace: routingResult.logs
      });
    }

    // Enqueue actual delivery jobs for each routed destination
    for (const channel of routingResult.channels) {
      // Exclude looping back to the source channel
      if (channel === message.channel_type || channel === 'email') continue;

      await this.addJob('deliveryQueue', {
        targetChannel: channel,
        originalMessage: message,
        aiAnalysis,
        userId
      });
    }
  }

  /**
   * Process 3: Delivery Engine -> Throttling -> Provider Gateway Dispatches
   */
  static async processDeliveryTask(data) {
    const { targetChannel, originalMessage, aiAnalysis, userId } = data;
    console.log(`📤 [Delivery Worker] Delivering message escalation: ${originalMessage.id} -> ${targetChannel}`);

    // Throttling / Rate limits simulation
    const limit = RATE_LIMITS[targetChannel];
    if (limit) {
      // Small simulated delay for provider network latency
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    try {
      // Execute the channel router dispatches
      const dispatchMessage = `[Escalated Alert - ${aiAnalysis.urgency}/100 Urgency]\nFrom: ${originalMessage.sender.name}\nBrief: ${aiAnalysis.briefing}\n\nSmart Reply suggestion:\n"${aiAnalysis.recommendedReply}"`;
      
      switch (targetChannel) {
        case 'twilio-sms':
          const twilio = require('../channels/twilio/twilioIntegration');
          await twilio.sendSMS(originalMessage.sender.id, dispatchMessage, userId);
          break;
        case 'whatsapp':
          const twilioWA = require('../channels/twilio/twilioIntegration');
          await twilioWA.sendWhatsApp(originalMessage.sender.id, dispatchMessage, userId);
          break;
        case 'slack':
          const slack = require('../channels/slack/slackIntegration');
          await slack.sendSlackDM(originalMessage.sender.id, dispatchMessage, userId);
          break;
        case 'telegram':
          const telegram = require('../channels/telegram/telegramIntegration');
          await telegram.sendAlert(originalMessage.sender.id, dispatchMessage, userId);
          break;
        case 'teams':
          const teams = require('../channels/teams/teamsIntegration');
          await teams.sendMessage(dispatchMessage, userId);
          break;
        case 'push':
          const push = require('../channels/push/pushIntegration');
          await push.triggerBrowserPush(userId, {
            title: `VIP Escalation: ${originalMessage.sender.name}`,
            body: aiAnalysis.briefing,
            urgency: aiAnalysis.urgency
          });
          break;
      }

      console.log(`⭐ [Delivery Worker] Successful delivery to: ${targetChannel}`);
    } catch (err) {
      console.error(`❌ [Delivery Worker] Failed delivery to ${targetChannel}:`, err.message);
      // Move to DLQ / retry queue
      await this.addJob('retryQueue', { ...data, error: err.message, timestamp: Date.now() });
    }
  }
}

module.exports = QueueSystem;
