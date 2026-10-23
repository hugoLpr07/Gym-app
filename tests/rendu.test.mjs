// Performance (lot E) : rendu au rythme des chronos (tick), formats de date, service worker, app native.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { loadBarlog, makeApp, emptyData, flush, HTML_PATH } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime(); // 15 oct. 2026, 12 h (heure locale)
const clk = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const countRenders = app => { const set = app.setState.bind(app); app.renders = 0; app.setState = (u, cb) => { app.renders++; set(u, cb); }; };

test('tick : pendant une séance, un rendu par seconde au lieu de quatre', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), workout: { rid: null, name: 'Push', start: T0, ex: [] }, screen: 'workout', now: T0 });
  countRenders(app);
  for (let i = 0; i < 40; i++) { t.mock.timers.tick(250); app.tick(); } // 10 s
  assert.equal(app.renders, 10);
});

test('tick : les chronos affichés (séance, repos) sont toujours à jour malgré moins de rendus', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const restEnd = T0 + 90500; // fin de repos pas alignée sur la seconde de la séance
  const app = makeApp(B, { ...emptyData(), workout: { rid: null, name: 'Push', start: T0 - 61200, ex: [] }, screen: 'workout',
    restEnd, restTotal: 90, now: T0 });
  countRenders(app);
  for (let i = 0; i < 24; i++) {
    t.mock.timers.tick(250); app.tick();
    const v = app.renderVals();
    assert.equal(v.elapsed, clk(Date.now() - app.state.workout.start), `séance à +${(i + 1) * 250} ms`);
    assert.equal(v.restClock, clk(restEnd - Date.now()), `repos à +${(i + 1) * 250} ms`);
  }
  assert.ok(app.renders <= 13, `${app.renders} rendus en 6 s (deux chronos décalés : au plus 2 par seconde)`);
});

test('tick : sans séance ni repos, un rendu toutes les 20 s seulement (comme avant)', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), now: T0 });
  app.tick(); countRenders(app);
  for (let i = 0; i < 160; i++) { t.mock.timers.tick(250); app.tick(); } // 40 s
  assert.equal(app.renders, 1);
});

test('Séances : compteur du mois (deux séances le même jour), mois et dates identiques à toLocaleDateString', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const d = (m, j, h) => new Date(2026, m, j, h).getTime();
  const sets = [{ w: 80, r: 5 }];
  const history = { 'Bench Press': [d(8, 20, 9), d(9, 3, 8), d(9, 3, 18), d(9, 10, 7)].map(date => ({ date, sets })) };
  const app = makeApp(B, { ...emptyData(), history, now: T0, tab: 'progress', progView: 'sessions', progEx: 'Bench Press', metric: 'e1rm' });
  const v = app.renderVals();
  assert.equal(v.calCount, '3 sessions', 'octobre : 3 séances, dont 2 le 3');
  assert.deepEqual(v.sessList.map(x => x.day + ' ' + x.mon), ['10 Oct', '3 Oct', '3 Oct', '20 Sep']);
  const md = x => new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  assert.deepEqual([v.chartFrom, v.chartTo], [md(d(8, 20, 9)), md(d(9, 10, 7))]);
});

// ---- Service worker : chargé tel quel dans un bac à sable, avec un faux navigateur ----
function loadSw() {
  const src = readFileSync(join(dirname(HTML_PATH), 'sw.js'), 'utf8');
  const on = {}; const fetched = []; const put = [];
  const sandbox = {
    URL, Promise, setTimeout, clearTimeout, Date, location: new URL('https://hugolpr07.github.io/Gym-app/sw.js'),
    self: { addEventListener: (k, fn) => { on[k] = fn; }, skipWaiting() {}, clients: { claim: () => Promise.resolve() } },
    caches: { open: () => Promise.resolve({ put: (rq) => put.push(rq.url), addAll: () => Promise.resolve() }), match: () => Promise.resolve(undefined), keys: () => Promise.resolve([]) },
    fetch: (u) => { fetched.push(String(u)); return Promise.resolve({ ok: true, clone() { return this; } }); },
  };
  vm.runInNewContext(src, sandbox);
  const get = (url, mode = 'cors') => { let res = null; on.fetch({ request: { method: 'GET', url, mode }, respondWith: p => { res = p; } }); return res; };
  return { get, fetched, put, src };
}

test('sw.js : les réponses de Supabase (et de tout autre site) ne passent pas par le cache', async () => {
  const sw = loadSw();
  assert.equal(sw.get('https://abc.supabase.co/storage/v1/object/backups/u/barlog.json.gz'), null, 'sauvegarde : laissée au navigateur');
  assert.equal(sw.get('https://abc.supabase.co/rest/v1/profiles?select=*&id=eq.1'), null, 'profils : laissés au navigateur');
  await flush();
  assert.deepEqual([sw.fetched, sw.put], [[], []]);
});

test('sw.js : les fichiers de l’app restent en cache pour le mode hors ligne ; Babel n’est plus préchargé', async () => {
  const sw = loadSw();
  const r = sw.get('https://hugolpr07.github.io/Gym-app/vendor/supabase.js');
  assert.ok(r, 'fichier de l’app : servi par le service worker');
  await r; await flush();
  assert.deepEqual(sw.put, ['https://hugolpr07.github.io/Gym-app/vendor/supabase.js']);
  assert.ok(!/babel/i.test(sw.src), 'Babel absent de sw.js');
});

// ---- App native : ni vérification de mise à jour, ni service worker ----
function fakeBrowser(t, native) {
  const keys = ['window', 'location', 'navigator', 'caches', 'fetch'];
  const prev = Object.fromEntries(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => keys.forEach(k => { if (prev[k]) Object.defineProperty(globalThis, k, prev[k]); else delete globalThis[k]; }));
  const log = [];
  const w = { Capacitor: native ? { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} } : undefined };
  w.self = w; w.top = w; w.caches = true;
  const def = (k, v) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  def('window', w);
  def('location', { protocol: 'https:' });
  def('navigator', { onLine: true, serviceWorker: {
    register: u => { log.push('register ' + u); return Promise.resolve(); },
    getRegistrations: () => Promise.resolve([{ unregister: () => { log.push('unregister'); return Promise.resolve(true); } }]) } });
  def('caches', { keys: () => Promise.resolve(['barlog-v8', 'autre']), delete: k => { log.push('delete ' + k); return Promise.resolve(true); } });
  def('fetch', u => { log.push('fetch ' + String(u).split('?')[0]); return Promise.resolve({ ok: false }); });
  return log;
}

test('App native (Android, https://localhost) : pas de relecture de la page ; le service worker des anciennes versions est retiré', async t => {
  const log = fakeBrowser(t, true);
  const app = makeApp(loadBarlog(), emptyData());
  app.checkUpdate(); app.swSetup(); await flush();
  assert.deepEqual(log, ['unregister', 'delete barlog-v8']);
});

test('Site web : vérification de mise à jour et service worker inchangés', async t => {
  const log = fakeBrowser(t, false);
  const app = makeApp(loadBarlog(), emptyData());
  app.checkUpdate(); app.swSetup(); await flush();
  assert.deepEqual(log, ['fetch ./Barlog.dc.html', 'register ./sw.js']);
});
