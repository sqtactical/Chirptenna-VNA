// Service worker: deja usar la app sin conexión (en el monte, sin cobertura). Red primero y, si falla, lo último guardado:
// así las actualizaciones llegan solas y nunca se queda una versión vieja atascada. No toca nada de otros orígenes
// (la librería del PDF se pide a internet cuando hace falta).
const CACHE = 'chirptenna-vna-v1';
const BASE = ['./', 'index.html', 'diagnostico.html', 'estilos.css', 'bandas.json', 'segmentos_hf.json', 'manifest.webmanifest', 'img/grillo.svg', 'img/icono-192.png', 'img/icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});