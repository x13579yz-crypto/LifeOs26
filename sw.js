// sw.js — LifeOS 26 Service Worker
// v3.5.1 Production Hardened
// Cache-first strategy with network fallback
// NEVER inline — separate file (v3.4 rule)

const CACHE_VERSION = '3.5.1';
const CACHE_NAME    = `lifeos-${CACHE_VERSION}`;

// All app shell files to cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',

  // CSS
  './css/variables.css',
  './css/layout.css',
  './css/components.css',

  // JS — Foundation
  './js/foundation/logger.js',
  './js/foundation/eventbus.js',
  './js/foundation/schema.js',
  './js/foundation/perf.js',

  // JS — Data
  './js/data/dataprotection.js',
  './js/data/store.js',

  // JS — System
  './js/system/dailyreset.js',
  './js/system/lifecycle.js',
  './js/system/audio.js',
  './js/system/charts.js',
  './js/system/accessibility.js',
  './js/system/ui.js',
  './js/system/backupstatus.js',
  './js/system/interactionmonitor.js',

  // JS — Features
  './js/features/badges.js',
  './js/features/exportreminder.js',
  './js/features/notifications.js',
  './js/features/onboarding.js',

  // JS — Sections
  './js/sections/dashboard.js',
  './js/sections/study.js',
  './js/sections/habits.js',
  './js/sections/workout.js',
  './js/sections/health.js',
  './js/sections/reports.js',
  './js/sections/profile.js',

  // JS — Orchestrator
  './js/app.js',
];

// ─── Install: cache all app shell files ──────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`[SW ${CACHE_VERSION}] Precaching ${PRECACHE_URLS.length} files`);
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log(`[SW ${CACHE_VERSION}] Install complete — skip waiting`);
        // Take control immediately without waiting for old SW to die
        return self.skipWaiting();
      })
      .catch(err => {
        console.error(`[SW ${CACHE_VERSION}] Precache failed`, err);
      })
  );
});

// ─── Activate: delete old cache versions ─────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const deleteOld = cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log(`[SW ${CACHE_VERSION}] Deleting old cache: ${name}`);
            return caches.delete(name);
          });
        return Promise.all(deleteOld);
      })
      .then(() => {
        console.log(`[SW ${CACHE_VERSION}] Activate complete — claiming clients`);
        // Claim all open clients so new SW takes effect immediately
        return self.clients.claim();
      })
  );
});

// ─── Fetch: cache-first, network fallback ────────────────────────────────────

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Cache hit — return cached version
          return cachedResponse;
        }

        // Cache miss — fetch from network and cache the response
        return fetch(event.request)
          .then(networkResponse => {
            // Only cache valid responses
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === 'error'
            ) {
              return networkResponse;
            }

            // Clone — response body can only be consumed once
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseToCache))
              .catch(err => console.warn('[SW] Cache put failed', err));

            return networkResponse;
          })
          .catch(() => {
            // Network failed and nothing in cache
            // For HTML navigation requests, return cached index.html (offline shell)
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // For other requests, fail silently
            return new Response('', {
              status:     503,
              statusText: 'Service Unavailable — Offline',
            });
          });
      })
  );
});

// ─── Message handler: force update from app ──────────────────────────────────

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
