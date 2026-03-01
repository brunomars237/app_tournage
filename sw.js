const CACHE_NAME = 'dirhub-commando-v4'; 
const RUNTIME_CACHE = 'dirhub-runtime-v4';

// Ressources critiques
const CRITICAL_ASSETS = [ 
  '/', 
  '/index.html',
  '/styles.css'
]; 

// Ressources externes
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/client.min.js'
];

// Helper pour fetcher avec retry
const fetchWithRetry = (url, maxRetries = 3) => {
  return new Promise((resolve, reject) => {
    const attempt = (retryCount = 0) => {
      fetch(url)
        .then(response => {
          if (response.ok || response.status === 0) {
            resolve(response);
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        })
        .catch(err => {
          if (retryCount < maxRetries) {
            console.log(`[SW] Retry ${retryCount + 1}/${maxRetries} pour ${url}`);
            setTimeout(() => attempt(retryCount + 1), 1000);
          } else {
            console.log(`[SW] Échec définitif: ${url}`);
            reject(err);
          }
        });
    };
    attempt();
  });
};

// Installation : Cache TOUT agressivement avec retry
self.addEventListener('install', e => { 
  console.log('[SW] Installation en cours...');
  e.waitUntil( 
    Promise.all([
      // Cache critique (local)
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[SW] Caching ressources critiques locales');
          return cache.addAll(CRITICAL_ASSETS).catch(err => {
            console.log('[SW] Partial cache OK:', err.message);
          });
        }),
      // Cache des ressources externes avec retry
      caches.open(RUNTIME_CACHE)
        .then(cache => {
          console.log('[SW] Pré-caching ressources externes (avec retry)...');
          return Promise.all(
            EXTERNAL_ASSETS.map(url => 
              fetchWithRetry(url, 3)
                .then(response => {
                  const responseClone = response.clone();
                  cache.put(url, responseClone);
                  console.log('[SW] ✅ Pré-chargé:', url);
                })
                .catch(err => {
                  console.log('[SW] ⚠️ Échec pré-défini:', url, err.message);
                })
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
            .filter(name => !name.includes('dirhub-commando-v4') && !name.includes('dirhub-runtime-v4'))
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
  const isExternal = url.includes('cdnjs') || url.includes('tailwind') || url.includes('babel') || url.includes('unpkg');
  const isStyles = url.endsWith('.css');
  
  if (isExternal) {
    // CDNs externes : CACHE-FIRST + mise à jour background
    e.respondWith(
      caches.match(url)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Cache hit:', url);
            // Update en background
            fetch(url)
              .then(response => {
                if (response.ok || response.status === 0) {
                  caches.open(RUNTIME_CACHE).then(cache => {
                    cache.put(url, response);
                    console.log('[SW] Background update:', url);
                  });
                }
              })
              .catch(() => {});
            return cachedResponse;
          }
          
          console.log('[SW] Network fetch:', url);
          return fetch(url)
            .then(response => {
              if (response.ok || response.status === 0) {
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => {
                  cache.put(url, responseClone);
                });
                return response;
              }
              throw new Error(`HTTP ${response.status}`);
            })
            .catch(err => {
              console.log('[SW] Network error:', err.message);
              return caches.match(url).then(cached => cached || new Response('Offline', { status: 503 }));
            });
        })
    );
  } else if (isStyles) {
    // CSS : CACHE-FIRST (important!)
    e.respondWith(
      caches.match(url)
        .then(cached => {
          if (cached) {
            console.log('[SW] Cache hit (CSS):', url);
            return cached;
          }
          return fetch(url)
            .then(response => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(url, clone));
              return response;
            })
            .catch(() => new Response('/* CSS Offline */', { status: 200, headers: { 'Content-Type': 'text/css' } }));
        })
    );
  } else {
    // Ressources locales : NETWORK-FIRST
    e.respondWith(
      fetch(url)
        .then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(url, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => {
          console.log('[SW] Network failed, using cache:', url);
          return caches.match(url)
            .then(cachedResponse => cachedResponse || new Response('Offline', { status: 503 }));
        })
    );
  }
});
