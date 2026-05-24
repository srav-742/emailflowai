/**
 * Stage 4: Smart Drip Campaigns Event-Driven Queue & Worker Architecture
 * Uses BullMQ + Redis for production, falls back to a highly resilient In-Memory queue for local sandboxes.
 */
const { Queue, Worker } = require('bullmq');
const redisConnection = require('../redisClient');

let useBullMQ = false;
const queues = {};
const workers = [];

// Resilient in-memory message brokers
const inMemoryQueues = {
  campaignQueue: [],
  sendQueue: [],
  trackingQueue: [],
  aiQueue: [],
  retryQueue: []
};

class CampaignQueueSystem {
  static async init(ioInstance, handlers = {}) {
    this.io = ioInstance;
    this.handlers = handlers; // { processCampaign, processSend, processTracking, processAI }

    // Detect if ioredis connection is online and healthy
    if (redisConnection.status === 'ready' || redisConnection.status === 'connect') {
      try {
        console.log('📦 [Campaign Queue] Redis active. Mounting production BullMQ handlers...');
        this.setupBullMQ();
        useBullMQ = true;
      } catch (err) {
        console.warn('⚠️ [Campaign Queue] BullMQ setup failed. Downgrading to In-Memory bus:', err.message);
        this.setupInMemoryBroker();
      }
    } else {
      console.log('💾 [Campaign Queue] Redis is offline. Bootstrapping Sandbox In-Memory bus...');
      this.setupInMemoryBroker();
    }
  }

  static setupBullMQ() {
    const queueNames = ['campaignQueue', 'sendQueue', 'trackingQueue', 'aiQueue', 'retryQueue'];

    for (const name of queueNames) {
      queues[name] = new Queue(name, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          },
          removeOnComplete: true
        }
      });
    }

    // 1. Scheduler worker
    workers.push(new Worker('campaignQueue', async (job) => {
      if (this.handlers.processCampaign) await this.handlers.processCampaign(job.data);
    }, { connection: redisConnection }));

    // 2. Personalization worker
    workers.push(new Worker('aiQueue', async (job) => {
      if (this.handlers.processAI) await this.handlers.processAI(job.data);
    }, { connection: redisConnection }));

    // 3. Sender worker
    workers.push(new Worker('sendQueue', async (job) => {
      if (this.handlers.processSend) await this.handlers.processSend(job.data);
    }, { connection: redisConnection }));

    // 4. Tracking event logging worker
    workers.push(new Worker('trackingQueue', async (job) => {
      if (this.handlers.processTracking) await this.handlers.processTracking(job.data);
    }, { connection: redisConnection }));

    console.log('✅ [Campaign Queue] Production BullMQ active (5/5 workers).');
  }

  static setupInMemoryBroker() {
    // Spin up dynamic intervals to exhaust the queues asynchronously
    setInterval(async () => {
      if (inMemoryQueues.campaignQueue.length > 0) {
        const job = inMemoryQueues.campaignQueue.shift();
        if (this.handlers.processCampaign) await this.handlers.processCampaign(job).catch(e => console.error('Scheduler Worker Error:', e.message));
      }
      if (inMemoryQueues.aiQueue.length > 0) {
        const job = inMemoryQueues.aiQueue.shift();
        if (this.handlers.processAI) await this.handlers.processAI(job).catch(e => console.error('Personalization Worker Error:', e.message));
      }
      if (inMemoryQueues.sendQueue.length > 0) {
        const job = inMemoryQueues.sendQueue.shift();
        if (this.handlers.processSend) await this.handlers.processSend(job).catch(e => console.error('Delivery Worker Error:', e.message));
      }
      if (inMemoryQueues.trackingQueue.length > 0) {
        const job = inMemoryQueues.trackingQueue.shift();
        if (this.handlers.processTracking) await this.handlers.processTracking(job).catch(e => console.error('Tracking Worker Error:', e.message));
      }
    }, 400);

    console.log('✅ [Campaign Queue] Sandbox async event loop started (400ms ticks).');
  }

  /**
   * Safe entry-point to push work onto the campaign queues
   */
  static async addJob(queueName, data) {
    if (useBullMQ && queues[queueName]) {
      await queues[queueName].add('job', data);
    } else if (inMemoryQueues[queueName]) {
      inMemoryQueues[queueName].push(data);
    } else {
      console.error(`❌ [Campaign Queue] Invalid Queue destination requested: ${queueName}`);
    }
  }

  static getQueueStatus() {
    return {
      engine: useBullMQ ? 'BullMQ (Redis)' : 'Sandbox In-Memory Event Loop',
      activeQueues: Object.keys(useBullMQ ? queues : inMemoryQueues)
    };
  }
}

module.exports = CampaignQueueSystem;
