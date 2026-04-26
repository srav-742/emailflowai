const express = require('express');
const { createCheckout, createPortal, getSubscription } = require('../controllers/billingController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/checkout', createCheckout);
router.post('/portal', createPortal);
router.get('/subscription', getSubscription);

module.exports = router;
