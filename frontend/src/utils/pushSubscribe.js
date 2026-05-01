/**
 * utility to handle browser push notification subscription
 */

const VAPID_PUBLIC_KEY = 'BFbXPsZKPEFuQyaat1GlkxW1Nb6tPaQu931_Of_7YYP_AXA1ok_fCCpdLl5MxIu6OhbyNmHjXfW-pAV9GLeFNGQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.');
    return;
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // 2. Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 3. Subscribe to Push Service
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // 4. Send subscription to backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(subscription)
    });

    console.log('[PushSubscribe] Successfully subscribed to push notifications');
    return true;
  } catch (error) {
    console.error('[PushSubscribe] Failed to subscribe to push notifications:', error);
    return false;
  }
}

export async function unsubscribeFromPush(token) {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
    }
    
    return true;
  } catch (error) {
    console.error('[PushSubscribe] Failed to unsubscribe from push notifications:', error);
    return false;
  }
}
