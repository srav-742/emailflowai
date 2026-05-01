const cron = require('node-cron');
const prisma = require('../config/database');
const { buildStyleProfile } = require('../services/styleService');

/**
 * Scheduled job to learn user writing styles.
 * Runs daily at 2:00 AM.
 */
function startStyleLearningJob() {
  // 0 2 * * * = Daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[StyleJob] Starting daily style learning cycle...');
    
    try {
      // Find users who signed up in the last 10 days (Intensive Learning)
      // OR users who haven't updated their profile in 7 days (Maintenance)
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const usersToLearn = await prisma.user.findMany({
        where: {
          OR: [
            { createdAt: { gte: tenDaysAgo } }, // New users
            { 
              styleProfile: { 
                lastLearnedAt: { lte: sevenDaysAgo } 
              } 
            }
          ]
        },
        include: { styleProfile: true }
      });

      console.log(`[StyleJob] Found ${usersToLearn.length} users needing style analysis.`);

      for (const user of usersToLearn) {
        // Run analysis (this will handle its own logging and DB updates)
        await buildStyleProfile(user.id);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log('[StyleJob] Style learning cycle completed.');
    } catch (error) {
      console.error('[StyleJob] Fatal error during style learning:', error);
    }
  });
}

module.exports = { startStyleLearningJob };
