const express = require('express');
const { 
  getSummary, 
  getDailyStats, 
  getTopSenders, 
  getCategoryBreakdown 
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/summary', asyncHandler(getSummary));
router.get('/daily', asyncHandler(getDailyStats));
router.get('/senders', asyncHandler(getTopSenders));
router.get('/categories', asyncHandler(getCategoryBreakdown));

module.exports = router;
