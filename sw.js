// Service worker: guarda la app en el teléfono para que abra sin señal.
// Los datos (tramos, vanos) los maneja Firestore con su propia caché sin conexión.
const VERSION = 'poda-v1.1.0';
const APP = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/db.js', './js/logica.js', './js/config.js', './js/fotos.js', './js/certificado.js',
  './icons/icono.svg', './icons/icono-180.png', './icons/icono-192.png', './icons/icono-512.png', './icons/epec.png'
];
const CDN = [
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'
];
const HOSTS_CDN = ['www.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP);
    await Promise.all(CDN.map(u => c.add(u).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas: primero la red, si no hay señal la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copia = r.clone();
      caches.open(VERSION).then(c => c.put('./index.html', copia));
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Librerías externas (Firebase, pdf-lib): la copia guardada primero
  if (HOSTS_CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    })));
    return;
  }

  // Archivos de la app: primero la red (así llegan las actualizaciones);
  // si no hay señal o tarda más de 4 segundos, la copia guardada
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const guardada = await caches.match(req);
      try {
        const r = await Promise.race([
          fetch(req),
          new Promise((_, no) => setTimeout(() => no(new Error('lento')), guardada ? 4000 : 30000))
        ]);
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
        return r;
      } catch (_) {
        return guardada || Response.error();
      }
    })());
    return;
  }
  // El resto (Firestore, autenticación) va directo a la red
});
