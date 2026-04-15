const CACHE_NAME = 'mri-v2';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const RIVERS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // Stale-while-revalidate for /api/rivers — river list changes every ~15 min
  if (url.pathname === '/api/rivers') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const now = Date.now();

        // Serve cached response immediately if fresh enough
        if (cached) {
          const cachedAt = Number(cached.headers.get('x-sw-cached-at') || 0);
          if (now - cachedAt < RIVERS_CACHE_TTL) {
            // Background revalidate if older than half TTL
            if (now - cachedAt > RIVERS_CACHE_TTL / 2) {
              fetch(request).then((res) => {
                if (res.ok) {
                  const headers = new Headers(res.headers);
                  headers.set('x-sw-cached-at', String(Date.now()));
                  cache.put(request, new Response(res.body, { status: res.status, headers }));
                }
              }).catch(() => {});
            }
            return cached;
          }
        }

        // Cache miss or stale — fetch, stamp, cache, return
        try {
          const res = await fetch(request);
          if (res.ok) {
            const headers = new Headers(res.headers);
            headers.set('x-sw-cached-at', String(Date.now()));
            cache.put(request, new Response(res.clone().body, { status: res.status, headers }));
          }
          return res;
        } catch {
          return cached || new Response(
            JSON.stringify({ error: 'offline', message: "You're offline — cached river data shown" }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })
    );
    return;
  }

  // Network-first for other API routes (access-weather, river-segments, flyshop-reports, etc.)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(
                JSON.stringify({ error: 'offline', message: "You're offline — cached river data shown" }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              )
          )
        )
    );
    return;
  }

  // Cache-first for static assets (_next/static, icons, fonts)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2?|css)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Network-first for navigation (HTML pages)
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return res;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match('/').then(
              (shell) =>
                shell ||
                new Response("You're offline. Please reconnect to view river conditions.", {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' },
                })
            )
        )
      )
  );
});
