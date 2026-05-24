/**
 * Stage 4: Twilio SMS & WhatsApp Provider Integration Gateway
 */
const twilio = require('twilio');
const prisma = require('../../config/database');
const OmnichannelService = require('../../services/stage4_omnichannelService');

class TwilioIntegration {
  /**
   * Validates cryptographic Twilio webhook signatures
   */
  static validateSignature(req) {
    const signature = req.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const url = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/omnichannel/webhooks/twilio` : req.originalUrl;

    if (!authToken) {
      console.warn('⚠️ [Twilio Gateway] TWILIO_AUTH_TOKEN is missing. Bypassing signature verification.');
      return true;
    }

    if (!signature) return false;

    try {
      const params = req.body;
      return twilio.validateRequest(authToken, signature, url, params);
    } catch (e) {
      console.error('❌ [Twilio Gateway] Signature verification exception:', e.message);
      return false;
    }
  }

  /**
   * Helper to resolve credentials from DB or fallback to environment variables
   */
  static async resolveCredentials(userId) {
    let credentials = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      smsNumber: process.env.TWILIO_SMS_NUMBER || '+1234567890',
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '+0987654321'
    };

    try {
      const channelConfig = await prisma.$queryRawUnsafe(`
        SELECT * FROM communication_channels
        WHERE user_id = $1::uuid AND channel_type IN ('twilio-sms', 'whatsapp')
        LIMIT 1;
      `, userId);

      if (channelConfig && channelConfig.length > 0) {
        const metadata = typeof channelConfig[0].metadata === 'string' 
          ? JSON.parse(channelConfig[0].metadata) 
          : (channelConfig[0].metadata || {});
        
        credentials.sid = metadata.account_sid || credentials.sid;
        credentials.token = OmnichannelService.decryptToken(channelConfig[0].access_token) || credentials.token;
        credentials.smsNumber = metadata.sms_number || credentials.smsNumber;
        credentials.whatsappNumber = metadata.whatsapp_number || credentials.whatsappNumber;
      }
    } catch (e) {
      console.warn('⚠️ [Twilio Gateway] DB credential fetch skipped or failed:', e.message);
    }

    return credentials;
  }

  /**
   * Sends a standard SMS message via Twilio API
   */
  static async sendSMS(phoneNumber, text, userId) {
    const creds = await this.resolveCredentials(userId);

    if (creds.sid && creds.token) {
      try {
        const client = twilio(creds.sid, creds.token);
        const result = await client.messages.create({
          body: text,
          from: creds.smsNumber,
          to: phoneNumber
        });
        
        console.log(`✅ [Twilio SMS] Message successfully dispatched. SID: ${result.sid}`);
        return { success: true, messageId: result.sid };
      } catch (err) {
        console.error('❌ [Twilio SMS] Gateway delivery failed:', err.message);
        throw err;
      }
    }

    // High fidelity simulator fallback
    console.log(`✨ [Twilio Gateway] [SMS SIMULATOR MODE]
    -------------------------------------------------------
    TWILIO SMS SENT SUCCESSFULLY
    From: ${creds.smsNumber}
    To: ${phoneNumber}
    Content: ${text.replace(/\n/g, '\n    ')}
    -------------------------------------------------------`);

    return { success: true, messageId: `mock_sms_sid_${Date.now()}` };
  }

  /**
   * Sends a WhatsApp template or message via Twilio WhatsApp Gateway
   */
  static async sendWhatsApp(phoneNumber, text, userId) {
    const creds = await this.resolveCredentials(userId);
    const targetTo = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
    const targetFrom = creds.whatsappNumber.startsWith('whatsapp:') ? creds.whatsappNumber : `whatsapp:${creds.whatsappNumber}`;

    if (creds.sid && creds.token) {
      try {
        const client = twilio(creds.sid, creds.token);
        const result = await client.messages.create({
          body: text,
          from: targetFrom,
          to: targetTo
        });
        
        console.log(`✅ [Twilio WhatsApp] Message successfully dispatched. SID: ${result.sid}`);
        return { success: true, messageId: result.sid };
      } catch (err) {
        console.error('❌ [Twilio WhatsApp] Gateway delivery failed:', err.message);
        throw err;
      }
    }

    // High fidelity simulator fallback
    console.log(`✨ [Twilio Gateway] [WHATSAPP SIMULATOR MODE]
    -------------------------------------------------------
    TWILIO WHATSAPP SENT SUCCESSFULLY
    From: ${targetFrom}
    To: ${targetTo}
    Content: ${text.replace(/\n/g, '\n    ')}
    -------------------------------------------------------`);

    return { success: true, messageId: `mock_whatsapp_sid_${Date.now()}` };
  }
}

module.exports = TwilioIntegration;
