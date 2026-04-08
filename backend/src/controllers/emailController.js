const prisma = require('../config/database');
const { getGmailClient } = require('../utils/gmailClient');
const { analyzeEmailIntelligence, generateSummary } = require('../utils/classifier');
const { summarizeEmail: groqSummarize, classifyEmail: groqClassify, generateReply } = require('../utils/groq');

function decodeMessage(data = '') {
  const buffer = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buffer.toString('utf-8');
}

function stripHtml(value = '') {
  return value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractHeader(headers = [], name) {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractBody(payload) {
  if (!payload) {
    return '';
  }

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeMessage(payload.body.data);
  }

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeMessage(payload.body.data));
  }

  for (const part of payload.parts || []) {
    const partBody = extractBody(part);
    if (partBody) {
      return partBody;
    }
  }

  if (payload.body?.data) {
    return decodeMessage(payload.body.data);
  }

  return '';
}

function parseName(sender = '') {
  const match = sender.match(/^(.*?)(<.+>)$/);
  return match ? match[1].replace(/["']/g, '').trim() : sender;
}

function ensureGmailConnection(user) {
  if (!user?.accessToken && !user?.refreshToken) {
    const error = new Error('Gmail access token not found. Please reconnect Gmail.');
    error.statusCode = 401;
    throw error;
  }
}

async function getAuthenticatedUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  ensureGmailConnection(user);
  return user;
}

async function upsertMessage(userId, message) {
  const payload = message.data.payload;
  const headers = payload?.headers || [];
  const subject = extractHeader(headers, 'subject');
  const from = extractHeader(headers, 'from');
  const to = extractHeader(headers, 'to');
  const labelIds = message.data.labelIds || [];
  const body = extractBody(payload).slice(0, 10000);
  const snippet = message.data.snippet || '';
  const intelligence = analyzeEmailIntelligence({
    subject,
    body,
    snippet,
    sender: from,
    labelIds,
  });

  return prisma.email.upsert({
    where: {
      messageId: message.data.id || '',
    },
    update: {
      subject,
      body,
      snippet,
      summary: intelligence.summary,
      priority: intelligence.priority,
      category: intelligence.category,
      labels: intelligence.labels,
      actionRequired: intelligence.actionRequired,
      sender: from,
      senderName: parseName(from),
      recipients: to ? [to] : [],
      gmailLabelIds: labelIds,
      isRead: !labelIds.includes('UNREAD'),
      threadId: message.data.threadId || undefined,
    },
    create: {
      userId,
      messageId: message.data.id || '',
      threadId: message.data.threadId || undefined,
      subject,
      body,
      snippet,
      summary: intelligence.summary,
      priority: intelligence.priority,
      category: intelligence.category,
      labels: intelligence.labels,
      actionRequired: intelligence.actionRequired,
      sender: from,
      senderName: parseName(from),
      recipients: to ? [to] : [],
      gmailLabelIds: labelIds,
      receivedAt: message.data.internalDate ? new Date(Number.parseInt(message.data.internalDate, 10)) : new Date(),
      isRead: !labelIds.includes('UNREAD'),
    },
  });
}

async function syncInbox(userId, maxResults = 35) {
  const user = await getAuthenticatedUser(userId);
  const gmail = getGmailClient(user.accessToken, user.refreshToken);
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    includeSpamTrash: false,
  });

  const messages = response.data.messages || [];
  const synced = [];

  for (const messageRef of messages) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageRef.id,
      format: 'full',
    });

    const savedEmail = await upsertMessage(userId, message);
    synced.push(savedEmail);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastSyncAt: new Date(),
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
    },
  });

  return synced;
}

function buildEmailContent(email) {
  return `Subject: ${email.subject || 'No Subject'}\nFrom: ${email.sender || 'Unknown'}\n\n${email.body || email.snippet || ''}`;
}

function buildReplyRawMessage({ to, subject, body }) {
  const normalizedSubject = /^re:/i.test(subject || '') ? subject : `Re: ${subject || 'Your email'}`;
  const message = [
    `To: ${to}`,
    `Subject: ${normalizedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

const fetchEmails = async (req, res) => {
  try {
    const emails = await syncInbox(req.user.id, 20);
    res.json({ emails });
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch emails' });
  }
};

const getEmails = async (req, res) => {
  try {
    const { category, priority, page = 1, limit = 20, q } = req.query;
    const where = {
      userId: req.user.id,
      ...(category ? { category: String(category) } : {}),
      ...(priority ? { priority: String(priority) } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: String(q), mode: 'insensitive' } },
              { sender: { contains: String(q), mode: 'insensitive' } },
              { snippet: { contains: String(q), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const emails = await prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    const total = await prisma.email.count({ where });

    res.json({
      emails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.max(1, Math.ceil(total / Number(limit))),
      },
    });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Failed to get emails' });
  }
};

const getEmailById = async (req, res) => {
  try {
    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ email });
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({ error: 'Failed to get email' });
  }
};

const classifyEmails = async (req, res) => {
  try {
    const emails = await prisma.email.findMany({
      where: { userId: req.user.id },
    });

    const updated = [];

    for (const email of emails) {
      const intelligence = analyzeEmailIntelligence({
        subject: email.subject || '',
        body: email.body || '',
        snippet: email.snippet || '',
        sender: email.sender || '',
        labelIds: email.gmailLabelIds || [],
      });

      const updatedEmail = await prisma.email.update({
        where: { id: email.id },
        data: {
          priority: intelligence.priority,
          category: intelligence.category,
          labels: intelligence.labels,
          actionRequired: intelligence.actionRequired,
        },
      });

      updated.push(updatedEmail);
    }

    res.json({ message: 'Emails classified', count: updated.length, emails: updated });
  } catch (error) {
    console.error('Classify emails error:', error);
    res.status(500).json({ error: 'Failed to classify emails' });
  }
};

const summarizeEmail = async (req, res) => {
  try {
    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const summary = generateSummary(email.subject || '', email.snippet || '', email.body || '');

    const updatedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { summary },
    });

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'summary',
        prompt: `Summarize email: ${email.subject}`,
        response: summary,
        model: 'rule-based',
      },
    });

    res.json({ message: 'Email summarized', email: updatedEmail });
  } catch (error) {
    console.error('Summarize email error:', error);
    res.status(500).json({ error: 'Failed to summarize email' });
  }
};

const getStats = async (req, res) => {
  try {
    const totalEmails = await prisma.email.count({
      where: { userId: req.user.id },
    });

    const byCategory = await prisma.email.groupBy({
      by: ['category'],
      where: { userId: req.user.id },
      _count: true,
    });

    const byPriority = await prisma.email.groupBy({
      by: ['priority'],
      where: { userId: req.user.id },
      _count: true,
    });

    const unreadCount = await prisma.email.count({
      where: { userId: req.user.id, isRead: false },
    });

    const actionRequired = await prisma.email.count({
      where: { userId: req.user.id, actionRequired: true },
    });

    res.json({
      stats: {
        totalEmails,
        unreadCount,
        actionRequired,
        byCategory: byCategory.map((item) => ({ category: item.category, count: item._count?._all ?? item._count ?? 0 })),
        byPriority: byPriority.map((item) => ({ priority: item.priority, count: item._count?._all ?? item._count ?? 0 })),
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
};

const syncEmails = async (req, res) => {
  try {
    const emails = await syncInbox(req.user.id, 40);
    res.json({ message: 'Emails synced successfully', count: emails.length, emails });
  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to sync emails' });
  }
};

const aiSummarize = async (req, res) => {
  try {
    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const summary = await groqSummarize(buildEmailContent(email), email.subject || '');
    const updatedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { summary },
    });

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'summary',
        prompt: `Summarize: ${email.subject}`,
        response: summary,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      },
    });

    res.json({ message: 'Email summarized using AI', email: updatedEmail });
  } catch (error) {
    console.error('AI summarize error:', error);
    res.status(500).json({ error: 'Failed to summarize email with AI' });
  }
};

const aiClassify = async (req, res) => {
  try {
    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const classification = await groqClassify(buildEmailContent(email));

    const updatedEmail = await prisma.email.update({
      where: { id: email.id },
      data: {
        priority: classification.priority || 'normal',
        category: classification.category || 'general',
        labels: Array.isArray(classification.labels) ? classification.labels : email.labels,
        actionRequired: classification.actionRequired ?? email.actionRequired,
      },
    });

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'classify',
        prompt: `Classify: ${email.subject}`,
        response: JSON.stringify(classification),
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      },
    });

    res.json({ message: 'Email classified using AI', email: updatedEmail, classification });
  } catch (error) {
    console.error('AI classify error:', error);
    res.status(500).json({ error: 'Failed to classify email with AI' });
  }
};

const aiGenerateReply = async (req, res) => {
  try {
    const { tone = 'professional' } = req.body;

    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const reply = await generateReply(buildEmailContent(email), tone);

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'reply',
        prompt: `Reply to: ${email.subject} (tone: ${tone})`,
        response: reply,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      },
    });

    res.json({ message: 'Reply generated using AI', reply, tone });
  } catch (error) {
    console.error('AI reply error:', error);
    res.status(500).json({ error: 'Failed to generate reply with AI' });
  }
};

const sendReply = async (req, res) => {
  try {
    const { body } = req.body;

    if (!body?.trim()) {
      return res.status(400).json({ error: 'Reply body is required' });
    }

    const [email, user] = await Promise.all([
      prisma.email.findFirst({
        where: {
          id: req.params.id,
          userId: req.user.id,
        },
      }),
      getAuthenticatedUser(req.user.id),
    ]);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const gmail = getGmailClient(user.accessToken, user.refreshToken);
    const raw = buildReplyRawMessage({
      to: email.sender || user.email,
      subject: email.subject || 'Your message',
      body: body.trim(),
    });

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: email.threadId || undefined,
      },
    });

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'send_reply',
        prompt: `Send reply for: ${email.subject}`,
        response: body.trim(),
        model: 'gmail-api',
      },
    });

    res.json({
      message: 'Reply sent successfully',
      sentMessageId: result.data.id,
    });
  } catch (error) {
    console.error('Send reply error:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
};

const aiProcessAll = async (req, res) => {
  try {
    const emails = await prisma.email.findMany({
      where: { userId: req.user.id },
    });

    let processedCount = 0;
    const results = [];

    for (const email of emails) {
      try {
        const [classification, summary] = await Promise.all([
          groqClassify(buildEmailContent(email)),
          groqSummarize(buildEmailContent(email), email.subject || ''),
        ]);

        await prisma.email.update({
          where: { id: email.id },
          data: {
            priority: classification.priority || 'normal',
            category: classification.category || email.category || 'general',
            labels: Array.isArray(classification.labels) ? classification.labels : email.labels,
            actionRequired: classification.actionRequired ?? email.actionRequired,
            summary,
          },
        });

        await prisma.aILog.create({
          data: {
            emailId: email.id,
            userId: req.user.id,
            actionType: 'classify_and_summarize',
            prompt: `Process: ${email.subject}`,
            response: JSON.stringify({ classification, summary }),
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          },
        });

        results.push({ id: email.id, subject: email.subject, status: 'success' });
        processedCount++;
      } catch (error) {
        results.push({ id: email.id, subject: email.subject, status: 'failed' });
      }
    }

    res.json({
      message: `Processed ${processedCount}/${emails.length} emails`,
      processedCount,
      totalCount: emails.length,
      results,
    });
  } catch (error) {
    console.error('AI process all error:', error);
    res.status(500).json({ error: 'Failed to process emails with AI' });
  }
};

module.exports = {
  fetchEmails,
  getEmails,
  getEmailById,
  classifyEmails,
  summarizeEmail,
  getStats,
  syncEmails,
  aiSummarize,
  aiClassify,
  aiGenerateReply,
  sendReply,
  aiProcessAll,
};
