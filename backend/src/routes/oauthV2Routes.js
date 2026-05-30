const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const accountHealthService = require('../services/oauth/accountHealthService');
const { enterpriseSyncQueue } = require('../queues/enterpriseSync.queue');

// Note: These routes should be protected by your auth middleware (e.g. clerkAuth)
// Assuming req.auth.userId or req.user.id is populated

/**
 * GET /api/v2/oauth/status
 * Dashboard endpoint to get the sync and health status of all connected accounts.
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.auth?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accounts = await prisma.emailAccount.findMany({
      where: { userId, connectionType: 'oauth' },
      select: {
        id: true,
        email: true,
        provider: true,
        healthStatus: true,
        lastHealthCheck: true,
        syncStatus: true,
        lastSyncAt: true,
      }
    });

    res.json({ accounts });
  } catch (error) {
    console.error('[OAuthV2 API] Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch account status' });
  }
});

/**
 * POST /api/v2/oauth/health-check
 * Manually trigger a health check for a specific account.
 */
router.post('/health-check', async (req, res) => {
  try {
    const userId = req.auth?.userId || req.user?.id;
    const { email } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await accountHealthService.checkAccountHealth(userId, email);
    res.json(result);
  } catch (error) {
    console.error('[OAuthV2 API] Error running health check:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

/**
 * POST /api/v2/oauth/sync
 * Manually trigger an enterprise sync for a specific account.
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = req.auth?.userId || req.user?.id;
    const { email } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Enqueue a job in the V2 sync queue
    const job = await enterpriseSyncQueue.add('enterprise-sync', {
      userId,
      email
    }, {
      jobId: `sync:v2:${userId}:${email}:${Date.now()}`
    });

    res.json({ message: 'Sync job enqueued', jobId: job.id });
  } catch (error) {
    console.error('[OAuthV2 API] Error enqueueing sync:', error);
    res.status(500).json({ error: 'Failed to enqueue sync' });
  }
});

module.exports = router;
