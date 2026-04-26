/**
 * Task extractor — powered by Groq (llama-3.3-70b-versatile).
 * Identical public API to the previous xAI version.
 */

const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = process.env.GROQ_MODEL  || 'llama-3.3-70b-versatile';
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

const PRIORITY_LEVELS = new Set(['low', 'medium', 'high']);
const ACTIONABLE_PATTERN =
  /\b(please|can you|could you|kindly|need to|follow up|schedule|send|share|review|submit|prepare|update|reply|deadline|asap|urgent)\b/i;

let taskCooldownUntil  = 0;
let taskCooldownReason = null;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateForPrompt(value = '', limit = 1800) {
  const normalized = normalizeWhitespace(value);
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit).trim()}...`;
}

function cleanJsonBlock(value = '') {
  return value.replace(/```json/gi, '').replace(/```/g, '').trim();
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

function extractRateLimitMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    ''
  );
}

function isGroqRateLimitError(error) {
  const status  = Number(error?.response?.status || 0);
  const code    = String(error?.response?.data?.error?.code || '').toLowerCase();
  const message = extractRateLimitMessage(error).toLowerCase();
  return status === 429 || code === 'rate_limit_exceeded' || message.includes('rate limit');
}

function isGroqCreditsOrPermissionError(error) {
  const status  = Number(error?.response?.status || 0);
  const code    = String(error?.response?.data?.error?.code || '').toLowerCase();
  const message = extractRateLimitMessage(error).toLowerCase();
  return (
    status === 401 || status === 403 ||
    code === 'permission_denied' || code === 'insufficient_credits' || code === 'unauthorized' ||
    message.includes('permission') || message.includes('credit') || message.includes('license')
  );
}

function enterTaskCooldown(error) {
  const message       = extractRateLimitMessage(error);
  let retryAfterMs    = parseRetryAfterMs(message) || 2 * 60 * 1000;
  
  // Cap cooldown to 15 minutes max
  if (retryAfterMs > 15 * 60 * 1000) {
    retryAfterMs = 15 * 60 * 1000;
  }

  taskCooldownUntil   = Date.now() + retryAfterMs;
  taskCooldownReason  = message;
  console.warn(`[Groq/Tasks] Cooling down until ${new Date(taskCooldownUntil).toLocaleTimeString()}. Falling back to local extraction.`);
}

// ─── Task validation & deduplication ──────────────────────────────────────

function sanitizeTask(task, index) {
  if (!task || typeof task !== 'object') return null;
  const label = typeof task.task === 'string' ? task.task.trim() : '';
  if (!label) return null;
  const deadline    = typeof task.deadline === 'string' && task.deadline.trim() ? task.deadline.trim() : null;
  const rawPriority = typeof task.priority === 'string' ? task.priority.trim().toLowerCase() : 'medium';
  const priority    = PRIORITY_LEVELS.has(rawPriority) ? rawPriority : 'medium';
  return {
    id:        typeof task.id === 'string' && task.id.trim() ? task.id.trim() : `task-${index + 1}`,
    task:      label,
    deadline,
    priority,
    completed: Boolean(task.completed),
  };
}

function dedupeTasks(tasks = []) {
  const seen = new Map();
  tasks.forEach((task) => {
    if (!task) return;
    const key = `${task.task.toLowerCase()}::${task.deadline || 'none'}`;
    if (!seen.has(key)) seen.set(key, task);
  });
  return Array.from(seen.values());
}

function parseTasksResponse(value = '') {
  const cleaned     = cleanJsonBlock(value);
  const arrayMatch  = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return dedupeTasks(parsed.map((t, i) => sanitizeTask(t, i)).filter(Boolean));
  } catch {
    return [];
  }
}

// ─── Local (rule-based) fallback ───────────────────────────────────────────

function detectDeadline(sentence = '') {
  const match = sentence.match(
    /\b(?:by|before|on|due|tomorrow|today|tonight|this\s+\w+|next\s+\w+)\b[\w\s,/-]*/i,
  );
  if (!match) return null;
  return normalizeWhitespace(match[0].replace(/^(by|before|on|due)\s+/i, ''));
}

function detectPriority(sentence = '') {
  const n = sentence.toLowerCase();
  if (/\b(asap|urgent|immediately|right away|today|tonight)\b/.test(n)) return 'high';
  if (/\b(by|before|due|deadline|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next)\b/.test(n)) return 'high';
  if (/\b(please|can you|could you|kindly|need to)\b/.test(n)) return 'medium';
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
  if (!content) return [];

  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const actionable = sentences.filter((s) =>
    /\b(please|can you|could you|kindly|need to|follow up|schedule|send|share|review|submit|prepare|update|reply)\b/i.test(s),
  );

  return dedupeTasks(
    actionable
      .map((s, i) => {
        const task = cleanTaskLabel(s);
        if (!task) return null;
        return {
          id:        `task-${i + 1}`,
          task:      task.charAt(0).toUpperCase() + task.slice(1),
          deadline:  detectDeadline(s),
          priority:  detectPriority(s),
          completed: false,
        };
      })
      .filter(Boolean),
  );
}

function isLikelyActionableEmail(email = {}) {
  if (email.actionRequired || email.priority === 'high') return true;
  const content = `${email.subject || ''} ${email.body || ''} ${email.snippet || ''}`;
  return ACTIONABLE_PATTERN.test(content);
}

// ─── Main AI-powered extraction ────────────────────────────────────────────

async function extractTasksWithAI(email = {}) {
  if (!GROQ_API_KEY)                       return extractTasksFallback(email);
  if (!isLikelyActionableEmail(email))     return extractTasksFallback(email);
  if (taskCooldownUntil > Date.now())      return extractTasksFallback(email);

  if (taskCooldownUntil && taskCooldownUntil <= Date.now()) {
    taskCooldownUntil  = 0;
    taskCooldownReason = null;
  }

  const prompt = [
    'You are a high-precision task extraction engine. Extract ALL actionable items, requests, and deadlines from this email.',
    'RULES:',
    '1. Return ONLY a valid JSON array. No markdown, no preamble, no "Here is the JSON".',
    '2. Each object must have: "id" (unique string), "task" (clear description), "deadline" (date or time if mentioned, else null), "priority" (low|medium|high), "completed" (false).',
    '3. If the sender asks for something (e.g. "Can you send the report?"), it IS a task.',
    '4. If a deadline is implicit (e.g. "by EOD tomorrow"), resolve it to a readable format.',
    '5. If NO actionable items are found, return exactly [].',
    '',
    `Subject: ${email.subject || 'No subject'}`,
    `From: ${email.sender || 'Unknown sender'}`,
    `Body: ${truncateForPrompt(email.body || email.snippet || 'No body', 2500)}`,
  ].join('\n');

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You extract structured tasks from emails. Return ONLY valid JSON arrays. No markdown, no commentary.' },
          { role: 'user',   content: prompt },
        ],
        temperature: 0.1,
        max_tokens:  500,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content ?? '';
    const tasks   = parseTasksResponse(content);
    return tasks.length ? tasks : extractTasksFallback(email);
  } catch (error) {
    if (isGroqRateLimitError(error) || isGroqCreditsOrPermissionError(error)) {
      enterTaskCooldown(error);
    }
    return extractTasksFallback(email);
  }
}

module.exports = {
  extractTasksFallback,
  extractTasksWithAI,
};
