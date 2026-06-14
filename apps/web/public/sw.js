// Service worker para Vetlla (PWA).
// Estrategia network-first con fallback a caché para GET del mismo origen.
// Nunca cachea /api/ (auth y datos). La capacidad offline de los datos de
// atención se apoya en IndexedDB + cola de sincronización, no en el SW.
//
// Notificaciones push (ARQ-C01, RF-NOT-001..005):
//   - Listener 'push': parsea el payload JSON { title, body, url, tag, icon? }
//     y muestra la notificación via self.registration.showNotification.
//   - Listener 'notificationclick': cierra la notificación y enfoca/abre la URL.
//
// Contrato del payload (ver apps/web/src/server/push/payload.ts):
//   { title: string, body: string, url: string, tag: string, icon?: string }

const CACHE = 'vetlla-v1';
const DEFAULT_ICON = '/icon.svg';

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

// ---------------------------------------------------------------------------
// Push notifications (RF-NOT-001..005)
// ---------------------------------------------------------------------------

/**
 * Listener 'push': recibe la notificación del servidor (via web-push/VAPID),
 * parsea el payload JSON y muestra la notificación al usuario.
 * Payload esperado: { title, body, url, tag, icon? }
 * (definido en apps/web/src/server/push/payload.ts — PushPayload)
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Si el payload no es JSON válido, usamos el texto como cuerpo.
    payload = { title: 'Vetlla', body: event.data.text(), url: '/', tag: 'vetlla-general' };
  }

  const { title = 'Vetlla', body = '', url = '/', tag = 'vetlla-general', icon } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: icon ?? DEFAULT_ICON,
      badge: DEFAULT_ICON,
      data: { url },
    }),
  );
});

/**
 * Listener 'notificationclick': cuando el usuario pulsa la notificación,
 * cierra el popup y enfoca una pestaña existente en la URL del payload
 * o abre una nueva si no hay ninguna abierta.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Buscar una pestaña ya abierta en la misma URL (o raíz).
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay pestaña existente, abre una nueva.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
