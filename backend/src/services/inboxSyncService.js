const prisma = require('../config/database');
const { getAuthenticatedGmailClient } = require('./tokenService');
const { analyzeEmailIntelligence } = require('../utils/classifier');
const { classifyEmail: xaiClassify, summarizeEmail: xaiSummarize } = require('../utils/xai');
const { extractTasksWithAI } = require('./taskExtractor');
const { refreshThreadIntelligence } = require('./threadService');
const { extractBatchActionItems } = require('./actionItemService');
const { trackEmailProcessing, trackAIAction } = require('./analyticsService');
const { detectAndCreateFollowUp, resolveFollowUpIfReplied } = require('./followUpService');

const activeSyncs = new Map();

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
  if (!sender) return '';
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

function sortEmailsByNewest(emails = []) {
  return [...emails].sort((left, right) => new Date(right.receivedAt || 0).getTime() - new Date(left.receivedAt || 0).getTime());
}

function normalizeStoredPriority(value = 'normal') {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'medium') {
    return 'normal';
  }

  if (['high', 'normal', 'low'].includes(normalized)) {
    return normalized;
  }

  return 'normal';
}

function isRecoverableGmailError(error) {
  if (!error) {
    return false;
  }

  if (error.statusCode && error.statusCode < 500 && error.statusCode !== 429) {
    return false;
  }

  const errorCode = String(error.code || error.cause?.code || '').toUpperCase();
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'].includes(errorCode)) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('gmail') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('timeout') ||
    message.includes('econnrefused')
  );
}

function buildSyncWarning() {
  return 'Gmail sync is temporarily unavailable. Showing the latest emails already saved in your workspace.';
}

function isEmailMessageConflict(error) {
  if (!error) {
    return false;
  }

  const prismaCode = String(error.code || '').toUpperCase();
  if (prismaCode === 'P2002') {
    return true;
  }

  return String(error.message || '').toLowerCase().includes('unique constraint failed');
}

async function getCachedInboxSnapshot(userId, maxResults) {
  const emails = await prisma.email.findMany({
    where: { userId },
    orderBy: { receivedAt: 'desc' },
    take: maxResults,
  });

  return sortEmailsByNewest(emails);
}

function buildEmailPayload(message) {
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

  return {
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
    recipients: to
      ? to
          .split(',')
          .map((recipient) => recipient.trim())
          .filter(Boolean)
      : [],
    gmailLabelIds: labelIds,
    isSent: labelIds.includes('SENT'),
    receivedAt: message.data.internalDate ? new Date(Number.parseInt(message.data.internalDate, 10)) : new Date(),
    isRead: !labelIds.includes('UNREAD'),
    accountId: message.accountId, // Ensure accountId is passed through
  };
}

function buildAIEmailContent(payload = {}) {
  return [
    `Subject: ${payload.subject || 'No Subject'}`,
    `From: ${payload.sender || 'Unknown sender'}`,
    '',
    String(payload.body || payload.snippet || '').trim(),
  ].join('\n');
}

async function persistEmail(userId, payload, existingEmail) {
  const syncedFields = {
    subject: payload.subject,
    body: payload.body,
    snippet: payload.snippet,
    sender: payload.sender,
    senderName: payload.senderName,
    recipients: payload.recipients,
    gmailLabelIds: payload.gmailLabelIds,
    isSent: payload.isSent,
    isSentByUser: payload.isSent,
    isRead: payload.isRead,
    threadId: payload.threadId,
    receivedAt: payload.receivedAt,
    accountId: payload.accountId,
  };

  const aiContent = buildAIEmailContent(payload);

  if (payload.threadId) {
    await prisma.thread.upsert({
      where: { id: payload.threadId },
      update: { lastReceivedAt: payload.receivedAt },
      create: {
        id: payload.threadId,
        userId,
        lastReceivedAt: payload.receivedAt,
      },
    });
  }

  if (existingEmail) {
    const updateData = {
      ...syncedFields,
      summary: existingEmail.summary || payload.summary,
      priority: existingEmail.priority || payload.priority,
      category: existingEmail.category || payload.category,
      labels: Array.isArray(existingEmail.labels) && existingEmail.labels.length ? existingEmail.labels : payload.labels,
      actionRequired: typeof existingEmail.actionRequired === 'boolean' ? existingEmail.actionRequired : payload.actionRequired,
    };

    if (!Array.isArray(existingEmail.tasks) || existingEmail.tasks.length === 0) {
      updateData.tasks = payload.isSent ? [] : await extractTasksWithAI(payload);
    }

    const email = await prisma.email.update({
      where: { id: existingEmail.id },
      data: updateData,
    });

    return { email, isNew: false };
  }

  let tasks = [];
  let summary = payload.summary;
  let priority = payload.priority;
  let category = payload.category;
  let labels = payload.labels;
  let actionRequired = payload.actionRequired;

  if (!payload.isSent) {
    const [classification, aiSummary, extractedTasks] = await Promise.all([
      xaiClassify(aiContent),
      xaiSummarize(aiContent, payload.subject || ''),
      extractTasksWithAI(payload),
    ]);

    summary = aiSummary || payload.summary;
    priority = normalizeStoredPriority(classification?.priority || payload.priority);
    category = classification?.category || payload.category;
    labels = Array.isArray(classification?.labels) && classification.labels.length ? classification.labels : payload.labels;
    actionRequired = typeof classification?.actionRequired === 'boolean' ? classification.actionRequired : payload.actionRequired;
    tasks = extractedTasks;
  }

  if (payload.threadId) {
    await prisma.thread.upsert({
      where: { id: payload.threadId },
      update: { lastReceivedAt: payload.receivedAt },
      create: {
        id: payload.threadId,
        userId,
        lastReceivedAt: payload.receivedAt,
        priority: priority || 'normal',
        category: category || 'general',
      },
    });
  }

  try {
    const email = await prisma.email.create({
      data: {
        userId,
        messageId: payload.messageId,
        tasks,
        ...syncedFields,
        summary,
        priority,
        category,
        labels,
        actionRequired,
      },
    });

    // Handle Auto Follow-up logic
    if (email.isSent) {
      void detectAndCreateFollowUp(email, userId);
    } else if (email.threadId) {
      void resolveFollowUpIfReplied(userId, email.threadId, email);
    }

    return { email, isNew: true };
  } catch (error) {
    if (!payload.messageId || !isEmailMessageConflict(error)) {
      throw error;
    }

    const matchingEmail = await prisma.email.findFirst({
      where: {
        userId,
        messageId: payload.messageId,
      },
      select: {
        id: true,
        summary: true,
        priority: true,
        category: true,
        labels: true,
        actionRequired: true,
        tasks: true,
      },
    });

    if (!matchingEmail) {
      throw error;
    }

    const email = await prisma.email.update({
      where: { id: matchingEmail.id },
      data: {
        ...syncedFields,
        summary,
        priority,
        category,
        labels,
        actionRequired,
        tasks,
      },
    });

    return { email, isNew: false };
  }
}

async function syncInboxInternal(userId, maxResults = 35, options = {}) {
  const { returnMeta = false, accountId = null } = options;
  // Validates Gmail is connected; the token check happens inside getAuthenticatedGmailClient.
  await getAuthenticatedUser(userId);
  // Build the Gmail client with a guaranteed-fresh access token.
  const gmail = await getAuthenticatedGmailClient(userId, accountId);

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      includeSpamTrash: false,
    });

    const messageRefs = response.data.messages || [];
    const knownEmails = messageRefs.length
      ? await prisma.email.findMany({
          where: {
            userId,
            messageId: {
              in: messageRefs.map((messageRef) => messageRef.id).filter(Boolean),
            },
          },
          select: {
            id: true,
            messageId: true,
            summary: true,
            priority: true,
            category: true,
            labels: true,
            actionRequired: true,
            tasks: true,
          },
        })
      : [];

    const existingByMessageId = new Map(knownEmails.map((email) => [email.messageId, email]));
    const syncedEmails = [];
    const newEmails = [];
    let skippedMessages = 0;

    for (const messageRef of messageRefs) {
      try {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: messageRef.id,
          format: 'full',
        });

        message.accountId = accountId; // Pass accountId to payload builder
        const payload = buildEmailPayload(message);
        const existingEmail = existingByMessageId.get(payload.messageId) || null;
        const result = await persistEmail(userId, payload, existingEmail);
        existingByMessageId.set(payload.messageId, {
          id: result.email.id,
          messageId: payload.messageId,
        });

        syncedEmails.push(result.email);
        if (result.isNew) {
          newEmails.push(result.email);
        }
      } catch (error) {
        skippedMessages += 1;
        console.error(`Skipping Gmail message ${messageRef.id} during sync:`, error.message || error);
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSyncAt: new Date(),
      },
    });

    if (newEmails.length > 0) {
      await Promise.allSettled([
        trackEmailProcessing(userId, newEmails.length),
        trackAIAction(userId, {
          aiActions: newEmails.length,
          timeSaved: Math.max(2, newEmails.length * 2),
        }),
      ]);

      // Refresh thread intelligence for new threads
      const affectedThreadIds = [...new Set(newEmails.map(e => e.threadId).filter(Boolean))];
      await Promise.allSettled(affectedThreadIds.map(tid => refreshThreadIntelligence(tid, userId)));

      // Auto-extract action items for new emails
      void extractBatchActionItems(newEmails.map(e => e.id), userId).catch(err => {
        console.error('[Sync] Auto-extraction failed:', err.message);
      });
    }

    const sortedEmails = sortEmailsByNewest(syncedEmails);
    const result = {
      emails: sortedEmails,
      newEmails: sortEmailsByNewest(newEmails),
      degraded: false,
      warning: skippedMessages
        ? `Synced your inbox, but ${skippedMessages} Gmail message${skippedMessages > 1 ? 's could not' : ' could not'} be processed.`
        : null,
    };

    if (messageRefs.length > 0 && sortedEmails.length === 0) {
      const fallbackEmails = await getCachedInboxSnapshot(userId, maxResults);
      result.emails = fallbackEmails;
      result.degraded = true;
      result.warning = buildSyncWarning();
    }

    return returnMeta ? result : result.emails;
  } catch (error) {
    if (!isRecoverableGmailError(error)) {
      throw error;
    }

    const fallback = {
      emails: await getCachedInboxSnapshot(userId, maxResults),
      newEmails: [],
      degraded: true,
      warning: buildSyncWarning(),
    };

    return returnMeta ? fallback : fallback.emails;
  }
}

function syncInbox(userId, maxResults = 35, options = {}) {
  if (activeSyncs.has(userId)) {
    return activeSyncs.get(userId);
  }

  const syncPromise = syncInboxInternal(userId, maxResults, options).finally(() => {
    if (activeSyncs.get(userId) === syncPromise) {
      activeSyncs.delete(userId);
    }
  });

  activeSyncs.set(userId, syncPromise);
  return syncPromise;
}

module.exports = {
  getAuthenticatedUser,
  syncInbox,
};
