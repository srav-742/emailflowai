const express = require('express');
const router = express.Router();
const digestController = require('../controllers/digestController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

router.use(authenticate);

router.get('/today', asyncHandler(digestController.getTodayDigest));
router.get('/preferences', asyncHandler(digestController.getPreferences));
router.patch('/preferences', asyncHandler(digestController.updatePreferences));
router.post('/generate', asyncHandler(digestController.triggerManualGeneration));

module.exports = router;
