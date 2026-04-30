const express = require('express');
const { 
  getSummary, 
  getDailyStats, 
  getTopSenders, 
  getCategoryBreakdown 
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/summary', getSummary);
router.get('/daily', getDailyStats);
router.get('/senders', getTopSenders);
router.get('/categories', getCategoryBreakdown);

module.exports = router;
