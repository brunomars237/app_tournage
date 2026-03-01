const CACHE_NAME = 'dirhub-commando-v3'; 
const RUNTIME_CACHE = 'dirhub-runtime-v3';

// Ressources critiques
const CRITICAL_ASSETS = [ 
  '/', 
  '/index.html'
]; 

// Ressources externes
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://esm.sh/react@18',
  'https://esm.sh/react-dom@18/client',
  'https://esm.sh/lucide-react@0.344.0'
];

// Installation : Cache TOUT agressivement
self.addEventListener('install', e => { 
  console.log('[SW] Installation en cours...');
  e.waitUntil( 
    Promise.all([
      // Cache critique
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[SW] Caching ressources critiques');
          return cache.addAll(CRITICAL_ASSETS).catch(err => {
            console.log('[SW] Partial cache OK:', err.message);
          });
        }),
      // Cache des ressources externes
      caches.open(RUNTIME_CACHE)
        .then(cache => {
          console.log('[SW] Pré-caching ressources externes...');
          return Promise.all(
            EXTERNAL_ASSETS.map(url => 
              fetch(url)
                .then(response => {
                  if (response.ok || response.status === 0) {
                    return cache.put(url, response);
                  }
                  throw new Error(`HTTP ${response.status}`);
                })
                .catch(err => console.log('[SW] Échec:', url, err.message))
            )
          );
        })
    ])
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
            .filter(name => !name.includes('dirhub-commando-v3') && !name.includes('dirhub-runtime-v3'))
            .map(name => {
              console.log('[SW] Suppression cache ancien:', name);
              return caches.delete(name);
            })
        );
      })
    ])
  ); 
}); 

// Stratégie adaptée par type de ressource
self.addEventListener('fetch', e => { 
  if (e.request.method !== 'GET') return;
  
  const url = e.request.url;
  const isExternal = url.includes('esm.sh') || url.includes('tailwind') || url.includes('babel') || url.includes('unpkg') || url.includes('unsplash');
  
  if (isExternal) {
    // Pour les CDNs externes : CACHE-FIRST (critère au cache)
    e.respondWith(
      caches.match(url)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Cache hit:', url);
            // Mettre à jour en background
            fetch(url)
              .then(response => {
                if (response.ok) {
                  caches.open(RUNTIME_CACHE).then(cache => {
                    cache.put(url, response);
                    console.log('[SW] Updated:', url);
                  });
                }
              })
              .catch(() => {});
            return cachedResponse;
          }
          
          // Pas en cache, fetch du réseau
          console.log('[SW] Network fetch:', url);
          return fetch(url)
            .then(response => {
              if (response.ok || response.status === 0) {
                // Mettre en cache
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => {
                  cache.put(url, responseClone);
                });
                return response;
              }
              throw new Error(`HTTP ${response.status}`);
            })
            .catch(err => {
              console.log('[SW] Network error, returning cache fallback:', err.message);
              return caches.match(url);
            });
        })
        .catch(() => new Response('Offline', { status: 503 }))
    );
  } else {
    // Pour nos ressources locales : NETWORK-FIRST
    e.respondWith(
      fetch(url)
        .then(networkResponse => {
          // Mettre à jour le cache
          caches.open(CACHE_NAME).then(cache => {
            cache.put(url, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => {
          console.log('[SW] Network failed, using cache:', url);
          return caches.match(url)
            .then(cachedResponse => {
              if (cachedResponse) return cachedResponse;
              // Pas trouvé dans aucun cache
              return new Response('Offline', { status: 503 });
            });
        })
    );
  }
});
