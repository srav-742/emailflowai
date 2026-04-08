const prisma = require('../config/database');
const { emitFollowUpNotifications } = require('./notificationService');

const FOLLOW_UP_DAYS = Number(process.env.FOLLOW_UP_DAYS || 2);

async function detectFollowUps(io = null) {
  const sentEmails = await prisma.email.findMany({
    where: {
      isSent: true,
      threadId: { not: null },
    },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      threadId: true,
      subject: true,
      recipients: true,
      receivedAt: true,
      followUp: true,
    },
  });

  const newlyFlagged = [];

  for (const email of sentEmails) {
    const threadId = email.threadId;
    if (!threadId) {
      continue;
    }

    const [replyAfterSent, newerSentEmail] = await Promise.all([
      prisma.email.findFirst({
        where: {
          threadId,
          isSent: false,
          receivedAt: { gt: email.receivedAt },
        },
        select: { id: true },
      }),
      prisma.email.findFirst({
        where: {
          threadId,
          isSent: true,
          receivedAt: { gt: email.receivedAt },
        },
        select: { id: true },
      }),
    ]);

    const shouldFollowUp =
      !replyAfterSent &&
      !newerSentEmail &&
      (Date.now() - new Date(email.receivedAt).getTime()) / (1000 * 60 * 60 * 24) >= FOLLOW_UP_DAYS;

    if (shouldFollowUp && !email.followUp) {
      const updated = await prisma.email.update({
        where: { id: email.id },
        data: {
          followUp: true,
          followUpAt: new Date(),
        },
      });

      newlyFlagged.push(updated);
    }

    if (!shouldFollowUp && email.followUp) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          followUp: false,
          followUpAt: null,
        },
      });
    }
  }

  if (io && newlyFlagged.length) {
    const byUser = new Map();
    newlyFlagged.forEach((email) => {
      if (!byUser.has(email.userId)) {
        byUser.set(email.userId, []);
      }
      byUser.get(email.userId).push(email);
    });

    byUser.forEach((emails, userId) => {
      emitFollowUpNotifications(io, userId, emails);
    });
  }

  return newlyFlagged;
}

module.exports = {
  FOLLOW_UP_DAYS,
  detectFollowUps,
};
