const CACHE_NAME = 'dirhub-commando-v2'; 
const RUNTIME_CACHE = 'dirhub-runtime';

// Ressources critiques (celles-ci sont au même scope que le SW)
const CRITICAL_ASSETS = [ 
  '/', 
  '/index.html'
]; 

// Ressources externes - cachées en background
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://esm.sh/react@18',
  'https://esm.sh/react-dom@18/client',
  'https://esm.sh/lucide-react@0.344.0'
];

// Installation : Cache les ressources critiques IMMÉDIATEMENT
self.addEventListener('install', e => { 
  console.log('[SW] Installation en cours...');
  e.waitUntil( 
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching ressources critiques');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => {
        // Cache les ressources externes en background (ne pas bloquer l'install)
        caches.open(RUNTIME_CACHE).then(cache => {
          EXTERNAL_ASSETS.forEach(url => {
            fetch(url)
              .then(response => {
                if (response.ok) {
                  cache.put(url, response.clone());
                  console.log('[SW] Cached:', url);
                }
              })
              .catch(err => console.log('[SW] Échec cache:', url, err));
          });
        });
        return true;
      })
  ); 
  self.skipWaiting(); 
}); 

self.addEventListener('activate', e => { 
  console.log('[SW] Activation...');
  e.waitUntil(
    Promise.all([
      clients.claim(),
      // Nettoyer les anciens caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map(name => caches.delete(name))
        );
      })
    ])
  ); 
}); 

// Stratégie : Réseau d'abord, puis Cache, puis Fallback
self.addEventListener('fetch', e => { 
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  e.respondWith(
    // Essayer le réseau EN PREMIER
    fetch(e.request, { mode: 'no-cors' })
      .then(networkResponse => {
        // Accepter les réponses valides (même status 0 en mode no-cors)
        if (networkResponse && networkResponse.status !== 404) {
          // Mettre à jour le cache avec la nouvelle version
          const cache = networkResponse.url.includes('esm.sh') || networkResponse.url.includes('tailwind') || networkResponse.url.includes('babel') || networkResponse.url.includes('unpkg')
            ? RUNTIME_CACHE
            : CACHE_NAME;
          
          caches.open(cache).then(c => {
            c.put(e.request, networkResponse.clone());
          });
          return networkResponse;
        }
        throw new Error('Response not OK');
      })
      .catch(() => {
        // Fallback au cache
        return caches.match(e.request, { ignoreSearch: true })
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', e.request.url);
              return cachedResponse;
            }
            
            // Dernière tentative : chercher dans l'autre cache
            return caches.keys().then(names => {
              for (let name of names) {
                // Chercher dans tous les caches
                return caches
                  .open(name)
                  .then(cache => cache.match(e.request, { ignoreSearch: true }))
                  .then(res => res || Promise.reject());
              }
            }).catch(() => {
              console.log('[SW] Resource not available:', e.request.url);
              return new Response('Offline - Ressource non disponible', { 
                status: 503, 
                statusText: 'Service Unavailable' 
              });
            });
          });
      })
  ); 
});
