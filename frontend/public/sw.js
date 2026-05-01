self.addEventListener('push', event => {
  try {
    const data = event.data.json();
    console.log('[ServiceWorker] Push event received:', data);

    const title = data.title || 'EmailFlow AI Update';
    const options = {
      body: data.body || 'You have a new update in your workspace.',
      icon: '/logo192.png',
      badge: '/badge.png',
      data: { url: data.url || '/' },
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: 'View Now' }
      ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error('[ServiceWorker] Push event handling failed:', error);
  }
});

self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification clicked:', event.notification.data);
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // If a window is already open, focus it
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
