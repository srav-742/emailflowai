require('dotenv').config();
const prisma = require('./src/config/database');
const { trackEvent, aggregateDailyStats } = require('./src/services/analyticsService');

async function seedTestData() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user found to seed data for.');
    return;
  }

  const userId = user.id;
  console.log(`Seeding analytics for user: ${userId}`);

  // 1. Create events for the last 5 days
  for (let i = 1; i <= 5; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    console.log(`- Creating events for ${date.toDateString()}`);
    
    // Emails processed
    for (let j = 0; j < 20 + i; j++) {
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType: 'email_processed',
          metadata: { timeSavedSeconds: 30 },
          createdAt: date
        }
      });
    }

    // Actions completed
    for (let j = 0; j < 5; j++) {
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType: 'action_completed',
          metadata: { timeSavedSeconds: 60 },
          createdAt: date
        }
      });
    }

    // Aggregating for that date
    // Note: aggregateDailyStats aggregates for (targetDate - 1)
    // So to aggregate 'date', we pass 'date + 1'
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    await aggregateDailyStats(nextDay);
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seedTestData();
