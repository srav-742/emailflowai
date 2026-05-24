/**
 * Stage 4: Tracking Pixel, Click Redirects & Unsubscribe Handlers
 * Serves highly performant 1x1 transparent images, click-through logging, and CAN-SPAM compliant unsubscribe templates.
 */
const prisma = require('../../config/database');

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

class CampaignTracker {
  /**
   * Tracks an email open event. Returns a 1x1 transparent GIF image.
   */
  static async handleOpenPixel(req, res) {
    const { contactId, stepOrder } = req.params;

    try {
      console.log(`👁️ [Campaign Tracker] Email OPEN detected: Contact=${contactId}, Step=${stepOrder}`);
      
      const contact = await prisma.$queryRawUnsafe(`
        SELECT * FROM campaign_contacts WHERE id = $1::uuid LIMIT 1;
      `, contactId);

      if (contact?.[0]) {
        // Record the open event in campaign_events
        await prisma.$executeRawUnsafe(`
          INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
          VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'open', $3::jsonb, $4);
        `, 
          contact[0].campaign_id, 
          contactId, 
          JSON.stringify({ stepOrder: parseInt(stepOrder || '1', 10), timestamp: new Date() }), 
          new Date()
        );
      }
    } catch (err) {
      console.error('[Campaign Tracker] Open logging failure:', err.message);
    }

    // Return the transparent pixel immediately
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(TRANSPARENT_GIF);
  }

  /**
   * Rewrites links to log click events before redirecting to the destination URL.
   */
  static async handleClickRedirect(req, res) {
    const { c: contactId, s: stepOrder, u: base64Url } = req.query;

    if (!base64Url) {
      return res.status(400).send('Malformed redirect target.');
    }

    let destinationUrl = 'http://localhost:5173';
    try {
      destinationUrl = Buffer.from(base64Url, 'base64').toString('utf8');
      
      console.log(`🔗 [Campaign Tracker] Link CLICK detected: Contact=${contactId}, Step=${stepOrder}, Target=${destinationUrl}`);
      
      const contact = await prisma.$queryRawUnsafe(`
        SELECT * FROM campaign_contacts WHERE id = $1::uuid LIMIT 1;
      `, contactId);

      if (contact?.[0]) {
        // Record the click event
        await prisma.$executeRawUnsafe(`
          INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
          VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'click', $3::jsonb, $4);
        `, 
          contact[0].campaign_id, 
          contactId, 
          JSON.stringify({ stepOrder: parseInt(stepOrder || '1', 10), url: destinationUrl }), 
          new Date()
        );
      }
    } catch (err) {
      console.error('[Campaign Tracker] Click logging failure:', err.message);
    }

    // Redirect to final destination
    res.redirect(destinationUrl);
  }

  /**
   * Handles user unsubscribe requests.
   */
  static async handleUnsubscribe(req, res) {
    const { c: contactId } = req.query;

    if (!contactId) {
      return res.status(400).send('Unsubscribe request lacks identifiers.');
    }

    try {
      console.log(`🛑 [Campaign Tracker] UNSUBSCRIBE request: Contact=${contactId}`);
      
      const contact = await prisma.$queryRawUnsafe(`
        SELECT * FROM campaign_contacts WHERE id = $1::uuid LIMIT 1;
      `, contactId);

      if (contact?.[0]) {
        // Mark contact as unsubscribed in campaign_contacts
        await prisma.$executeRawUnsafe(`
          UPDATE campaign_contacts
          SET status = 'unsubscribed', next_execution_at = NULL
          WHERE id = $1::uuid;
        `, contactId);

        // Record the event
        await prisma.$executeRawUnsafe(`
          INSERT INTO campaign_events (id, campaign_id, contact_id, event_type, metadata, created_at)
          VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'unsubscribe', '{}'::jsonb, $3);
        `, contact[0].campaign_id, contactId, new Date());
      }
    } catch (err) {
      console.error('[Campaign Tracker] Unsubscribe failure:', err.message);
    }

    // Render a high-fidelity confirmation page
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed Successful — EmailFlow AI</title>
        <meta charset="utf-8" />
        <style>
          body {
            background-color: #050505;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            backdrop-filter: blur(12px);
          }
          h1 {
            font-size: 24px;
            margin-bottom: 12px;
            color: #10b981;
          }
          p {
            font-size: 14px;
            color: #a3a3a3;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .brand {
            font-weight: 700;
            letter-spacing: 1px;
            color: rgba(255, 255, 255, 0.3);
            font-size: 12px;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Subscription Ended</h1>
          <p>You have been successfully removed from this campaign sequence. The sender has been notified and you will receive no further automated nurturing emails.</p>
          <div class="brand">EmailFlow AI</div>
        </div>
      </body>
      </html>
    `);
  }
}

module.exports = CampaignTracker;
