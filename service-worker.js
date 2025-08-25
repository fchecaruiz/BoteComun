const CACHE_NAME = 'botecomun-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/boteComun.css',
  '/boteComun.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia: cache first, fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // cachear solo GETs y respuestas válidas
        if (event.request.method === 'GET' && resp && resp.status === 200) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        }
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});