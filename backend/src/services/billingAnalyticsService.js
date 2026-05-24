const prisma = require('../config/database');

/**
 * Get monthly price value (in USD) based on price ID
 */
const getMonthlyEquivalentValue = (priceId) => {
  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly';
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual';
  const basic = process.env.STRIPE_BASIC_PRICE_ID || 'price_basic';
  const pro = process.env.STRIPE_PRO_PRICE_ID || 'price_pro';
  const enterprise = process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise';

  // Fallbacks if priceId matches or contains certain keywords
  if (priceId === proMonthly || priceId === pro) {
    return 12.0; // $12/month
  }
  if (priceId === proAnnual) {
    return 99.0 / 12.0; // $8.25/month equivalent
  }
  if (priceId === enterprise) {
    return 299.0; // $299/month
  }
  if (priceId === basic) {
    return 5.0; // $5/month
  }

  // Fallback checking by string match if actual IDs are generated dynamically
  const lower = String(priceId || '').toLowerCase();
  if (lower.includes('annual') || lower.includes('yearly')) {
    if (lower.includes('pro')) return 99.0 / 12.0;
    if (lower.includes('team')) return 399.0 / 12.0;
    return 0;
  }
  if (lower.includes('pro')) return 12.0;
  if (lower.includes('team')) return 49.0;
  if (lower.includes('enterprise')) return 299.0;
  if (lower.includes('basic')) return 5.0;

  return 0;
};

/**
 * Calculate active revenue analytics (MRR, ARR, active counts)
 */
const getBillingAnalytics = async () => {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'trialing'] }
    }
  });

  const allSubscriptionsCount = await prisma.subscription.count();
  const canceledCount = await prisma.subscription.count({
    where: {
      status: 'canceled'
    }
  });

  let mrr = 0;
  const planDistribution = {
    free: 0,
    basic: 0,
    pro: 0,
    team: 0,
    enterprise: 0
  };

  activeSubscriptions.forEach((sub) => {
    const value = getMonthlyEquivalentValue(sub.stripePriceId);
    mrr += value;

    const plan = sub.plan || 'free';
    if (planDistribution[plan] !== undefined) {
      planDistribution[plan]++;
    } else {
      planDistribution[plan] = 1;
    }
  });

  const arr = mrr * 12;

  // Churn rate calculation
  const churnRate = allSubscriptionsCount > 0 
    ? Number(((canceledCount / allSubscriptionsCount) * 100).toFixed(2)) 
    : 0;

  // Total trial subscriptions
  const trialingCount = await prisma.subscription.count({
    where: { status: 'trialing' }
  });

  // Recent invoice transactions (limit 10)
  const recentInvoices = await prisma.invoice.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });

  // Total successful invoice amounts
  const successfulPayments = await prisma.invoice.aggregate({
    where: { status: 'paid' },
    _sum: {
      amount: true
    }
  });

  const totalRevenue = successfulPayments._sum.amount 
    ? Number((successfulPayments._sum.amount / 100).toFixed(2)) // amount is in cents
    : 0;

  return {
    mrr: Number(mrr.toFixed(2)),
    arr: Number(arr.toFixed(2)),
    totalRevenue,
    churnRate,
    trialingCount,
    activeCount: activeSubscriptions.length,
    planDistribution,
    recentInvoices: recentInvoices.map((inv) => ({
      id: inv.id,
      stripeInvoiceId: inv.stripeInvoiceId,
      customerName: inv.user?.name || 'Customer',
      customerEmail: inv.user?.email || '',
      amount: Number((inv.amount / 100).toFixed(2)),
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      invoicePdf: inv.invoicePdf,
      createdAt: inv.createdAt
    }))
  };
};

module.exports = {
  getBillingAnalytics
};
