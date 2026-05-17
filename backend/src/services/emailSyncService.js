const prisma = require('../config/database');
const { syncInbox } = require('./inboxSyncService');
const { emitEmailNotifications } = require('./notificationService');
const { detectFollowUps } = require('./followUpService');
const { broadcastInboxSummary } = require('./inboxSummaryService');

let interval = null;
let followUpInterval = null;
let isPolling = false;
let isFollowUpPolling = false;

async function pollInbox(io) {
  if (isPolling) {
    return;
  }

  isPolling = true;

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
          {
            emailAccounts: {
              some: {
                provider: 'google',
                syncEnabled: true,
                OR: [
                  { accessToken: { not: null } },
                  { refreshToken: { not: null } },
                ],
              },
            },
          },
          {
            oauthTokens: {
              some: {},
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        importantContacts: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    console.log(`[Sync] Polling ${users.length} user(s) with active tokens...`);
    for (const user of users) {
      console.log(`[Sync] Processing user: ${user.email} (${user.id})`);
      try {
        // Fetch all connected email accounts for this user
        const accounts = await prisma.emailAccount.findMany({
          where: {
            userId: user.id,
            provider: 'google',
            syncEnabled: true,
            OR: [
              { accessToken: { not: null } },
              { refreshToken: { not: null } },
            ],
          },
          select: { id: true, email: true, isPrimary: true },
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' },
          ],
        });
        const oauthTokens = await prisma.oAuthToken.findMany({
          where: { userId: user.id },
          select: { email: true },
        });
        const oauthTokenEmails = new Set(oauthTokens.map((token) => token.email));
        const hasLegacyTokens = Boolean(user.accessToken || user.refreshToken);
        const hasPrimaryAccount = accounts.some((account) => account.email === user.email);
        const shouldSyncDefaultConnection = accounts.length === 0
          ? (hasLegacyTokens || oauthTokenEmails.size > 0)
          : (!hasPrimaryAccount && (hasLegacyTokens || oauthTokenEmails.has(user.email)));

        // Sync legacy account if it has tokens
        console.log(`[Sync] Checking default Google connection for ${user.email}:`, {
          hasLegacyTokens,
          hasPrimaryOauthToken: oauthTokenEmails.has(user.email),
          hasActiveAccounts: accounts.length > 0,
        });
        if (shouldSyncDefaultConnection) {
          console.log(`[Sync] Triggering legacy sync for ${user.email}`);
          await syncAndNotify(io, user, null);
        }

        // Sync all new-style accounts
        console.log(`[Sync] Found ${accounts.length} linked accounts for ${user.email}`);
        for (const account of accounts) {
          console.log(`[Sync] Triggering sync for account: ${account.email} (${account.id})`);
          await syncAndNotify(io, user, account.id);
        }

        // Automatic Calendar Sync
        const { syncCalendar } = require('./calendarService');
        try {
          await syncCalendar(user.id);
        } catch (calErr) {
          // Silently fail or log if needed, don't crash the email sync
          console.log(`[Sync] Calendar auto-sync skipped for ${user.email}: ${calErr.message}`);
        }

      } catch (error) {
        console.error(`Polling error for user ${user.id}:`, error.message || error);
      }
    }
  } catch (error) {
    console.error('Polling error:', error.message || error);
  } finally {
    isPolling = false;
  }
}

async function syncAndNotify(io, user, accountId) {
  try {
    const result = await syncInbox(user.id, 25, { returnMeta: true, accountId });

    if (result.newEmails.length > 0) {
      console.log(`Live sync detected ${result.newEmails.length} new email(s) for user ${user.id} (Account: ${accountId || 'primary'})`);
      emitEmailNotifications(io, user, result.newEmails);
      void broadcastInboxSummary(io, user, result.newEmails);
    }
  } catch (error) {
    if (!error.message?.includes('Please reconnect')) {
      console.error(`Sync error for user ${user.id} account ${accountId}:`, error.message);
    }
  }
}

async function pollFollowUps(io) {
  if (isFollowUpPolling) {
    return;
  }

  isFollowUpPolling = true;

  try {
    const newlyFlagged = await detectFollowUps(io);

    if (newlyFlagged.length > 0) {
      console.log(`Follow-up automation flagged ${newlyFlagged.length} thread(s).`);
    }
  } catch (error) {
    console.error('Follow-up polling error:', error.message || error);
  } finally {
    isFollowUpPolling = false;
  }
}

function startEmailPolling(io) {
  if (interval) {
    return interval;
  }

  const pollIntervalMs = Number(process.env.EMAIL_POLL_INTERVAL_MS || 60000);
  const followUpIntervalMs = Number(process.env.FOLLOW_UP_POLL_INTERVAL_MS || 60 * 60 * 1000);

  void pollInbox(io);
  void pollFollowUps(io);
  interval = setInterval(() => {
    void pollInbox(io);
  }, pollIntervalMs);
  followUpInterval = setInterval(() => {
    void pollFollowUps(io);
  }, followUpIntervalMs);

  console.log(`Email polling started every ${Math.round(pollIntervalMs / 1000)} second(s)`);
  return interval;
}

module.exports = {
  startEmailPolling,
};
