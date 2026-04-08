const prisma = require('../config/database');

async function ensureUserStats(userId) {
  return prisma.userStats.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

async function trackEmailProcessing(userId, count = 1) {
  await ensureUserStats(userId);

  return prisma.userStats.update({
    where: { userId },
    data: {
      emailsProcessed: {
        increment: Math.max(0, count),
      },
    },
  });
}

async function trackAIAction(userId, options = {}) {
  const aiActions = Math.max(0, options.aiActions ?? 1);
  const timeSaved = Math.max(0, options.timeSaved ?? 2);

  await ensureUserStats(userId);

  return prisma.userStats.update({
    where: { userId },
    data: {
      aiActions: {
        increment: aiActions,
      },
      timeSaved: {
        increment: timeSaved,
      },
    },
  });
}

async function getAnalytics(userId) {
  const stats = await ensureUserStats(userId);
  const [totalEmails, unreadCount, followUpCount, actionRequiredCount, byCategory, byPriority, recentAI] = await Promise.all([
    prisma.email.count({
      where: { userId },
    }),
    prisma.email.count({
      where: { userId, isRead: false },
    }),
    prisma.email.count({
      where: { userId, followUp: true },
    }),
    prisma.email.count({
      where: { userId, actionRequired: true },
    }),
    prisma.email.groupBy({
      by: ['category'],
      where: { userId },
      _count: true,
    }),
    prisma.email.groupBy({
      by: ['priority'],
      where: { userId },
      _count: true,
    }),
    prisma.aILog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        actionType: true,
        model: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    id: stats.id,
    userId: stats.userId,
    emailsProcessed: stats.emailsProcessed,
    aiActions: stats.aiActions,
    timeSaved: stats.timeSaved,
    totalEmails,
    unreadCount,
    followUpCount,
    actionRequiredCount,
    byCategory: byCategory.map((item) => ({
      category: item.category,
      count: item._count?._all ?? item._count ?? 0,
    })),
    byPriority: byPriority.map((item) => ({
      priority: item.priority,
      count: item._count?._all ?? item._count ?? 0,
    })),
    recentAI,
  };
}

module.exports = {
  ensureUserStats,
  trackEmailProcessing,
  trackAIAction,
  getAnalytics,
};
