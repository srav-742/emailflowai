const stripeProductionService = require('../services/stripeProductionService');
const usageService = require('../services/usageService');
const prisma = require('../config/database');

/**
 * Creates Stripe Checkout Session for plan or price ID via the strict production service
 */
const createCheckout = async (req, res) => {
  try {
    const { priceId, plan } = req.body;
    const planOrPrice = priceId || plan;
    
    if (!planOrPrice) {
      return res.status(400).json({ error: 'Plan name or Price ID is required' });
    }

    const session = await stripeProductionService.createCheckoutSession(req.user.id, planOrPrice);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[Billing V2] Checkout Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Creates Stripe Customer Billing Portal redirect link via the strict production service
 */
const createPortal = async (req, res) => {
  try {
    const session = await stripeProductionService.createPortalSession(req.user.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[Billing V2] Portal Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieve User Subscription details, dynamic usage limits, and transactional invoices
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const usageStatus = await usageService.getUsageStatus(userId);

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
    console.error('[Billing V2] Subscription Details Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription and usage details' });
  }
};

/**
 * Secure Stripe Webhook Signature Construction & Processing Handler
 * This version strictly enforces signatures and throws errors if Stripe is not properly configured.
 */
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (!stripeProductionService.stripe) {
      return res.status(503).json({ error: 'Stripe service unavailable. STRIPE_SECRET_KEY missing.' });
    }

    if (!sig) {
      return res.status(400).send('Webhook signature missing');
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ error: 'Stripe webhook secret is missing in environment variables.' });
    }

    // Sig Verification (will throw if invalid)
    event = stripeProductionService.stripe.webhooks.constructEvent(
      req.body, // raw request body is needed here, ensuring we mount this route correctly
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Stripe V2 Webhook Verification Error] ${err.message}`);
    return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
  }

  try {
    await stripeProductionService.handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error(`[Stripe V2 Webhook Processing Error] ${err.message}`);
    res.status(500).json({ error: 'Webhook execution failed' });
  }
};

module.exports = {
  createCheckout,
  createPortal,
  getSubscription,
  handleWebhook
};
