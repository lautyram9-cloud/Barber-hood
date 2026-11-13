// Service worker de la nueva Barber Hood (PWA). Versión de caché nueva: 'bhm-v2'.
// - Los datos (supabase.co) NUNCA se guardan: el worker ni los toca.
// - Red primero: siempre se pide la versión más nueva; el caché solo sirve sin conexión.
// - No toca /legacy/: la versión estable tiene su propio worker (alcance más específico) y su caché 'bh-v1'.
const V = 'bhm-v2';
const CORE = ['./', 'index.html', 'manifest.json', 'logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Borra solo cachés propias anteriores ('bhm-*'); 'bh-v1' pertenece a la versión estable.
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('bhm-') && k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith(new URL('legacy/', self.registration.scope).pathname)) return;
  e.respondWith(
    fetch(r)
      .then((x) => { if (x.ok) { const c = x.clone(); caches.open(V).then((ch) => ch.put(r, c)); } return x; })
      .catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
