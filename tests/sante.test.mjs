// Valeurs lues dans Apple Santé / Health Connect : jamais dans les sauvegardes du téléphone (0.36).
// Elles vivent dans barlog-health.json (dossier LIBRARY_NO_CLOUD, exclu d'iCloud et des règles de sauvegarde Android),
// pas dans le localStorage ni dans barlog-data.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const D1 = new Date(2026, 9, 1).getTime(), D2 = new Date(2026, 9, 2).getTime(), D3 = new Date(2026, 9, 3).getTime();

// App native simulée : Filesystem en mémoire (chemin + dossier), localStorage en mémoire.
function nativeEnv(t, files = {}) {
  const fsMem = { ...files }; const ls = {};
  const Filesystem = {
    readFile: async o => { const k = o.directory + '/' + o.path; if (!(k in fsMem)) throw new Error('absent'); return { data: fsMem[k] }; },
    writeFile: async o => { fsMem[o.directory + '/' + o.path] = o.data; return {}; },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window'); const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Filesystem } } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } } });
  t.after(() => {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
    if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete globalThis.localStorage;
  });
  return { fsMem, ls };
}
// Pesée du 1er : poids saisi à la main, masse grasse lue dans Santé ; le 2 : tout vient de Santé ; le 3 : saisie à la main.
const body = () => [{ date: D1, w: 80, bf: 18, hk: { bf: 1 } }, { date: D2, w: 79.5, bf: 17.8, hk: { w: 1, bf: 1 } }, { date: D3, w: 79 }];

test('enregistrement : rien de Santé dans le localStorage ni dans barlog-data.json ; tout dans barlog-health.json (hors sauvegardes)', async t => {
  const env = nativeEnv(t); const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), routines: [{ id: 'r', name: 'R', ex: [] }], body: body() });
  app.nativeReady = true; app.save(true); await flush();
  const main = JSON.parse(env.fsMem['DATA/barlog-data.json']); const ls = JSON.parse(env.ls['barlog-v1']);
  for (const d of [main, ls]) assert.deepEqual(d.body, [{ date: D1, w: 80 }, { date: D3, w: 79 }], 'seulement les valeurs saisies dans Barlog');
  const h = JSON.parse(env.fsMem['LIBRARY_NO_CLOUD/barlog-health.json']);
  assert.deepEqual(h.body, [{ date: D1, hk: { bf: 1 }, bf: 18 }, { date: D2, hk: { w: 1, bf: 1 }, w: 79.5, bf: 17.8 }]);
  assert.ok(!('DATA/barlog-health.json' in env.fsMem), 'jamais dans le dossier sauvegardé');
});

test('démarrage : les valeurs de Santé reviennent (même affichage qu’avant) sans relire Santé', async t => {
  const B = loadBarlog();
  const main = JSON.stringify({ routines: [{ id: 'r', name: 'R', ex: [] }], body: B.bodyOut(body()), hkWSync: 123, hkTag: true, savedAt: 1 });
  const health = JSON.stringify({ v: 1, body: B.bodyHk(body()) });
  nativeEnv(t, { 'DATA/barlog-data.json': main, 'LIBRARY_NO_CLOUD/barlog-health.json': health });
  const app = makeApp(B, { ...emptyData() }); app.instCheck = () => Promise.resolve();
  await app.nativeBoot(null);
  assert.deepEqual(app.state.body, body());
  assert.equal(app.state.hkWSync, 123, 'pas de relecture complète inutile');
});

test('mise à jour depuis 0.35 (valeurs de Santé encore dans barlog-data.json) : déplacées, puis relecture de Santé', async t => {
  const B = loadBarlog();
  const env = nativeEnv(t, { 'DATA/barlog-data.json': JSON.stringify({ routines: [{ id: 'r', name: 'R', ex: [] }], body: body(), hkWSync: 123, savedAt: 1 }) });
  const app = makeApp(B, { ...emptyData() }); app.instCheck = () => Promise.resolve();
  await app.nativeBoot(null); await flush();
  assert.deepEqual(app.state.body, body(), 'rien de perdu à l’écran');
  assert.equal(app.state.hkWSync, null, 'fichier Santé absent → relecture complète');
  assert.deepEqual(JSON.parse(env.fsMem['DATA/barlog-data.json']).body, [{ date: D1, w: 80 }, { date: D3, w: 79 }]);
  assert.equal(JSON.parse(env.fsMem['LIBRARY_NO_CLOUD/barlog-health.json']).body.length, 2);
});

test('fusion : une valeur saisie à la main l’emporte ; deux mesures à la même heure sont gardées', () => {
  const B = loadBarlog();
  const out = B.bodyHkIn([{ date: D1, w: 81 }, { date: D1, waist: 85 }], [{ date: D1, hk: { w: 1, bf: 1 }, w: 80, bf: 18 }]);
  assert.deepEqual(out, [{ date: D1, w: 81, bf: 18, hk: { bf: 1 } }, { date: D1, waist: 85 }]);
});

// ── Pro offert pendant la bêta, dans les apps seulement (0.36) ──
test('bêta : Pro offert dans l’app (sans écran d’achat), le Pro « test » remplacé ; rien sur le site', async t => {
  const B = loadBarlog();
  nativeEnv(t, { 'DATA/barlog-data.json': JSON.stringify({ routines: [{ id: 'r', name: 'R', ex: [] }], pro: { plan: 'year', test: true }, savedAt: 1 }) });
  const app = makeApp(B, { ...emptyData(), lang: 'fr' }); app.instCheck = () => Promise.resolve();
  await app.nativeBoot(null);
  assert.equal(app.state.pro.beta, true); assert.equal(app.isPro(), true);
  const v = app.renderVals(); assert.equal(v.proTitle, 'Offert pendant la bêta'); assert.equal(v.proBtn, 'Bêta');
  v.proCardClick(); assert.equal(app.state.pro.beta, true, 'pas de « désactiver » ni d’écran d’achat');
  const web = makeApp(loadBarlog(), { ...emptyData() }); delete globalThis.window; web.betaPro(); assert.equal(web.state.pro, undefined);
});

test('fin de la bêta (BETA = false) : le Pro offert est retiré, un vrai achat reste', async t => {
  nativeEnv(t);
  const html = (await import('node:fs')).readFileSync((await import('./harness.mjs')).HTML_PATH, 'utf8').replace('const BETA = true;', 'const BETA = false;');
  const B = loadBarlog(html);
  const a = makeApp(B, { ...emptyData(), pro: { plan: 'beta', beta: true } }); a.betaPro(); assert.equal(a.state.pro, null);
  const b = makeApp(B, { ...emptyData(), pro: { plan: 'life' } }); b.betaPro(); assert.deepEqual(b.state.pro, { plan: 'life' });
});

test('fichier Santé abîmé (écriture interrompue) : sa copie de secours est utilisée, rien n’est perdu', async t => {
  const B = loadBarlog();
  const env = nativeEnv(t, { 'DATA/barlog-data.json': JSON.stringify({ routines: [{ id: 'r', name: 'R', ex: [] }], body: B.bodyOut(body()), hkWSync: 5, savedAt: 1 }),
    'LIBRARY_NO_CLOUD/barlog-health.json': '{"v":1,"body":[{"da', 'LIBRARY_NO_CLOUD/barlog-health.prev.json': JSON.stringify({ v: 1, body: B.bodyHk(body()) }) });
  const app = makeApp(B, { ...emptyData() }); app.instCheck = () => Promise.resolve();
  await app.nativeBoot(null); await flush();
  assert.deepEqual(app.state.body, body()); assert.equal(app.state.hkWSync, 5);
  assert.equal(JSON.parse(env.fsMem['LIBRARY_NO_CLOUD/barlog-health.json']).body.length, 2, 'réécrit à partir de la copie, pas vidé');
});

test('mise à jour depuis 0.35 : la copie de la veille (sauvegardée par le téléphone) ne garde pas les valeurs de Santé', async t => {
  const B = loadBarlog();
  const env = nativeEnv(t, { 'DATA/barlog-data.json': JSON.stringify({ routines: [{ id: 'r', name: 'R', ex: [] }], body: body(), savedAt: 1 }) });
  const app = makeApp(B, { ...emptyData() }); app.instCheck = () => Promise.resolve();
  await app.nativeBoot(null); await flush();
  assert.deepEqual(JSON.parse(env.fsMem['DATA/barlog-data.prev.json']).body, [{ date: D1, w: 80 }, { date: D3, w: 79 }]);
});

test('site web (pas de sauvegarde du téléphone) : des valeurs de Santé importées restent après rechargement', t => {
  const ls = {}; const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } } });
  t.after(() => { if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete globalThis.localStorage; });
  const B = loadBarlog(); const app = makeApp(B, { ...emptyData(), body: body() }); app.save(true);
  assert.deepEqual(JSON.parse(ls['barlog-v1']).body, body());
});
