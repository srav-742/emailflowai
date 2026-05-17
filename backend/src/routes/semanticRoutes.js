const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  getStatus,
  runIndex,
  runSearch,
} = require('../controllers/semanticController');

const router = express.Router();

router.use(authenticate);

router.get('/status', asyncHandler(getStatus));
router.post('/index', asyncHandler(runIndex));
router.get('/search', asyncHandler(runSearch));
router.post('/search', asyncHandler(runSearch));

module.exports = router;
