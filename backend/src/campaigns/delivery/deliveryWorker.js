/**
 * Stage 4: Smart Drip Campaign Delivery Worker
 * Integrates Nodemailer custom SMTP connectors, Gmail OAuth API sending, smart warmups, and tracking pixels injection.
 */
const prisma = require('../../config/database');
const SmtpConnector = require('../../services/connector/SmtpConnector');
const { getAuthenticatedGmailClient } = require('../../utils/gmailOAuth'); // Let's check if this is imported, or we can use emailController's path
const { buildReplyRawMessage } = require('../../utils/gmailOAuth'); // Or we can construct standard MIME

class CampaignDeliveryWorker {
  /**
   * Process a send queue job: Personalize -> Embed Tracking -> Send -> Schedule Next
   */
  static async processSendJob(jobData) {
    const { contact, nextStep, personalized } = jobData;
    console.log(`✉️ [Delivery Worker] Dispatching campaign email to: ${contact.email}`);

    try {
      // 1. Fetch Campaign Details & Active Sender Account
      const campaign = await prisma.campaigns.findUnique({
        where: { id: contact.campaignId }
      });
      if (!campaign) throw new Error('Campaign not found.');

      // Find the user's primary/active email connection
      const senderAccount = await prisma.emailAccount.findFirst({
        where: {
          userId: campaign.user_id,
          syncEnabled: true
        }
      });
      if (!senderAccount) throw new Error('No verified sender email account connected.');

      // 2. Warmup & Provider Throttling Enforcement
      await this.enforceDeliverabilityThrottling(campaign.user_id);

      // 3. Inject Open Tracking Pixel, Click Tracking Redirects & Unsubscribe Compliance links
      const trackingMeta = { contactId: contact.id, campaignId: campaign.id, stepOrder: nextStep.step_order };
      const enrichedHtml = this.injectTrackingAndCompliance(personalized.body, trackingMeta);

      let messageId = null;

      // 4. Send via Transport (Gmail API vs Custom SMTP Connector)
      if (senderAccount.provider === 'google' && senderAccount.connectionType === 'oauth') {
        // Send via Google Gmail API
        console.log(`🔑 [Delivery Worker] Routing through Gmail API OAuth for: ${senderAccount.email}`);
        const gmailClient = await getAuthenticatedGmailClient(campaign.user_id);
        
        const rawMime = this.buildRawMimeMessage({
          from: `"${senderAccount.displayName || 'Outreach'}" <${senderAccount.email}>`,
          to: contact.email,
          subject: personalized.subject,
          html: enrichedHtml
        });

        const sendResult = await gmailClient.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawMime
          }
        });
        messageId = sendResult.data.id;
      } else {
        // Send via Custom SMTP Connector
        console.log(`🔌 [Delivery Worker] Routing through SMTP Connector for: ${senderAccount.email}`);
        const smtp = new SmtpConnector(senderAccount);
        const sendResult = await smtp.sendEmail({
          to: contact.email,
          subject: personalized.subject,
          html: enrichedHtml,
          body: personalized.body // Plain text fallback
        });
        messageId = sendResult.messageId;
      }

      console.log(`⭐ [Delivery Worker] Dispatched successfully! messageId: ${messageId}`);

      // 5. Log campaign events ('sent') and progress the contact to next stage
      await prisma.$executeRawUnsafe(`
        INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
        VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'sent', $3::jsonb, $4);
      `, 
        campaign.id, 
        contact.id, 
        JSON.stringify({ stepOrder: nextStep.step_order, messageId, subject: personalized.subject }), 
        new Date()
      );

      // Calculate next execution date based on hours delay
      const delayHours = nextStep.delay_hours || 24;
      const nextRun = new Date(Date.now() + delayHours * 60 * 60 * 1000);

      await prisma.$executeRawUnsafe(`
        UPDATE campaign_contacts
        SET current_step = $1, next_execution_at = $2, status = 'active'
        WHERE id = $3::uuid;
      `, nextStep.step_order, nextRun, contact.id);

    } catch (err) {
      console.error(`❌ [Delivery Worker] SMTP/Gmail delivery failed for ${contact.email}:`, err.message);
      
      // Log failure event
      await prisma.$executeRawUnsafe(`
        INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
        VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'fail', $3::jsonb, $4);
      `, contact.campaignId, contact.id, JSON.stringify({ error: err.message, stepOrder: nextStep.step_order }), new Date());

      // Update contact status to failed or trigger backoff/retry
      await prisma.$executeRawUnsafe(`
        UPDATE campaign_contacts
        SET status = 'failed', next_execution_at = NULL
        WHERE id = $1::uuid;
      `, contact.id);
    }
  }

  /**
   * Embeds tracking pixel, URL click redirects, and CAN-SPAM footers.
   */
  static injectTrackingAndCompliance(bodyText, { contactId, campaignId, stepOrder }) {
    // Format text body to basic HTML paragraphs if not already HTML
    let html = bodyText.replace(/\n/g, '<br />');
    
    // Parse the frontend server / backend host url
    const host = process.env.BACKEND_URL || 'http://localhost:10000';

    // 1. Rewrite Click Redirects (base64 URL rewriting)
    // Matches any standard href URL
    const urlPattern = /href=["'](https?:\/\/[^"']+)["']/gi;
    html = html.replace(urlPattern, (match, url) => {
      // Exclude tracking pixels or system links from redirection
      if (url.includes('/api/campaigns/tracking')) return match;
      
      const encodedUrl = Buffer.from(url).toString('base64');
      const trackingUrl = `${host}/api/campaigns/tracking/click?c=${contactId}&s=${stepOrder}&u=${encodedUrl}`;
      return `href="${trackingUrl}"`;
    });

    // 2. Inject Open Tracking Pixel
    const trackingPixelUrl = `${host}/api/campaigns/tracking/pixel/${contactId}/${stepOrder}`;
    const pixelImg = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none !important; visibility:hidden;" alt="" />`;

    // 3. Inject CAN-SPAM Footer & Unsubscribe link
    const unsubscribeUrl = `${host}/api/campaigns/tracking/unsubscribe?c=${contactId}`;
    const footer = `
      <br /><br />
      <hr style="border:0; border-top:1px solid #eee; margin:20px 0;" />
      <p style="font-size:11px; color:#999; font-family:sans-serif; line-height:1.4;">
        This email was sent by EmailFlow AI Smart Campaigns.
        <br />
        To cease receiving automated sequences from this sender, please 
        <a href="${unsubscribeUrl}" style="color:#0066cc; text-decoration:underline;">unsubscribe instantly</a>.
      </p>
    `;

    return `<html><body>${html}${footer}${pixelImg}</body></html>`;
  }

  /**
   * Standard helper to build a raw Base64-encoded RFC-2822 MIME message for Google Gmail API.
   */
  static buildRawMimeMessage({ from, to, subject, html }) {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: ${from}`,
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      html
    ];
    const mime = messageParts.join('\r\n');
    return Buffer.from(mime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Warmup Rate-Limit Throttling Simulator:
   * Sleeps between sends to guarantee delivery slots look human-like (between 1-2s delay)
   */
  static async enforceDeliverabilityThrottling(userId) {
    const minDelay = 1000; // 1 second
    const randomBuffer = Math.random() * 1500; // up to 1.5 second buffer
    const delay = minDelay + randomBuffer;
    
    console.log(`⏱️ [Deliverability Engine] Pausing send operations for ${(delay / 1000).toFixed(2)}s to protect domain reputation...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = CampaignDeliveryWorker;
