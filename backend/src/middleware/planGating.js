const prisma = require('../config/database');

/**
 * planGating
 * 
 * Middleware to restrict access based on user subscription plan.
 * @param {string[]} allowedPlans - Array of plans allowed to access the route (e.g. ['pro'])
 */
const planGating = (allowedPlans = ['pro']) => {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { subscription: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const currentPlan = user.subscription?.plan || user.plan || 'free';
      const status = user.subscription?.status || 'active';

      // If 'free' is allowed, everyone passes
      if (allowedPlans.includes('free')) {
        return next();
      }

      // Check if user's plan is in allowedPlans AND the subscription is active/trialing
      const isActive = status === 'active' || status === 'trialing';
      
      if (!allowedPlans.includes(currentPlan) || !isActive) {
        console.warn(`[PlanGating] Access denied for user ${req.user.id}. Current plan: ${currentPlan}, Status: ${status}, Required: ${allowedPlans.join('/')}`);
        return res.status(403).json({
          error: 'Subscription Required',
          message: `This feature is available on the ${allowedPlans.join('/')} plan. Please upgrade to continue.`,
          currentPlan,
          status
        });
      }

      next();
    } catch (error) {
      console.error('[PlanGating] Error:', error);
      res.status(500).json({ error: 'Internal security check failed' });
    }
  };
};

module.exports = planGating;
