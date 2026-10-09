/**
 * Service Worker Dojang Turn Pro (Scope Khusus: '/turn-pro/')
 * Khusus menangani kebutuhan Offline Capability Arena Pertandingan:
 * 1. Precache App Shell & Sound Engine
 * 2. Cache-First untuk aset pertandingan
 * 3. Background Sync untuk pengiriman antrean Outbox scoring saat online
 */

const CACHE_NAME = 'turn-pro-v2';

const TURN_PRO_ASSETS = [
  '/turn-pro/',
  '/turn-pro/index.html',
  '/turn-pro/turn-pro.css',
  '/turn-pro/turn-pro.js',
  '/turn-pro/display.html',
  '/turn-pro/display.css',
  '/turn-pro/display.js',
  '/turn-pro/manifest.json'
];

// Install: Cache seluruh aset arena pertandingan
self.addEventListener('install', (event) => {
  console.log('[Turn Pro SW] Menginstal Service Worker Arena Pertandingan...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Turn Pro SW] Pre-caching asset turn-pro');
      return cache.addAll(TURN_PRO_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Bersihkan cache versi lama turn-pro
self.addEventListener('activate', (event) => {
  console.log('[Turn Pro SW] Mengaktifkan Service Worker Arena...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('turn-pro-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First untuk aset /turn-pro/, bypass untuk API sync
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jangan intercept request API backend sync (ditangani langsung oleh client IndexedDB)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Intercept request aset di subpath /turn-pro/
  if (url.pathname.startsWith('/turn-pro')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Aset ditemukan di cache: Return instan tanpa internet!
          return cachedResponse;
        }

        // Jika belum ada di cache, ambil dari network dan simpan
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Fallback ke offline index jika navigasi HTML
          if (event.request.mode === 'navigate') {
            return caches.match('/turn-pro/index.html');
          }
        });
      })
    );
  }
});

// Background Sync: Pemicu otomatis dari browser saat sinyal kembali online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-match-scores') {
    console.log('[Turn Pro SW] Background Sync dipicu: sync-match-scores');
    event.waitUntil(notifyClientsToSync());
  }
});

// Beritahu window client yang aktif untuk memicu sync outbox
async function notifyClientsToSync() {
  const allClients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({
      type: 'TRIGGER_OUTBOX_SYNC',
      source: 'BACKGROUND_SYNC'
    });
  }
}
