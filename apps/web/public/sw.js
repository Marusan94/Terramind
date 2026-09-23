// Terramind Service Worker
// v1.0: navegaciones con network-first (evita pantalla blanca tras un deploy
// en movil: el index.html viejo apuntaba a assets con hash ya eliminados).
// Solo los assets con hash (/assets/*) y tiles/API van cache-first.
const CACHE_NAME = 'terramind-v1.0';
const TILE_CACHE = 'terramind-tiles-v1';
const API_CACHE = 'terramind-api-v1';

const STATIC_ASSETS = [
  '/favicon.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== TILE_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navegaciones (/, /?layer=..., instalar PWA): red primero, caché como respaldo.
  // Así un deploy nuevo nunca deja al móvil con un index.html obsoleto en blanco.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache API responses (Open-Meteo)
  if (url.hostname.includes('open-meteo.com')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Cache map tiles
  if (url.hostname.includes('tile.openstreetmap.org') ||
      url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.opentopomap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Assets con hash de Vite (/assets/*.js|css): cache-first, son inmutables.
  // El index.html y el resto: red primero para no servir bundles obsoletos.
  if (request.method === 'GET') {
    const immutable = url.pathname.startsWith('/assets/');
    event.respondWith(
      immutable
        ? caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }))
        : fetch(request)
            .then((response) => response)
            .catch(() => caches.match(request))
    );
  }
});
