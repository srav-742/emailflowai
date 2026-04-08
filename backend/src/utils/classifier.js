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
  'need your input',
  'respond by',
  'let me know',
];

const GMAIL_CATEGORY_MAP = {
  CATEGORY_PROMOTIONS: 'newsletter',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_FORUMS: 'social',
  CATEGORY_UPDATES: 'operations',
};

function normalizeText(value = '') {
  return value.toLowerCase();
}

function summarizeText(value = '', maxLength = 180) {
  const cleaned = value.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return '';
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
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
  if (HIGH_PRIORITY_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'high';
  }

  if (category === 'finance' || category === 'legal' || category === 'clients') {
    return 'high';
  }

  if (category === 'newsletter' || category === 'social' || LOW_PRIORITY_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'low';
  }

  return 'normal';
}

function buildLabels(category, text, labelIds = []) {
  const labels = new Set();

  if (category !== 'general') {
    labels.add(category);
  }

  if (ACTION_REQUIRED_KEYWORDS.some((keyword) => text.includes(keyword))) {
    labels.add('action-required');
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
  const parts = [subject, summarizeText(snippet || body)];
  return parts.filter(Boolean).join(' - ') || 'No content available';
}

function analyzeEmailIntelligence({ subject = '', body = '', snippet = '', sender = '', labelIds = [] }) {
  const text = normalizeText(`${subject} ${snippet} ${body}`);
  const category = detectCategory(text, sender, labelIds);
  const priority = detectPriority(text, category);
  const actionRequired = priority === 'high' || ACTION_REQUIRED_KEYWORDS.some((keyword) => text.includes(keyword));
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
