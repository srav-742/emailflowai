const axios = require('axios');

const XAI_API_URL = process.env.XAI_API_URL || 'https://api.x.ai/v1/chat/completions';
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-fast-non-reasoning';

const PRIORITY_LEVELS = new Set(['low', 'medium', 'high']);
const ACTIONABLE_PATTERN =
  /\b(please|can you|could you|kindly|need to|follow up|schedule|send|share|review|submit|prepare|update|reply|deadline|asap|urgent)\b/i;

let xaiTaskCooldownUntil = 0;
let xaiTaskCooldownReason = null;

function cleanJsonBlock(value = '') {
  return value.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function truncateForPrompt(value = '', limit = 1800) {
  const normalized = normalizeWhitespace(value);
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

function extractRateLimitMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    ''
  );
}

function isXAIRateLimitError(error) {
  const code = String(error?.response?.data?.error?.code || error?.code || '').toLowerCase();
  const message = extractRateLimitMessage(error).toLowerCase();

  return code === 'rate_limit_exceeded' || code === 'tokens' || message.includes('rate limit');
}

function isXAICreditsOrPermissionError(error) {
  const code = String(error?.response?.data?.error?.code || error?.code || '').toLowerCase();
  const message = extractRateLimitMessage(error).toLowerCase();

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

function enterXAITaskCooldown(error) {
  const message = extractRateLimitMessage(error);
  const retryAfterMs = parseRetryAfterMs(message) || 15 * 60 * 1000;
  xaiTaskCooldownUntil = Date.now() + retryAfterMs;
  xaiTaskCooldownReason = message;

  console.warn(
    `xAI task extraction is cooling down until ${new Date(xaiTaskCooldownUntil).toLocaleTimeString()}. Falling back to local extraction.`,
  );
}

function isLikelyActionableEmail(email = {}) {
  if (email.actionRequired || email.priority === 'high') {
    return true;
  }

  const content = `${email.subject || ''} ${email.body || ''} ${email.snippet || ''}`;
  return ACTIONABLE_PATTERN.test(content);
}

function sanitizeTask(task, index) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const label = typeof task.task === 'string' ? task.task.trim() : '';
  if (!label) {
    return null;
  }

  const deadline = typeof task.deadline === 'string' && task.deadline.trim() ? task.deadline.trim() : null;
  const rawPriority = typeof task.priority === 'string' ? task.priority.trim().toLowerCase() : 'medium';
  const priority = PRIORITY_LEVELS.has(rawPriority) ? rawPriority : 'medium';

  return {
    id: typeof task.id === 'string' && task.id.trim() ? task.id.trim() : `task-${index + 1}`,
    task: label,
    deadline,
    priority,
    completed: Boolean(task.completed),
  };
}

function dedupeTasks(tasks = []) {
  const uniqueTasks = new Map();

  tasks.forEach((task) => {
    if (!task) {
      return;
    }

    const key = `${task.task.toLowerCase()}::${task.deadline || 'none'}`;
    if (!uniqueTasks.has(key)) {
      uniqueTasks.set(key, task);
    }
  });

  return Array.from(uniqueTasks.values());
}

function parseTasksResponse(value = '') {
  const cleaned = cleanJsonBlock(value);
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeTasks(
      parsed
        .map((task, index) => sanitizeTask(task, index))
        .filter(Boolean),
    );
  } catch {
    return [];
  }
}

function normalizeWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function detectDeadline(sentence = '') {
  const match = sentence.match(
    /\b(?:by|before|on|due|tomorrow|today|tonight|this\s+\w+|next\s+\w+)\b[\w\s,/-]*/i,
  );

  if (!match) {
    return null;
  }

  return normalizeWhitespace(match[0].replace(/^(by|before|on|due)\s+/i, ''));
}

function detectPriority(sentence = '') {
  const normalized = sentence.toLowerCase();

  if (/\b(asap|urgent|immediately|right away|today|tonight)\b/.test(normalized)) {
    return 'high';
  }

  if (/\b(by|before|due|deadline|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next)\b/.test(normalized)) {
    return 'high';
  }

  if (/\b(please|can you|could you|kindly|need to)\b/.test(normalized)) {
    return 'medium';
  }

  return 'low';
}

function cleanTaskLabel(sentence = '') {
  return normalizeWhitespace(
    sentence
      .replace(/^(please|kindly|can you|could you|would you|we need to|you need to)\s+/i, '')
      .replace(/\b(by|before|on|due)\b[\s\S]*$/i, '')
      .replace(/[.?!]+$/g, ''),
  );
}

function extractTasksFallback(email = {}) {
  const content = normalizeWhitespace(`${email.subject || ''}. ${email.body || ''}. ${email.snippet || ''}`);
  if (!content) {
    return [];
  }

  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const actionable = sentences.filter((sentence) =>
    /\b(please|can you|could you|kindly|need to|follow up|schedule|send|share|review|submit|prepare|update|reply)\b/i.test(
      sentence,
    ),
  );

  const tasks = actionable.map((sentence, index) => {
    const task = cleanTaskLabel(sentence);
    if (!task) {
      return null;
    }

    return {
      id: `task-${index + 1}`,
      task: task.charAt(0).toUpperCase() + task.slice(1),
      deadline: detectDeadline(sentence),
      priority: detectPriority(sentence),
      completed: false,
    };
  });

  return dedupeTasks(tasks.filter(Boolean));
}

async function extractTasksWithAI(email = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return extractTasksFallback(email);
  }

  if (!isLikelyActionableEmail(email)) {
    return extractTasksFallback(email);
  }

  if (xaiTaskCooldownUntil > Date.now()) {
    return extractTasksFallback(email);
  }

  if (xaiTaskCooldownUntil && xaiTaskCooldownUntil <= Date.now()) {
    xaiTaskCooldownUntil = 0;
    xaiTaskCooldownReason = null;
  }

  const prompt = [
    'Extract action items from this email.',
    'Return only a JSON array.',
    'Each item must have: id, task, deadline, priority, completed.',
    'Priority must be one of: low, medium, high.',
    'Use completed as false for newly detected tasks.',
    'If no action item exists, return [].',
    '',
    `Subject: ${email.subject || 'No subject'}`,
    `From: ${email.sender || 'Unknown sender'}`,
    `Body: ${truncateForPrompt(email.body || email.snippet || 'No body')}`,
  ].join('\n');

  try {
    const response = await axios.post(
      XAI_API_URL,
      {
        model: XAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You extract structured tasks from emails. Return valid JSON only with no commentary and no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content ?? '';
    const tasks = parseTasksResponse(content);
    return tasks.length ? tasks : extractTasksFallback(email);
  } catch (error) {
    if (isXAIRateLimitError(error) || isXAICreditsOrPermissionError(error)) {
      enterXAITaskCooldown(error);
      return extractTasksFallback(email);
    }

    // Fallback to local extraction on any error
    return extractTasksFallback(email);
  }
}

module.exports = {
  extractTasksFallback,
  extractTasksWithAI,
};
