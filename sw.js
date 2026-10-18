const C = 'barlog-v5';
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
// Rest-over notification while the app is in the background (best effort; Android installed PWA).
let restT = null, restDone = null;
const clearRest = () => { clearTimeout(restT); restT = null; if (restDone) { restDone(); restDone = null; } };
self.addEventListener('message', e => { const d = e.data || {};
  if (d.type === 'rest-cancel') { clearRest(); return; }
  if (d.type === 'rest') { clearRest(); const ms = Math.max(0, d.at - Date.now());
    e.waitUntil(new Promise(res => { restDone = res; restT = setTimeout(() => { restT = null; self.registration.showNotification(d.title, { body: d.body, tag: 'barlog-rest', renotify: true, icon: './icon-192.png', badge: './icon-192.png', vibrate: [200, 100, 200] }).catch(() => {}).then(() => { restDone = null; res(); }); }, ms); })); } });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))); });
