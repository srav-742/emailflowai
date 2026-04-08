const express = require('express');
const {
  morningBrief,
  trainStyle,
  getAnalyticsSummary,
  updatePreferences,
  listAccounts,
} = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/morning-brief', morningBrief);
router.get('/analytics', getAnalyticsSummary);
router.post('/style/train', trainStyle);
router.put('/preferences', updatePreferences);
router.get('/accounts', listAccounts);

module.exports = router;
