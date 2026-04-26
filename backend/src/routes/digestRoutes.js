const express = require('express');
const router = express.Router();
const digestController = require('../controllers/digestController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/today', digestController.getTodayDigest);
router.get('/preferences', digestController.getPreferences);
router.patch('/preferences', digestController.updatePreferences);
router.post('/generate', digestController.triggerManualGeneration);

module.exports = router;
