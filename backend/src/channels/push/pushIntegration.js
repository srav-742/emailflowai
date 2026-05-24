/**
 * Stage 4: Push Notification Engine Gateway
 * Links to web-push protocol and updates the frontend client.
 */
const webPush = require('web-push');
const prisma = require('../../config/database');

class PushNotificationIntegration {
  /**
   * Dispatches browser push alerts to registered push subscriptions in PostgreSQL
   * @param {String} userId - Associate user ID
   * @param {Object} payload - Notification body (title, body, urgency)
   */
  static async triggerBrowserPush(userId, payload) {
    console.log(`✨ [Push Gateway] [SIMULATOR MODE]
    -------------------------------------------------------
    MOBILE / BROWSER PUSH NOTIFICATION BROKEN
    Target User ID: ${userId}
    Payload Title: ${payload.title}
    Payload Body: ${payload.body}
    Urgency Index: ${payload.urgency || 50}
    -------------------------------------------------------`);

    // Standard push broker retrieval if configured
    try {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId }
      });

      if (subscriptions && subscriptions.length > 0 && process.env.VAPID_PUBLIC_KEY) {
        webPush.setVapidDetails(
          'mailto:support@emailflow.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );

        for (const sub of subscriptions) {
          const pushConfig = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };

          await webPush.sendNotification(pushConfig, JSON.stringify(payload)).catch(err => {
            console.warn('⚠️ [Push Gateway] Web-push failed for a subscription endpoint:', err.message);
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ [Push Gateway] DB VAPID fetch skipped or failed:', e.message);
    }

    return { success: true, timestamp: Date.now() };
  }
}

module.exports = PushNotificationIntegration;
