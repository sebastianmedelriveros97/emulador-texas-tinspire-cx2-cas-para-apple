// Service worker: permite usar Nspire Lab sin conexión (red primero, caché de respaldo).
const CACHE = 'nspirelab-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'vendor/fengari-web.js',
  'src/app.js', 'src/nspire.js', 'src/prelude.js', 'src/matheval.js', 'src/tns.js', 'src/style.css',
  'examples/demo.lua', 'examples/viga.lua', 'examples/control.lua',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
