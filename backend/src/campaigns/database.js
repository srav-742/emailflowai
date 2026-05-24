/**
 * Stage 4: Smart Drip Campaigns Database Initialization
 * Isolated, non-disruptive PostgreSQL schema initializer using raw SQL queries.
 */
const prisma = require('../config/database');

class CampaignDatabase {
  static async initialize() {
    if (this.initialized) return;

    console.log('⚡ [Campaign DB] Bootstrapping Smart Drip Campaign tables...');
    try {
      await this.createTables();
      console.log('✅ [Campaign DB] Schemas successfully verified & indexed.');
      this.initialized = true;
    } catch (error) {
      console.error('❌ [Campaign DB] Schema initialization error:', error.message);
      throw error;
    }
  }

  static async createTables() {
    // 1. campaigns
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        name TEXT NOT NULL,
        campaign_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'paused', -- 'paused', 'active', 'draft'
        settings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. campaign_sequences
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaign_sequences (
        id UUID PRIMARY KEY,
        campaign_id UUID NOT NULL,
        step_order INTEGER NOT NULL,
        delay_hours INTEGER NOT NULL DEFAULT 24,
        message_template JSONB NOT NULL DEFAULT '{}'::jsonb, -- { subject, body, variants: [] }
        conditions JSONB DEFAULT '{}'::jsonb,                 -- { openTrigger, linkTrigger }
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. campaign_contacts
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        id UUID PRIMARY KEY,
        campaign_id UUID NOT NULL,
        email TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,                 -- { firstName, company, role, etc. }
        status TEXT NOT NULL DEFAULT 'active',              -- 'active', 'paused', 'replied', 'completed', 'unsubscribed', 'failed'
        current_step INTEGER NOT NULL DEFAULT 0,
        next_execution_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. campaign_events
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaign_events (
        id UUID PRIMARY KEY,
        campaign_id UUID NOT NULL,
        contact_id UUID NOT NULL,
        event_type TEXT NOT NULL,                           -- 'scheduled', 'sent', 'open', 'click', 'reply', 'bounce', 'unsubscribe', 'fail'
        metadata JSONB DEFAULT '{}'::jsonb,                 -- { stepOrder, subject, urlClicked, replyMessageId }
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Create Performance Indexes for Campaign Telemetry & Scheduling
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_seq_camp ON campaign_sequences(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_seq_order ON campaign_sequences(campaign_id, step_order);
      CREATE INDEX IF NOT EXISTS idx_campaign_cont_camp ON campaign_contacts(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_cont_email ON campaign_contacts(email);
      CREATE INDEX IF NOT EXISTS idx_campaign_cont_exec ON campaign_contacts(status, next_execution_at);
      CREATE INDEX IF NOT EXISTS idx_campaign_event_camp ON campaign_events(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_event_cont ON campaign_events(contact_id);
    `);
  }
}

CampaignDatabase.initialized = false;

module.exports = CampaignDatabase;
