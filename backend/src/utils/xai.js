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

function isUsefulText(value = '') {
  const text = String(value || '').trim();
  return Boolean(text) && !/no summary available/i.test(text);
}

function normalizeList(values = [], limit = 5) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, limit)
    : [];
}

function normalizePriority(value = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'normal') return 'medium';
  if (['high', 'medium', 'low'].includes(normalized)) return normalized;
  return 'medium';
}

function formatSenderLabel(sender = '') {
  const raw = String(sender || '').trim();
  if (!raw) return 'Unknown sender';

  const match = raw.match(/^(.*?)\s*<.+>$/);
  return (match?.[1] || raw).replace(/["']/g, '').trim() || raw;
}

function inferCompanyLabel(sender = '', subject = '') {
  const senderLabel = formatSenderLabel(sender);
  if (senderLabel && !senderLabel.includes('@')) {
    return senderLabel;
  }

  const domainMatch = String(sender || '').match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (domainMatch?.[1]) {
    const parts = domainMatch[1].replace(/^mail\./i, '').split('.');
    if (parts.length > 1) {
      return parts[0]
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  const subjectMatch = String(subject || '').match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  return subjectMatch?.[1]?.trim() || senderLabel || 'Unknown contact';
}

function extractFirstUrl(value = '') {
  const text = String(value || '');
  // More robust URL extraction, avoiding common image/tracking patterns
  const matches = text.matchAll(/https?:\/\/\S+/gi);
  const ignorePatterns = [
    /sendgrid\.net/i, /doubleclick\.net/i, /google-analytics\.com/i, 
    /pixel/i, /track/i, /open/i, /beacon/i, /logo/i, /\.png/i, /\.jpg/i, /\.gif/i, /\.jpeg/i, /\.svg/i,
    /favicon/i, /static/i, /assets/i
  ];

  for (const match of matches) {
    const url = match[0].replace(/[)>.,'"]+$/g, '');
    if (!ignorePatterns.some(p => p.test(url))) {
      return url;
    }
  }
  return null;
}

function extractDeadlineText(value = '') {
  const match = String(value || '').match(
    /\b(?:by|before|due|on)\s+(?:today|tonight|tomorrow|eod|eow|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|[A-Z][a-z]+\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i,
  );
  return match ? match[0] : null;
}

function formatRuleSummary(summary = '') {
  return String(summary || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('OVERVIEW:')) return `What this email means: ${trimmed.slice('OVERVIEW:'.length).trim()}`;
      if (trimmed.startsWith('ACTION:')) return `Next step: ${trimmed.slice('ACTION:'.length).trim()}`;
      if (trimmed.startsWith('TIMELINE:')) return `Timeline: ${trimmed.slice('TIMELINE:'.length).trim()}`;
      return trimmed;
    })
    .filter(Boolean)
    .join('\n');
}

function scoreBriefingEmail(email = {}) {
  const text = `${email.subject || ''} ${email.body || email.snippet || ''}`.toLowerCase();
  let score = 0;

  if (email.actionRequired) score += 120;
  if (email.priority === 'high') score += 100;
  if (email.priority === 'normal') score += 45;
  if (email.isRead === false) score += 20;

  if (['developer', 'finance', 'meetings', 'focus_today', 'operations', 'clients', 'legal'].includes(email.category)) {
    score += 35;
  }

  if (['newsletter', 'social', 'read_later'].includes(email.category)) {
    score -= 60;
  }

  if (/\b(reply|respond|deadline|interview|assessment|deploy|incident|meeting|invoice|payment|action required|follow up)\b/.test(text)) {
    score += 35;
  }

  if (/\b(unsubscribe|sale|promotion|weekly digest|newsletter)\b/.test(text)) {
    score -= 45;
  }

  return score;
}

function buildBatchSummaryFallback(cleanEmails = []) {
  const actionableEmails = cleanEmails.filter((email) => email.actionRequired || email.priority === 'high');
  const focusEmails = (actionableEmails.length ? actionableEmails : cleanEmails).slice(0, 4);
  const focusSubjects = focusEmails.map((email) => email.subject).filter(Boolean);
  const topSubjectList = focusSubjects.slice(0, 2).join('; ');
  const priority = actionableEmails.length ? 'high' : cleanEmails.some((email) => email.priority === 'normal') ? 'medium' : 'low';

  const executiveSummary = actionableEmails.length
    ? `${actionableEmails.length} urgent email${actionableEmails.length > 1 ? 's need' : ' needs'} attention. Highest-signal items: ${topSubjectList || 'review your top active threads'}.`
    : `Inbox is stable. Current focus is ${topSubjectList || 'the latest active conversations'}.`;

  const keyUpdates = focusEmails.map((email) => `${email.from}: ${email.subject}`);
  const criticalActions = focusEmails
    .filter((email) => email.actionRequired || email.priority === 'high')
    .map((email) => `Respond to ${email.from} about ${email.subject}`)
    .slice(0, 4);

  const risks = actionableEmails
    .slice(0, 3)
    .map((email) => `A delayed response to ${email.from} on "${email.subject}" could slow progress.`);

  const categoryCounts = cleanEmails.reduce((acc, email) => {
    const key = email.category || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topCategory = Object.entries(categoryCounts).sort((left, right) => right[1] - left[1])[0]?.[0];
  const insights = [];

  if (topCategory) {
    insights.push(`Most active lane right now: ${topCategory.replace(/_/g, ' ')}.`);
  }
  if (actionableEmails.length) {
    insights.push(`Action-required traffic is concentrated in ${actionableEmails.length} active thread${actionableEmails.length > 1 ? 's' : ''}.`);
  } else {
    insights.push('No high-risk inbox items are crowding the top of the queue.');
  }

  const recommendations = actionableEmails.length
    ? actionableEmails.slice(0, 3).map((email) => `Start with ${email.subject} from ${email.from}.`)
    : ['Continue triaging the newest non-newsletter conversations first.'];

  return {
    executive_summary: executiveSummary,
    key_updates: keyUpdates,
    critical_actions: criticalActions.length ? criticalActions : ['Review your newest active threads and reply where needed.'],
    risks,
    insights,
    recommendations,
    priority,
  };
}

function normalizeBriefingResult(parsed, fallback) {
  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  const priority = normalizePriority(parsed.priority || fallback.priority);
  const keyUpdates = normalizeList(parsed.key_updates, 5);
  const criticalActions = normalizeList(parsed.critical_actions, 5);
  const risks = normalizeList(parsed.risks, 5);
  const insights = normalizeList(parsed.insights, 5);
  const recommendations = normalizeList(parsed.recommendations, 5);

  return {
    executive_summary: isUsefulText(parsed.executive_summary) ? parsed.executive_summary.trim() : fallback.executive_summary,
    key_updates: keyUpdates.length ? keyUpdates : fallback.key_updates,
    critical_actions: criticalActions.length ? criticalActions : fallback.critical_actions,
    risks: risks.length ? risks : fallback.risks,
    insights: insights.length ? insights : fallback.insights,
    recommendations: recommendations.length ? recommendations : fallback.recommendations,
    priority,
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
  const ignoreWords = ['neighbor crush', 'joke', 'meme'];

  const filtered = emails.filter((email) => {
    if (!email?.subject?.trim()) return false;
    if (!(email.body?.trim() || email.snippet?.trim())) return false;

    const text = `${email.subject} ${email.body || email.snippet || ''}`.toLowerCase();
    return !ignoreWords.some((word) => text.includes(word));
  });

  const rankedEmails = filtered
    .map((email) => ({ email, score: scoreBriefingEmail(email) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.email.receivedAt || right.email.createdAt || 0).getTime()
        - new Date(left.email.receivedAt || left.email.createdAt || 0).getTime();
    });

  const uniqueEmails = [];
  const seenSubjects = new Set();

  for (const { email } of rankedEmails) {
    const key = String(email.subject || '').trim().toLowerCase();
    if (!key || seenSubjects.has(key)) {
      continue;
    }

    seenSubjects.add(key);
    uniqueEmails.push(email);
  }

  return uniqueEmails.slice(0, 20).map((email) => ({
    from: formatSenderLabel(email.senderName || email.sender || 'Unknown sender'),
    subject: String(email.subject || '').trim(),
    content: truncateForPrompt(email.body || email.snippet || '', 300),
    priority: normalizePriority(email.priority),
    category: email.category || 'other',
    actionRequired: Boolean(email.actionRequired),
    receivedAt: email.receivedAt || email.createdAt || null,
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

  const fallback = buildBatchSummaryFallback(cleanEmails);

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
      const normalized = normalizeBriefingResult(parsed, fallback);
      batchSummaryCache.set(cacheKey, { content: normalized, expiry: Date.now() + 5 * 60 * 1000 });
      return normalized;
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
  const parsedEmail = parseEmailContent(content);
  const intelligence = analyzeEmailIntelligence({
    subject,
    body: parsedEmail.body,
    snippet: truncateForPrompt(parsedEmail.body, 240),
    sender: parsedEmail.sender,
  });
  const fallbackSummary = {
    priority: intelligence.priority.toUpperCase(),
    company: inferCompanyLabel(parsedEmail.sender, subject),
    role: subject || 'Email update',
    action_url: extractFirstUrl(content),
    deadline: extractDeadlineText(`${subject}\n${parsedEmail.body}`) || 'No specific deadline mentioned',
    formatted_summary: [
      formatRuleSummary(intelligence.summary),
      !intelligence.actionRequired && intelligence.priority !== 'high'
        ? 'Next step: Keep this item visible and revisit if a reply is needed.'
        : null,
    ].filter(Boolean).join('\n'),
  };

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
  "action_url": "Extract the primary CTA URL if any (e.g., Apply, Confirm, Join, Register). IGNORE image or tracking links.",
  "deadline": "...",
  "formatted_summary": "..."
}`;

  try {
    const result = await requestGroq([
      { role: 'system', content: 'You are an email-intelligent briefing system acting as a Chief of Staff. You think, decide, and guide decisions clearly.' },
      { role: 'user', content: `${prompt}\n\nSubject: ${subject}\n\nContent: ${content}` }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(result || '', 'object');
    if (json) {
      try {
        const aiSummary = JSON.parse(json);
        return JSON.stringify({
          ...fallbackSummary,
          ...aiSummary,
          priority: String(aiSummary.priority || fallbackSummary.priority).toUpperCase(),
          company: isUsefulText(aiSummary.company) ? aiSummary.company : fallbackSummary.company,
          role: isUsefulText(aiSummary.role) ? aiSummary.role : fallbackSummary.role,
          action_url: isUsefulText(aiSummary.action_url) ? aiSummary.action_url : fallbackSummary.action_url,
          deadline: isUsefulText(aiSummary.deadline) ? aiSummary.deadline : fallbackSummary.deadline,
          formatted_summary: isUsefulText(aiSummary.formatted_summary) ? aiSummary.formatted_summary : fallbackSummary.formatted_summary,
        });
      } catch (error) {
        return JSON.stringify(fallbackSummary);
      }
    }

    return JSON.stringify({
      ...fallbackSummary,
      formatted_summary: isUsefulText(result) ? result : fallbackSummary.formatted_summary,
    });
  } catch (error) {
    console.error('[XAI] Summarize error:', error.message);
    return JSON.stringify(fallbackSummary);
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
