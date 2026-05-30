const express = require('express');
const billingProductionController = require('../controllers/billingProductionController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Note: Webhooks must be configured with express.raw()
 * We handle this differently: this router assumes it is mounted BEFORE express.json()
 * in server.js or it requires a raw body middleware applied specifically to the webhook route.
 * 
 * E.g., app.use('/api/v2/billing/webhook', express.raw({ type: 'application/json' }), billingProductionRoutes);
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }), // Explicitly use raw for this route
  billingProductionController.handleWebhook
);

// Protect subsequent routes
router.use(authenticate);

router.post('/checkout', billingProductionController.createCheckout);
router.post('/portal', billingProductionController.createPortal);
router.get('/subscription', billingProductionController.getSubscription);

module.exports = router;
