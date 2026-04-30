const prisma = require('../config/database');

/**
 * Track a granular analytics event.
 */
async function trackEvent(userId, eventType, metadata = {}) {
  try {
    // Determine time saved based on event type
    let timeSavedSeconds = 0;
    if (eventType === 'email_processed') timeSavedSeconds = 30;
    if (eventType === 'action_completed') timeSavedSeconds = 60;
    if (eventType === 'followup_sent') timeSavedSeconds = 120;
    if (eventType === 'digest_opened') timeSavedSeconds = 300;

    const data = {
      userId,
      eventType,
      metadata: { ...metadata, timeSavedSeconds }
    };

    return await prisma.analyticsEvent.create({ data });
  } catch (error) {
    console.error('[Analytics] trackEvent failed:', error.message);
  }
}

/**
 * Aggregate yesterday's events into the daily stats table.
 */
async function aggregateDailyStats(targetDate = new Date()) {
  try {
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const nextDay = new Date(yesterday);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all events for yesterday
    const events = await prisma.analyticsEvent.findMany({
      where: {
        createdAt: {
          gte: yesterday,
          lt: nextDay,
        },
      },
    });

    // Group by user
    const userGroups = events.reduce((acc, event) => {
      if (!acc[event.userId]) {
        acc[event.userId] = {
          emailsProcessed: 0,
          actionsCompleted: 0,
          followupsSent: 0,
          timeSavedSeconds: 0,
        };
      }
      
      const meta = event.metadata || {};
      acc[event.userId].timeSavedSeconds += meta.timeSavedSeconds || 0;

      if (event.eventType === 'email_processed') acc[event.userId].emailsProcessed++;
      if (event.eventType === 'action_completed') acc[event.userId].actionsCompleted++;
      if (event.eventType === 'followup_sent') acc[event.userId].followupsSent++;
      
      return acc;
    }, {});

    // Upsert into AnalyticsDaily
    const promises = Object.entries(userGroups).map(([userId, stats]) => {
      return prisma.analyticsDaily.upsert({
        where: {
          userId_date: { userId, date: yesterday }
        },
        update: stats,
        create: {
          userId,
          date: yesterday,
          ...stats
        }
      });
    });

    await Promise.all(promises);
    console.log(`[Analytics] Aggregated stats for ${yesterday.toDateString()} (${promises.length} users)`);
  } catch (error) {
    console.error('[Analytics] Daily aggregation failed:', error.message);
  }
}

/**
 * Get 30-day summary for a user.
 */
async function getSummary(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyStats = await prisma.analyticsDaily.findMany({
    where: {
      userId,
      date: { gte: thirtyDaysAgo }
    },
    orderBy: { date: 'asc' }
  });

  const totals = dailyStats.reduce((acc, day) => {
    acc.emailsProcessed += day.emailsProcessed;
    acc.actionsCompleted += day.actionsCompleted;
    acc.followupsSent += day.followupsSent;
    acc.timeSavedSeconds += day.timeSavedSeconds;
    return acc;
  }, { emailsProcessed: 0, actionsCompleted: 0, followupsSent: 0, timeSavedSeconds: 0 });

  return {
    totals,
    daily: dailyStats
  };
}

/**
 * Get top senders for a user.
 */
async function getTopSenders(userId, limit = 10) {
  return await prisma.email.groupBy({
    by: ['sender', 'senderName'],
    where: { userId },
    _count: { _all: true },
    orderBy: { _count: { sender: 'desc' } },
    take: limit
  });
}

/**
 * Get category breakdown for a user.
 */
async function getCategoryBreakdown(userId) {
  return await prisma.email.groupBy({
    by: ['category'],
    where: { userId },
    _count: { _all: true }
  });
}

module.exports = {
  trackEvent,
  aggregateDailyStats,
  getSummary,
  getTopSenders,
  getCategoryBreakdown
};
