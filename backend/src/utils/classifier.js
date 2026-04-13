const CATEGORY_RULES = [
  {
    name: 'finance',
    keywords: ['invoice', 'payment', 'budget', 'expense', 'receipt', 'billing', 'refund', 'bank', 'tax', 'salary'],
  },
  {
    name: 'developer',
    keywords: ['deploy', 'deployment', 'bug', 'incident', 'pull request', 'merge request', 'api', 'server', 'release', 'build', 'github', 'gitlab', 'stack trace'],
  },
  {
    name: 'meetings',
    keywords: ['meeting', 'calendar', 'invite', 'zoom', 'teams', 'google meet', 'reschedule', 'agenda'],
  },
  {
    name: 'clients',
    keywords: ['proposal', 'statement of work', 'client', 'customer', 'renewal', 'quote', 'contract'],
  },
  {
    name: 'operations',
    keywords: ['workflow', 'status update', 'approval', 'operations', 'maintenance', 'report', 'status'],
  },
  {
    name: 'legal',
    keywords: ['legal', 'nda', 'agreement', 'policy', 'compliance', 'privacy', 'terms'],
  },
  {
    name: 'hr',
    keywords: ['interview', 'candidate', 'onboarding', 'benefits', 'leave request', 'payroll', 'hiring'],
  },
  {
    name: 'travel',
    keywords: ['flight', 'hotel', 'itinerary', 'booking', 'boarding pass', 'reservation', 'trip'],
  },
  {
    name: 'newsletter',
    keywords: ['newsletter', 'unsubscribe', 'weekly digest', 'product news', 'edition', 'latest news'],
  },
  {
    name: 'social',
    keywords: ['linkedin', 'facebook', 'instagram', 'x.com', 'twitter', 'social', 'friend request'],
  },
];

const HIGH_PRIORITY_KEYWORDS = [
  'urgent',
  'asap',
  'action required',
  'deadline',
  'critical',
  'approve today',
  'respond by',
  'production issue',
  'reply by',
  'needs approval',
  'time sensitive',
  'immediate attention',
];

const LOW_PRIORITY_KEYWORDS = [
  'unsubscribe',
  'weekly digest',
  'newsletter',
  'promotion',
  'offer',
  'sale',
];

const ACTION_REQUIRED_KEYWORDS = [
  'please review',
  'please approve',
  'reply needed',
  'action required',
  'can you',
  'could you',
  'would you',
  'please send',
  'please share',
  'please confirm',
  'please update',
  'need your input',
  'respond by',
  'let me know',
];

const DEADLINE_PATTERN =
  /\b(?:by|before|due|on)\s+(?:today|tonight|tomorrow|eod|eow|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|[A-Z][a-z]+\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

const REQUEST_PATTERN =
  /\b(please|can you|could you|would you|kindly|need to|let me know|please review|please approve|please send|please share|please confirm|reply|respond|follow up|schedule|submit|prepare|update)\b/i;

const GMAIL_CATEGORY_MAP = {
  CATEGORY_PROMOTIONS: 'newsletter',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_FORUMS: 'social',
  CATEGORY_UPDATES: 'operations',
};

function normalizeText(value = '') {
  return value.toLowerCase();
}

function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function summarizeText(value = '', maxLength = 180) {
  const cleaned = normalizeWhitespace(value);

  if (!cleaned) {
    return '';
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function splitSentences(value = '') {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stripQuotedContent(value = '') {
  const text = String(value || '');
  const delimiters = [
    /\nOn .+ wrote:\n/i,
    /\nFrom:\s.+\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}\n/i,
  ];

  for (const delimiter of delimiters) {
    const match = text.match(delimiter);
    if (match?.index > 0) {
      return text.slice(0, match.index).trim();
    }
  }

  return text.trim();
}

function extractDeadline(text = '') {
  const match = String(text).match(DEADLINE_PATTERN);
  return match ? normalizeWhitespace(match[0]) : null;
}

function containsKeyword(text = '', keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractActionSentence(sentences = []) {
  return sentences.find((sentence) => REQUEST_PATTERN.test(sentence)) || '';
}

function cleanSentence(sentence = '') {
  return normalizeWhitespace(
    sentence
      .replace(/^subject:\s*/i, '')
      .replace(/^from:\s*/i, '')
      .replace(/[.?!]+$/g, ''),
  );
}

function detectCategory(text, sender = '', labelIds = []) {
  for (const labelId of labelIds) {
    if (GMAIL_CATEGORY_MAP[labelId]) {
      return GMAIL_CATEGORY_MAP[labelId];
    }
  }

  const senderText = normalizeText(sender);
  let bestCategory = 'general';
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = rule.keywords.reduce((total, keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return total + Number(text.includes(normalizedKeyword) || senderText.includes(normalizedKeyword));
    }, 0);

    if (score > bestScore) {
      bestCategory = rule.name;
      bestScore = score;
    }
  }

  return bestCategory;
}

function detectPriority(text, category) {
  const hasHighPriorityKeyword = containsKeyword(text, HIGH_PRIORITY_KEYWORDS);
  const hasRequest = REQUEST_PATTERN.test(text);
  const deadline = extractDeadline(text);

  if (hasHighPriorityKeyword) {
    return 'high';
  }

  if (deadline && hasRequest) {
    return 'high';
  }

  if (category === 'finance' || category === 'legal' || category === 'clients') {
    return 'high';
  }

  if (category === 'newsletter' || category === 'social' || containsKeyword(text, LOW_PRIORITY_KEYWORDS)) {
    return 'low';
  }

  if (hasRequest) {
    return 'normal';
  }

  return 'normal';
}

function buildLabels(category, text, labelIds = []) {
  const labels = new Set();

  if (category !== 'general') {
    labels.add(category);
  }

  if (containsKeyword(text, ACTION_REQUIRED_KEYWORDS) || REQUEST_PATTERN.test(text)) {
    labels.add('action-required');
  }

  if (extractDeadline(text)) {
    labels.add('deadline');
  }

  if (text.includes('invoice') || text.includes('receipt') || text.includes('payment')) {
    labels.add('billing');
  }

  if (text.includes('deploy') || text.includes('incident') || text.includes('outage')) {
    labels.add('ops-alert');
  }

  for (const labelId of labelIds) {
    if (labelId.startsWith('CATEGORY_')) {
      labels.add(labelId.replace('CATEGORY_', '').toLowerCase());
    }
  }

  return Array.from(labels).slice(0, 6);
}

function generateSummary(subject = '', snippet = '', body = '') {
  const normalizedSubject = normalizeWhitespace(subject);
  const primaryText = stripQuotedContent(body || snippet || '');
  const sentences = splitSentences(primaryText);
  const leadSentence = cleanSentence(sentences[0] || snippet || normalizedSubject);
  const actionSentence = cleanSentence(extractActionSentence(sentences));
  const deadline = extractDeadline(`${normalizedSubject} ${primaryText}`);
  const parts = [];

  if (leadSentence) {
    parts.push(summarizeText(leadSentence, 150));
  } else if (normalizedSubject) {
    parts.push(summarizeText(normalizedSubject, 150));
  }

  if (actionSentence && !parts.join(' ').toLowerCase().includes(actionSentence.toLowerCase())) {
    parts.push(`Action: ${summarizeText(actionSentence, 110)}`);
  }

  if (deadline && !parts.join(' ').toLowerCase().includes(deadline.toLowerCase())) {
    parts.push(`Deadline: ${deadline}`);
  }

  return parts.filter(Boolean).join('. ') || 'No content available';
}

function analyzeEmailIntelligence({ subject = '', body = '', snippet = '', sender = '', labelIds = [] }) {
  const text = normalizeText(`${subject} ${snippet} ${body}`);
  const category = detectCategory(text, sender, labelIds);
  const priority = detectPriority(text, category);
  const actionRequired = priority === 'high' || containsKeyword(text, ACTION_REQUIRED_KEYWORDS) || REQUEST_PATTERN.test(text);
  const labels = buildLabels(category, text, labelIds);
  const summary = generateSummary(subject, snippet, body);

  return {
    category,
    priority,
    labels,
    actionRequired,
    summary,
  };
}

module.exports = { analyzeEmailIntelligence, generateSummary };
