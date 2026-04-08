const prisma = require('../config/database');
const { analyzeEmailIntelligence, generateSummary } = require('../utils/classifier');
const { summarizeEmail: groqSummarize, classifyEmail: groqClassify, generateReply } = require('../utils/groq');
const { extractTasksWithAI } = require('../services/taskExtractor');
const { getAuthenticatedUser, syncInbox } = require('../services/inboxSyncService');
const { trackAIAction } = require('../services/analyticsService');
const { getOrCreateStyleProfile } = require('../services/styleService');
const { emitEmailNotifications } = require('../services/notificationService');
const { detectFollowUps } = require('../services/followUpService');
const { getGmailClient } = require('../utils/gmailClient');
const { getUserSocketRoom } = require('../utils/socketRooms');

function buildEmailContent(email) {
  const content = `${email.body || email.snippet || ''}`.replace(/\s+/g, ' ').trim();
  const trimmedContent = content.length > 4000 ? `${content.slice(0, 4000).trim()}...` : content;
  return `Subject: ${email.subject || 'No Subject'}\nFrom: ${email.sender || 'Unknown'}\n\n${trimmedContent}`;
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

function normalizeStoredPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'medium') {
    return 'normal';
  }

  if (['high', 'normal', 'low'].includes(normalized)) {
    return normalized;
  }

  return 'normal';
}

async function logAIUsage(userId, options = {}) {
  try {
    await trackAIAction(userId, options);
  } catch (error) {
    console.error('Analytics tracking error:', error.message || error);
  }
}

const fetchEmails = async (req, res) => {
  try {
    const result = await syncInbox(req.user.id, 20, { returnMeta: true });
    res.json({
      emails: result.emails,
      newEmails: result.newEmails,
      count: result.emails.length,
      newCount: result.newEmails.length,
      degraded: Boolean(result.degraded),
      warning: result.warning || null,
    });
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
    const [totalEmails, byCategory, byPriority, unreadCount, actionRequired, followUpCount, taskPayload] = await Promise.all([
      prisma.email.count({
        where: { userId: req.user.id },
      }),
      prisma.email.groupBy({
        by: ['category'],
        where: { userId: req.user.id },
        _count: true,
      }),
      prisma.email.groupBy({
        by: ['priority'],
        where: { userId: req.user.id },
        _count: true,
      }),
      prisma.email.count({
        where: { userId: req.user.id, isRead: false },
      }),
      prisma.email.count({
        where: { userId: req.user.id, actionRequired: true },
      }),
      prisma.email.count({
        where: { userId: req.user.id, followUp: true },
      }),
      prisma.email.findMany({
        where: { userId: req.user.id },
        select: { tasks: true },
      }),
    ]);

    const allTasks = taskPayload.flatMap((entry) => (Array.isArray(entry.tasks) ? entry.tasks : []));
    const pendingTasks = allTasks.filter((task) => !task?.completed);

    res.json({
      stats: {
        totalEmails,
        unreadCount,
        actionRequired,
        followUpCount,
        taskCount: allTasks.length,
        pendingTaskCount: pendingTasks.length,
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
    const result = await syncInbox(req.user.id, 40, { returnMeta: true });
    const io = req.app.get('io');

    if (result.newEmails.length > 0) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          importantContacts: true,
        },
      });

      if (user) {
        emitEmailNotifications(io, user, result.newEmails);
      } else {
        io.to(getUserSocketRoom(req.user.id)).emit('new-emails', result.newEmails);
      }
    }

    await detectFollowUps(io);

    res.json({
      message: result.degraded ? 'Showing your saved inbox while Gmail sync is temporarily unavailable' : 'Emails synced successfully',
      count: result.emails.length,
      newCount: result.newEmails.length,
      emails: result.emails,
      newEmails: result.newEmails,
      degraded: Boolean(result.degraded),
      warning: result.warning || null,
    });
  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to sync emails' });
  }
};

const extractEmailTasks = async (req, res) => {
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

    const tasks = await extractTasksWithAI(email);
    const updatedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { tasks },
    });

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'extract_tasks',
        prompt: `Extract tasks from: ${email.subject || 'Untitled email'}`,
        response: JSON.stringify(tasks),
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      },
    });

    await logAIUsage(req.user.id, { aiActions: 1, timeSaved: 2 });

    res.json({
      message: 'Tasks extracted successfully',
      tasks,
      email: updatedEmail,
    });
  } catch (error) {
    console.error('Extract tasks error:', error);
    res.status(500).json({ error: 'Failed to extract tasks from email' });
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

    await logAIUsage(req.user.id, { aiActions: 1, timeSaved: 2 });

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
        priority: normalizeStoredPriority(classification.priority),
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

    await logAIUsage(req.user.id, { aiActions: 1, timeSaved: 2 });

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

    const styleProfile = await getOrCreateStyleProfile(req.user.id);
    const reply = await generateReply(buildEmailContent(email), tone, styleProfile);

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

    await logAIUsage(req.user.id, { aiActions: 1, timeSaved: 3 });

    res.json({ message: 'Reply generated using AI', reply, tone, style: styleProfile });
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
        const [classification, summary, tasks] = await Promise.all([
          groqClassify(buildEmailContent(email)),
          groqSummarize(buildEmailContent(email), email.subject || ''),
          extractTasksWithAI(email),
        ]);

        await prisma.email.update({
          where: { id: email.id },
          data: {
            priority: normalizeStoredPriority(classification.priority),
            category: classification.category || email.category || 'general',
            labels: Array.isArray(classification.labels) ? classification.labels : email.labels,
            actionRequired: classification.actionRequired ?? email.actionRequired,
            summary,
            tasks,
          },
        });

        await prisma.aILog.create({
          data: {
            emailId: email.id,
            userId: req.user.id,
            actionType: 'classify_and_summarize',
            prompt: `Process: ${email.subject}`,
            response: JSON.stringify({ classification, summary, tasks }),
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          },
        });

        results.push({ id: email.id, subject: email.subject, status: 'success' });
        processedCount++;
      } catch (error) {
        results.push({
          id: email.id,
          subject: email.subject,
          status: 'failed',
          error: error.message || 'Unknown AI processing error',
        });
      }
    }

    if (processedCount > 0) {
      await logAIUsage(req.user.id, {
        aiActions: processedCount * 3,
        timeSaved: processedCount * 3,
      });
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
  extractEmailTasks,
  aiSummarize,
  aiClassify,
  aiGenerateReply,
  sendReply,
  aiProcessAll,
};
