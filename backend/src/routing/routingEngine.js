/**
 * Stage 4: AI Routing & Channel Escalation Engine
 * Parses and runs intelligent cross-channel delivery workflows.
 */
const { requestGroq, extractJsonBlock } = require('../utils/xai');
const logger = require('../config/logger');

// Local storage for active rules in memory (initialized with default enterprise policies)
let activeRules = [
  {
    id: 'default-ceo-escalation',
    name: 'CEO Urgent Escalation',
    description: 'If sender is CEO and urgency is high, escalate across channels.',
    criteria: 'sender_role === "ceo" || urgency >= 90',
    actions: ['push', 'twilio-sms', 'slack'],
    enabled: true
  },
  {
    id: 'default-invoice-whatsapp',
    name: 'Invoice Finance Notification',
    description: 'When an invoice arrives, notify the WhatsApp finance team.',
    criteria: 'category === "finance" || text.includes("invoice")',
    actions: ['whatsapp'],
    enabled: true
  },
  {
    id: 'default-outage-slack',
    name: 'Developer Outage Broadcast',
    description: 'If a workflow/system failure is detected, notify Slack.',
    criteria: 'text.includes("outage") || text.includes("failure") || category === "developer"',
    actions: ['slack'],
    enabled: true
  }
];

class RoutingEngine {
  /**
   * Compiles natural language routing instructions into a structured rule object
   * @param {String} ruleText - The natural language instruction
   * @returns {Object} Structured rules payload
   */
  static async compileRule(ruleText) {
    if (!ruleText || !ruleText.trim()) {
      throw new Error('[RoutingEngine] NL instruction is empty.');
    }

    const systemPrompt = `You are a Communication Rule Compiler that translates natural language statements into formal structured logic.
You will output a rule containing:
1. id (url-friendly slug)
2. name (short name)
3. description (explain in one line)
4. criteria (a valid Javascript evaluation string. Available variables: channel, text, sender, category, urgency, sentiment)
5. actions (array of channels to dispatch to: "push", "twilio-sms", "whatsapp", "slack", "teams", "telegram", "email")

STRICT RULE COMPILATION EXAMPLES:
NL: "If no reply to email in 2 hours -> send SMS"
Output:
{
  "id": "email-no-reply-sms",
  "name": "SMS Escalation",
  "description": "Escalate to SMS if email thread requires follow up.",
  "criteria": "channel === 'email' && urgency >= 50",
  "actions": ["twilio-sms"]
}

NL: "When invoice arrives -> WhatsApp finance team"
Output:
{
  "id": "invoice-whatsapp",
  "name": "WhatsApp Finance",
  "description": "Forward invoices to WhatsApp team chat.",
  "criteria": "text.toLowerCase().includes('invoice') || category === 'finance'",
  "actions": ["whatsapp"]
}

Return ONLY strict JSON:`;

    try {
      const response = await requestGroq([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Compile this instruction: "${ruleText}"` }
      ], { temperature: 0.1 });

      const json = extractJsonBlock(response, 'object');
      if (json) {
        const parsed = JSON.parse(json);
        const compiledRule = {
          id: parsed.id || `rule-${Math.random().toString(36).substring(7)}`,
          name: parsed.name || 'Custom Dynamic Rule',
          description: parsed.description || ruleText,
          criteria: parsed.criteria || 'true',
          actions: Array.isArray(parsed.actions) ? parsed.actions : ['push'],
          enabled: true
        };
        
        // Add to active rules list
        activeRules.push(compiledRule);
        return compiledRule;
      }
    } catch (err) {
      console.error('❌ [RoutingEngine] Rule compilation failed:', err.message);
    }

    // Fallback compiler logic
    const fallbackId = `rule-${Math.random().toString(36).substring(7)}`;
    const isSlack = ruleText.toLowerCase().includes('slack');
    const isSms = ruleText.toLowerCase().includes('sms');
    const isWhatsApp = ruleText.toLowerCase().includes('whatsapp');
    
    const fallback = {
      id: fallbackId,
      name: 'Custom Routing Rule',
      description: ruleText,
      criteria: ruleText.toLowerCase().includes('urgent') ? 'urgency >= 80' : 'true',
      actions: [isSlack ? 'slack' : isSms ? 'twilio-sms' : isWhatsApp ? 'whatsapp' : 'push'],
      enabled: true
    };
    activeRules.push(fallback);
    return fallback;
  }

  /**
   * Evaluates an incoming message against all active rules and quiet-hours schedules
   * @param {Object} message - The normalized message
   * @param {Object} analysis - The AI Priority analysis output
   * @returns {Array} List of target channels triggered
   */
  static evaluateRouting(message, analysis) {
    const context = {
      channel: message.channel || '',
      text: (message.content?.text || '').toLowerCase(),
      sender: (message.sender?.name || '').toLowerCase(),
      sender_role: (message.sender?.name || '').toLowerCase().includes('ceo') ? 'ceo' : 'staff',
      category: analysis.category || '',
      urgency: analysis.urgency || 50,
      sentiment: analysis.sentiment || 'neutral'
    };

    const triggeredChannels = new Set();
    const evaluationLogs = [];

    // Support quiet-hours suppression (simulate: quiet hours between 10 PM and 7 AM unless urgency >= 90)
    const currentHour = new Date().getHours();
    const isQuietHours = currentHour >= 22 || currentHour < 7;
    const isVipOverride = context.urgency >= 90 || context.sender_role === 'ceo';

    for (const rule of activeRules) {
      if (!rule.enabled) continue;

      try {
        // Safe evaluation simulation via Function builder
        const evaluator = new Function('ctx', `with(ctx) { return (${rule.criteria}); }`);
        const isMatched = evaluator(context);

        if (isMatched) {
          if (isQuietHours && !isVipOverride) {
            evaluationLogs.push(`Rule [${rule.name}] MATCHED but suppressed due to Quiet Hours.`);
          } else {
            rule.actions.forEach(act => triggeredChannels.add(act));
            evaluationLogs.push(`Rule [${rule.name}] MATCHED: Routing to [${rule.actions.join(', ')}].`);
          }
        }
      } catch (err) {
        // Log evaluation warning but keep processing
        evaluationLogs.push(`Rule [${rule.name}] evaluation warning: ${err.message}`);
      }
    }

    return {
      channels: Array.from(triggeredChannels),
      logs: evaluationLogs
    };
  }

  /**
   * Retrieves all currently active routing rules
   */
  static getRules() {
    return activeRules;
  }

  /**
   * Resets active rules to default setting
   */
  static resetRules() {
    activeRules = activeRules.slice(0, 3);
    return activeRules;
  }
}

module.exports = RoutingEngine;
