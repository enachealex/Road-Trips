// Roadbook service worker: keeps the app itself loadable without a connection, so a trip
// saved on the phone can still be opened in the middle of nowhere. Trip data is cached by
// the app; this only handles the site's own files. Requests to other origins (the
// Supabase server, maps) are never touched.

// Replaced with a unique id on every build (scripts/postexport.mjs), which retires old caches.
const VERSION = '__BUILD_ID__';
const CACHE = `roadbook-${VERSION}`;

async function precache() {
  const cache = await caches.open(CACHE);
  const page = await fetch('/', { cache: 'no-cache' });
  const html = await page.clone().text();
  await cache.put('/', page);
  // The page's own scripts and styles, so the first offline open works too.
  const files = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
  await cache.addAll([...new Set(['/manifest.json', '/icon.svg', ...files])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('roadbook-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Pages: always try the network so updates arrive; fall back to the saved app when
    // offline. (GitHub Pages answers trip links with 404.html, which is the same app.)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === '/') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Scripts, fonts, images: file names change with each build, so cached copies are safe.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
