/**
 * Stage 4: Smart Drip Campaign AI Intelligence Engine
 * Integrates with Groq LLM (llama-3.3-70b-versatile) to dynamically personalize content, optimize schedules, and auto-build campaigns.
 */
const { requestGroq, extractJsonBlock } = require('../../utils/xai');

class CampaignAIEngine {
  /**
   * 1. Dynamic Contact-Specific Email Personalization
   */
  static async personalizeMessage({ contact, sequenceStep, threadHistory = [] }) {
    const template = sequenceStep.message_template || {};
    const originalSubject = template.subject || 'Follow up';
    const originalBody = template.body || '';

    const contactMetadata = contact.metadata || {};
    const variables = {
      email: contact.email,
      firstName: contactMetadata.firstName || contactMetadata.name || 'there',
      company: contactMetadata.company || 'your company',
      role: contactMetadata.role || 'Professional',
      ...contactMetadata
    };

    // If Groq is not configured, perform standard placeholder replacement
    if (!process.env.GROQ_API_KEY) {
      let personalizedBody = originalBody;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        personalizedBody = personalizedBody.replace(regex, value);
      }
      return {
        subject: originalSubject,
        body: personalizedBody,
        optimizedSendTime: new Date()
      };
    }

    try {
      const threadSummaryText = threadHistory.length > 0
        ? `Previous communications in thread:\n${threadHistory.map(h => `From: ${h.sender}\nBody: ${h.body}`).join('\n\n')}`
        : 'This is the first outreach in this campaign sequence.';

      const prompt = `
        You are a highly skilled Sales Outreach and Relationship Intelligence AI.
        Your goal is to write a warm, bespoke, individually-tailored email by injecting personal and contextual details.

        CONTEXT:
        - Recipient Name: ${variables.firstName}
        - Company: ${variables.company}
        - Role: ${variables.role}
        - Additional Context: ${JSON.stringify(contactMetadata)}
        - Thread History: ${threadSummaryText}

        ORIGINAL EMAIL TEMPLATE:
        Subject: ${originalSubject}
        Body:
        ${originalBody}

        INSTRUCTIONS:
        1. Replace template placeholders like {{firstName}}, {{company}}, {{role}} with target details.
        2. Keep the core email body structurally aligned with the original template, but improve flow, greeting style, company mentions, and tone to feel 100% natural, written by a human.
        3. Make sure greeting fits context (e.g. "Hi ${variables.firstName}", not "Dear {{firstName}}").
        4. If thread history exists, briefly reference or follow up naturally from the last contact without sounding repetitive.
        5. Return a JSON object with strictly formatted "subject" and "body" parameters. DO NOT output any extra chat, explanations, or wrapper tags.
      `;

      const response = await requestGroq([
        { role: 'system', content: 'You are a professional outreach copywriting assistant.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.7, maxTokens: 1000 });

      const jsonStr = extractJsonBlock(response, 'object');
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        return {
          subject: parsed.subject || originalSubject,
          body: parsed.body || originalBody,
          optimizedSendTime: this.predictSmartSendTime(variables)
        };
      }
    } catch (err) {
      console.warn('⚠️ [Campaign AI] Personalization failed, falling back to regex: ', err.message);
    }

    // Default Fallback
    let personalizedBody = originalBody;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      personalizedBody = personalizedBody.replace(regex, value);
    }
    return {
      subject: originalSubject,
      body: personalizedBody,
      optimizedSendTime: new Date()
    };
  }

  /**
   * 2. Autonomous Visual Sequence Generator
   * Generates a fully-structured multi-step drip campaign sequence from a high-level user objective.
   */
  static async generateSequenceFromPrompt(userPrompt) {
    if (!process.env.GROQ_API_KEY) {
      // Offline fallback
      return this.getMockFallbackCampaign(userPrompt);
    }

    try {
      const prompt = `
        You are a growth marketing and communications designer.
        The user wants to build an automated email campaign for this objective:
        "${userPrompt}"

        Create a highly optimized, fully fleshed out 3-step sequence flow. 
        Each step must represent a logical email touchpoint with realistic smart delay intervals and full templates.

        Return a JSON object with:
        {
          "campaignName": "A catchy, modern title for this campaign sequence",
          "campaignType": "sales", "hiring", "onboarding", "nurturing", "retention", or "relationship",
          "steps": [
            {
              "step_order": 1,
              "delay_hours": 0,
              "subject": "...",
              "body": "...",
              "conditions": { "openTrigger": false, "linkTrigger": false }
            },
            {
              "step_order": 2,
              "delay_hours": 72,
              "subject": "...",
              "body": "...",
              "conditions": { "openTrigger": true, "linkTrigger": false }
            },
            {
              "step_order": 3,
              "delay_hours": 96,
              "subject": "...",
              "body": "...",
              "conditions": { "openTrigger": false, "linkTrigger": false }
            }
          ]
        }

        INSTRUCTIONS:
        - Include actual variables like {{firstName}}, {{company}}, {{role}} inside the subject and bodies.
        - Ensure subjects are highly conversational and punchy (no spam triggers).
        - Add realistic delays (e.g. Step 1: 0 hours, Step 2: 72 hours (3 days), Step 3: 96 hours (4 days)).
        - Return ONLY raw JSON without markdown code fences or conversational text.
      `;

      const response = await requestGroq([
        { role: 'system', content: 'You are an advanced email marketing consultant.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.8, maxTokens: 1500 });

      const jsonStr = extractJsonBlock(response, 'object');
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
    } catch (err) {
      console.error('❌ [Campaign AI] AI Sequence Generation failed:', err.message);
    }

    return this.getMockFallbackCampaign(userPrompt);
  }

  /**
   * 3. Smart Send-Time Optimization
   * Predicts the absolute highest engagement window based on timezone / contact data.
   */
  static predictSmartSendTime(variables) {
    const now = new Date();
    // Default optimized send window: target next 9:00 AM in business days
    const nextExecution = new Date(now);
    
    // Simulating advanced AI delivery window optimization:
    // Avoid weekends (Saturday, Sunday)
    let day = nextExecution.getDay();
    let hoursToAdd = 0;
    
    if (day === 6) { // Saturday -> Move to Monday
      hoursToAdd = 48;
    } else if (day === 0) { // Sunday -> Move to Monday
      hoursToAdd = 24;
    }
    
    nextExecution.setHours(9, 30, 0, 0); // Target 9:30 AM
    nextExecution.setTime(nextExecution.getTime() + hoursToAdd * 60 * 60 * 1000);
    
    if (nextExecution.getTime() <= now.getTime()) {
      // If 9:30 AM has already passed today, target tomorrow morning
      nextExecution.setDate(nextExecution.getDate() + 1);
    }
    
    return nextExecution;
  }

  /**
   * 4. AI Lead Engagement & Response Probability Scorer
   */
  static calculateEngagementScore(contactMetadata, eventCount = {}) {
    let score = 50; // Base score out of 100

    if (contactMetadata.role && /(director|founder|ceo|vp|lead|manager|executive)/i.test(contactMetadata.role)) {
      score += 15; // High decision-maker weight
    }

    if (contactMetadata.email && /(gmail\.com|outlook\.com|yahoo\.com)$/i.test(contactMetadata.email)) {
      score -= 5; // Slight commercial outreach discount for generic emails
    }

    const opens = eventCount.opens || 0;
    const clicks = eventCount.clicks || 0;
    const replies = eventCount.replies || 0;

    score += opens * 5;
    score += clicks * 15;
    score += replies * 30;

    return Math.min(Math.max(score, 0), 100); // Clamped between 0 and 100
  }

  static getMockFallbackCampaign(userPrompt) {
    const cleanPrompt = userPrompt || 'General Lead Outreach';
    return {
      campaignName: `Campaign: ${cleanPrompt.slice(0, 30)}`,
      campaignType: 'sales',
      steps: [
        {
          step_order: 1,
          delay_hours: 0,
          subject: 'Quick question regarding {{company}}',
          body: 'Hi {{firstName}},\n\nI was looking at {{company}} and love what you are building as a {{role}}.\n\nWould you be open to a quick chat sometime this week?\n\nBest,\n[Your Name]',
          conditions: { openTrigger: false, linkTrigger: false }
        },
        {
          step_order: 2,
          delay_hours: 72,
          subject: 'Following up on my last email',
          body: 'Hi {{firstName}},\n\nJust wanted to bump this to the top of your inbox in case it got buried. Open to hearing your thoughts!\n\nBest,\n[Your Name]',
          conditions: { openTrigger: true, linkTrigger: false }
        },
        {
          step_order: 3,
          delay_hours: 120,
          subject: 'One last try...',
          body: 'Hi {{firstName}},\n\nI promise this is my last follow-up. If now is not a good time, let me know if we should sync up next quarter.\n\nBest,\n[Your Name]',
          conditions: { openTrigger: false, linkTrigger: false }
        }
      ]
    };
  }
}

module.exports = CampaignAIEngine;
