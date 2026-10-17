const C = 'barlog-v4';
const CORE = ['./', './Barlog.dc.html', './support.js', './manifest.json', './icon-180.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Network first (always fresh when online), cache fallback (works offline at the gym).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    (() => { const u = new URL(e.request.url); if (u.origin !== location.origin) return fetch(e.request);
      // Bypass GitHub Pages CDN cache (~10 min) for the app page itself.
      if (e.request.mode === 'navigate' || /\.(html|js|json)$/.test(u.pathname)) { u.searchParams.set('_', Date.now()); return fetch(u.href, { cache: 'no-store' }); }
      return fetch(e.request, { cache: 'no-cache' }); })().then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === 'navigate' ? caches.match('./Barlog.dc.html') : undefined)))
  );
});
