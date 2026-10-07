/**
 * Service Worker Dojang Core (Root Scope: '/')
 * Bertanggung jawab atas caching shell halaman public dan login Dojang Core.
 */

const CACHE_NAME = 'dojang-core-v1';

const CORE_PRECACHE = [
  '/',
  '/index.html',
  '/core.css',
  '/core.js'
];

// Install: Cache aset inti Dojang Core
self.addEventListener('install', (event) => {
  console.log('[Core SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Core SW] Caching app shell');
      return cache.addAll(CORE_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Bersihkan cache lama khusus Core
self.addEventListener('activate', (event) => {
  console.log('[Core SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('dojang-core-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Jangan ganggu subpath lain (/turn-pro/, /coach/, /member/) dan API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jika request menuju ke /turn-pro/, /coach/, /member/, atau /api/, serahkan ke SW masing-masing atau network
  if (
    url.pathname.startsWith('/turn-pro') ||
    url.pathname.startsWith('/coach') ||
    url.pathname.startsWith('/member') ||
    url.pathname.startsWith('/api')
  ) {
    return;
  }

  // Stale-While-Revalidate untuk aset Dojang Core
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
