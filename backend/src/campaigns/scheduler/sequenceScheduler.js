/**
 * Stage 4: Smart Drip Campaign Sequence Scheduler Engine
 * Scans due campaign contacts, conducts deep inbox sync-based reply detection, and moves contacts through sequence stages.
 */
const prisma = require('../../config/database');
const QueueSystem = require('../campaignQueues');

class CampaignScheduler {
  /**
   * Scans the database for contacts due for sequence delivery.
   */
  static async runSchedulerTick() {
    console.log('⏰ [Campaign Scheduler] Scanning active campaigns for pending dispatches...');
    
    try {
      const now = new Date();
      
      // 1. Fetch active contacts whose delay time has expired
      const dueContacts = await prisma.$queryRawUnsafe(`
        SELECT cc.*, c.status as campaign_status
        FROM campaign_contacts cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE cc.status = 'active'
          AND c.status = 'active'
          AND cc.next_execution_at <= $1
        LIMIT 50;
      `, now);

      if (!dueContacts || dueContacts.length === 0) {
        return { processed: 0 };
      }

      console.log(`🎯 [Campaign Scheduler] Found ${dueContacts.length} contacts ready for processing.`);
      let processedCount = 0;

      for (const rawContact of dueContacts) {
        // Map raw postgres keys to JS properties
        const contact = {
          id: rawContact.id,
          campaignId: rawContact.campaign_id,
          email: rawContact.email,
          metadata: rawContact.metadata,
          status: rawContact.status,
          currentStep: rawContact.current_step,
          nextExecutionAt: rawContact.next_execution_at
        };

        await this.processContactSequenceStep(contact);
        processedCount++;
      }

      return { processed: processedCount };
    } catch (error) {
      console.error('❌ [Campaign Scheduler] Scanning run-loop error:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Evaluates the sequence step status of a single contact.
   */
  static async processContactSequenceStep(contact) {
    console.log(`👤 [Campaign Scheduler] Processing contact: ${contact.email} (Step: ${contact.currentStep})`);

    try {
      // 1. Inbox Sync & Reply Detection:
      // If the recipient replied, STOP sequence immediately.
      const hasReplied = await this.detectRecipientReply(contact);
      if (hasReplied) {
        console.log(`🛑 [Campaign Scheduler] Reply detected from ${contact.email}. Halting sequence.`);
        
        await prisma.$executeRawUnsafe(`
          UPDATE campaign_contacts
          SET status = 'replied', next_execution_at = NULL
          WHERE id = $1::uuid;
        `, contact.id);

        await prisma.$executeRawUnsafe(`
          INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
          VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'reply', $3::jsonb, $4);
        `, 
          contact.campaignId, 
          contact.id, 
          JSON.stringify({ reason: 'Inbox sync automatic reply detection' }), 
          new Date()
        );

        return;
      }

      // 2. Load the Next Sequence Step
      const nextStepOrder = contact.currentStep + 1;
      const sequenceSteps = await prisma.$queryRawUnsafe(`
        SELECT * FROM campaign_sequences
        WHERE campaign_id = $1::uuid AND step_order = $2
        LIMIT 1;
      `, contact.campaignId, nextStepOrder);

      const nextStep = sequenceSteps?.[0];

      if (!nextStep) {
        // No more steps exist - Campaign completed!
        console.log(`🎉 [Campaign Scheduler] Contact ${contact.email} completed all steps.`);
        
        await prisma.$executeRawUnsafe(`
          UPDATE campaign_contacts
          SET status = 'completed', next_execution_at = NULL
          WHERE id = $1::uuid;
        `, contact.id);

        await prisma.$executeRawUnsafe(`
          INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
          VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'completed', '{}'::jsonb, $3);
        `, contact.campaignId, contact.id, new Date());

        return;
      }

      // 3. Behavioral Trigger Evaluation:
      // If this is step > 1, evaluate prior step triggers (e.g. openTrigger, clickTrigger)
      if (contact.currentStep > 0) {
        const canExecute = await this.evaluateTriggers(contact, nextStep);
        if (!canExecute) {
          console.log(`⏩ [Campaign Scheduler] Conditions not met for step ${nextStepOrder} (Contact: ${contact.email}). Bypassing step.`);
          
          // Fast-forward delay window and try again
          const delayMs = (nextStep.delay_hours || 24) * 60 * 60 * 1000;
          const nextRun = new Date(Date.now() + delayMs);
          
          await prisma.$executeRawUnsafe(`
            UPDATE campaign_contacts
            SET current_step = $1, next_execution_at = $2
            WHERE id = $3::uuid;
          `, nextStepOrder, nextRun, contact.id);

          return;
        }
      }

      // 4. Enqueue to Personalization Pipeline (aiQueue)
      console.log(`🤖 [Campaign Scheduler] Enqueuing ${contact.email} for AI personalization...`);
      await QueueSystem.addJob('aiQueue', {
        contact,
        nextStep
      });

    } catch (err) {
      console.error(`❌ [Campaign Scheduler] Error processing contact ${contact.email}:`, err.message);
    }
  }

  /**
   * Scans user emails to check if recipient has replied to the campaign thread.
   */
  static async detectRecipientReply(contact) {
    try {
      // Find the last campaign outbound event for this contact to verify replies sent AFTER
      const lastSentEvents = await prisma.$queryRawUnsafe(`
        SELECT created_at FROM campaign_events
        WHERE contact_id = $1::uuid AND event_type = 'sent'
        ORDER BY created_at DESC
        LIMIT 1;
      `, contact.id);

      const sinceDate = lastSentEvents?.[0]?.created_at
        ? new Date(lastSentEvents[0].created_at)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days

      // Look in standard Emails table where sender is the contact email and received AFTER campaign sent date
      const receivedEmails = await prisma.email.findFirst({
        where: {
          sender: {
            contains: contact.email,
            mode: 'insensitive'
          },
          receivedAt: {
            gt: sinceDate
          },
          isSentByUser: false
        }
      });

      return !!receivedEmails;
    } catch (err) {
      console.error('[Campaign Scheduler] Reply detection engine warning:', err.message);
      return false;
    }
  }

  /**
   * Dynamic Behavioral Trigger Evaluator
   */
  static async evaluateTriggers(contact, nextStep) {
    const conditions = nextStep.conditions || {};
    
    // If no triggers are configured, proceed naturally
    if (!conditions.openTrigger && !conditions.linkTrigger) {
      return true;
    }

    try {
      // Look up events for the previous email step
      const stepEvents = await prisma.$queryRawUnsafe(`
        SELECT event_type FROM campaign_events
        WHERE contact_id = $1::uuid
          AND (event_type = 'open' OR event_type = 'click');
      `, contact.id);

      const opened = stepEvents.some(e => e.event_type === 'open');
      const clicked = stepEvents.some(e => e.event_type === 'click');

      if (conditions.openTrigger && !opened) return false;
      if (conditions.linkTrigger && !clicked) return false;

      return true;
    } catch (err) {
      console.error('[Campaign Scheduler] Trigger evaluation warning:', err.message);
      return true; // Safe-fallback: proceed if query fails
    }
  }
}

module.exports = CampaignScheduler;
