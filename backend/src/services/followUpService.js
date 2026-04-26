const prisma = require('../config/database');
const { checkReplyRequired } = require('../utils/xai');

/**
 * Detects if a sent email requires a reply and creates a follow-up record if so.
 */
async function detectAndCreateFollowUp(email, userId) {
  try {
    // Only process sent emails
    if (!email.isSent) return null;

    // AI check for reply requirement
    const emailContent = `Subject: ${email.subject}\nBody: ${email.body || email.snippet}`;
    const result = await checkReplyRequired(emailContent);

    if (result.requiresReply && result.confidence > 0.6) {
      const sentAt = new Date(email.receivedAt);
      const remindAt = new Date(sentAt.getTime() + 3 * 24 * 60 * 60 * 1000); // Default 3 days

      return await prisma.followUp.create({
        data: {
          userId,
          sentEmailId: email.id,
          threadId: email.threadId,
          recipientEmail: email.recipients[0] || 'unknown',
          subject: email.subject || 'No Subject',
          sentAt,
          remindAt,
          status: 'waiting',
        },
      });
    }
  } catch (error) {
    console.error('[FollowUpService] Detection failed:', error.message);
  }
  return null;
}

/**
 * Checks if a reply has arrived for a specific thread and marks follow-up as replied.
 */
async function resolveFollowUpIfReplied(userId, threadId, incomingEmail) {
  try {
    // If the incoming email is NOT sent by the user, it's a potential reply
    if (incomingEmail.isSent) return null;

    const followUp = await prisma.followUp.findFirst({
      where: {
        userId,
        threadId,
        status: 'waiting',
      },
    });

    if (followUp) {
      return await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          status: 'replied',
          replyReceivedAt: new Date(incomingEmail.receivedAt),
        },
      });
    }
  } catch (error) {
    console.error('[FollowUpService] Resolution failed:', error.message);
  }
  return null;
}

/**
 * Get all active follow-ups for a user.
 */
async function getActiveFollowUps(userId) {
  return await prisma.followUp.findMany({
    where: {
      userId,
      status: { in: ['waiting', 'snoozed'] },
    },
    include: {
      email: true,
    },
    orderBy: {
      remindAt: 'asc',
    },
  });
}

/**
 * Snooze a follow-up.
 */
async function snoozeFollowUp(id, userId, days) {
  const snoozeMs = days * 24 * 60 * 60 * 1000;
  const newRemindAt = new Date(Date.now() + snoozeMs);

  return await prisma.followUp.updateMany({
    where: { id, userId },
    data: {
      status: 'snoozed',
      remindAt: newRemindAt,
      snoozedUntil: newRemindAt,
    },
  });
}

/**
 * Dismiss a follow-up.
 */
async function dismissFollowUp(id, userId) {
  return await prisma.followUp.updateMany({
    where: { id, userId },
    data: {
      status: 'dismissed',
    },
  });
}

/**
 * Main entry point for background follow-up automation.
 */
async function detectFollowUps(io) {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
    });

    const results = [];
    for (const user of users) {
      // For now, this is just a hook. 
      // The real detection happens during sync in inboxSyncService.
      // We could add logic here to re-activate snoozed items or similar.
    }
    return results;
  } catch (error) {
    console.error('[FollowUpService] detectFollowUps failed:', error.message);
    return [];
  }
}

module.exports = {
  detectAndCreateFollowUp,
  resolveFollowUpIfReplied,
  getActiveFollowUps,
  snoozeFollowUp,
  dismissFollowUp,
  detectFollowUps,
};
