const prisma = require('../config/database');
const ConnectorFactory = require('./connector');
const { analyzeEmailIntelligence } = require('../utils/classifier');

function normalizeImapMessageId(accountId, rawEmail = {}) {
  const baseId = rawEmail.messageId || `imap-${rawEmail.imapUid || rawEmail.receivedAt || Date.now()}`;
  return `${accountId}:${baseId}`;
}

async function syncImapAccount(userId, accountId, options = {}) {
  const limit = options.limit || 25;
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account || account.userId !== userId) {
    throw new Error(`Account ${accountId} not found or unauthorized.`);
  }

  if (!['imap', 'app_password'].includes(account.connectionType)) {
    return { success: true, skipped: true, reason: 'Account is not configured for IMAP sync.', accountId };
  }

  const connector = ConnectorFactory.getConnector(account);
  const { emails, lastUid } = await connector.fetchLatestEmails(limit, account.lastImapUid);

  let newEmailsCount = 0;

  for (const rawEmail of emails) {
    const messageId = normalizeImapMessageId(accountId, rawEmail);

    try {
      const existing = await prisma.email.findFirst({
        where: { userId, messageId },
        select: { id: true },
      });

      if (existing) continue;

      const intelligence = analyzeEmailIntelligence({
        subject: rawEmail.subject,
        body: rawEmail.body,
        snippet: rawEmail.body?.substring(0, 200) || '',
        sender: rawEmail.sender,
        labelIds: rawEmail.labels || [],
      });

      await prisma.email.create({
        data: {
          userId,
          accountId,
          messageId,
          subject: rawEmail.subject,
          body: rawEmail.body?.substring(0, 10000) || '',
          snippet: rawEmail.body?.substring(0, 200) || '',
          summary: intelligence.summary,
          priority: intelligence.priority,
          category: intelligence.category,
          labels: intelligence.labels,
          actionRequired: intelligence.actionRequired,
          sender: rawEmail.sender,
          senderName: rawEmail.senderName,
          recipients: rawEmail.recipients,
          isSent: rawEmail.isSent || false,
          isRead: rawEmail.isRead || false,
          receivedAt: new Date(rawEmail.receivedAt),
          provider: account.provider,
        },
      });

      newEmailsCount += 1;
    } catch (emailError) {
      if (emailError.code === 'P2002') continue;
      console.error(`[IMAP Sync] Error persisting email ${messageId}:`, emailError.message);
    }
  }

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      lastImapUid: lastUid || account.lastImapUid,
      lastSyncAt: new Date(),
      requiresReconnect: false,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

  return {
    success: true,
    type: 'sync-imap',
    accountId,
    totalFetched: emails.length,
    newEmailsCount,
    lastUid,
  };
}

async function syncUserImapAccounts(userId, options = {}) {
  const accounts = await prisma.emailAccount.findMany({
    where: {
      userId,
      syncEnabled: true,
      connectionType: { in: ['imap', 'app_password'] },
      requiresReconnect: false,
    },
    select: { id: true, email: true },
  });

  const results = [];
  const errors = [];

  for (const account of accounts) {
    try {
      results.push(await syncImapAccount(userId, account.id, options));
    } catch (error) {
      errors.push({ accountId: account.id, email: account.email, error: error.message });
    }
  }

  return { accounts, results, errors };
}

module.exports = {
  syncImapAccount,
  syncUserImapAccounts,
};
