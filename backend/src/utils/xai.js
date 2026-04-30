/**
 * AI utilities powered by Groq (llama-3.3-70b-versatile).
 * FINAL DECISION GRADE: Chief of Staff Intelligence (DECISIVE, SPECIFIC, ZERO-FILLER).
 */

const axios = require('axios');
const { analyzeEmailIntelligence, generateSummary } = require('./classifier');

const GROQ_API_KEY  = process.env.GROQ_API_KEY;
const GROQ_MODEL    = process.env.GROQ_MODEL    || 'llama-3.3-70b-versatile';
const GROQ_API_URL  = process.env.GROQ_API_URL  || 'https://api.groq.com/openai/v1/chat/completions';

const XAI_MODEL = GROQ_MODEL;

const DEFAULT_COOLDOWN_MS            = 2  * 60 * 1000;
const MAX_COOLDOWN_MS                = 15 * 60 * 1000;

let cooldownUntil = 0;

const batchSummaryCache = new Map();

// ─── Low-level HTTP client ─────────────────────────────────────────────────

const groqClient = axios.create({
  baseURL:  GROQ_API_URL,
  headers:  { 'Content-Type': 'application/json' },
  timeout:  30000,
});

groqClient.interceptors.request.use((config) => {
  const key = process.env.GROQ_API_KEY;
  if (key) config.headers.Authorization = `Bearer ${key}`;
  return config;
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractJsonBlock(value = '', mode = 'object') {
  if (!value) return null;
  const pattern = mode === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = String(value).match(pattern);
  return match ? match[0] : null;
}

function truncateForPrompt(value = '', limit = 3200) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit).trim()}...`;
}

function parseRetryAfterMs(message = '') {
  const match = String(message).match(/try again in\s+((?:\d+(?:\.\d+)?h)?(?:\d+(?:\.\d+)?m)?(?:\d+(?:\.\d+)?s)?)/i);
  if (!match?.[1]) return null;
  const h = (match[1].match(/(\d+(?:\.\d+)?)h/i)?.[1] || 0);
  const m = (match[1].match(/(\d+(?:\.\d+)?)m/i)?.[1] || 0);
  const s = (match[1].match(/(\d+(?:\.\d+)?)s/i)?.[1] || 0);
  const ms = ((+h * 3600) + (+m * 60) + +s) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function isGroqRateLimitError(error) {
  const status = Number(error?.response?.status || 0);
  const message = (error?.response?.data?.error?.message || '').toLowerCase();
  return status === 429 || message.includes('rate limit');
}

function parseEmailContent(emailContent = '') {
  const subjectMatch = String(emailContent).match(/Subject:\s*(.+)/i);
  const senderMatch  = String(emailContent).match(/From:\s*(.+)/i);
  const bodyStart    = String(emailContent).indexOf('\n\n');
  const body         = bodyStart >= 0 ? String(emailContent).slice(bodyStart + 2).trim() : String(emailContent).trim();
  return {
    subject: subjectMatch?.[1]?.trim() || '',
    sender:  senderMatch?.[1]?.trim()  || '',
    body,
  };
}

async function requestGroq(messages, overrides = {}) {
  if (!GROQ_API_KEY) return null;
  if (cooldownUntil > Date.now()) return null;

  try {
    const response = await groqClient.post('', {
      model:       GROQ_MODEL,
      messages,
      max_tokens:  overrides.maxTokens  ?? 1200,
      temperature: overrides.temperature ?? 0.1,
    });
    return response.data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    if (isGroqRateLimitError(error)) {
      let retry = parseRetryAfterMs(error?.response?.data?.error?.message) || DEFAULT_COOLDOWN_MS;
      if (retry > MAX_COOLDOWN_MS) retry = MAX_COOLDOWN_MS;
      cooldownUntil = Date.now() + retry;
    }
    return null;
  }
}

// ─── Chief of Staff Intelligence ───────────────────────────────────────────

/**
 * FINAL UPGRADE: Deep cleaning and deduplication.
 */
function getCleanFilteredEmails(emails = []) {
  const ignoreWords = ["unsubscribe", "sale", "offer", "discount", "joke", "meme", "neighbor crush"];
  
  // 1. Remove obvious noise and empty emails
  const filtered = emails
    .filter(e => e.subject?.trim() && (e.body?.trim() || e.snippet?.trim()))
    .filter(e => {
      const text = (e.subject + ' ' + (e.body || e.snippet || '')).toLowerCase();
      return !ignoreWords.some(word => text.includes(word));
    });

  // 2. Remove duplicate subject lines (Deduplication)
  const uniqueEmails = Array.from(
    new Map(filtered.map(e => [e.subject.trim().toLowerCase(), e])).values()
  );

  // 3. Format for AI consumption
  return uniqueEmails.map(e => ({
    from: e.senderName || e.sender || 'Unknown',
    subject: e.subject.trim(),
    content: truncateForPrompt(e.body || e.snippet || '', 300)
  }));
}

/**
 * FINAL DECISION GRADE: Chief of Staff Intelligence
 */
const summarizeBatchEmails = async (emails = [], userId = 'default') => {
  const cleanEmails = getCleanFilteredEmails(emails);
  
  if (!cleanEmails.length) return {
    executive_summary: 'Your workspace is clear of urgent professional matters. No immediate action required.',
    key_updates: [],
    critical_actions: [],
    risks: [],
    insights: [],
    priority: 'low'
  };

  const cacheKey = `briefing:v7:${userId}:${cleanEmails.length}:${cleanEmails[0]?.subject}`;
  const cached = batchSummaryCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) return cached.content;

  const emailList = cleanEmails
    .slice(0, 35)
    .map((e, i) => `Email ${i + 1}:\nFrom: ${e.from}\nSubject: ${e.subject}\nContent: ${e.content}`)
    .join('\n\n---\n\n');

  const fallback = {
    executive_summary: `Briefing: Analyzing ${cleanEmails.length} professional communications. High recruiter demand detected.`,
    key_updates: cleanEmails.slice(0, 2).map(e => `Progress regarding ${e.subject}`),
    critical_actions: cleanEmails.slice(0, 2).map(e => `Address inquiry from ${e.from}`),
    risks: [],
    insights: ['Recruitment volume is high.'],
    priority: 'normal'
  };

  if (!GROQ_API_KEY) return fallback;

  try {
    const content = await requestGroq([
      {
        role: 'system',
        content: `You are a Chief of Staff AI assistant. Your role is to THINK, DECIDE, and COMMUNICATE like a human executive assistant.

========================
STRICT COMMUNICATION RULES
========================
- Write like a human, not a system.
- NO filler phrases like: "Recent activity regarding", "No immediate crisis", "Communication from", "Update for".
- Be direct, specific, and confident.
- Every line must add value.
- Avoid vague verbs like "review" — use clear actions like: "Respond", "Prepare", "Apply", "Follow up".

========================
INTELLIGENCE RULES
========================
- Understand intent behind each email.
- Rewrite into meaningful insights (do NOT copy subject lines).
- Combine similar job alerts into one point.
- Ignore low-value notifications.

========================
SECTIONS
========================

1. EXECUTIVE SUMMARY (2–3 sharp lines)
- Focus on opportunities + urgency.
- Must feel like a real assistant briefing.

2. KEY UPDATES
- Only important developments.
- Rewrite clearly (no filler language).

3. CRITICAL ACTIONS
- Only actions that matter NOW.
- Each must be clear and specific.
  GOOD: "Respond to Deloitte recruiter about next interview step"
  BAD: "Review Deloitte email"

4. RISKS
- Only real risks (missed replies, delays, lost opportunities).
- If none, say: "No immediate risks identified"

5. INSIGHTS
- Real patterns: recruiter activity trend, demand trends, opportunity level.
- No generic stats.

6. STRATEGIC RECOMMENDATIONS
- High-level advice: "Prioritize Deloitte over TATA because of X", "Focus on SQL roles as they match 90% of your profile".
- Match opportunities with skills and career goals.

========================
THINKING PROCESS (MANDATORY)
========================
1. Classify emails.
2. Remove noise.
3. Group similar items.
4. Generate sharp, human output.

Return ONLY strict JSON.`
      },
      {
        role: 'user',
        content: `Analyze these communications and generate the executive briefing:\n\n${emailList}\n\nReturn JSON:
{
  "executive_summary": "...",
  "key_updates": ["..."],
  "critical_actions": ["..."],
  "risks": ["..."],
  "insights": ["..."],
  "recommendations": ["..."],
  "priority": "low | medium | high"
} `
      }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(content || '', 'object');
    if (json) {
      const parsed = JSON.parse(json);
      batchSummaryCache.set(cacheKey, { content: parsed, expiry: Date.now() + 5 * 60 * 1000 });
      return parsed;
    }
    return fallback;
  } catch (err) {
    console.error('[Groq] Final Decision Grade Chief of Staff error:', err.message);
    return fallback;
  }
};

/**
 * Smarter Reply Generation with Tone, Context, and Intent
 */
const generateReply = async (emailContent, tone = 'professional', styleProfile = null, intent = 'general') => {
  const parsed = parseEmailContent(emailContent);
  const style = styleProfile ? `Tone: ${styleProfile.tone || tone}, Voice: ${styleProfile.styleSummary || 'Concise'}` : `Tone: ${tone}`;

  const intentInstructions = {
    accept: 'Accept the proposal, invite, or offer enthusiastically.',
    negotiate: 'Ask for more information, suggest a different time, or negotiate terms.',
    decline: 'Politely decline the request or offer with a brief reason.',
    general: 'Provide a helpful and professional response based on the email context.'
  };

  try {
    const content = await requestGroq([
      {
        role: 'system',
        content: `You are a professional email assistant. Write a clear, concise, and context-aware reply.

Rules:
- INTENT: ${intentInstructions[intent] || intentInstructions.general}
- Understand context: job inquiry, interview invite, meeting request, etc.
- Match requested tone: ${style}.
- If it's a job → show interest and enthusiasm.
- If it's a meeting → confirm availability or ask for a link.
- Keep it under 8 lines.
- No placeholders like [Your Name]. Use context or skip.`
      },
      {
        role: 'user',
        content: `Draft a reply to this email:\n\nSubject: ${parsed.subject}\nFrom: ${parsed.sender}\nContent: ${truncateForPrompt(parsed.body)}`
      }
    ], { temperature: 0.7 });

    return content || 'Thank you for your email. I have received it and will follow up shortly.';
  } catch {
    return 'Thank you for your email. I will get back to you soon.';
  }
};

// ─── Legacy Wrappers ───────────────────────────────────────────────────────

const summarizeEmail = async (content, subject = '') => {
  const prompt = `Analyze the following email and generate a structured, action-oriented briefing like a real Chief of Staff.

Focus on:
- What the email is about
- Key details (date, time, location, role)
- Required actions
- Deadlines
- Risks if ignored

========================
IDEAL OUTPUT FORMAT (Strictly follow this for the 'formatted_summary' field)
========================
🚨 Priority: HIGH / MEDIUM / LOW
🏢 Company: [Company Name]
📩 Role / Context: [Role or Purpose]
📌 What This Email Means (1–2 lines)
[Clear explanation in simple language]

⏰ Important Details
Date: [Date]
Time: [Time]
Mode: [Walk-in / Online / Test / etc.]
Location / Link: [Address or URL]

✅ What You Must Do
- Step 1
- Step 2
- Step 3

⚠️ Deadline / Urgency
[Exact deadline or time window]

🎯 Why This Matters
[Short impact statement]

🚫 Risk If Ignored
[What the user loses]

Return ONLY a valid JSON object:
{
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "company": "...",
  "role": "...",
  "action_url": "...",
  "deadline": "...",
  "formatted_summary": "..."
}`;

  try {
    const result = await requestGroq([
      { role: 'system', content: 'You are an email-intelligent briefing system acting as a Chief of Staff. You think, decide, and guide decisions clearly.' },
      { role: 'user', content: `${prompt}\n\nSubject: ${subject}\n\nContent: ${content}` }
    ], { temperature: 0.1 });

    // Try to extract JSON, but if it fails or returns plain text, wrap it.
    const json = extractJsonBlock(result || '', 'object');
    if (json) {
      return json; // Return the JSON string itself to be stored in the summary field
    }

    // Fallback if AI didn't return JSON
    return JSON.stringify({
      priority: "MEDIUM",
      formatted_summary: result || 'No summary available.'
    });
  } catch (error) {
    console.error('[XAI] Summarize error:', error.message);
    return 'No summary available.';
  }
};

const summarizeThread = async (emails = []) => {
  if (!emails.length) return null;

  const threadContent = emails
    .map((e, i) => `[Email ${i + 1}] From: ${e.sender}\nSubject: ${e.subject}\nContent: ${e.body || e.snippet}`)
    .join('\n\n---\n\n');

  const prompt = `Analyze this full email conversation thread and generate a single, actionable briefing for the entire opportunity.

Think like a Chief of Staff:
- What is the current status of this thread?
- What are the cumulative next steps?
- Who is the main company/contact?
- What is the overall priority?

========================
IDEAL OUTPUT FORMAT
========================
🚨 Overall Priority: HIGH / MEDIUM / LOW
🏢 Company: 
📩 Role / Context: 
📌 Thread Summary
[1-2 lines on the current state of the conversation]

✅ Required Actions (Cumulative)
- Step 1
- Step 2

⚠️ Next Deadline
[Upcoming deadline if any]

🎯 Strategic Insight
[Advice on how to handle this thread]

Return ONLY a valid JSON object:
{
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "company": "...",
  "role": "...",
  "summary": "...",
  "action_required": true | false,
  "deadline": "...",
  "formatted_briefing": "..."
}`;

  try {
    const result = await requestGroq([
      { role: 'system', content: 'You provide thread-level intelligence for email conversations.' },
      { role: 'user', content: `${prompt}\n\nThread Content:\n${threadContent}` }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(result || '', 'object');
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error('[XAI] Summarize thread error:', error.message);
    return null;
  }
};

const classifyEmail = async (content) => {
  const prompt = `Classify this email into one of these specific types:
- Interview Invite
- Walk-in Drive
- Job Opening
- Rejection
- Assessment/Test
- General Professional
- Newsletter/Spam

Priority Detection Logic:
- Interview today/tomorrow -> HIGH
- Interview in 2-3 days -> HIGH
- Assessment/Test with deadline < 48h -> HIGH
- Job opening -> MEDIUM
- Newsletter -> LOW

Return ONLY a valid JSON: 
{
  "category": "...", 
  "priority": "high" | "normal" | "low", 
  "labels": ["..."], 
  "actionRequired": true | false
}`;

  const result = await requestGroq([
    { role: 'system', content: 'You are a high-precision email classifier.' },
    { role: 'user', content: `${prompt}\n\nEmail Content:\n${content}` }
  ]);
  
  const json = extractJsonBlock(result) || '{"category":"General Professional","priority":"normal","labels":[],"actionRequired":false}';
  try {
    return JSON.parse(json);
  } catch (e) {
    return {"category":"General Professional","priority":"normal","labels":[],"actionRequired":false};
  }
};

const checkReplyRequired = async (emailContent) => {
  const prompt = `Analyze this SENT email and determine if it requires a reply from the recipient.
  
  Consider:
  - Is there a direct question?
  - Is there a call to action or request?
  - Is it a proposal or application that needs a response?
  - Is it just an acknowledgment or "thank you" (which usually doesn't require a reply)?
  
  Return ONLY a valid JSON:
  {
    "requiresReply": true | false,
    "confidence": 0.0 to 1.0,
    "reason": "short explanation"
  }`;

  try {
    const result = await requestGroq([
      { role: 'system', content: 'You are an email intent analyst focusing on follow-up necessity.' },
      { role: 'user', content: `${prompt}\n\nEmail Content:\n${emailContent}` }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(result) || '{"requiresReply":false,"confidence":0,"reason":"Failed to parse"}';
    return JSON.parse(json);
  } catch (error) {
    console.error('[XAI] checkReplyRequired error:', error.message);
    return { requiresReply: false, confidence: 0, reason: error.message };
  }
};

const summarizeDailyDigest = async (data) => {
  const prompt = `Generate a motivating morning brief based on this data:
  - Emails: ${JSON.stringify(data.emails)}
  - Action Items: ${JSON.stringify(data.actions)}
  - Follow-ups: ${JSON.stringify(data.followups)}
  - Calendar Events: ${JSON.stringify(data.calendarEvents)}
  
  Focus on:
  1. What is the most important thing today? (Check calendar for meetings!)
  2. Summary of key unread emails.
  3. Urgent tasks or follow-ups.
  4. Your schedule for today.
  
  Keep it concise, professional, and helpful. 
  Return ONLY a valid JSON:
  {
    "brief": "A 2-3 sentence overall summary",
    "topPriority": "The single most important task, email, or meeting",
    "emailSummary": "1 sentence summarizing the inbox state",
    "actionSummary": "1 sentence on tasks",
    "scheduleSummary": "1 sentence summarizing today's meetings"
  }`;

  try {
    const result = await requestGroq([
      { role: 'system', content: 'You are a Chief of Staff providing a morning briefing.' },
      { role: 'user', content: prompt }
    ]);

    const json = extractJsonBlock(result) || '{"brief":"Your digest is ready.","topPriority":"Check your inbox","emailSummary":"New emails waiting","actionSummary":"Tasks pending","scheduleSummary":"No meetings scheduled today"}';
    return JSON.parse(json);
  } catch (error) {
    console.error('[XAI] summarizeDailyDigest error:', error.message);
    return { brief: "Error generating brief", topPriority: "N/A", emailSummary: "N/A", actionSummary: "N/A", scheduleSummary: "N/A" };
  }
};

module.exports = {
  summarizeBatchEmails,
  generateReply,
  summarizeEmail,
  summarizeThread,
  classifyEmail,
  checkReplyRequired,
  summarizeDailyDigest,
  requestGroq,
  extractJsonBlock,
  XAI_MODEL
};
