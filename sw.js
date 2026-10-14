const C = 'carcall-v2';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))));
  self.clients.claim();
});
// Network first (so edits to config.js apply at once); cache is only an offline fallback for the app shell.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});

// Push from the Car Call server: always show a notification (iOS requires this).
self.addEventListener('push', e => e.waitUntil(self.registration.showNotification('🚗 Someone is calling about your car', {
  body: 'Tap to open Car Call and answer.', tag: 'carcall-ring', renotify: true, requireInteraction: true, icon: 'icon-192.png'
})));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./index.html');
  }));
});
