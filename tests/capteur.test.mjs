// Ceinture cardiaque Bluetooth (étape C) — C0 : page d'essai provisoire (administrateur, iPhone) et calcul des trous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

// App native simulée : seuls les plugins passés existent.
function nativeWindow(t, Plugins, platform = 'ios') {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
}

// Faux plugin BarlogHR : points fournis par le test, appels notés.
function fakeHR(t = [], b = []) {
  const calls = [], L = {};
  return { calls, L,
    addListener: (ev, f) => { L[ev] = f; return Promise.resolve({ remove() {} }); },
    status: () => Promise.resolve({ ok: true, bt: 'on', state: 'on', name: 'HRM 200', contact: 1, n: t.length, bg: 7, reconnects: 1, since: 1 }),
    samples: o => { calls.push(['samples', o]); return Promise.resolve({ t, b }); },
    scan: o => { calls.push(['scan', o]); return Promise.resolve({ ok: true }); },
    stopScan: () => { calls.push(['stopScan']); return Promise.resolve({ ok: true }); },
    connect: o => { calls.push(['connect', o]); return Promise.resolve({ ok: true }); },
    disconnect: () => { calls.push(['disconnect']); return Promise.resolve({ ok: true }); },
    clear: () => { calls.push(['clear']); return Promise.resolve({ ok: true }); } };
}

const sec = n => Array.from({ length: n }, (_, i) => 1_000_000 + i * 1000);

test('C0 : couverture des secondes, trous de plus de 2,5 s, moyenne et max', () => {
  const app = makeApp(loadBarlog(), emptyData());
  assert.equal(app.hrStats([], []), null, 'rien reçu');
  const t = sec(601), b = t.map((_, i) => 100 + (i % 50));
  const S = app.hrStats(t, b);
  assert.deepEqual([S.n, S.span, S.cover, S.gapN, S.gapS, S.max], [601, 600, 100, 0, 0, 149], '10 min sans trou : 100 %');
  // 29 points manquants (secondes 101 à 129) : un trou de 30 s entre 100 et 130 → 29 s manquantes sur 600.
  const keep = t.map((x, i) => i).filter(i => i <= 100 || i >= 130);
  const S2 = app.hrStats(keep.map(i => t[i]), keep.map(i => b[i]));
  assert.deepEqual([S2.gapN, S2.gapS, S2.cover], [1, 29, 95.2], 'un trou de 30 s');
  assert.deepEqual(S2.top, [{ at: t[100], s: 30 }], 'le trou, à l’heure du dernier point reçu avant');
  // Petits décalages (1,2 s, 2,4 s) : pas des trous.
  const S3 = app.hrStats([0, 1200, 3600, 4600], [80, 80, 80, 80]);
  assert.equal(S3.gapN, 0, 'moins de 2,5 s entre deux points : pas un trou');
  assert.equal(app.hrStats([5000], [90]).cover, 100, 'un seul point');
});

test('C0 : page d’essai seulement pour l’administrateur, dans l’app iPhone qui a le plugin', t => {
  // Site : pas de plugin.
  assert.equal(makeApp(loadBarlog(), { ...emptyData(), mqN: 2 }).hrtVals({ mqN: 2 }).hrtOn, false, 'site');
  nativeWindow(t, { BarlogHR: fakeHR() });
  const B = loadBarlog();
  assert.equal(makeApp(B, { ...emptyData(), mqN: null }).hrtVals({ mqN: null }).hrtOn, false, 'pas administrateur');
  const app = makeApp(B, { ...emptyData(), mqN: 0 });
  const v = app.renderVals();
  assert.equal(v.hrtOn, true, 'administrateur (aucun signalement en attente)');
  assert.equal(v.hrtOpen, false, 'fermée au départ');
});

test('C0 : Android sans le plugin → rien', t => {
  nativeWindow(t, {}, 'android');
  const app = makeApp(loadBarlog(), { ...emptyData(), mqN: 0 });
  assert.equal(app.renderVals().hrtOn, false);
});

test('C0 : ouvrir l’essai relit les points, chercher puis se connecter, chiffres affichés', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const t1 = sec(301), H = fakeHR(t1, t1.map(() => 120));
  nativeWindow(t, { BarlogHR: H });
  const app = makeApp(loadBarlog(), { ...emptyData(), mqN: 0 });
  app.renderVals().hrtToggle();
  await flush();
  assert.deepEqual(H.calls[0], ['samples', { since: 0 }], 'tous les points gardés par le natif');
  assert.ok(H.L.hr && H.L.hrState && H.L.hrFound && H.L.hrScanEnd, 'écouteurs posés');
  let v = app.renderVals();
  assert.equal(v.hrtOpen, true);
  const line = k => (v.hrtLines.find(l => l.k === k) || {}).v;
  assert.equal(line('Points reçus'), '301 (dont 7 en arrière-plan)');
  assert.equal(line('Secondes reçues'), '100 % ✓');
  assert.equal(line('Capteur'), 'connecté · HRM 200');
  assert.equal(line('Reconnexions'), '1');
  // Recherche : les ceintures trouvées s'affichent, toucher = se connecter.
  v.hrtScan();
  await flush();
  assert.deepEqual(H.calls.find(c => c[0] === 'scan'), ['scan', { all: false }]);
  H.L.hrFound({ id: 'A-1', name: 'HRM 200:123', rssi: -60 });
  H.L.hrFound({ id: 'A-1', name: 'HRM 200:123', rssi: -55 });
  v = app.renderVals();
  assert.deepEqual(v.hrtFound.map(d => [d.name, d.sig]), [['HRM 200:123', '-55 dBm']], 'une seule ligne par ceinture, signal à jour');
  v.hrtFound[0].onClick();
  await flush();
  assert.deepEqual(H.calls.filter(c => c[0] === 'connect'), [['connect', { id: 'A-1' }]]);
  assert.deepEqual(app.renderVals().hrtFound, [], 'liste vidée après le choix');
  // BPM en direct.
  H.L.hr({ bpm: 142, t: Date.now() });
  v = app.renderVals();
  assert.deepEqual([v.hrtBpm, v.hrtLive], ['142', 'en direct']);
  H.L.hr({ bpm: 0, t: Date.now() });
  assert.deepEqual([app.renderVals().hrtBpm, app.renderVals().hrtLive], ['—', 'pas de contact']);
  // Relu toutes les 5 s tant que l'essai est ouvert ; plus rien une fois fermé.
  const n = H.calls.filter(c => c[0] === 'samples').length;
  t.mock.timers.tick(5000);
  assert.equal(H.calls.filter(c => c[0] === 'samples').length, n + 1, 'relu après 5 s');
  app.renderVals().hrtToggle();
  t.mock.timers.tick(15000);
  assert.equal(H.calls.filter(c => c[0] === 'samples').length, n + 1, 'fermé : plus relu');
});
