const express = require('express');
const { aiQueue } = require('../queues/ai.queue');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get('/test-ai', asyncHandler(async (req, res) => {
  try {
    const shouldFail = req.query.fail === 'true';
    
    const job = await aiQueue.add(
      'generate-email',
      {
        prompt: req.query.prompt || 'Test AI Job',
        fail: shouldFail,
      }
    );

    res.json({
      success: true,
      jobId: job.id,
      description: shouldFail ? 'Job will trigger retries' : 'Job added successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}));

module.exports = router;
