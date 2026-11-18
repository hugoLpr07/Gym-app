// Ceinture cardiaque Bluetooth (étape C, Pro, iPhone) : C1 — fréquence cardiaque gardée avec la séance ; C2a — Profil →
// Capteur cardiaque, connexion automatique pendant la séance, pastille ♥, carte « Fréquence cardiaque », hors iCloud.
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

// ——— C2a : écran ———

// App native simulée avec Filesystem et localStorage en mémoire (comme sante.test.mjs) et le faux plugin.
function nativeEnv(t, H, files = {}) {
  const fsMem = { ...files }, ls = {};
  const Filesystem = {
    readFile: async o => { const k = o.directory + '/' + o.path; if (!(k in fsMem)) throw new Error('absent'); return { data: fsMem[k] }; },
    writeFile: async o => { fsMem[o.directory + '/' + o.path] = o.data; return {}; },
  };
  nativeWindow(t, { Filesystem, ...(H ? { BarlogHR: H } : {}) });
  const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } } });
  t.after(() => { if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete globalThis.localStorage; });
  return { fsMem, ls };
}
const PRO = { pro: { plan: 'app' } };
const DEV = { id: 'A-1', name: 'HRM200:123041' };

test('C2a : Profil → Capteur cardiaque seulement dans l’app iPhone qui a le plugin', t => {
  assert.equal(makeApp(loadBarlog(), emptyData()).renderVals().hrOn, false, 'site');
  nativeWindow(t, {}, 'android');
  assert.equal(makeApp(loadBarlog(), emptyData()).renderVals().hrOn, false, 'Android sans le plugin');
});

test('C2a : sans Pro, la ligne a le ✦ et ouvre la page Pro « capteur cardiaque »', t => {
  nativeWindow(t, { BarlogHR: fakeHR() });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr' });
  app.pwLoad = () => {};
  const v = app.renderVals();
  assert.deepEqual([v.hrOn, v.hrLabel, v.hrOpen], [true, 'Capteur cardiaque ✦', false]);
  assert.match(v.hrSub, /Inclus dans Barlog Pro\.$/);
  v.hrRowTap();
  assert.equal(app.state.pw.f, 'hr', 'page Pro, raison « hr »');
  const pw = app.renderVals();
  assert.equal(pw.pwTitle, 'Ton capteur cardiaque');
  assert.ok(pw.pwPerks.some(x => x.label === 'Capteur cardiaque'), 'ligne de la page Pro');
  assert.equal(app.state.hrOpen, undefined, 'la page du capteur ne s’ouvre pas sans Pro');
});

test('C2a : page Pro sur le site → pas de ligne « Capteur cardiaque »', () => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', pw: { f: null, plan: 'year' } });
  assert.equal(app.renderVals().pwPerks.some(x => x.label === 'Capteur cardiaque'), false);
});

test('C2a : chercher, choisir la ceinture (gardée sur ce téléphone), la voir en direct, l’oublier', async t => {
  const H = fakeHR(); nativeWindow(t, { BarlogHR: H });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', ...PRO });
  app.renderVals().hrRowTap(); app.hrAuto();
  let v = app.renderVals();
  assert.deepEqual([v.hrOpen, v.hrNoDev, v.hrHasDev, v.hrLabel], [true, true, false, 'Capteur cardiaque']);
  assert.equal(H.calls.some(c => c[0] === 'connect'), false, 'aucune ceinture choisie : pas de connexion');
  v.hrFind(); await flush();
  assert.deepEqual(H.calls.find(c => c[0] === 'scan'), ['scan', { all: false }], 'seulement les capteurs cardiaques');
  assert.equal(app.renderVals().hrFindLabel, 'Recherche…');
  // Bluetooth éteint / refusé / indisponible : le natif le dit par hrState (pas de hrScanEnd) → la recherche s'arrête.
  H.L.hrState({ state: 'idle', why: 'Bluetooth éteint' });
  assert.deepEqual([app.renderVals().hrFindLabel, app.renderVals().hrErr], ['Chercher', 'Bluetooth éteint']);
  app.renderVals().hrFind(); await flush();
  H.L.hrFound({ id: 'A-1', name: 'HRM200:123041', rssi: -60 }); H.L.hrFound({ id: 'A-1', name: 'HRM200:123041', rssi: -50 });
  v = app.renderVals();
  assert.deepEqual(v.hrFound.map(d => d.name), ['HRM200:123041'], 'une ligne par ceinture');
  v.hrFound[0].onClick(); app.hrAuto(); await flush();
  assert.deepEqual(app.state.hrDev, DEV, 'ceinture enregistrée');
  assert.ok(H.calls.some(c => c[0] === 'stopScan'), 'recherche arrêtée');
  assert.deepEqual(H.calls.filter(c => c[0] === 'connect'), [['connect', { id: 'A-1' }]], 'page ouverte : connectée pour voir les BPM');
  v = app.renderVals();
  assert.deepEqual([v.hrHasDev, v.hrNoDev, v.hrBpm, v.hrLive], [true, false, '—', 'Mets ta ceinture : elle s’allume au contact de la peau.']);
  assert.equal(v.hrSub, 'HRM200:123041 · se connecte pendant tes séances');
  H.L.hr({ bpm: 92, t: Date.now() });
  v = app.renderVals();
  assert.deepEqual([v.hrBpm, v.hrLive], ['92', 'en direct']);
  assert.equal(v.hrPillOn, false, 'pas de séance : pas de pastille');
  // Fermer la page sans séance → déconnectée.
  v.hrRowTap(); app.hrAuto();
  assert.equal(H.calls.at(-1)[0], 'disconnect');
  // Oublier.
  app.renderVals().hrRowTap(); app.hrAuto(); app.renderVals().hrForget(); app.hrAuto();
  assert.equal(app.state.hrDev, null);
  assert.equal(H.calls.at(-1)[0], 'disconnect');
  // Ni dans la sauvegarde en ligne ni dans l'export (identifiant Bluetooth propre à ce téléphone).
  const B = loadBarlog();
  assert.ok(B.PK.includes('hrDev') && B.CB_SKIP.includes('hrDev'));
  assert.equal('hrDev' in app.cbData({ ...emptyData(), hrDev: DEV }), false);
});

test('C2a : connexion automatique pendant la séance seulement (Pro), déconnexion à « Finir »', async t => {
  const now = Date.now(), H = fakeHR(); nativeWindow(t, { BarlogHR: H });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', ...PRO, hrDev: DEV });
  app.hrAuto();
  assert.equal(H.calls.some(c => c[0] === 'connect'), false, 'pas de séance : pas de connexion');
  app.setState({ screen: 'workout', workout: { rid: null, name: 'Push', start: now - 60_000, ex: [{ name: 'Bench Press', sets: [{ w: 60, r: 10, done: true }] }] } }); app.hrAuto();
  assert.deepEqual(H.calls.filter(c => c[0] === 'connect'), [['connect', { id: 'A-1' }]], 'séance commencée → connectée');
  app.setState({ workout: { ...app.state.workout, name: 'Push 2' } }); app.hrAuto();
  assert.equal(H.calls.filter(c => c[0] === 'connect').length, 1, 'séance modifiée : pas de nouvelle connexion');
  const nd = H.calls.filter(c => c[0] === 'disconnect').length;
  app.finish(); app.hrAuto(); await flush();
  assert.equal(H.calls.filter(c => c[0] === 'disconnect').length, nd + 1, '« Finir » → déconnectée');
  assert.ok(H.calls.some(c => c[0] === 'samples'), 'points relus à « Finir » (le natif les garde après la déconnexion)');
  // Sans Pro (ou « Voir l'app sans Pro ») : jamais connectée.
  const H2 = fakeHR(); nativeWindow(t, { BarlogHR: H2 });
  const free = makeApp(loadBarlog(), { ...emptyData(), hrDev: DEV, workout: { rid: null, name: 'X', start: now, ex: [] } });
  free.hrAuto();
  assert.equal(H2.calls.some(c => c[0] === 'connect'), false);
});

test('C2a : pastille ♥ en séance — seulement après des BPM de cette séance, « — » si plus rien depuis 5 s', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const H = fakeHR(); nativeWindow(t, { BarlogHR: H });
  const T0 = Date.now();
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', ...PRO, hrDev: DEV });
  app.hrListen();
  H.L.hr({ bpm: 80 });   // avant la séance
  app.setState({ screen: 'workout', workout: { rid: null, name: 'Push', start: T0, ex: [] } });
  assert.equal(app.renderVals().hrPillOn, false, 'BPM d’avant la séance : pas de pastille');
  t.mock.timers.tick(1000); H.L.hr({ bpm: 132 });
  let v = app.renderVals();
  assert.deepEqual([v.hrPillOn, v.hrPill], [true, '♥ 132']);
  t.mock.timers.tick(300); H.L.hr({ bpm: 135 });
  assert.equal(app.renderVals().hrPill, '♥ 132', 'deux messages par seconde : un seul rafraîchissement');
  t.mock.timers.tick(700); H.L.hr({ bpm: 136 });
  assert.equal(app.renderVals().hrPill, '♥ 136');
  t.mock.timers.tick(6000);
  v = app.renderVals();
  assert.deepEqual([v.hrPillOn, v.hrPill], [true, '♥ —'], 'ceinture perdue ou app en arrière-plan');
});

test('C2a : carte « Fréquence cardiaque » au résumé et dans le détail d’une séance ; floutée sans Pro', t => {
  nativeWindow(t, { BarlogHR: fakeHR() });
  const S = 1_700_000_000_000, hr = { avg: 128, max: 165, n: 1700, step: 5, c: [100, 110, 0, 0, 120, 0, 150, 160] };
  const hist = { 'Bench Press': [{ date: S, sets: [{ w: 60, r: 10 }] }] };
  const base = { ...emptyData(), lang: 'fr', history: hist, sessMeta: { [S]: { name: 'Push', dur: 1800_000, hr } } };
  const app = makeApp(loadBarlog(), { ...base, ...PRO, screen: 'session', openSess: S });
  let v = app.hrcVals(app.state);
  assert.deepEqual([v.hrcOn, v.hrcAvg, v.hrcMax, v.lkHr.on, v.hrcEnd], [true, '128', '165', false, '1 min']);
  assert.equal(v.hrcSegs.length, 3, 'trous gardés : 3 morceaux');
  assert.equal(v.hrcSegs[1].pts.split(' ').length, 2, 'point seul : petit trait');
  const ys = v.hrcSegs.flatMap(g => g.pts.split(' ').map(p => +p.split(',')[1]));
  assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= 80, 'dans la hauteur du graphique');
  assert.equal(app.renderVals().hrcOn, true, 'dans le rendu');
  // Résumé juste après « Finir ».
  const sum = makeApp(loadBarlog(), { ...base, ...PRO, screen: 'summary', summary: { start: S, name: 'Push', dur: 1800_000, vol: 0, sets: 1, prevVol: 0, hasPrev: false, prs: [], ex: [] } });
  assert.equal(sum.hrcVals(sum.state).hrcOn, true);
  // Sans Pro : floutée, avec le cadenas.
  const free = makeApp(loadBarlog(), { ...base, screen: 'session', openSess: S });
  assert.equal(free.hrcVals(free.state).lkHr.on, true);
  // Séance sans fréquence cardiaque, ou mal formée : pas de carte.
  assert.equal(makeApp(loadBarlog(), { ...base, sessMeta: { [S]: { name: 'Push' } }, screen: 'session', openSess: S }).hrcVals({ ...base, sessMeta: { [S]: { name: 'Push' } }, screen: 'session', openSess: S }).hrcOn, false);
  assert.equal(app.hrcVals({ ...app.state, sessMeta: { [S]: { hr: { ...hr, c: 'x' } } } }).hrcOn, false);
  // Durée affichée en heures au-delà de 60 min.
  assert.equal(app.hrcVals({ ...app.state, sessMeta: { [S]: { hr: { ...hr, step: 20, c: Array(300).fill(120) } } } }).hrcEnd, '1 h 40');
});

test('C2a : fréquence cardiaque jamais dans les sauvegardes du téléphone (iCloud) ; remise au démarrage', async t => {
  const S = Date.now() - 86_400_000, hr = { avg: 128, max: 165, n: 600, step: 5, c: [120, 130] };
  const env = nativeEnv(t, fakeHR());
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), routines: [{ id: 'r', name: 'R', ex: [] }], history: { 'Bench Press': [{ date: S, sets: [{ w: 60, r: 10 }] }] }, sessMeta: { [S]: { name: 'Push', hr } } });
  app.nativeReady = true; app.save(true); await flush();
  const main = JSON.parse(env.fsMem['DATA/barlog-data.json']), ls = JSON.parse(env.ls['barlog-v1']);
  for (const d of [main, ls]) assert.deepEqual(d.sessMeta[S], { name: 'Push' }, 'ni dans barlog-data.json ni dans le localStorage');
  assert.deepEqual(JSON.parse(env.fsMem['LIBRARY_NO_CLOUD/barlog-health.json']).hr, { [S]: hr }, 'dans le fichier hors sauvegardes');
  assert.deepEqual(app.state.sessMeta[S].hr, hr, 'toujours à l’écran');
  assert.deepEqual(app.cbData(app.state).sessMeta[S].hr, hr, 'la sauvegarde en ligne la garde');
  // Démarrage : remise depuis le fichier hors sauvegardes.
  const app2 = makeApp(B, { ...emptyData() }); app2.instCheck = () => Promise.resolve();
  await app2.nativeBoot(null); await flush();
  assert.deepEqual(app2.state.sessMeta[S], { name: 'Push', hr }, 'revenue au démarrage');
  assert.deepEqual(JSON.parse(env.fsMem['DATA/barlog-data.prev.json']).sessMeta[S], { name: 'Push' }, 'copie de la veille : sans non plus');
});

test('C2a : données remises par la sauvegarde d’un autre téléphone → ceinture oubliée (identifiant Bluetooth différent)', async t => {
  nativeEnv(t, fakeHR(), { 'LIBRARY_NO_CLOUD/barlog-install': 'iNOUVEAU' });
  const app = makeApp(loadBarlog(), { ...emptyData(), hrDev: DEV, cloud: { inst: 'iANCIEN' } });
  await app.instCheck(); await flush();
  assert.equal(app.state.hrDev, null);
  const same = makeApp(loadBarlog(), { ...emptyData(), hrDev: DEV, cloud: { inst: 'iNOUVEAU' } });
  await same.instCheck(); await flush();
  assert.deepEqual(same.state.hrDev, DEV, 'même téléphone : gardée');
});

// ——— C2b : « Montrer ma fréquence cardiaque » (Fil, page profil, image de partage) ———

const ACCT = { uid: 'u1', email: 'a@b.c', profile: { username: 'alex', terms_v: 1, default_visibility: 'followers' } };
const HR1 = { avg: 130, max: 181, n: 2400, step: 15, c: [120, 140] };
// Faux client Supabase : update(…).eq(…).eq(…) / .not(…) ; erreur réseau au choix ; journal des appels.
function sbLog(fail) {
  const log = [];
  const q = (t, op, p) => { const e = { t, op, p, f: [] }; log.push(e); const r = { eq: (k, v) => { e.f.push(['eq', k, v]); return r; }, not: (k, o, v) => { e.f.push(['not', k, o, v]); return r; },
    then: (ok, ko) => (fail && fail() ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ error: null })).then(ok, ko) }; return r; };
  return { log, c: { from: t => ({ update: p => q(t, 'update', p) }) } };
}
function shareApp(t, state = {}, fail) {
  nativeWindow(t, { BarlogHR: fakeHR() });
  const S1 = Date.UTC(2026, 10, 17, 15), S2 = Date.UTC(2026, 10, 18, 14), S3 = Date.UTC(2026, 10, 18, 18);
  const history = { Squat: [S1, S2, S3].map(date => ({ date, sets: [{ w: 100, r: 5 }] })) };
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct: ACCT, history, ...PRO,
    sessMeta: { [S1]: { name: 'Sans FC', pub: { vis: 'followers', at: 1 } }, [S2]: { name: 'Bas du corps', hr: HR1, pub: { vis: 'followers', at: 2 } }, [S3]: { name: 'Pas publiée', hr: HR1 } }, ...state });
  const k = sbLog(fail); app.sb = () => Promise.resolve(k.c); app.renderVals();
  return { app, log: k.log, S1, S2, S3 };
}

test('C2b : désactivé par défaut → rien de cardiaque dans la publication (colonnes envoyées vides, pour effacer)', t => {
  const { app, S2 } = shareApp(t);
  const row = app.pubRow(S2, 'followers', '');
  assert.ok('hr_avg' in row && 'hr_max' in row, 'toujours envoyées');
  assert.deepEqual([row.hr_avg, row.hr_max], [null, null]);
  assert.equal(app.state.hrShare, undefined, 'jamais activé tout seul');
});

test('C2b : activé → moyenne et max dans la publication ; valeurs hors des bornes du serveur → rien', t => {
  const { app, S1, S2 } = shareApp(t, { hrShare: true });
  assert.deepEqual([app.pubRow(S2, 'followers', '').hr_avg, app.pubRow(S2, 'followers', '').hr_max], [130, 181]);
  assert.deepEqual([app.pubRow(S1, 'followers', '').hr_avg, app.pubRow(S1, 'followers', '').hr_max], [null, null], 'séance sans fréquence cardiaque');
  for (const hr of [{ ...HR1, avg: 20 }, { ...HR1, max: 260 }, { ...HR1, avg: 150, max: 140 }, { ...HR1, c: 'x' }]) {
    app.state.sessMeta = { ...app.state.sessMeta, [S2]: { name: 'X', hr } };
    assert.equal(app.pubRow(S2, 'followers', '').hr_avg, null, JSON.stringify(hr));
  }
  app.state.sessMeta = { ...app.state.sessMeta, [S2]: { name: 'X', hr: { ...HR1, avg: 129.6, max: 180.4 } } };
  assert.deepEqual([app.pubRow(S2, 'followers', '').hr_avg, app.pubRow(S2, 'followers', '').hr_max], [130, 180], 'entiers');
});

test('C2b : réglage dans Profil → Compte, seulement dans l’app iPhone (ou déjà activé) ; l’activer = Pro', t => {
  const { app } = shareApp(t, { pro: null });
  app.pwLoad = () => {};
  let v = app.renderVals();
  assert.deepEqual([v.acHrOn, v.acHrLabel, v.acHrTg.justify], [true, 'Montrer ma fréquence cardiaque ✦', 'flex-start']);
  v.acHrClick();
  assert.equal(app.state.pw.f, 'hr', 'sans Pro : page Pro');
  assert.equal(app.state.hrShare, undefined);
  // Site / Android sans le plugin : caché… sauf s'il est déjà activé (pour pouvoir le désactiver).
  nativeWindow(t, {}, 'android');
  assert.equal(makeApp(loadBarlog(), { ...emptyData(), acct: ACCT }).renderVals().acHrOn, false);
  assert.equal(makeApp(loadBarlog(), { ...emptyData(), acct: ACCT, hrShare: true }).renderVals().acHrOn, true);
});

test('C2b : activer → ajoutée aux séances déjà publiées qui en ont une ; désactiver → retirée de toutes en une demande', async t => {
  const { app, log, S2, S1 } = shareApp(t);
  app.setState(st => ({ sessMeta: { ...st.sessMeta, [S2]: { ...st.sessMeta[S2], pub: { ...st.sessMeta[S2].pub, id: 'p2' } }, [S1]: { ...st.sessMeta[S1], pub: { ...st.sessMeta[S1].pub, id: 'p1' } } },
    feed: { items: [{ id: 'p2', user_id: 'u1' }, { id: 'p1', user_id: 'u1' }, { id: 'x9', user_id: 'u2', hr_avg: 140, hr_max: 170 }], at: Date.now() } }));
  app.renderVals().acHrClick(); for (let i = 0; i < 4; i++) await flush();
  assert.equal(app.state.hrShare, true);
  assert.deepEqual(log.map(e => [e.t, e.op, e.p, e.f]), [['activities', 'update', { hr_avg: 130, hr_max: 181 }, [['eq', 'user_id', 'u1'], ['eq', 'local_start', S2]]]],
    'seulement la séance publiée avec fréquence cardiaque (ni celle sans, ni la non publiée)');
  assert.equal(app.renderVals().acHrTg.justify, 'flex-end');
  // Cartes déjà affichées : mises à jour sans attendre le rechargement du Fil.
  assert.deepEqual([app.state.feed.items[0].hr_avg, app.state.feed.items[1].hr_avg], [130, undefined]);
  log.length = 0;
  app.renderVals().acHrClick(); for (let i = 0; i < 4; i++) await flush();
  assert.equal(app.state.hrShare, false);
  assert.deepEqual(log.map(e => [e.t, e.op, e.p, e.f]), [['activities', 'update', { hr_avg: null, hr_max: null }, [['eq', 'user_id', 'u1'], ['not', 'hr_avg', 'is', null]]]]);
  assert.equal(app.state.hrHideQ, null, 'fait : plus en attente');
  assert.deepEqual(app.state.feed.items.map(x => x.hr_avg), [null, undefined, 140], 'retirée de mes cartes affichées, pas de celles des autres');
});

test('C2b : désactivé hors ligne → la demande attend et repart au retour du réseau, sous le même compte seulement', async t => {
  let off = true;
  const { app, log } = shareApp(t, { hrShare: true }, () => off);
  app.renderVals().acHrClick(); for (let i = 0; i < 4; i++) await flush();
  assert.deepEqual([app.state.hrShare, app.state.hrHideQ], [false, 'u1'], 'gardée en attente');
  const B = loadBarlog();
  assert.ok(B.PK.includes('hrHideQ') && B.CB_SKIP.includes('hrHideQ'), 'survit à la fermeture de l’app, reste sur ce téléphone');
  assert.ok(B.PK.includes('hrShare') && B.CB_SET.includes('hrShare'), 'le réglage suit la restauration, comme « Publier automatiquement »');
  // Autre compte connecté : rien ne part.
  app.setState({ acct: { ...ACCT, uid: 'u2' } }); log.length = 0; app.pubFlush(true); await flush();
  assert.equal(log.length, 0);
  off = false; app.setState({ acct: ACCT }); app.pubFlush(true); for (let i = 0; i < 4; i++) await flush();
  assert.equal(log.length, 1); assert.deepEqual(log[0].p, { hr_avg: null, hr_max: null });
  assert.equal(app.state.hrHideQ, null);
  // Réactivé avant le retour du réseau : la demande en attente est abandonnée.
  off = true; app.renderVals(); app.hrHideAll(); await flush(); assert.equal(app.state.hrHideQ, 'u1');
  app.renderVals().acHrClick(); assert.equal(app.state.hrHideQ, null);
});

test('C2b : suppression du compte → réglage remis à « désactivé »', async () => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct: ACCT, hrShare: true, hrHideQ: 'u1', cloud: { on: false } });
  app.sb = () => Promise.resolve({ functions: { invoke: async () => ({ data: { ok: true }, error: null }) }, auth: { signOut: async () => ({}) } });
  app.renderVals(); app.acDelete(); app.sureGo(); for (let i = 0; i < 6; i++) await flush();
  assert.equal(app.state.acct, null);
  assert.deepEqual([app.state.hrShare, app.state.hrHideQ], [false, null]);
});

test('C2b : Fil et page profil — « FC moy. » (rouge) et « FC max » seulement quand l’auteur les a publiées', () => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', acct: ACCT });
  app.renderVals();
  const row = { id: 'a1', user_id: 'u2', username: 'bo', title: 'Legs', duration_s: 5060, volume_kg: 2819.5, sets: 31 };
  const st = x => app.cardVals(app.state, [{ ...row, ...x }], 'fd')[0].stats;
  assert.deepEqual(st({}).map(s => s.label), ['Durée', 'Volume', 'Séries']);
  assert.deepEqual(st({ hr_avg: null, hr_max: null }).length, 3, 'colonnes vides');
  const s5 = st({ hr_avg: 130, hr_max: 181 });
  assert.deepEqual(s5.slice(3), [{ label: 'FC moy.', value: '130 BPM', color: '#FF5A6E' }, { label: 'FC max', value: '181 BPM', color: '#FFFFFF' }]);
  assert.equal(s5[0].color, '#FFFFFF');
  // Données d'un autre compte : jamais fiables.
  for (const bad of [{ hr_avg: '130', hr_max: 181 }, { hr_avg: 130 }, { hr_avg: 150, hr_max: 140 }, { hr_avg: 10, hr_max: 300 }, { hr_avg: 130.5, hr_max: 181 }])
    assert.equal(st(bad).length, 3, JSON.stringify(bad));
});

test('C2b : image de partage — celle du Fil reprend ce que l’auteur a publié ; celle du résumé suit le réglage', t => {
  const { app, S2 } = shareApp(t, { unit: 'kg', fdFull: {} });
  const got = []; app.shareCard = d => got.push(d);
  app.state.feed = { items: [{ id: 'a1', user_id: 'u2', username: 'bo', title: 'Legs', duration_s: 3600, volume_kg: 1000, sets: 10, hr_avg: 130, hr_max: 181 }, { id: 'a2', user_id: 'u2', username: 'bo', title: 'Push', duration_s: 3600, volume_kg: 1000, sets: 10 }] };
  globalThis.document = { querySelectorAll: () => [] }; t.after(() => { delete globalThis.document; });
  app.shareAct('a1'); app.shareAct('a2');
  assert.deepEqual(got.map(d => d.hr), [{ avg: 130, max: 181 }, null]);
  // Résumé de fin de séance.
  const sum = { start: S2, name: 'Bas du corps', dur: 5060_000, vol: 2819.5, sets: 31, prevVol: 0, hasPrev: false, prs: [], ex: [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }] };
  app.setState({ screen: 'summary', summary: sum }); app.renderVals(); app.shareSummary();
  assert.equal(got.at(-1).hr, null, 'réglage désactivé : pas sur l’image');
  app.setState({ hrShare: true }); app.renderVals(); app.shareSummary();
  assert.deepEqual(got.at(-1).hr, { avg: 130, max: 181 });
});

test('C2b : activé puis désactivé vite (réseau lent) → les demandes partent l’une après l’autre ; le serveur finit sans fréquence cardiaque', async t => {
  const { app, log } = shareApp(t);
  // Réseau lent : chaque demande attend que le test la libère.
  const held = []; app.sb = () => Promise.resolve({ from: tb => ({ update: p => { const e = { p, f: [] }; log.push(e); const r = { eq: (k, v) => { e.f.push([k, v]); return r; }, not: (k) => { e.f.push(['not', k]); return r; },
    then: (ok, ko) => new Promise(res => held.push(res)).then(() => ({ error: null })).then(ok, ko) }; return r; } }) });
  app.renderVals().acHrClick(); await flush();
  assert.equal(log.length, 1, 'ajout parti'); assert.deepEqual(log[0].p, { hr_avg: 130, hr_max: 181 });
  app.renderVals().acHrClick(); await flush(); await flush();
  assert.equal(log.length, 1, 'effacement pas encore parti : il attend la réponse de l’ajout');
  assert.deepEqual([app.state.hrShare, app.state.hrHideQ], [false, 'u1']);
  held.shift()(); for (let i = 0; i < 4; i++) await flush();
  assert.equal(log.length, 2); assert.deepEqual(log[1].p, { hr_avg: null, hr_max: null }, 'effacement envoyé après');
  held.shift()(); for (let i = 0; i < 4; i++) await flush();
  assert.equal(app.state.hrHideQ, null);
  // Désactivé → réactivé vite : le dernier passage remet la fréquence cardiaque.
  app.renderVals().acHrClick(); app.renderVals().acHrClick(); app.renderVals().acHrClick(); await flush(); await flush();
  while (held.length) { held.shift()(); for (let i = 0; i < 4; i++) await flush(); }
  assert.equal(app.state.hrShare, true);
  assert.deepEqual(log.at(-1).p, { hr_avg: 130, hr_max: 181 }, 'dernier envoi = dernier choix (activé)');
});

test('C2b : publication automatique à « Terminer » → elle attend la fréquence cardiaque (réglage activé)', async t => {
  for (const share of [true, false]) {
    const { app, start } = hrSession(t);
    app.setState({ autoPub: true, hrShare: share, acct: ACCT });
    const sent = []; app.pubSend = (d, vis, note, quiet) => sent.push({ d, vis, quiet, row: app.pubRow(d, vis, note) });
    app.finish(); for (let i = 0; i < 4; i++) await flush();
    assert.equal(sent.length, 1, 'publiée une fois');
    assert.deepEqual([sent[0].d, sent[0].vis, sent[0].quiet], [start, 'followers', true]);
    assert.deepEqual([sent[0].row.hr_avg, sent[0].row.hr_max], share ? [130, 130] : [null, null], share ? 'avec la fréquence cardiaque' : 'réglage désactivé : sans');
  }
});

test('C2b : natif qui ne répond pas → la publication automatique part quand même après 3 s', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, H } = hrSession(t);
  H.samples = () => new Promise(() => {});   // jamais de réponse
  app.setState({ autoPub: true, hrShare: true, acct: ACCT });
  const sent = []; app.pubSend = (d) => sent.push(app.pubRow(d, 'followers', ''));
  app.finish(); await flush();
  assert.equal(sent.length, 0, 'attend la fréquence cardiaque');
  t.mock.timers.tick(3000); await flush();
  assert.equal(sent.length, 1, 'partie après 3 s');
  assert.equal(sent[0].hr_avg, null, 'sans fréquence cardiaque');
});
