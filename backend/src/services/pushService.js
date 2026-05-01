const webpush = require('web-push');
const prisma = require('../config/database');

// Configure VAPID details
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@emailflowai.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Sends a push notification to all active subscriptions of a user.
 * 
 * @param {string} userId - Target user ID.
 * @param {Object} payload - { title, body, url }
 */
async function sendPushNotification(userId, payload) {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    if (!subscriptions.length) return;

    console.log(`[PushService] Sending notification to user ${userId} (${subscriptions.length} devices)`);

    const notifications = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.auth,
          p256dh: sub.p256dh
        }
      };

      try {
        await webpush.sendNotification(pushConfig, JSON.stringify(payload));
      } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.warn(`[PushService] Subscription expired or removed for user ${userId}. Deleting from DB.`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          console.error(`[PushService] Error sending to subscription ${sub.id}:`, error.message);
        }
      }
    });

    await Promise.allSettled(notifications);
  } catch (error) {
    console.error(`[PushService] Global error sending push to user ${userId}:`, error.message);
  }
}

module.exports = { sendPushNotification };
