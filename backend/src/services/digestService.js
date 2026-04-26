const prisma = require('../config/database');
const { summarizeDailyDigest } = require('../utils/xai');

/**
 * Generates a daily digest for a specific user.
 */
async function generateDailyDigest(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // 1. Gather Data
    const [emails, actions, followups, preferences] = await Promise.all([
      // Unread important emails from last 24h
      prisma.email.findMany({
        where: {
          userId,
          isRead: false,
          priority: { in: ['high', 'normal'] },
          receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        take: 5,
        select: { subject: true, senderName: true, priority: true }
      }),
      // Pending action items due today or overdue
      prisma.actionItem.findMany({
        where: {
          userId,
          status: 'pending',
          dueDate: { lte: tomorrow }
        },
        select: { title: true, priority: true, dueDate: true }
      }),
      // Waiting follow-ups
      prisma.followUp.findMany({
        where: {
          userId,
          status: 'waiting'
        },
        select: { recipientEmail: true, subject: true, remindAt: true }
      }),
      // User preferences
      prisma.digestPreference.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
    ]);

    // 2. AI Summarization
    const aiBrief = await summarizeDailyDigest({ emails, actions, followups });

    // 3. Persist Digest
    const digest = await prisma.dailyDigest.upsert({
      where: {
        userId_digestDate: {
          userId,
          digestDate: today
        }
      },
      update: {
        content: {
          raw: { emails, actions, followups },
          ai: aiBrief
        },
        status: 'sent',
        deliveredAt: new Date()
      },
      create: {
        userId,
        digestDate: today,
        scheduledAt: new Date(),
        deliveredAt: new Date(),
        status: 'sent',
        content: {
          raw: { emails, actions, followups },
          ai: aiBrief
        }
      }
    });

    return digest;
  } catch (error) {
    console.error('[DigestService] Generation failed:', error.message);
    throw error;
  }
}

/**
 * Background worker to check and trigger digests.
 * In a real production app, this would be a Cron job.
 */
async function checkAndTriggerDigests() {
  try {
    const users = await prisma.user.findMany({
      include: { digestPreference: true }
    });

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    for (const user of users) {
      const pref = user.digestPreference || { sendTime: '07:30' };
      const [hour, minute] = pref.sendTime.split(':').map(Number);
      
      // Simple logic: if it's the right hour and we haven't sent today yet
      if (currentHour === hour && currentMinute >= minute) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existing = await prisma.dailyDigest.findUnique({
          where: { userId_digestDate: { userId: user.id, digestDate: today } }
        });

        if (!existing) {
          console.log(`[DigestService] Triggering digest for user ${user.email}`);
          await generateDailyDigest(user.id);
        }
      }
    }
  } catch (error) {
    console.error('[DigestService] Scheduler check failed:', error.message);
  }
}

module.exports = {
  generateDailyDigest,
  checkAndTriggerDigests,
};
