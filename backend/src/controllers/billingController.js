const stripeService = require('../services/stripeService');
const prisma = require('../config/database');

const createCheckout = async (req, res) => {
  try {
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'Price ID is required' });

    const session = await stripeService.createCheckoutSession(req.user.id, priceId);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[BillingController] Checkout Error:', error);
    res.status(500).json({ error: error.message });
  }
};

const createPortal = async (req, res) => {
  try {
    const session = await stripeService.createPortalSession(req.user.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[BillingController] Portal Error:', error);
    res.status(500).json({ error: error.message });
  }
};

const getSubscription = async (req, res) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });
    res.json({ subscription });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
};

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripeService.stripe.webhooks.constructEvent(
      req.body, // This MUST be the raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Webhook Error] ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await stripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error(`[Webhook Handler Error] ${err.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

module.exports = {
  createCheckout,
  createPortal,
  getSubscription,
  handleWebhook
};
