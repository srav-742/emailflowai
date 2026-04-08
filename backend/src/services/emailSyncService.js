const prisma = require('../config/database');
const { syncInbox } = require('./inboxSyncService');
const { emitEmailNotifications } = require('./notificationService');
const { detectFollowUps } = require('./followUpService');

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
        ],
      },
      select: {
        id: true,
        importantContacts: true,
      },
    });

    for (const user of users) {
      try {
        const result = await syncInbox(user.id, 25, { returnMeta: true });

        if (result.warning) {
          console.warn(`Sync warning for user ${user.id}: ${result.warning}`);
        }

        if (result.newEmails.length > 0) {
          console.log(`Live sync detected ${result.newEmails.length} new email(s) for user ${user.id}`);
          emitEmailNotifications(io, user, result.newEmails);
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
