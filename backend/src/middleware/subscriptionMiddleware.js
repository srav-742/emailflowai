const usageService = require('../services/usageService');

/**
 * Middleware to enforce plan limits on specific operations
 * @param {string} metricType - The metric type to check (e.g. 'ai_summaries', 'connected_accounts')
 */
const enforceLimit = (metricType) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required for subscription verification' });
      }

      const userId = req.user.id;
      const isAllowed = await usageService.isWithinLimit(userId, metricType, 1);
      
      if (!isAllowed) {
        const status = await usageService.getUsageStatus(userId);
        return res.status(403).json({
          error: 'Limit Reached',
          message: `You have reached the usage limit for ${metricType.replace('_', ' ')} under your current plan (${status.plan.toUpperCase()}). Please upgrade your plan to increase limits.`,
          plan: status.plan,
          limit: status.limits[metricType],
          usage: status.usage[metricType]
        });
      }
      
      next();
    } catch (error) {
      console.error('[Subscription Middleware] Limit check failed:', error);
      res.status(500).json({ error: 'Failed to verify subscription limits' });
    }
  };
};

module.exports = {
  enforceLimit
};
