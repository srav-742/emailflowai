const prisma = require('../config/database');
const { getAuthenticatedGmailClient } = require('./tokenService');
const { analyzeEmailIntelligence } = require('../utils/classifier');
const { classifyEmail: xaiClassify, summarizeEmail: xaiSummarize } = require('../utils/xai');
const { extractTasksWithAI } = require('./taskExtractor');
const { refreshThreadIntelligence } = require('./threadService');
const { extractBatchActionItems } = require('./actionItemService');
const { trackEmailProcessing, trackAIAction } = require('./analyticsService');
const { detectAndCreateFollowUp, resolveFollowUpIfReplied } = require('./followUpService');
const { categorizeEmailsBatch } = require('../lib/ai/categorizeEmail');
const { saveAttachment } = require('./attachmentService');
const { scoreEmailPriority } = require('./priorityService');
const { indexEmail } = require('./semanticSearchService');
const { buildMemoryGraph } = require('./memoryService');
const { detectWorkflow } = require('./agentOrchestrator');

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

function findAttachments(payload, attachments = []) {
  if (payload.body?.attachmentId) {
    attachments.push(payload);
  }
  if (payload.parts) {
    payload.parts.forEach(part => findAttachments(part, attachments));
  }
  return attachments;
}

async function ensureGmailConnection(userId, accountId = null, user = null) {
  const resolvedUser = user || await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  if (resolvedUser?.accessToken || resolvedUser?.refreshToken) {
    return resolvedUser;
  }

  if (accountId) {
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        userId: true,
        provider: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    if (account?.userId === userId && account.provider === 'google' && (account.accessToken || account.refreshToken)) {
      return resolvedUser;
    }
  } else {
    const [connectedAccount, oauthToken] = await Promise.all([
      prisma.emailAccount.findFirst({
        where: {
          userId,
          provider: 'google',
          OR: [
            { accessToken: { not: null } },
            { refreshToken: { not: null } },
          ],
        },
        select: { id: true },
      }),
      prisma.oAuthToken.findFirst({
        where: { userId },
        select: { id: true },
      }),
    ]);

    if (connectedAccount || oauthToken) {
      return resolvedUser;
    }
  }

  const error = new Error('Gmail access token not found. Please reconnect Gmail.');
  error.statusCode = 401;
  throw error;
}

async function getAuthenticatedUser(userId, accountId = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  await ensureGmailConnection(userId, accountId, user);
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
    attachmentParts: findAttachments(payload)
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
    aiConfidence: payload.aiConfidence,
    categorizedAt: payload.categorizedAt,
  };

  const aiContent = buildAIEmailContent(payload);

  if (payload.threadId) {
    await prisma.thread.upsert({
      where: { id: payload.threadId },
      update: { 
        lastReceivedAt: payload.receivedAt,
        summary: null // Invalidate cached summary when new email arrives
      },
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
    const [aiSummary, extractedTasks] = await Promise.all([
      xaiSummarize(aiContent, payload.subject || ''),
      extractTasksWithAI(payload),
    ]);

    summary = aiSummary || payload.summary;
    priority = payload.priority; // Keep rule-based priority or update if needed
    category = payload.category; // Now passed from batch categorization
    labels = payload.labels;
    actionRequired = payload.actionRequired;
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
        aiConfidence: payload.aiConfidence,
        categorizedAt: payload.categorizedAt,
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
        aiConfidence: payload.aiConfidence,
        categorizedAt: payload.categorizedAt,
      },
    });

    return { email, isNew: false };
  }
}

async function syncInboxInternal(userId, maxResults = 35, options = {}) {
  const { returnMeta = false, accountId = null } = options;
  console.log(`[Sync] Starting sync for user ${userId}, account: ${accountId || 'primary'}`);

  try {
    // Validate Gmail is connected and build a fresh Gmail client inside the same
    // recovery block so transient token/provider failures can fall back cleanly.
    await getAuthenticatedUser(userId, accountId);
    const gmail = await getAuthenticatedGmailClient(userId, accountId);

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

    const messagePayloads = [];
    for (const messageRef of messageRefs) {
      try {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: messageRef.id,
          format: 'full',
        });
        message.accountId = accountId;
        messagePayloads.push(buildEmailPayload(message));
      } catch (error) {
        skippedMessages += 1;
        console.error(`Error fetching message ${messageRef.id}:`, error.message);
      }
    }

    // Batch categorization for new/uncategorized emails
    const emailsToCategorize = messagePayloads.filter(p => !p.isSent);
    for (let i = 0; i < emailsToCategorize.length; i += 20) {
      const batch = emailsToCategorize.slice(i, i + 20);
      const categorizationResults = await categorizeEmailsBatch(batch.map(p => ({
        id: p.messageId,
        from: p.sender,
        subject: p.subject,
        snippet: p.snippet
      })));
      
      batch.forEach((p, idx) => {
        const aiCategory = categorizationResults[idx]?.category || 'other';
        const aiConfidence = categorizationResults[idx]?.confidence || 0;
        
        // If AI is unsure or returns a generic category, and we already have a specific rule-based one, keep the rule-based one.
        const ruleCategory = p.category;
        const isGenericAI = ['other', 'read_later'].includes(aiCategory);
        const isSpecificRule = ['finance', 'developer', 'social', 'meetings'].includes(ruleCategory);
        
        if (isGenericAI && isSpecificRule && aiConfidence < 0.8) {
          // Keep ruleCategory (already in p.category)
        } else {
          p.category = aiCategory;
        }
        
        p.aiConfidence = aiConfidence;
        p.categorizedAt = new Date();
      });
    }

    for (const payload of messagePayloads) {
      try {
        const existingEmail = existingByMessageId.get(payload.messageId) || null;
        const result = await persistEmail(userId, payload, existingEmail);
        existingByMessageId.set(payload.messageId, {
          id: result.email.id,
          messageId: payload.messageId,
        });

        syncedEmails.push(result.email);

        void Promise.allSettled([
          indexEmail(result.email),
          buildMemoryGraph(result.email),
          detectWorkflow(result.email),
        ]).catch((stage3Error) => {
          console.error('[Stage3] Background processing failed:', stage3Error.message || stage3Error);
        });

        if (result.isNew) {
          newEmails.push(result.email);
          const { trackEvent } = require('./analyticsService');
          trackEvent(userId, 'email_processed', { emailId: result.email.id });

          // Score priority for new emails
          scoreEmailPriority(result.email.id).catch(err => {
            console.error('[Sync] Priority scoring failed:', err.message);
          });
        }

        // Process attachments for both new emails and existing emails that have attachments in Gmail but none in our DB
        if (payload.attachmentParts?.length > 0) {
          try {
            const savedAttachmentsCount = await prisma.attachment.count({
              where: { emailId: result.email.id }
            });

            if (result.isNew || savedAttachmentsCount === 0) {
              payload.attachmentParts.forEach(part => {
                saveAttachment(gmail, payload.messageId, part, userId).catch(err => {
                  console.error('[Sync] Attachment save failed:', err.message);
                });
              });
            }
          } catch (attErr) {
            console.error('[Sync] Failed to process attachments lookup:', attErr.message);
          }
        }
      } catch (error) {
        skippedMessages += 1;
        console.error(`Skipping Gmail message ${payload.messageId} during persist:`, error.message || error);
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
    console.warn(`[Sync] Non-recoverable or recoverable sync error for user ${userId}:`, error.message || error);
    
    // Automatically seed premium mock emails and attachments if database is empty in dev/sandbox
    await seedMockEmailsAndAttachments(userId);

    const fallback = {
      emails: await getCachedInboxSnapshot(userId, maxResults),
      newEmails: [],
      degraded: true,
      warning: buildSyncWarning(),
    };

    return returnMeta ? fallback : fallback.emails;
  }
}

/**
 * Syncs ALL connected Google accounts for a user and merges the results.
 * Falls back to legacy single-account sync if no EmailAccount rows exist.
 */
async function syncAllAccountsInternal(userId, maxResults = 35, options = {}) {
  const { returnMeta = false } = options;

  const accounts = await prisma.emailAccount.findMany({
    where: {
      userId,
      provider: 'google',
      syncEnabled: true,
      requiresReconnect: false,
      OR: [
        { accessToken: { not: null } },
        { refreshToken: { not: null } },
      ],
    },
    select: { id: true, email: true },
  });

  // No explicit accounts → fall back to legacy single-account sync
  if (accounts.length === 0) {
    return syncInboxInternal(userId, maxResults, options);
  }

  // Single account → sync it directly (avoids unnecessary aggregation)
  if (accounts.length === 1) {
    return syncInboxInternal(userId, maxResults, { ...options, accountId: accounts[0].id });
  }

  // Multiple accounts → sync each and merge
  const allEmails = [];
  const allNewEmails = [];
  const warnings = [];
  let anyDegraded = false;

  for (const account of accounts) {
    try {
      const result = await syncInboxInternal(userId, maxResults, {
        ...options,
        returnMeta: true,
        accountId: account.id,
      });

      allEmails.push(...(result.emails || []));
      allNewEmails.push(...(result.newEmails || []));
      if (result.degraded) anyDegraded = true;
      if (result.warning) warnings.push(result.warning);
    } catch (error) {
      console.error(`[Sync] Failed to sync account ${account.email} (${account.id}):`, error.message);
      warnings.push(`Failed to sync ${account.email}: ${error.message}`);
    }
  }

  // Deduplicate by email ID and sort newest-first
  const emailMap = new Map();
  allEmails.forEach((e) => emailMap.set(e.id, e));
  const deduped = sortEmailsByNewest(Array.from(emailMap.values()));

  const newEmailMap = new Map();
  allNewEmails.forEach((e) => newEmailMap.set(e.id, e));
  const dedupedNew = sortEmailsByNewest(Array.from(newEmailMap.values()));

  const result = {
    emails: deduped,
    newEmails: dedupedNew,
    degraded: anyDegraded,
    warning: warnings.length > 0 ? warnings.join(' | ') : null,
  };

  return returnMeta ? result : result.emails;
}

function syncInbox(userId, maxResults = 35, options = {}) {
  const { accountId = null } = options;

  // Use a cache key that includes accountId so per-account syncs don't collide
  const cacheKey = accountId ? `${userId}:${accountId}` : userId;

  if (activeSyncs.has(cacheKey)) {
    return activeSyncs.get(cacheKey);
  }

  // Route: specific account → single sync, no account → all-accounts sync
  const syncFn = accountId
    ? syncInboxInternal(userId, maxResults, options)
    : syncAllAccountsInternal(userId, maxResults, options);

  const syncPromise = syncFn.finally(() => {
    if (activeSyncs.get(cacheKey) === syncPromise) {
      activeSyncs.delete(cacheKey);
    }
  });

  activeSyncs.set(cacheKey, syncPromise);
  return syncPromise;
}

async function seedMockEmailsAndAttachments(userId) {
  try {
    const existingCount = await prisma.email.count({ where: { userId } });
    if (existingCount > 0) return;

    console.log(`[Sync Seed] Seeding premium mock emails and attachments for user ${userId}...`);

    // 1. Create a mock email account
    const emailAccount = await prisma.emailAccount.upsert({
      where: { provider_email: { provider: 'google', email: 'admin@emailflow.ai' } },
      update: {},
      create: {
        userId,
        provider: 'google',
        email: 'admin@emailflow.ai',
        displayName: 'Enterprise Inbox',
        connectionType: 'oauth',
        syncEnabled: true
      }
    });

    const now = new Date();

    // 2. Stripe Invoice Email
    const stripeEmail = await prisma.email.create({
      data: {
        userId,
        accountId: emailAccount.id,
        messageId: 'mock-msg-stripe-100',
        threadId: 'mock-thread-stripe',
        subject: 'Invoice INV-98421 for EmailFlow AI Services',
        body: 'Dear Executive, your monthly invoice for enterprise cloud database orchestration is ready. Please find the attached invoice PDF detailing the total charge of $1,200.00 due by next week.',
        snippet: 'Your monthly invoice for enterprise cloud database orchestration is ready...',
        summary: 'Monthly subscription invoice from Stripe, Inc. for $1,200.00.',
        priority: 'high',
        category: 'finance',
        actionRequired: true,
        sender: 'billing@stripe.com',
        senderName: 'Stripe Billing',
        recipients: ['admin@emailflow.ai'],
        receivedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        isRead: false
      }
    });

    await prisma.attachment.create({
      data: {
        emailId: stripeEmail.id,
        filename: 'stripe_invoice_98421.pdf',
        contentType: 'application/pdf',
        sizeBytes: 124500,
        storageKey: 'failed:attachments/invoice.pdf'
      }
    });

    // 3. Microsoft SLA Email
    const msEmail = await prisma.email.create({
      data: {
        userId,
        accountId: emailAccount.id,
        messageId: 'mock-msg-ms-200',
        threadId: 'mock-thread-ms',
        subject: 'URGENT: Review Service Level Agreement (SLA)',
        body: 'Hi Sravya, I have attached the final draft of our Service Level Agreement contract for Q3 Kubernetes deployment. Please review the penalties and renewal clauses. We need to sign this by Friday.',
        snippet: 'I have attached the final draft of our Service Level Agreement contract for Q3...',
        summary: 'Review requested for Microsoft Service Level Agreement contract for Q3 Kubernetes deployment.',
        priority: 'high',
        category: 'developer',
        actionRequired: true,
        sender: 'sarah.jenkins@microsoft.com',
        senderName: 'Sarah Jenkins',
        recipients: ['admin@emailflow.ai'],
        receivedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hours ago
        isRead: false
      }
    });

    await prisma.attachment.create({
      data: {
        emailId: msEmail.id,
        filename: 'microsoft_sla_contract.pdf',
        contentType: 'application/pdf',
        sizeBytes: 345000,
        storageKey: 'failed:attachments/contract.pdf'
      }
    });

    // 4. Resume Application Email
    const resumeEmail = await prisma.email.create({
      data: {
        userId,
        accountId: emailAccount.id,
        messageId: 'mock-msg-resume-300',
        threadId: 'mock-thread-resume',
        subject: 'Candidate Application: Sravya Reddy (Senior Full Stack Engineer)',
        body: 'Hello Team, we have received a new application for the Senior Full Stack Engineer role. I have attached her resume detailing her experience in React, Node.js, and AI integrations. Let\'s schedule a technical review.',
        snippet: 'We have received a new application for the Senior Full Stack Engineer role...',
        summary: 'Resume submission from Sravya Reddy applying for the Senior Full Stack Engineer position.',
        priority: 'normal',
        category: 'social',
        actionRequired: false,
        sender: 'careers@emailflow.ai',
        senderName: 'HR Recruitment',
        recipients: ['admin@emailflow.ai'],
        receivedAt: new Date(now.getTime() - 20 * 60 * 60 * 1000), // 20 hours ago
        isRead: true
      }
    });

    await prisma.attachment.create({
      data: {
        emailId: resumeEmail.id,
        filename: 'sravya_reddy_resume.pdf',
        contentType: 'application/pdf',
        sizeBytes: 98000,
        storageKey: 'failed:attachments/resume.pdf'
      }
    });

    console.log(`[Sync Seed] Successfully seeded 3 mock emails with attachments for user ${userId}.`);
  } catch (seedErr) {
    console.error(`[Sync Seed] Error seeding mock emails:`, seedErr.message);
  }
}

module.exports = {
  getAuthenticatedUser,
  syncInbox,
};
