const express = require('express');
const router = express.Router();
const followUpController = require('../controllers/followUpController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', followUpController.getFollowUps);
router.get('/stats', followUpController.getStats);
router.patch('/:id/snooze', followUpController.snooze);
router.patch('/:id/dismiss', followUpController.dismiss);

module.exports = router;
