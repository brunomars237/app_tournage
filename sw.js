const CACHE_NAME = 'dirhub-commando-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://esm.sh/react@18',
  'https://esm.sh/react-dom@18/client',
  'https://esm.sh/lucide-react@0.344.0'
];

// Installation : Mise en cache des ressources critiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Stratégie : Réseau d'abord, sinon Cache (pour garantir les dernières modifs de ton index.html)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(networkResponse => {
        // On met à jour le cache avec la nouvelle version
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // En cas d'échec (hors-ligne), on sert le cache
        return caches.match(e.request);
      })
  );
});
