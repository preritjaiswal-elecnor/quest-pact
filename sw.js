// Quest Pact Service Worker
const CACHE = 'questpact-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always go to network — no caching
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request));
});
