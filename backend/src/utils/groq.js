const axios = require('axios');
const { analyzeEmailIntelligence, generateSummary } = require('./classifier');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_COOLDOWN_MS = 15 * 60 * 1000;

let groqCooldownUntil = 0;

const groqClient = axios.create({
  baseURL: GROQ_API_URL,
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 25000,
});

function extractJsonBlock(value = '', mode = 'object') {
  const pattern = mode === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = value.match(pattern);

  if (!match) {
    return null;
  }

  return match[0];
}

function truncateForPrompt(value = '', limit = 3200) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trim()}...`;
}

function parseRetryAfterMs(message = '') {
  const retryMatch = String(message).match(/try again in\s+((?:\d+(?:\.\d+)?h)?(?:\d+(?:\.\d+)?m)?(?:\d+(?:\.\d+)?s)?)/i);
  if (!retryMatch?.[1]) {
    return null;
  }

  const durationText = retryMatch[1];
  const hourMatch = durationText.match(/(\d+(?:\.\d+)?)h/i);
  const minuteMatch = durationText.match(/(\d+(?:\.\d+)?)m/i);
  const secondMatch = durationText.match(/(\d+(?:\.\d+)?)s/i);

  const hours = hourMatch ? Number.parseFloat(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number.parseFloat(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number.parseFloat(secondMatch[1]) : 0;
  const totalMs = ((hours * 60 * 60) + (minutes * 60) + seconds) * 1000;

  return Number.isFinite(totalMs) && totalMs > 0 ? totalMs : null;
}

function getGroqErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    ''
  );
}

function isGroqRateLimitError(error) {
  const code = String(error?.response?.data?.error?.code || error?.code || '').toLowerCase();
  const message = getGroqErrorMessage(error).toLowerCase();

  return code === 'rate_limit_exceeded' || code === 'tokens' || message.includes('rate limit');
}

function normalizePriority(value, fallback = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'normal') {
    return 'medium';
  }

  if (['low', 'medium', 'high'].includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function parseClassificationResponse(value) {
  const match = extractJsonBlock(value, 'object');

  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match);
    return {
      category: parsed.category || 'general',
      priority: normalizePriority(parsed.priority, 'medium'),
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      actionRequired: Boolean(parsed.actionRequired || parsed.action_required),
    };
  } catch {
    return null;
  }
}

function fallbackAnalysis(emailContent) {
  const fallback = analyzeEmailIntelligence({
    subject: '',
    snippet: emailContent,
    body: emailContent,
  });

  return {
    ...fallback,
    priority: normalizePriority(fallback.priority, 'medium'),
  };
}

function fallbackStyleProfile(samples = []) {
  const averageLength = samples.length
    ? samples.reduce((total, sample) => total + sample.length, 0) / samples.length
    : 0;

  return {
    tone: averageLength > 420 ? 'formal' : averageLength > 220 ? 'friendly' : 'casual',
    length: averageLength > 520 ? 'long' : averageLength > 220 ? 'medium' : 'short',
    sampleCount: samples.length,
  };
}

async function requestGroq(messages, overrides = {}) {
  if (!GROQ_API_KEY) {
    return null;
  }

  if (groqCooldownUntil > Date.now()) {
    return null;
  }

  if (groqCooldownUntil && groqCooldownUntil <= Date.now()) {
    groqCooldownUntil = 0;
  }

  try {
    const response = await groqClient.post('', {
      model: GROQ_MODEL,
      messages,
      max_tokens: overrides.maxTokens ?? 500,
      temperature: overrides.temperature ?? 0.1,
    });

    return response.data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    if (isGroqRateLimitError(error)) {
      const retryAfterMs = parseRetryAfterMs(getGroqErrorMessage(error)) || DEFAULT_GROQ_COOLDOWN_MS;
      groqCooldownUntil = Date.now() + retryAfterMs;
      console.warn(
        `Groq AI is cooling down until ${new Date(groqCooldownUntil).toLocaleTimeString()}. Falling back to local intelligence.`,
      );
      return null;
    }

    throw error;
  }
}

const summarizeEmail = async (emailContent, subject = '') => {
  const fallbackSummary = generateSummary(subject, emailContent, emailContent);

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: 'You summarize emails for busy professionals. Provide a concise, high-signal summary of no more than 3 sentences. Focus on the core message, any specific requests, and upcoming deadlines.',
        },
        {
          role: 'user',
          content: `Please provide an excellent summary for this email:\n\nSubject: ${subject}\n\nContent:\n${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 250, temperature: 0.3 },
    );

    return content || fallbackSummary;
  } catch (error) {
    console.error('Groq summarize error:', error.response?.data || error.message);
    return fallbackSummary;
  }
};

const classifyEmail = async (emailContent) => {
  const fallback = fallbackAnalysis(emailContent);

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: 'You are an advanced email classifier. Your goal is to provide perfect classification results in a structured JSON format.',
        },
        {
          role: 'user',
          content: `Carefully analyze this email content and classify it.
Determine the category, priority (high, normal, low), relevant labels (at least 2), and if a response is required from the reader.

Categories: finance, developer, meetings, clients, operations, legal, hr, travel, newsletter, social, general.
Priority: high (urgent, time-sensitive), normal (standard), low (can wait).

Return ONLY JSON in this format:
{
  "category": "category_name",
  "priority": "high | medium | low",
  "labels": ["label1", "label2"],
  "actionRequired": true|false
}

Email Content:
${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 200, temperature: 0.1 },
    );

    const parsed = content ? parseClassificationResponse(content) : null;
    return parsed || fallback;
  } catch (error) {
    console.error('Groq classify error:', error.response?.data || error.message);
    return fallback;
  }
};

const analyzeWritingStyle = async (samples = []) => {
  const fallback = fallbackStyleProfile(samples);

  if (!samples.length) {
    return fallback;
  }

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content:
            'You analyze a person\'s writing style from sent emails. Return valid JSON only and do not include markdown.',
        },
        {
          role: 'user',
          content: `Analyze the user's email writing style.

Return JSON in this format:
{
  "tone": "formal | casual | friendly",
  "length": "short | medium | long"
}

Sent emails:
${truncateForPrompt(samples.join('\n\n---\n\n'), 4000)}`,
        },
      ],
      { maxTokens: 180, temperature: 0.1 },
    );

    const json = extractJsonBlock(content || '', 'object');
    if (!json) {
      return fallback;
    }

    const parsed = JSON.parse(json);
    return {
      tone: ['formal', 'casual', 'friendly'].includes(parsed.tone) ? parsed.tone : fallback.tone,
      length: ['short', 'medium', 'long'].includes(parsed.length) ? parsed.length : fallback.length,
      sampleCount: samples.length,
    };
  } catch (error) {
    console.error('Groq style analysis error:', error.response?.data || error.message);
    return fallback;
  }
};

const generateReply = async (emailContent, tone = 'professional', styleProfile = null) => {
  const fallbackReply = [
    'Hi,',
    '',
    `Thanks for the update. I reviewed the email and will follow up shortly.`,
    '',
    'Best regards,',
  ].join('\n');

  const styleInstruction = styleProfile
    ? `Match the user's learned style as closely as possible.
Preferred tone: ${styleProfile.tone || tone}
Preferred length: ${styleProfile.length || 'medium'}.`
    : 'No learned style is available yet.';

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: `You write polished email replies. The tone should be ${tone}. ${styleInstruction} Keep the response concise, helpful, and ready to send. DO NOT include any placeholders like [Name]. If properties are unknown, be vague but polite.`,
        },
        {
          role: 'user',
          content: `Draft a perfect ${tone} response to this email:\n\n${truncateForPrompt(emailContent)}`,
        },
      ],
      { maxTokens: 450, temperature: 0.5 },
    );

    return content || fallbackReply;
  } catch (error) {
    console.error('Groq reply error:', error.response?.data || error.message);
    return fallbackReply;
  }
};

module.exports = { summarizeEmail, classifyEmail, generateReply, requestGroq, analyzeWritingStyle };
