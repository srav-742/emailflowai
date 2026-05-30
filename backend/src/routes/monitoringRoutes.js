const express = require('express');
const router = express.Router();
const { getWorkerHealth } = require('../workers/workerReliability');
const { checkRedisHealth } = require('../config/redis');

// Get overall background worker health and metrics
router.get('/workers', async (req, res) => {
  try {
    const workerHealth = getWorkerHealth();
    const redisHealth = await checkRedisHealth();
    
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      redis: redisHealth,
      workers: workerHealth,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
