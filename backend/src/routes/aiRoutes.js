const express = require('express');
const {
  morningBrief,
  trainStyle,
  getAnalyticsSummary,
  updatePreferences,
  listAccounts,
  getInboxSummary,
} = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/morning-brief', asyncHandler(morningBrief));
router.get('/analytics', asyncHandler(getAnalyticsSummary));
router.get('/inbox-summary', asyncHandler(getInboxSummary));
router.post('/style/train', asyncHandler(trainStyle));
router.post('/train-style', asyncHandler(trainStyle));
router.put('/preferences', asyncHandler(updatePreferences));
router.get('/accounts', asyncHandler(listAccounts));

module.exports = router;
