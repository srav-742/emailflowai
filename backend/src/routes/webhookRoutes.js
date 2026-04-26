const express = require('express');
const { handleWebhook } = require('../controllers/billingController');

const router = express.Router();

// Stripe requires the raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
