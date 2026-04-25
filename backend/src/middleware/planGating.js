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
        select: { plan: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (!allowedPlans.includes(user.plan)) {
        console.warn(`[PlanGating] Access denied for user ${req.user.id}. Current plan: ${user.plan}, Required: ${allowedPlans.join('/')}`);
        return res.status(403).json({
          error: 'Subscription Required',
          message: `This feature is available on the ${allowedPlans.join('/')} plan. Please upgrade to continue.`,
          currentPlan: user.plan
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
