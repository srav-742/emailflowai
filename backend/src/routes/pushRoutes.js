const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe } = require('../controllers/pushController');
const { authenticate } = require('../middleware/auth');

router.post('/subscribe', authenticate, subscribe);
router.post('/unsubscribe', authenticate, unsubscribe);

module.exports = router;
