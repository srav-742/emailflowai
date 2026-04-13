/**
 * AI utilities powered by Groq (llama-3.3-70b-versatile).
 * Groq uses an OpenAI-compatible REST API, so we use axios directly.
 * All exports are identical to the previous xai.js so no downstream changes are needed.
 */

const axios = require('axios');
const { analyzeEmailIntelligence, generateSummary } = require('./classifier');

const GROQ_API_KEY  = process.env.GROQ_API_KEY;
const GROQ_MODEL    = process.env.GROQ_MODEL    || 'llama-3.3-70b-versatile';
const GROQ_API_URL  = process.env.GROQ_API_URL  || 'https://api.groq.com/openai/v1/chat/completions';

// Re-export XAI_MODEL as an alias so server.js / other files still work
const XAI_MODEL = GROQ_MODEL;

const DEFAULT_COOLDOWN_MS            = 2  * 60 * 1000;  // 2 min on rate-limit
const DEFAULT_PERMISSION_COOLDOWN_MS = 30 * 60 * 1000;  // 30 min on auth error

let cooldownUntil = 0;
let cooldownReason = null;

// ─── Low-level HTTP client ─────────────────────────────────────────────────

const groqClient = axios.create({
  baseURL:  GROQ_API_URL,
  headers:  { 'Content-Type': 'application/json' },
  timeout:  30000,
});

// Read the API key dynamically on every request so it's always current
groqClient.interceptors.request.use((config) => {
  const key = process.env.GROQ_API_KEY;
  if (key) config.headers.Authorization = `Bearer ${key}`;
  return config;
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractJsonBlock(value = '', mode = 'object') {
  const pattern = mode === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = value.match(pattern);
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

function getGroqErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    ''
  );
}

function isGroqRateLimitError(error) {
  const status  = Number(error?.response?.status || 0);
  const code    = String(error?.response?.data?.error?.code || '').toLowerCase();
  const message = getGroqErrorMessage(error).toLowerCase();
  return status === 429 || code === 'rate_limit_exceeded' || message.includes('rate limit');
}

function isGroqCreditsOrPermissionError(error) {
  const status  = Number(error?.response?.status || 0);
  const code    = String(error?.response?.data?.error?.code || '').toLowerCase();
  const message = getGroqErrorMessage(error).toLowerCase();
  return (
    status === 401 || status === 403 ||
    code === 'permission_denied' || code === 'insufficient_credits' || code === 'unauthorized' ||
    message.includes('permission') || message.includes('credit') || message.includes('license')
  );
}

// Keep legacy names exported for files that import them directly
const isXAIRateLimitError            = isGroqRateLimitError;
const isXAICreditsOrPermissionError  = isGroqCreditsOrPermissionError;
const getXAIErrorMessage             = getGroqErrorMessage;

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

function normalizePriority(value, fallback = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'normal') return 'medium';
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : fallback;
}

function parseClassificationResponse(value) {
  const match = extractJsonBlock(value, 'object');
  if (!match) return null;
  try {
    const parsed = JSON.parse(match);
    return {
      category:       parsed.category || 'general',
      priority:       normalizePriority(parsed.priority, 'medium'),
      labels:         Array.isArray(parsed.labels) ? parsed.labels : [],
      actionRequired: Boolean(parsed.actionRequired || parsed.action_required),
    };
  } catch {
    return null;
  }
}

function fallbackAnalysis(emailContent) {
  const parsed   = parseEmailContent(emailContent);
  const fallback = analyzeEmailIntelligence({ subject: parsed.subject, snippet: parsed.body, body: parsed.body, sender: parsed.sender });
  return { ...fallback, priority: normalizePriority(fallback.priority, 'medium') };
}

function fallbackStyleProfile(samples = []) {
  const avg = samples.length ? samples.reduce((t, s) => t + s.length, 0) / samples.length : 0;
  return {
    tone:            avg > 420 ? 'formal' : avg > 220 ? 'friendly' : 'casual',
    greetingStyle:   avg > 220 ? 'Warm greeting with recipient name when available' : 'Short greeting',
    signatureStyle:  avg > 220 ? 'Polite sign-off with name' : 'Minimal sign-off',
    sentenceLength:  avg > 520 ? 'long' : avg > 220 ? 'medium' : 'short',
    commonPhrases:   [],
    styleSummary:    avg > 420 ? 'Structured and polished' : avg > 220 ? 'Friendly and concise' : 'Direct and efficient',
    ready:           samples.length >= 5,
    minSamples:      5,
    sampleCount:     samples.length,
  };
}

// ─── Core request wrapper ──────────────────────────────────────────────────

async function requestGroq(messages, overrides = {}) {
  if (!GROQ_API_KEY) {
    console.warn('[Groq] GROQ_API_KEY is not set — falling back to local intelligence.');
    return null;
  }

  if (cooldownUntil > Date.now()) {
    return null;
  }

  if (cooldownUntil && cooldownUntil <= Date.now()) {
    cooldownUntil  = 0;
    cooldownReason = null;
  }

  try {
    const response = await groqClient.post('', {
      model:       GROQ_MODEL,
      messages,
      max_tokens:  overrides.maxTokens  ?? 500,
      temperature: overrides.temperature ?? 0.1,
    });

    return response.data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    const isRate   = isGroqRateLimitError(error);
    const isPerms  = isGroqCreditsOrPermissionError(error);

    if (isRate || isPerms) {
      const retryAfterMs = isPerms
        ? DEFAULT_PERMISSION_COOLDOWN_MS
        : parseRetryAfterMs(getGroqErrorMessage(error)) || DEFAULT_COOLDOWN_MS;

      const nextUntil  = Date.now() + retryAfterMs;
      const nextReason = isPerms ? 'no-credits' : 'rate-limit';
      const shouldLog  = nextUntil > cooldownUntil || nextReason !== cooldownReason;

      cooldownUntil  = nextUntil;
      cooldownReason = nextReason;

      if (shouldLog) {
        if (isPerms) {
          console.warn(`[Groq] Auth/credit error — cooling down for ${Math.round(retryAfterMs / 60000)} min. Falling back to local intelligence.`);
        } else {
          console.warn(`[Groq] Rate-limited — cooling down until ${new Date(cooldownUntil).toLocaleTimeString()}. Falling back to local intelligence.`);
        }
      }
      return null;
    }

    const msg = getGroqErrorMessage(error);
    console.error('[Groq] Unexpected error:', msg || error.message);
    return null;   // graceful fallback on any other error
  }
}

// Keep legacy alias
const requestXAI = requestGroq;

// ─── Email Summarization ───────────────────────────────────────────────────

const summarizeEmail = async (emailContent, subject = '') => {
  const parsed          = parseEmailContent(emailContent);
  const fallbackSummary = generateSummary(subject || parsed.subject, parsed.body || emailContent, parsed.body || emailContent);

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: 'You summarize emails for busy professionals. Provide a concise, high-signal summary in 2–3 sentences. Focus on the core message, any specific requests, and upcoming deadlines.',
        },
        {
          role: 'user',
          content: `Summarize this email:\n\nSubject: ${subject}\n\nContent:\n${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 200, temperature: 0.3 },
    );

    return content || fallbackSummary;
  } catch {
    return fallbackSummary;
  }
};

// ─── Email Classification ──────────────────────────────────────────────────

const classifyEmail = async (emailContent) => {
  const fallback = fallbackAnalysis(emailContent);

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: 'You are an advanced email classifier. Return ONLY valid JSON. No markdown, no commentary.',
        },
        {
          role: 'user',
          content: `Classify this email.

Categories: finance, developer, meetings, clients, operations, legal, hr, travel, newsletter, social, general.
Priority: high (urgent / time-sensitive), normal (standard), low (informational).

Return ONLY this JSON:
{
  "category": "category_name",
  "priority": "high | normal | low",
  "labels": ["label1", "label2"],
  "actionRequired": true|false
}

Email:
${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 180, temperature: 0.1 },
    );

    const parsed = content ? parseClassificationResponse(content) : null;
    return parsed || fallback;
  } catch {
    return fallback;
  }
};

// ─── Batch Inbox Summary (NEW — core feature) ─────────────────────────────

/**
 * Given an array of emails, ask Groq to produce ONE consolidated summary
 * covering all of them: themes, highlights, urgencies, and recommended actions.
 *
 * @param {Array<{subject: string, sender: string, snippet: string, category: string, priority: string}>} emails
 * @returns {Promise<string>}
 */
const summarizeBatchEmails = async (emails = []) => {
  if (!emails.length) return 'No emails to summarize.';

  // Build a numbered list of emails for the prompt
  const emailList = emails
    .slice(0, 20) // cap to avoid token overflow
    .map((e, i) => {
      const priority = (e.priority || 'normal').toUpperCase();
      const subject  = e.subject  || 'No Subject';
      const from     = e.senderName || e.sender || 'Unknown';
      const category = e.category  || 'general';
      const body     = truncateForPrompt(e.summary || e.snippet || '', 180);
      return `${i + 1}. [${priority}] ${subject} — from ${from} | ${category}\n   ${body}`;
    })
    .join('\n\n');

  // Build a meaningful fallback without Groq
  const categories = [...new Set(emails.map((e) => e.category || 'general'))];
  const highCount  = emails.filter((e) => e.priority === 'high').length;
  const fallback   = [
    `You have ${emails.length} email(s) in your inbox.`,
    highCount > 0 ? `${highCount} are marked high priority and may need your attention.` : '',
    `Topics include: ${categories.join(', ')}.`,
  ].filter(Boolean).join(' ');

  if (!GROQ_API_KEY) {
    console.warn('[Groq] GROQ_API_KEY not set — returning fallback summary.');
    return fallback;
  }

  try {
    console.log(`[Groq] Generating batch summary for ${emails.length} email(s)...`);
    const content = await requestGroq(
      [
        {
          role: 'system',
          content:
            'You are EmailFlowAI, an intelligent inbox assistant. When given a batch of emails, produce a single concise executive summary (3–5 sentences max). Highlight the most urgent items, key themes, and one clear recommended next action. Sound calm, professional, and helpful.',
        },
        {
          role: 'user',
          content: `Here are the latest ${emails.length} email(s) in my inbox:\n\n${emailList}\n\nWrite a smart summary of what is happening and what I should focus on first.`,
        },
      ],
      { maxTokens: 400, temperature: 0.4 },
    );

    if (content) {
      console.log('[Groq] Batch summary generated successfully.');
      return content;
    }

    console.warn('[Groq] Batch summary returned empty — using fallback.');
    return fallback;
  } catch (err) {
    console.error('[Groq] Batch summary error:', err.message);
    return fallback;
  }
};

// ─── Writing Style Analysis ────────────────────────────────────────────────

const analyzeWritingStyle = async (samples = []) => {
  const fallback = fallbackStyleProfile(samples);

  if (!samples.length) return fallback;

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: "Analyze a person's writing style from sent emails. Return ONLY valid JSON, no markdown.",
        },
        {
          role: 'user',
          content: `Analyze the user's email writing style.

Return this JSON:
{
  "tone": "formal | casual | friendly | direct",
  "greetingStyle": "how the user usually opens emails",
  "signatureStyle": "how the user usually signs off",
  "sentenceLength": "short | medium | long",
  "commonPhrases": ["phrase 1", "phrase 2"],
  "styleSummary": "one sentence summary of the user's voice"
}

Sent emails:
${truncateForPrompt(samples.join('\n\n---\n\n'), 4000)}`,
        },
      ],
      { maxTokens: 200, temperature: 0.1 },
    );

    const json = extractJsonBlock(content || '', 'object');
    if (!json) return fallback;

    const parsed = JSON.parse(json);
    return {
      tone:           ['formal', 'casual', 'friendly', 'direct'].includes(parsed.tone) ? parsed.tone : fallback.tone,
      greetingStyle:  typeof parsed.greetingStyle === 'string' && parsed.greetingStyle.trim() ? parsed.greetingStyle.trim() : fallback.greetingStyle,
      signatureStyle: typeof parsed.signatureStyle === 'string' && parsed.signatureStyle.trim() ? parsed.signatureStyle.trim() : fallback.signatureStyle,
      sentenceLength: ['short', 'medium', 'long'].includes(parsed.sentenceLength) ? parsed.sentenceLength : fallback.sentenceLength,
      commonPhrases:  Array.isArray(parsed.commonPhrases) ? parsed.commonPhrases.map((p) => String(p).trim()).filter(Boolean).slice(0, 5) : fallback.commonPhrases,
      styleSummary:   typeof parsed.styleSummary === 'string' && parsed.styleSummary.trim() ? parsed.styleSummary.trim() : fallback.styleSummary,
      ready:          samples.length >= 5,
      minSamples:     5,
      sampleCount:    samples.length,
    };
  } catch (error) {
    console.error('[Groq] Style analysis error:', error.message);
    return fallback;
  }
};

// ─── Reply Generation ──────────────────────────────────────────────────────

const generateReply = async (emailContent, tone = 'professional', styleProfile = null) => {
  const fallbackReply = 'Hi,\n\nThanks for the update. I reviewed the email and will follow up shortly.\n\nBest regards,';

  const styleInstruction = styleProfile
    ? `Match the user's learned writing style:
Tone: ${styleProfile.tone || tone}
Greeting: ${styleProfile.greetingStyle || 'Natural, concise greeting'}
Sign-off: ${styleProfile.signatureStyle || 'Polite sign-off'}
Sentence length: ${styleProfile.sentenceLength || 'medium'}
Common phrases: ${(styleProfile.commonPhrases || []).join(', ') || 'none'}`
    : 'No learned style available — use a professional tone.';

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: `You write polished, ready-to-send email replies. Tone: ${tone}. ${styleInstruction} Never use placeholders like [Name]. If details are unknown, be politely vague.`,
        },
        {
          role: 'user',
          content: `Draft a ${tone} reply to this email:\n\n${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 450, temperature: 0.5 },
    );

    return content || fallbackReply;
  } catch (error) {
    console.error('[Groq] Reply generation error:', error.message);
    return fallbackReply;
  }
};

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  summarizeEmail,
  classifyEmail,
  generateReply,
  analyzeWritingStyle,
  summarizeBatchEmails,
  requestXAI,
  requestGroq,
  getXAIErrorMessage,
  getGroqErrorMessage,
  isXAIRateLimitError,
  isXAICreditsOrPermissionError,
  isGroqRateLimitError,
  isGroqCreditsOrPermissionError,
  XAI_MODEL,
  GROQ_MODEL,
};
