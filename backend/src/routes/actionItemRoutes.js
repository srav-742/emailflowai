const express = require('express');
const {
  getActionItems,
  extractFromEmail,
  extractBatch,
  updateActionItem,
  deleteActionItem,
} = require('../controllers/actionItemController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(getActionItems));
router.post('/extract-batch', asyncHandler(extractBatch));
router.post('/:emailId/extract', asyncHandler(extractFromEmail));
router.patch('/:id', asyncHandler(updateActionItem));
router.delete('/:id', asyncHandler(deleteActionItem));

module.exports = router;
