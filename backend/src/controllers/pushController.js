const prisma = require('../config/database');

const subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Valid subscription object is required' });
    }

    // Extract keys from the subscription object
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!p256dh || !auth) {
      return res.status(400).json({ error: 'Subscription keys (p256dh, auth) are required' });
    }

    // Save to database
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh,
        auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      }
    });

    res.status(201).json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('[PushController] Subscription failed:', error.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required for unsubscription' });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint }
    });

    res.json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('[PushController] Unsubscription failed:', error.message);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
};

module.exports = { subscribe, unsubscribe };
