const express = require('express');
const { 
  createCheckout, 
  createPortal, 
  getSubscription, 
  getAnalytics 
} = require('../controllers/billingController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

// Checkout Sessions
router.post('/checkout', asyncHandler(createCheckout));
router.post('/create-checkout-session', asyncHandler(createCheckout)); // Compatibility route

// Customer Billing Portals
router.post('/portal', asyncHandler(createPortal));
router.post('/customer-portal', asyncHandler(createPortal)); // Compatibility route

// Active Subscriptions & Invoices
router.get('/subscription', asyncHandler(getSubscription));

// Revenue & Billing Analytics
router.get('/analytics', asyncHandler(getAnalytics));

module.exports = router;
