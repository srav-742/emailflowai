const axios = require('axios');
const { analyzeEmailIntelligence, generateSummary } = require('./classifier');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const groqClient = axios.create({
  baseURL: GROQ_API_URL,
  headers: {
    Authorization: `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 25000,
});

function parseJsonResponse(value) {
  const match = value.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]);
    // Ensure all fields exist
    return {
      category: parsed.category || 'general',
      priority: parsed.priority || 'normal',
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      actionRequired: Boolean(parsed.actionRequired || parsed.action_required),
    };
  } catch {
    return null;
  }
}

function fallbackAnalysis(emailContent) {
  return analyzeEmailIntelligence({
    subject: '',
    snippet: emailContent,
    body: emailContent,
  });
}

async function requestGroq(messages, overrides = {}) {
  if (!GROQ_API_KEY) {
    return null;
  }

  const response = await groqClient.post('', {
    model: GROQ_MODEL,
    messages,
    max_tokens: overrides.maxTokens ?? 500,
    temperature: overrides.temperature ?? 0.1,
  });

  return response.data?.choices?.[0]?.message?.content?.trim() ?? null;
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
          content: `Please provide an excellent summary for this email:\n\nSubject: ${subject}\n\nContent:\n${emailContent}`,
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
  "priority": "priority_level",
  "labels": ["label1", "label2"],
  "actionRequired": true|false
}

Email Content:
${emailContent}`,
        },
      ],
      { maxTokens: 200, temperature: 0.1 },
    );

    const parsed = content ? parseJsonResponse(content) : null;
    return parsed || fallback;
  } catch (error) {
    console.error('Groq classify error:', error.response?.data || error.message);
    return fallback;
  }
};

const generateReply = async (emailContent, tone = 'professional') => {
  const fallbackReply = [
    'Hi,',
    '',
    `Thanks for the update. I reviewed the email and will follow up shortly.`,
    '',
    'Best regards,',
  ].join('\n');

  try {
    const content = await requestGroq(
      [
        {
          role: 'system',
          content: `You write polished email replies. The tone should be ${tone}. Keep the response concise, helpful, and ready to send. DO NOT include any placeholders like [Name]. If properties are unknown, be vague but polite.`,
        },
        {
          role: 'user',
          content: `Draft a perfect ${tone} response to this email:\n\n${emailContent}`,
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

module.exports = { summarizeEmail, classifyEmail, generateReply };

