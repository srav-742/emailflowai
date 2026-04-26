const express = require('express');
const {
  getActionItems,
  extractFromEmail,
  extractBatch,
  updateActionItem,
  deleteActionItem,
} = require('../controllers/actionItemController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', getActionItems);
router.post('/extract-batch', extractBatch);
router.post('/:emailId/extract', extractFromEmail);
router.patch('/:id', updateActionItem);
router.delete('/:id', deleteActionItem);

module.exports = router;
