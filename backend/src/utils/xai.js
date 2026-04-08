const axios = require('axios');
const { analyzeEmailIntelligence, generateSummary } = require('./classifier');

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-fast-non-reasoning';
const XAI_API_URL = process.env.XAI_API_URL || 'https://api.x.ai/v1/chat/completions';
const DEFAULT_XAI_COOLDOWN_MS = 15 * 60 * 1000;

let xaiCooldownUntil = 0;

const xaiClient = axios.create({
  baseURL: XAI_API_URL,
  headers: {
    Authorization: `Bearer ${XAI_API_KEY}`,
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

function getXAIErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    ''
  );
}

function isXAIRateLimitError(error) {
  const code = String(error?.response?.data?.error?.code || error?.code || '').toLowerCase();
  const message = getXAIErrorMessage(error).toLowerCase();

  return code === 'rate_limit_exceeded' || code === 'tokens' || message.includes('rate limit');
}

function isXAICreditsOrPermissionError(error) {
  const code = String(error?.response?.data?.error?.code || error?.code || '').toLowerCase();
  const message = getXAIErrorMessage(error).toLowerCase();

  return (
    code === 'permission_denied' ||
    code === 'insufficient_credits' ||
    code === 'unauthorized' ||
    message.includes('permission') ||
    message.includes('credit') ||
    message.includes('license') ||
    message.includes('does not have permission')
  );
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
    greetingStyle: averageLength > 220 ? 'Warm greeting with recipient name when available' : 'Short greeting',
    signatureStyle: averageLength > 220 ? 'Polite sign-off with name' : 'Minimal sign-off',
    sentenceLength: averageLength > 520 ? 'long' : averageLength > 220 ? 'medium' : 'short',
    commonPhrases: [],
    styleSummary: averageLength > 420 ? 'Structured and polished' : averageLength > 220 ? 'Friendly and concise' : 'Direct and efficient',
    ready: samples.length >= 5,
    minSamples: 5,
    sampleCount: samples.length,
  };
}

async function requestXAI(messages, overrides = {}) {
  if (!XAI_API_KEY) {
    return null;
  }

  if (xaiCooldownUntil > Date.now()) {
    return null;
  }

  if (xaiCooldownUntil && xaiCooldownUntil <= Date.now()) {
    xaiCooldownUntil = 0;
  }

  try {
    const response = await xaiClient.post('', {
      model: XAI_MODEL,
      messages,
      max_tokens: overrides.maxTokens ?? 500,
      temperature: overrides.temperature ?? 0.1,
    });

    return response.data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    if (isXAIRateLimitError(error) || isXAICreditsOrPermissionError(error)) {
      const retryAfterMs = parseRetryAfterMs(getXAIErrorMessage(error)) || DEFAULT_XAI_COOLDOWN_MS;
      xaiCooldownUntil = Date.now() + retryAfterMs;

      if (isXAICreditsOrPermissionError(error)) {
        console.warn(
          `xAI unavailable: No credits/licenses. Falling back to local intelligence for ${Math.round(retryAfterMs / 1000 / 60)} minutes.`,
        );
      } else {
        console.warn(
          `xAI is cooling down until ${new Date(xaiCooldownUntil).toLocaleTimeString()}. Falling back to local intelligence.`,
        );
      }
      return null;
    }

    throw error;
  }
}

const summarizeEmail = async (emailContent, subject = '') => {
  const fallbackSummary = generateSummary(subject, emailContent, emailContent);

  try {
    const content = await requestXAI(
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
    // Fallback to local summary on any error
    return fallbackSummary;
  }
};

const classifyEmail = async (emailContent) => {
  const fallback = fallbackAnalysis(emailContent);

  try {
    const content = await requestXAI(
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
    // Fallback to local analysis on any error
    return fallback;
  }
};

const analyzeWritingStyle = async (samples = []) => {
  const fallback = fallbackStyleProfile(samples);

  if (!samples.length) {
    return fallback;
  }

  try {
    const content = await requestXAI(
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
      { maxTokens: 180, temperature: 0.1 },
    );

    const json = extractJsonBlock(content || '', 'object');
    if (!json) {
      return fallback;
    }

    const parsed = JSON.parse(json);
    return {
      tone: ['formal', 'casual', 'friendly', 'direct'].includes(parsed.tone) ? parsed.tone : fallback.tone,
      greetingStyle: typeof parsed.greetingStyle === 'string' && parsed.greetingStyle.trim() ? parsed.greetingStyle.trim() : fallback.greetingStyle,
      signatureStyle: typeof parsed.signatureStyle === 'string' && parsed.signatureStyle.trim() ? parsed.signatureStyle.trim() : fallback.signatureStyle,
      sentenceLength: ['short', 'medium', 'long'].includes(parsed.sentenceLength) ? parsed.sentenceLength : fallback.sentenceLength,
      commonPhrases: Array.isArray(parsed.commonPhrases) ? parsed.commonPhrases.map((phrase) => String(phrase).trim()).filter(Boolean).slice(0, 5) : fallback.commonPhrases,
      styleSummary: typeof parsed.styleSummary === 'string' && parsed.styleSummary.trim() ? parsed.styleSummary.trim() : fallback.styleSummary,
      ready: samples.length >= 5,
      minSamples: 5,
      sampleCount: samples.length,
    };
  } catch (error) {
    console.error('xAI style analysis error:', error.response?.data || error.message);
    return fallback;
  }
};

const generateReply = async (emailContent, tone = 'professional', styleProfile = null) => {
  const fallbackReply = [
    'Hi,',
    '',
    'Thanks for the update. I reviewed the email and will follow up shortly.',
    '',
    'Best regards,',
  ].join('\n');

  const styleInstruction = styleProfile
    ? `Match the user's learned style as closely as possible.
Preferred tone: ${styleProfile.tone || tone}
Greeting style: ${styleProfile.greetingStyle || 'Natural, concise greeting'}.
Signature style: ${styleProfile.signatureStyle || 'Polite sign-off'}.
Sentence length: ${styleProfile.sentenceLength || 'medium'}.
Common phrases to echo when natural: ${(styleProfile.commonPhrases || []).join(', ') || 'none'}.`
    : 'No learned style is available yet.';

  try {
    const content = await requestXAI(
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
    console.error('xAI reply error:', error.response?.data || error.message);
    return fallbackReply;
  }
};

module.exports = {
  summarizeEmail,
  classifyEmail,
  generateReply,
  requestXAI,
  analyzeWritingStyle,
  XAI_MODEL,
};
