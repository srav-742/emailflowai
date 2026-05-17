const express = require('express');
const { createCheckout, createPortal, getSubscription } = require('../controllers/billingController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.post('/checkout', asyncHandler(createCheckout));
router.post('/portal', asyncHandler(createPortal));
router.get('/subscription', asyncHandler(getSubscription));

module.exports = router;
