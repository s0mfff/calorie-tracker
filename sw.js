// Service worker «Калории» — офлайн-кэш
const CACHE = 'kalorii-v3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/db.js',
  './js/engine.js',
  './js/camera.js',
  './js/chat.js',
  './js/app.js',
  './vendor/tf.min.js',
  './vendor/mobilenet.min.js',
  './vendor/transformers.min.js',
  './vendor/model/model.json',
  './vendor/model/group1-shard1of4.bin',
  './vendor/model/group1-shard2of4.bin',
  './vendor/model/group1-shard3of4.bin',
  './vendor/model/group1-shard4of4.bin',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // allSettled: отсутствие необязательного бандла (например, на GitHub Pages
      // без workflow) не должно ломать установку кэша
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Навигация: сеть, при офлайне — кэшированный index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Всё остальное: кэш сначала, при промахе — сеть и запись в кэш
  const cacheable = url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net';
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.destination === 'image') return new Response('', { status: 204 });
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
