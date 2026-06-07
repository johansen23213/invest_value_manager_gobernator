// Service worker mínimo para Vetlla (PWA).
// Estrategia network-first con fallback a caché para GET del mismo origen.
// Nunca cachea /api/ (auth y datos). La capacidad offline de los datos de
// atención se apoya en IndexedDB + cola de sincronización, no en el SW.

const CACHE = 'vetlla-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallback = await cache.match('/atencion');
          if (fallback) return fallback;
        }
        throw new Error('offline');
      }
    })(),
  );
});
