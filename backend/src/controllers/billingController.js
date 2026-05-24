const stripeService = require('../services/stripeService');
const usageService = require('../services/usageService');
const billingAnalyticsService = require('../services/billingAnalyticsService');
const prisma = require('../config/database');

/**
 * Creates Stripe Checkout Session for plan or price ID
 */
const createCheckout = async (req, res) => {
  try {
    const { priceId, plan } = req.body;
    const planOrPrice = priceId || plan;
    
    if (!planOrPrice) {
      return res.status(400).json({ error: 'Plan name or Price ID is required' });
    }

    const session = await stripeService.createCheckoutSession(req.user.id, planOrPrice);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[BillingController] Checkout Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Creates Stripe Customer Billing Portal redirect link
 */
const createPortal = async (req, res) => {
  try {
    const session = await stripeService.createPortalSession(req.user.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[BillingController] Portal Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieve User Subscription details, dynamic usage limits, and transactional invoices
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch subscription record
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    // Fetch dynamic limits & usage meters
    const usageStatus = await usageService.getUsageStatus(userId);

    // Fetch user invoices
    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      subscription,
      usage: usageStatus,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        stripeInvoiceId: inv.stripeInvoiceId,
        amount: Number((inv.amount / 100).toFixed(2)),
        currency: inv.currency.toUpperCase(),
        status: inv.status,
        invoicePdf: inv.invoicePdf,
        createdAt: inv.createdAt
      }))
    });
  } catch (error) {
    console.error('[BillingController] Subscription Details Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription and usage details' });
  }
};

/**
 * Retrieve SaaS Revenue Analytics (MRR, ARR, Churn, Upgrades)
 */
const getAnalytics = async (req, res) => {
  try {
    // Only allow admin or billing managers if auth scope is extended, otherwise default authorized
    const analytics = await billingAnalyticsService.getBillingAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('[BillingController] Revenue Analytics Error:', error);
    res.status(500).json({ error: 'Failed to retrieve SaaS revenue analytics' });
  }
};

/**
 * Secure Stripe Webhook Signature Construction & Processing Handler
 */
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (!stripeService.stripe) {
      console.warn('[Stripe Webhook MOCK] Stripe client not active. Simulated payload event fired.');
      // Simulating webhook reception in dev
      if (req.body && req.body.type) {
        await stripeService.handleWebhook(req.body);
        return res.json({ received: true, mock: true });
      }
      return res.status(503).json({ error: 'Stripe service unavailable' });
    }

    if (!sig) {
      return res.status(400).send('Webhook signature missing');
    }

    // Sig Verification
    event = stripeService.stripe.webhooks.constructEvent(
      req.body, // Contains raw request body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Stripe Webhook Verification Error] ${err.message}`);
    return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
  }

  try {
    // Execute Stripe webhook engine
    await stripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook Processing Error] ${err.message}`);
    res.status(500).json({ error: 'Webhook execution failed' });
  }
};

module.exports = {
  createCheckout,
  createPortal,
  getSubscription,
  getAnalytics,
  handleWebhook
};
