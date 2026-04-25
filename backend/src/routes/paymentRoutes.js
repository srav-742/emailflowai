const express = require('express');
const router = express.Router();
const StripeService = require('../services/stripeService');
const { authenticate } = require('../middleware/auth');
const bodyParser = require('body-parser');

// Checkout Session
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    const { plan } = req.body;
    const session = await StripeService.createCheckoutSession(req.user.id, plan);
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('[Stripe] Checkout Error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook (Requires raw body for signature verification)
router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[Stripe Webhook Error]: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await StripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook Handler Error]:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
