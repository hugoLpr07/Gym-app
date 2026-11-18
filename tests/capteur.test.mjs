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

test('C1 : décodage d’un message brut (même lecture que HeartRate.swift)', () => {
  const app = makeApp(loadBarlog(), emptyData());
  assert.deepEqual(app.hrDecode('0048'), { f: 0, bpm: 72, rr: [], contact: null }, '8 bits, rien d’autre');
  assert.deepEqual(app.hrDecode('163c00040002'), { f: 0x16, bpm: 60, rr: [1000, 500], contact: true }, 'contact + deux RR (1/1024 s → ms)');
  assert.equal(app.hrDecode('012c01').bpm, 300, '16 bits');
  assert.deepEqual(app.hrDecode('185a10000004').rr, [1000], 'énergie sautée avant les RR');
  assert.deepEqual(app.hrDecode('1046000400').rr, [1000], 'RR coupé : morceau ignoré');
  assert.equal(app.hrDecode('00'), null, 'drapeaux seuls');
  assert.equal(app.hrDecode('0148'), null, '16 bits annoncés, un octet');
  assert.equal(app.hrDecode('zz48'), null, 'pas de l’hexadécimal');
});

test('C1 : journal brut — tranches de 10 s, battements, doublons, écarts, messages par seconde', () => {
  const app = makeApp(loadBarlog(), emptyData());
  assert.equal(app.hrRawStats([], [], 0), null, 'rien reçu');
  // 30 s portée à 2 messages / s (un RR sur deux), puis 20 s retirée (BPM sans RR), puis un doublon.
  const t0 = 1_700_000_000_000, t = [], x = [];
  for (let i = 0; i < 60; i++) { t.push(t0 + i * 500); x.push(i % 2 ? '1050' : '10500004'); }
  for (let i = 0; i < 40; i++) { t.push(t0 + 30000 + i * 500); x.push('1050'); }
  t.push(t0 + 49_520); x.push('1050');
  const R = app.hrRawStats(t, x, t0 + 50_000);
  assert.deepEqual(R.rows.map(r => r.at - t0), [0, 10000, 20000, 30000, 40000, 50000], 'calées sur l’horloge, jusqu’à maintenant');
  assert.deepEqual(R.rows.slice(0, 3).map(r => [r.n, r.rrMsg, r.beats, r.lo, r.hi, r.dup]), Array(3).fill([20, 10, 10, 80, 80, 0]), 'portée : un message sur deux avec un battement');
  assert.deepEqual(R.rows.slice(3, 5).map(r => [r.n, r.beats, r.dup]), [[20, 0, 0], [21, 0, 1]], 'retirée : aucun battement ; doublon à 20 ms');
  assert.equal(R.rows[5].n, 0, 'tranche en cours, vide');
  assert.deepEqual(R.gaps, [1, 99, 0, 0], 'écarts de la dernière minute : 99 à 0,5 s, 1 doublon');
  assert.deepEqual([R.wn, R.wrr, R.rate], [101, 30, 2.0], '101 messages en 49,5 s, 30 avec RR');
  assert.deepEqual(R.flags, [0x10], 'drapeaux vus');
  assert.deepEqual(R.last.map(m => m.gap), [20, 500, 500, 500, 500, 500], 'les 6 derniers, du plus récent');
  // Plus de 3 min : seules les 18 dernières tranches.
  const long = Array.from({ length: 400 }, (_, i) => t0 + i * 1000);
  assert.equal(app.hrRawStats(long, long.map(() => '0050'), t0 + 400_000).rows.length, 18);
});

test('C1 : page d’essai — journal brut affiché quand le natif a la méthode raw', async t => {
  const t1 = sec(30), H = fakeHR(t1, t1.map(() => 90));
  H.status = () => Promise.resolve({ ok: true, bt: 'on', state: 'on', name: 'HRM 200', contact: -1, n: 30, bg: 0, reconnects: 0, since: 1, subs: 1 });
  nativeWindow(t, { BarlogHR: H });
  const app = makeApp(loadBarlog(), { ...emptyData(), mqN: 0 });
  await app.hrPull();
  let v = app.renderVals();
  assert.deepEqual([v.hrtRawOn, v.hrtRows, v.hrtMsgs], [false, [], []], 'ancien natif sans raw : rien de plus');
  const n0 = Math.floor(Date.now() / 10000) * 10000 - 5000;   // trois messages dans la même tranche de 10 s
  H.raw = () => Promise.resolve({ t: [n0, n0 + 500, n0 + 510], x: ['1050', '10500004', '1050'] });
  await app.hrPull();
  v = app.renderVals();
  const line = k => (v.hrtLines.find(l => l.k === k) || {}).v;
  assert.equal(v.hrtRawOn, true);
  assert.equal(line('Abonnements'), '1');
  assert.equal(line('Drapeaux vus'), '0x10');
  assert.equal(line('Messages avec RR (1 min)'), '1 / 3');
  assert.deepEqual(v.hrtRows.filter(r => r.v !== 'aucun message').map(r => r.v), ['3 msg · 1 avec RR · 1 batt. · 80–80 · 1 doubl.']);
  assert.match(v.hrtMsgs[0].k, /,510$/, 'heure à la milliseconde');
  assert.equal(v.hrtMsgs[0].v, '+10 ms · 80 · RR — · 1050');
  assert.equal(v.hrtMsgs[1].v, '+500 ms · 80 · RR 1000 · 10500004');
});

// ——— C1 : fréquence cardiaque gardée avec la séance (sessMeta[start].hr) ———

test('C1 : résumé cardiaque — moyenne, max, secondes reçues, courbe de 360 valeurs au plus, trous gardés', () => {
  const app = makeApp(loadBarlog(), emptyData());
  const S0 = 1_700_000_000_000;
  // Séance de 30 min, un point par seconde, sauf un trou de 60 s (minutes 10 à 11).
  const t = [], b = [];
  for (let s = 0; s <= 1800; s++) if (s < 600 || s >= 660) { t.push(S0 + s * 1000); b.push(s < 900 ? 100 : 140); }
  const H = app.hrSum(t, b, S0, S0 + 1800_000);
  assert.equal(H.step, 5, '30 min → tranches de 5 s');
  assert.equal(H.c.length, 360, '360 valeurs');
  assert.equal(H.n, 1741, 'secondes reçues');
  assert.equal(H.max, 140);
  assert.equal(H.avg, Math.round((840 * 100 + 901 * 140) / 1741), 'moyenne sur tous les points');
  assert.deepEqual(H.c.slice(119, 133), [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100], 'trou de 60 s = 12 tranches à 0');
  assert.equal(H.c[359], 140);
  assert.ok(JSON.stringify(H).length < 1600, 'environ 1,5 Ko : ' + JSON.stringify(H).length);
  // Séance de 2 h → tranches de 20 s, toujours 360 valeurs au plus.
  const t2 = Array.from({ length: 7201 }, (_, i) => S0 + i * 1000);
  const H2 = app.hrSum(t2, t2.map(() => 90), S0, S0 + 7200_000);
  assert.deepEqual([H2.step, H2.c.length, H2.n, H2.avg], [20, 360, 7201, 90]);
  // Points hors de la séance ou hors 25-250 : ignorés ; deux points dans la même seconde = une seconde.
  const H3 = app.hrSum([S0 - 5000, ...sec(40).map(x => x - 1_000_000 + S0), S0 + 39_500, S0 + 90_000], [200, ...Array(40).fill(80), 82, 300], S0, S0 + 60_000);
  assert.deepEqual([H3.n, H3.max], [40, 82], 'avant le début, après la fin, 300 BPM : ignorés');
  // Moins de 30 s de points : rien.
  assert.equal(app.hrSum(sec(29).map(x => x - 1_000_000 + S0), Array(29).fill(80), S0, S0 + 600_000), null, '29 s');
});

test('C1 : lecture prudente de sessMeta[start].hr (fichier importé, autre téléphone)', () => {
  const app = makeApp(loadBarlog(), emptyData());
  const ok = { avg: 120, max: 160, n: 600, step: 5, c: [100, 0, 120] };
  assert.deepEqual(app.hrOf({ hr: ok }), ok);
  for (const bad of [undefined, null, 'x', { ...ok, avg: 'a' }, { ...ok, step: 0 }, { ...ok, c: 'x' }, { ...ok, c: [1, 'a'] }, { ...ok, c: [400] }, { ...ok, c: Array(2001).fill(1) }])
    assert.equal(app.hrOf({ hr: bad }), null, JSON.stringify(bad));
  assert.equal(app.hrOf(null), null);
});

// Séance en cours de 10 min, une série faite ; la ceinture a envoyé un point par seconde depuis 2 min avant le début.
function hrSession(t, { pro = true, plugin = true } = {}) {
  const now = Date.now(), start = now - 600_000;
  const pts = Array.from({ length: 721 }, (_, i) => start - 120_000 + i * 1000);
  const H = fakeHR(pts, pts.map(x => x < start ? 70 : 130));
  nativeWindow(t, plugin ? { BarlogHR: H } : {});
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', autoRest: false, pro: pro ? { plan: 'app' } : null,
    screen: 'workout', workout: { rid: null, name: 'Cardio', start, ex: [{ name: 'Bench Press', sets: [{ w: 60, r: 10, done: true }] }] } });
  return { app, start, H };
}

test('C1 : « Finir » garde la fréquence cardiaque de la séance seulement (Pro)', async t => {
  const { app, start, H } = hrSession(t);
  app.finish();
  await flush();
  assert.deepEqual(H.calls.find(c => c[0] === 'samples'), ['samples', { since: start - 1 }]);
  const hr = app.state.sessMeta[start].hr;
  assert.ok(hr, 'gardée');
  assert.deepEqual([hr.avg, hr.max, hr.step], [130, 130, 5], 'les 2 min avant le début (70 BPM) ne comptent pas');
  assert.ok(hr.n >= 599 && hr.n <= 601, 'environ 600 s : ' + hr.n);
  assert.equal(app.state.sessMeta[start].name, 'Cardio', 'le reste de sessMeta est gardé');
});

test('C1 : sans Pro → aucune fréquence cardiaque', async t => {
  const a = hrSession(t, { pro: false });
  a.app.finish(); await flush();
  assert.equal('hr' in a.app.state.sessMeta[a.start], false, 'sans Pro');
  assert.equal(a.H.calls.some(c => c[0] === 'samples'), false, 'natif pas interrogé');
});

test('C1 : sans le plugin (site, Android pour l’instant) → aucune fréquence cardiaque', async t => {
  const b = hrSession(t, { plugin: false });
  b.app.finish(); await flush();
  assert.equal('hr' in b.app.state.sessMeta[b.start], false);
});

test('C1 : séance supprimée avant la réponse du natif → rien n’est recréé', async t => {
  const { app, start } = hrSession(t);
  app.finish();
  app.setState(st => { const m = { ...st.sessMeta }; delete m[start]; return { sessMeta: m }; });
  await flush();
  assert.equal(app.state.sessMeta[start], undefined);
});

test('C1 : la fréquence cardiaque suit la sauvegarde en ligne, la fusion et l’export / import', () => {
  const B = loadBarlog(), app = makeApp(B, emptyData());
  const T = Date.now() - 86_400_000, hr = { avg: 120, max: 160, n: 600, step: 5, c: [100, 0, 120] };   // récente : goneMerge oublie au-delà de 400 jours
  const hist = { 'Bench Press': [{ date: T, sets: [{ w: 60, r: 10 }] }] };
  // Envoi en ligne et export : sessMeta part en entier.
  assert.deepEqual(app.cbData({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A', hr } } }).sessMeta[T].hr, hr, 'sauvegarde en ligne');
  assert.ok(B.PK.includes('sessMeta') && !B.CB_SKIP.includes('sessMeta'), 'sessMeta exporté');
  // Fusion : ce téléphone l'emporte, mais garde la fréquence cardiaque de l'autre côté s'il n'en a pas.
  const m1 = app.cbMerge({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A', pub: { vis: 'friends' } } } }, { ...emptyData(), history: hist, sessMeta: { [T]: { name: 'B', hr } } });
  assert.deepEqual(m1.sessMeta[T], { name: 'A', pub: { vis: 'friends' }, hr }, 'hr reprise, le reste vient de ce téléphone');
  const m2 = app.cbMerge({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A' } } }, { ...emptyData(), history: hist, sessMeta: { [T]: { name: 'B', pub: { vis: 'public' } } } });
  assert.deepEqual(m2.sessMeta[T], { name: 'A' }, 'rien d’autre n’est repris de l’autre côté (publication retirée ici)');
  const m3 = app.cbMerge({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A', hr: null } } }, { ...emptyData(), history: hist, sessMeta: { [T]: { name: 'B', hr } } });
  assert.equal(m3.sessMeta[T].hr, null, 'hr: null ici = pas reprise');
  const m4 = app.cbMerge({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A', hr } }, gone: { s: {}, r: {} } }, { ...emptyData(), history: {}, sessMeta: {}, gone: { s: { [T]: T + 1 }, r: {} } });
  assert.equal(m4.sessMeta[T], undefined, 'séance supprimée ailleurs : hr partie avec elle');
  // Import d'un fichier exporté.
  app.importJson({ ...emptyData(), history: hist, sessMeta: { [T]: { name: 'A', hr } } });
  assert.deepEqual(app.state.sessMeta[T].hr, hr, 'import');
});
