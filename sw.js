// AeroBrief G650ER - Network-First Service Worker with Offline Cockpit Fallback
const CACHE_NAME = 'aerobrief-g650er-v11';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=6',
  './app.js?v=11',
  './briefing-storage.js?v=11',
  './notam-parser.js?v=11',
  './g650er-rules.js?v=11',
  './mock-briefings.js?v=11',
  './jeppesen-compliance.js?v=11',
  './data/fir_rules.json?v=11',
  './data/adiz_rules.json?v=11',
  './data/aerodrome_notices.json?v=11',
  './data/aom_tables.json?v=11',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(err => {
      console.warn('Pre-cache note:', err);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for same-origin app files only.
// Never intercept cross-origin map tiles (CartoDB, OSM, Esri, RainViewer) or live weather APIs.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request, { cache: 'reload' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
