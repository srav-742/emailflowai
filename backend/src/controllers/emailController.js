const prisma = require('../config/database');
const redis = require('../redisClient');
const { analyzeEmailIntelligence, generateSummary } = require('../utils/classifier');
const { summarizeBatchEmails, generateReply, XAI_MODEL } = require('../utils/xai');
const { extractTasksWithAI } = require('../services/taskExtractor');
const { extractAndSaveActionItems } = require('../services/actionItemService');
const { getAuthenticatedUser, syncInbox } = require('../services/inboxSyncService');
const { trackAIAction } = require('../services/analyticsService');
const { getOrCreateStyleProfile, refreshStyleProfileIfReady } = require('../services/styleService');
const { emitEmailNotifications } = require('../services/notificationService');
const { detectFollowUps } = require('../services/followUpService');
const { getAuthenticatedGmailClient } = require('../services/tokenService');
const { getUserSocketRoom } = require('../utils/socketRooms');
const StyleExtractor = require('../services/StyleExtractor');

function parseCsvList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

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

  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeReplyText(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function normalizeStoredPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'medium') return 'normal';
  if (['high', 'normal', 'low'].includes(normalized)) return normalized;
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
    const result = await syncInbox(req.user.id, 100, { returnMeta: true });
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
    const { category, categoryIn, priority, followUp, isRead, actionRequired, labels, limit = 20, q, cursor } = req.query;
    const userId = req.user.id;

    if (category === 'waiting') {
      const followUps = await prisma.followUp.findMany({
        where: { userId, status: 'waiting' },
        include: { email: true },
        orderBy: { sentAt: 'desc' },
        take: Number(limit) + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      let nextCursor = null;
      if (followUps.length > Number(limit)) {
        const nextItem = followUps.pop();
        nextCursor = nextItem.id;
      }

      return res.json({
        emails: followUps.map(f => ({ ...f.email, followUpStatus: f.status })),
        pagination: { nextCursor },
      });
    }

    const categories = parseCsvList(categoryIn);
    const labelList = parseCsvList(labels);
    const where = {
      userId,
      ...(category ? { category: String(category) } : {}),
      ...(category === 'focus_today' ? { receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } : {}),
      ...(categories.length ? { category: { in: categories } } : {}),
      ...(priority ? { priority: String(priority) } : {}),
      ...(followUp !== undefined ? { followUp: followUp === 'true' } : {}),
      ...(isRead !== undefined ? { isRead: isRead === 'true' } : {}),
      ...(actionRequired !== undefined ? { actionRequired: actionRequired === 'true' } : {}),
      ...(labelList.length ? { labels: { hasSome: labelList } } : {}),
      ...(q ? {
            OR: [
              { subject: { contains: String(q), mode: 'insensitive' } },
              { sender: { contains: String(q), mode: 'insensitive' } },
              { snippet: { contains: String(q), mode: 'insensitive' } },
            ],
          } : {}),
    };

    const emails = await prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: Number(limit) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor = null;
    if (emails.length > Number(limit)) {
      const nextItem = emails.pop();
      nextCursor = nextItem.id;
    }

    res.json({
      emails,
      pagination: { nextCursor },
    });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Failed to get emails' });
  }
};

const getCategoryCounts = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `counts:${userId}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [focusToday, readLater, newsletter, waiting] = await Promise.all([
      prisma.email.count({ where: { userId, category: 'focus_today', isRead: false, receivedAt: { gte: twentyFourHoursAgo } } }),
      prisma.email.count({ where: { userId, category: 'read_later', isRead: false } }),
      prisma.email.count({ where: { userId, category: 'newsletter', isRead: false } }),
      prisma.followUp.count({ where: { userId, status: 'waiting' } }),
    ]);

    const counts = { focus_today: focusToday, read_later: readLater, newsletter: newsletter, waiting };
    await redis.setex(cacheKey, 300, JSON.stringify(counts));
    
    res.json(counts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get counts' });
  }
};

const updateEmailCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const userId = req.user.id;

    const email = await prisma.email.update({
      where: { id, userId },
      data: { category },
    });

    // Invalidate counts cache
    await redis.del(`counts:${userId}`);

    res.json({ message: 'Category updated', email });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
};

const getThreads = async (req, res) => {
  try {
    const { page = 1, limit = 20, priority, category } = req.query;
    
    const where = {
      userId: req.user.id,
      ...(priority ? { priority: String(priority) } : {}),
      ...(category ? { category: String(category) } : {}),
    };

    const threads = await prisma.thread.findMany({
      where,
      orderBy: { lastReceivedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        _count: {
          select: { emails: true }
        }
      }
    });

    const total = await prisma.thread.count({ where });

    res.json({
      threads: threads.map(t => ({
        ...t,
        emailCount: t._count?.emails || 0
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Failed to get threaded view' });
  }
};

const getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;
    
    const [thread, emails] = await Promise.all([
      prisma.thread.findUnique({
        where: { id: threadId }
      }),
      prisma.email.findMany({
        where: {
          userId: req.user.id,
          threadId,
        },
        orderBy: { receivedAt: 'asc' },
      })
    ]);

    if (!emails.length) return res.status(404).json({ error: 'Thread not found' });
    
    res.json({ 
      threadId, 
      metadata: thread,
      emails 
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Failed to get thread details' });
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

    if (!email) return res.status(404).json({ error: 'Email not found' });
    res.json({ email });
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({ error: 'Failed to get email' });
  }
};

const classifyEmails = async (req, res) => {
  try {
    const emails = await prisma.email.findMany({ where: { userId: req.user.id } });
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

    if (!email) return res.status(404).json({ error: 'Email not found' });

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

const searchEmails = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query is required' });

    const offset = (Number(page) - 1) * Number(limit);
    const emails = await prisma.$queryRaw`
      SELECT *,
        ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM emails
      WHERE "userId" = ${req.user.id}
      AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC, "received_at" DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `;

    const countResult = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM emails
      WHERE "userId" = ${req.user.id}
      AND search_vector @@ plainto_tsquery('english', ${q})
    `;

    const total = countResult[0]?.count || 0;

    res.json({
      emails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Search emails error:', error);
    res.status(500).json({ error: 'Search service temporarily unavailable' });
  }
};

const getStats = async (req, res) => {
  try {
    const [totalEmails, byCategory, byPriority, unreadCount, actionRequired, followUpCount, taskPayload] = await Promise.all([
      prisma.email.count({ where: { userId: req.user.id } }),
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
      prisma.email.count({ where: { userId: req.user.id, isRead: false } }),
      prisma.email.count({ where: { userId: req.user.id, actionRequired: true } }),
      prisma.email.count({ where: { userId: req.user.id, followUp: true } }),
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
    const result = await syncInbox(req.user.id, 100, { returnMeta: true });
    const io = req.app.get('io');

    if (result.newEmails.length > 0) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, importantContacts: true },
      });

      if (user) {
        emitEmailNotifications(io, user, result.newEmails);
      } else {
        io.to(getUserSocketRoom(req.user.id)).emit('new-emails', result.newEmails);
      }

      try {
        const summary = await summarizeBatchEmails(result.emails, req.user.id);
        io.to(getUserSocketRoom(req.user.id)).emit('inbox-summary', summary);
      } catch (err) {
        console.error('Failed to auto-update batch summary during sync:', err);
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

    if (!email) return res.status(404).json({ error: 'Email not found' });

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
        model: XAI_MODEL,
      },
    });

    // Also populate the new ActionItem table
    await extractAndSaveActionItems(email.id, req.user.id).catch(err => {
      console.error('[Controller] ActionItem persistence failed:', err.message);
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

    if (!email) return res.status(404).json({ error: 'Email not found' });

    const summary = await xaiSummarize(buildEmailContent(email), email.subject || '');
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
        model: XAI_MODEL,
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

    if (!email) return res.status(404).json({ error: 'Email not found' });

    const classification = await xaiClassify(buildEmailContent(email));
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
        model: XAI_MODEL,
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
    const { tone = 'professional', intent = 'general' } = req.body;

    const email = await prisma.email.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!email) return res.status(404).json({ error: 'Email not found' });

    const styleProfile = await getOrCreateStyleProfile(req.user.id);
    const reply = await generateReply(buildEmailContent(email), tone, styleProfile, intent);

    await prisma.aILog.create({
      data: {
        emailId: email.id,
        userId: req.user.id,
        actionType: 'reply',
        prompt: `Reply to: ${email.subject} (tone: ${tone}, intent: ${intent})`,
        response: reply,
        model: XAI_MODEL,
      },
    });

    await logAIUsage(req.user.id, { aiActions: 1, timeSaved: 3 });

    res.json({ message: 'Reply generated using AI', reply, tone, intent, style: styleProfile });
  } catch (error) {
    console.error('AI reply error:', error);
    res.status(500).json({ error: 'Failed to generate reply with AI' });
  }
};

const sendReply = async (req, res) => {
  try {
    const { body, generatedReply = '', wasEdited } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Reply body is required' });

    const [email, user] = await Promise.all([
      prisma.email.findFirst({
        where: { id: req.params.id, userId: req.user.id },
      }),
      getAuthenticatedUser(req.user.id),
    ]);

    if (!email) return res.status(404).json({ error: 'Email not found' });

    const gmail = await getAuthenticatedGmailClient(req.user.id);
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

    const normalizedSubject = /^re:/i.test(email.subject || '') ? email.subject || 'Your message' : `Re: ${email.subject || 'Your message'}`;
    const userEditedReply = typeof wasEdited === 'boolean' ? wasEdited : normalizeReplyText(body) !== normalizeReplyText(generatedReply);

    if (result.data.id) {
      await prisma.email.upsert({
        where: {
          userId_messageId: {
            userId: req.user.id,
            messageId: result.data.id,
          },
        },
        update: {
          subject: normalizedSubject,
          body: body.trim(),
          snippet: body.trim().slice(0, 200),
          summary: generateSummary(normalizedSubject, body.trim(), body.trim()),
          priority: email.priority || 'normal',
          category: email.category || 'general',
          labels: Array.isArray(email.labels) ? email.labels : [],
          actionRequired: false,
          sender: user.email,
          senderName: user.name || user.email,
          recipients: email.sender ? [email.sender] : [],
          gmailLabelIds: ['SENT'],
          isSent: true,
          isSentByUser: true,
          isEditedReply: userEditedReply,
          isRead: true,
          threadId: result.data.threadId || email.threadId || null,
          receivedAt: new Date(),
        },
        create: {
          userId: req.user.id,
          messageId: result.data.id,
          subject: normalizedSubject,
          body: body.trim(),
          snippet: body.trim().slice(0, 200),
          summary: generateSummary(normalizedSubject, body.trim(), body.trim()),
          priority: email.priority || 'normal',
          category: email.category || 'general',
          labels: Array.isArray(email.labels) ? email.labels : [],
          actionRequired: false,
          sender: user.email,
          senderName: user.name || user.email,
          recipients: email.sender ? [email.sender] : [],
          gmailLabelIds: ['SENT'],
          isSent: true,
          isSentByUser: true,
          isEditedReply: userEditedReply,
          isRead: true,
          threadId: result.data.threadId || email.threadId || null,
          receivedAt: new Date(),
        },
      });
    }

    void refreshStyleProfileIfReady(req.user.id).catch((styleError) => {
      console.error('Style auto-refresh error:', styleError.message || styleError);
    });

    if (userEditedReply) {
      void StyleExtractor.logDraftEdit(req.user.id, email.id, generatedReply, body, tone).catch(err => {
        console.error('Failed to log AI training data:', err);
      });
    }

    res.json({
      message: 'Reply sent successfully',
      sentMessageId: result.data.id,
      wasEdited: userEditedReply,
    });
  } catch (error) {
    console.error('Send reply error:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
};

const aiProcessAll = async (req, res) => {
  try {
    const emails = await prisma.email.findMany({ where: { userId: req.user.id } });
    let processedCount = 0;
    const results = [];

    for (const email of emails) {
      try {
        const [classification, summary, tasks] = await Promise.all([
          xaiClassify(buildEmailContent(email)),
          xaiSummarize(buildEmailContent(email), email.subject || ''),
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
            model: XAI_MODEL,
          },
        });
        results.push({ id: email.id, subject: email.subject, status: 'success' });
        processedCount++;
      } catch (error) {
        results.push({ id: email.id, subject: email.subject, status: 'failed', error: error.message });
      }
    }

    if (processedCount > 0) {
      await logAIUsage(req.user.id, { aiActions: processedCount * 3, timeSaved: processedCount * 3 });
      const io = req.app.get('io');
      const latestEmails = await prisma.email.findMany({ where: { userId: req.user.id }, orderBy: { receivedAt: 'desc' }, take: 35 });
      const summary = await summarizeBatchEmails(latestEmails, req.user.id);
      io.to(getUserSocketRoom(req.user.id)).emit('inbox-summary', summary);
    }

    res.json({ message: `Processed ${processedCount}/${emails.length} emails`, processedCount, totalCount: emails.length, results });
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
  getThreads,
  getThreadById,
  searchEmails,
  getCategoryCounts,
  updateEmailCategory,
};
