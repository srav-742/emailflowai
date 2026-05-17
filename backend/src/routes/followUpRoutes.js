const express = require('express');
const router = express.Router();
const followUpController = require('../controllers/followUpController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

router.use(authenticate);

router.get('/', asyncHandler(followUpController.getFollowUps));
router.get('/stats', asyncHandler(followUpController.getStats));
router.patch('/:id/snooze', asyncHandler(followUpController.snooze));
router.patch('/:id/dismiss', asyncHandler(followUpController.dismiss));

module.exports = router;
