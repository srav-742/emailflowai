const express = require('express');
const { handleWebhook } = require('../controllers/billingController');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Stripe requires the raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), asyncHandler(handleWebhook));

module.exports = router;
