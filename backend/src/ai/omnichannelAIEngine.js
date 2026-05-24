/**
 * Stage 4: AI Prioritization, Routing and Summarization Engine
 * Powered by Groq/Llama-3.3-70b-versatile via local xai.js client
 */
const { requestGroq, extractJsonBlock } = require('../utils/xai');
const prisma = require('../config/database');
const logger = require('../config/logger');

class OmnichannelAIEngine {
  /**
   * Analyzes an incoming message for executive prioritization and sentiment
   * @param {Object} message - The normalized message object
   * @returns {Object} Structured AI intelligence payload
   */
  static async analyzeMessage(message) {
    const textContent = message.content?.text || '';
    const senderInfo = `${message.sender?.name || 'Unknown'} (${message.sender?.id || 'No ID'})`;
    const channel = message.channel || 'unknown';

    if (!textContent) {
      return this.getFallbackAnalysis('No content to analyze.');
    }

    const systemPrompt = `You are a Chief of Staff AI prioritizing executive communication channels.
Analyze the incoming message and extract high-signal communication parameters.

STRICT CLASSIFICATION CRITERIA:
1. URGENCY SCORE (0 to 100):
   - 90-100: Absolute crises, system outages, direct CEO action, major contract deals closing today, or real-life emergencies.
   - 70-80: Recruiting scheduling requests, invoices with overdue warnings, key project milestones due in 24 hours, customer escalations.
   - 30-60: Standard syncs, general project updates, check-ins.
   - 0-25: Newsletters, automated alerts, generic marketing.

2. SLA RISK (0.0 to 1.0):
   - Measure the impact of NOT responding immediately.
   - High risk (0.8+) = contract cancellations, lost candidates, operational delays.

3. ESCALATION NECESSITY (true/false):
   - Should this immediately wake up the user via push/SMS if they are on another channel? 

4. SENTIMENT: "positive" | "neutral" | "negative".

5. EXECUTIVE BRIEFING: A single sentence summarizing what this means for the user. NO filler words.

6. ACTION ITEMS: Array of concrete, task-oriented action steps (max 2).

7. RECOMMENDED REPLY: A complete, natural draft reply suitable to be sent on the same channel (${channel}). Keep it concise (under 4 lines) and matching the provider's communication culture (e.g. friendly for Slack, concise for SMS).

Return ONLY a valid JSON block:
{
  "urgency": 85,
  "sla_risk": 0.75,
  "sentiment": "neutral",
  "escalation_necessity": true,
  "briefing": "Direct summary sentence here.",
  "action_items": ["Action 1"],
  "recommended_reply": "Draft message content..."
}`;

    const userPrompt = `Incoming Message on Channel [${channel}]:
From: ${senderInfo}
Message content: "${textContent}"`;

    try {
      const response = await requestGroq([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.1 });

      const json = extractJsonBlock(response, 'object');
      if (json) {
        const parsed = JSON.parse(json);
        return {
          urgency: Math.min(100, Math.max(0, parseInt(parsed.urgency) || 45)),
          slaRisk: Math.min(1.0, Math.max(0.0, parseFloat(parsed.sla_risk) || 0.4)),
          sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
          escalationNecessity: Boolean(parsed.escalation_necessity),
          briefing: parsed.briefing || 'New conversation initiated.',
          actionItems: Array.isArray(parsed.action_items) ? parsed.action_items : [],
          recommendedReply: parsed.recommended_reply || 'Thank you for your message, I am looking into this.'
        };
      }
    } catch (err) {
      console.warn('⚠️ [Omnichannel AI Engine] Rate limited or failed. Returning fallback analysis.', err.message);
    }

    return this.getFallbackAnalysis(textContent);
  }

  /**
   * Generates a local deterministic fallback analysis when LLM fails or is rate limited
   */
  static getFallbackAnalysis(text) {
    const lower = text.toLowerCase();
    let urgency = 45;
    let escalation = false;
    let briefing = 'New cross-channel update arrived.';
    let actionItems = ['Review thread and respond where necessary.'];

    if (/\b(outage|server down|urgent|emergency|ceo|critical|immediately)\b/i.test(lower)) {
      urgency = 95;
      escalation = true;
      briefing = '🚨 Urgent: High priority operational alert detected.';
      actionItems = ['Resolve active incident immediately', 'Alert the engineering response team'];
    } else if (/\b(invoice|payment|pricing|stripe|subscribe|billing)\b/i.test(lower)) {
      urgency = 75;
      briefing = 'Finance transaction update received.';
      actionItems = ['Verify receipt and process payment details'];
    }

    return {
      urgency,
      slaRisk: urgency > 80 ? 0.9 : 0.4,
      sentiment: 'neutral',
      escalationNecessity: escalation,
      briefing,
      actionItems,
      recommendedReply: 'Got your message. Checking on this now and will follow up shortly!'
    };
  }

  /**
   * Generates an executive daily omnichannel briefing summary
   */
  static async generateOmnichannelDigest(userId) {
    try {
      const conversations = await prisma.$queryRawUnsafe(`
        SELECT * FROM conversations
        WHERE user_id = $1::uuid
        ORDER BY updated_at DESC
        LIMIT 10;
      `, userId);

      if (!conversations || conversations.length === 0) {
        return "Your communication lines are quiet. No active alerts across Slack, Teams, or Twilio.";
      }

      const summaries = conversations.map(c => `[${c.primary_channel.toUpperCase()}] ${c.ai_summary || 'No summary'}`).join('\n');
      
      const systemPrompt = `You are a Chief of Staff providing an executive morning brief across Slack, WhatsApp, SMS, and Email.
Condense the following summaries into a single, cohesive, highly professional briefing statement under 3 lines.
Be direct, eliminate generic placeholders, and highlight only major action boundaries.`;

      const response = await requestGroq([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Summaries:\n${summaries}` }
      ], { temperature: 0.2 });

      return response || "Omnichannel channels stable. Key conversations actively triaged on Slack and WhatsApp.";
    } catch (err) {
      return "Daily communications summary compiled. Key items waiting for your attention in the unified inbox.";
    }
  }
}

module.exports = OmnichannelAIEngine;
