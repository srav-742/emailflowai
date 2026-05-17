const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe } = require('../controllers/pushController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

router.post('/subscribe', authenticate, asyncHandler(subscribe));
router.post('/unsubscribe', authenticate, asyncHandler(unsubscribe));

module.exports = router;
