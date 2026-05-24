const prisma = require('../config/database');

const PLAN_LIMITS = {
  free: {
    connected_accounts: 1,
    ai_summaries: 50,
    attachments_stored: 100 * 1024 * 1024, // 100MB in bytes
    automation_runs: 0,
    team_seats: 1
  },
  pro: {
    connected_accounts: 10,
    ai_summaries: 999999, // Unlimited indicator
    attachments_stored: 5 * 1024 * 1024 * 1024, // 5GB in bytes
    automation_runs: 1000,
    team_seats: 1
  },
  team: {
    connected_accounts: 100, // virtually unlimited for normal teams
    ai_summaries: 999999,
    attachments_stored: 50 * 1024 * 1024 * 1024, // 50GB in bytes
    automation_runs: 10000,
    team_seats: 10 // Baseline team seats included in plan
  },
  enterprise: {
    connected_accounts: 999999,
    ai_summaries: 999999,
    attachments_stored: 999999999999,
    automation_runs: 999999,
    team_seats: 999999
  }
};

/**
 * Get current billing period for user based on subscription
 */
const getCurrentBillingPeriod = async (userId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId }
  });

  if (subscription && subscription.currentPeriodStart && subscription.currentPeriodEnd) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
      plan: subscription.plan || 'free'
    };
  }

  // Fallback to current calendar month
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  return {
    start,
    end,
    plan: user?.plan || 'free'
  };
};

/**
 * Get dynamic usage for email accounts
 */
const getConnectedAccountsUsage = async (userId) => {
  return await prisma.emailAccount.count({
    where: { userId }
  });
};

/**
 * Get dynamic usage for attachment storage size in bytes
 */
const getAttachmentStorageUsage = async (userId) => {
  const result = await prisma.attachment.aggregate({
    where: {
      email: { userId }
    },
    _sum: {
      sizeBytes: true
    }
  });
  return result._sum.sizeBytes ? Number(result._sum.sizeBytes) : 0;
};

/**
 * Get usage count for a metric type
 */
const getUsage = async (userId, metricType) => {
  if (metricType === 'connected_accounts') {
    return await getConnectedAccountsUsage(userId);
  }
  
  if (metricType === 'attachments_stored') {
    return await getAttachmentStorageUsage(userId);
  }

  const period = await getCurrentBillingPeriod(userId);
  const metric = await prisma.usageMetric.findFirst({
    where: {
      userId,
      metricType,
      billingPeriodStart: { lte: new Date() },
      billingPeriodEnd: { gte: new Date() }
    }
  });

  if (!metric) return 0;
  // Convert BigInt to number safely
  return Number(metric.usageCount);
};

/**
 * Track/Increment usage for incrementable metrics (e.g. AI summaries, automation runs)
 */
const trackUsage = async (userId, metricType, amount = 1) => {
  const period = await getCurrentBillingPeriod(userId);

  // Find existing metric for current period
  const existingMetric = await prisma.usageMetric.findFirst({
    where: {
      userId,
      metricType,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end
    }
  });

  if (existingMetric) {
    const updated = await prisma.usageMetric.update({
      where: { id: existingMetric.id },
      data: {
        usageCount: existingMetric.usageCount + BigInt(amount)
      }
    });
    return Number(updated.usageCount);
  } else {
    const created = await prisma.usageMetric.create({
      data: {
        userId,
        metricType,
        usageCount: BigInt(amount),
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end
      }
    });
    return Number(created.usageCount);
  }
};

/**
 * Check if the user is allowed to perform an action under their current plan limits
 */
const isWithinLimit = async (userId, metricType, incrementBy = 1) => {
  const period = await getCurrentBillingPeriod(userId);
  const plan = period.plan;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const maxLimit = limits[metricType];

  if (maxLimit === undefined) return true; // No limit defined

  const currentUsage = await getUsage(userId, metricType);
  return (currentUsage + incrementBy) <= maxLimit;
};

/**
 * Full details of all user plan limits and active usage counts
 */
const getUsageStatus = async (userId) => {
  const period = await getCurrentBillingPeriod(userId);
  const plan = period.plan;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const connectedAccounts = await getUsage(userId, 'connected_accounts');
  const aiSummaries = await getUsage(userId, 'ai_summaries');
  const attachmentsStored = await getUsage(userId, 'attachments_stored');
  const automationRuns = await getUsage(userId, 'automation_runs');
  const teamSeats = await getUsage(userId, 'team_seats');

  return {
    plan,
    limits: {
      connected_accounts: limits.connected_accounts,
      ai_summaries: limits.ai_summaries,
      attachments_stored: limits.attachments_stored,
      automation_runs: limits.automation_runs,
      team_seats: limits.team_seats
    },
    usage: {
      connected_accounts: Number(connectedAccounts),
      ai_summaries: Number(aiSummaries),
      attachments_stored: Number(attachmentsStored),
      automation_runs: Number(automationRuns),
      team_seats: Number(teamSeats)
    },
    periodStart: period.start,
    periodEnd: period.end
  };
};

module.exports = {
  PLAN_LIMITS,
  getCurrentBillingPeriod,
  getUsage,
  trackUsage,
  isWithinLimit,
  getUsageStatus
};
