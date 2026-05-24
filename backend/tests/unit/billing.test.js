require('dotenv').config();
const stripeService = require('../../src/services/stripeService');
const usageService = require('../../src/services/usageService');
const prisma = require('../../src/config/database');

describe('Stripe Billing & Subscriptions Unit Tests', () => {
  let testUser;

  beforeAll(async () => {
    await prisma.$connect();
    
    // Create a mock user for testing
    testUser = await prisma.user.create({
      data: {
        email: `billing_test_${Date.now()}@example.com`,
        name: 'Billing Test User',
        plan: 'free'
      }
    });
  });

  afterAll(async () => {
    // Cleanup mock data
    if (testUser) {
      await prisma.user.delete({
        where: { id: testUser.id }
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test('usageService correctly calculates free plan limits', async () => {
    const status = await usageService.getUsageStatus(testUser.id);
    expect(status.plan).toBe('free');
    expect(status.limits.connected_accounts).toBe(1);
    expect(status.limits.ai_summaries).toBe(50);
  });

  test('usageService trackUsage correctly records incrementable AI actions', async () => {
    const countBefore = await usageService.getUsage(testUser.id, 'ai_summaries');
    await usageService.trackUsage(testUser.id, 'ai_summaries', 5);
    const countAfter = await usageService.getUsage(testUser.id, 'ai_summaries');
    expect(countAfter - countBefore).toBe(5);
  });

  test('usageService correctly detects limit enforcement bounds', async () => {
    const withinLimit = await usageService.isWithinLimit(testUser.id, 'ai_summaries', 10);
    // User already used 5, free plan limit is 50. 5 + 10 = 15 <= 50, so should be within limit.
    expect(withinLimit).toBe(true);
  });
});
