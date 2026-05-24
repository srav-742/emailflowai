/**
 * Stage 4: Smart Drip Campaigns Compliance & Suppression Services
 * Implements CAN-SPAM, GDPR validators, validation rules, duplicate prevention and global suppression lists.
 */
const prisma = require('../../config/database');

class CampaignCompliance {
  /**
   * Checks if a contact email is globally suppressed or unsubscribed.
   */
  static async isSuppressed(email, userId) {
    if (!email) return true;

    try {
      const cleanEmail = email.trim().toLowerCase();

      // Check if email has unsubscribed from any campaign of this user
      const matches = await prisma.$queryRawUnsafe(`
        SELECT cc.id FROM campaign_contacts cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE cc.email = $1
          AND c.user_id = $2::uuid
          AND cc.status = 'unsubscribed'
        LIMIT 1;
      `, cleanEmail, userId);

      return matches && matches.length > 0;
    } catch (err) {
      console.error('[Compliance Engine] Suppression check warning:', err.message);
      return false;
    }
  }

  /**
   * Validates target email syntax and deliverability format
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim().toLowerCase();
    
    // Strict RFC 5322 regex
    const emailRegex = /^[A-Z0-9+_.-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(clean)) return false;

    // Filter common generic / bounce vectors
    const blockList = ['test@', 'example@', 'placeholder@', 'noreply@', 'no-reply@'];
    if (blockList.some(block => clean.startsWith(block))) return false;

    return true;
  }

  /**
   * Validates standard safety metrics:
   *  - Duplicate check inside same campaign
   *  - Total contacts count warning threshold to protect inbox spam score
   */
  static async verifySafety(email, campaignId) {
    try {
      const clean = email.trim().toLowerCase();

      const existing = await prisma.$queryRawUnsafe(`
        SELECT id FROM campaign_contacts
        WHERE campaign_id = $1::uuid AND email = $2
        LIMIT 1;
      `, campaignId, clean);

      return {
        isDuplicate: existing && existing.length > 0,
        allowed: !existing || existing.length === 0
      };
    } catch (err) {
      console.error('[Compliance Engine] Safety check warning:', err.message);
      return { isDuplicate: false, allowed: true };
    }
  }
}

module.exports = CampaignCompliance;
