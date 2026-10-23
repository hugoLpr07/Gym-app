// Fiabilité native (lot F) : données du widget, téléphone restauré depuis une sauvegarde, ouverture d'une notification push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime(); // jeudi 15 oct. 2026, 12 h (heure locale) ; lundi = 12 oct.
const d = (m, j, h) => new Date(2026, m, j, h).getTime();

// App native Android simulée : seuls les plugins passés existent.
function nativeWindow(t, Plugins) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
}

test('Widget : dates brutes et textes à compléter (v2), plus de textes déjà calculés qui se figent', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T0 });
  const sent = [];
  nativeWindow(t, { BarlogWidget: { update: o => { sent.push(JSON.parse(o.data)); return Promise.resolve(); } } });
  const B = loadBarlog();
  const sets = [{ w: 80, r: 5 }];
  const history = { 'Bench Press': [d(9, 1, 9), d(9, 8, 9), d(9, 12, 9), d(9, 14, 18)].map(date => ({ date, sets })) };
  const app = makeApp(B, { ...emptyData(), lang: 'fr', pro: { plan: 'life' }, history, now: T0,
    routines: [{ id: 'r1', name: 'Push', ex: [{ name: 'Bench Press', sets: 3 }] }] });
  app.renderVals();
  t.mock.timers.tick(900);
  const w = sent.at(-1);
  assert.ok(w, 'widget mis à jour');
  assert.equal(w.v, 2);
  assert.equal(w.last, d(9, 14, 18), 'date de la dernière séance de la routine (le widget calcule « il y a N jours »)');
  assert.equal(w.sub, '', 'pas de « il y a N jours » figé');
  assert.deepEqual(w.starts, [d(9, 12, 9), d(9, 14, 18)], 'séances de la semaine en cours');
  assert.deepEqual([w.streak, w.streakWeek], [3, '2026-10-12'], 'série de 3 semaines, jusqu’à la semaine du 12 oct.');
  assert.deepEqual([w.tx.lastDone, w.tx.ago, w.tx.n1, w.tx.nN, w.tx.sN], ['Dernière fois', 'il y a {n} jours', '{n} séance', '{n} séances', '{n} semaines d’affilée']);
  assert.deepEqual(w.tx.days, ['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  assert.ok(!('week' in w) && !('weekCount' in w) && !('foot' in w), 'semaine et série calculées par le widget');
});

// ---- Téléphone restauré depuis la sauvegarde d'un autre (Google, iCloud) ----
function fakeFs(files = {}) {
  const k = o => o.directory + '/' + o.path;
  return { files,
    readFile: o => k(o) in files ? Promise.resolve({ data: files[k(o)] }) : Promise.reject(new Error('File does not exist')),
    writeFile: o => { files[k(o)] = o.data; return Promise.resolve({ uri: k(o) }); } };
}

test('instCheck : première ouverture (ou réinstallation) → identifiant d’installation créé hors sauvegarde, nouvel identifiant d’appareil', async t => {
  const F = fakeFs(); nativeWindow(t, { Filesystem: F });
  const app = makeApp(loadBarlog(), { ...emptyData(), cloud: { link: true, uid: 'u1', dev: 'dVieux' }, push: { tok: 'jetonVieux', prefs: { kudo: false } } });
  await app.instCheck();
  const id = F.files['LIBRARY_NO_CLOUD/barlog-install'];
  assert.match(id, /^i[a-z0-9]+$/, 'fichier écrit dans Library/NoCloud (iOS) / files exclu des sauvegardes (Android)');
  assert.deepEqual(app.state.cloud, { link: true, uid: 'u1', inst: id }, 'identifiant d’appareil retiré : il sera recréé au prochain envoi');
  assert.deepEqual(app.state.push, { tok: null, prefs: { kudo: false } }, 'jeton hérité oublié (réenregistré au démarrage du compte)');
});

test('instCheck : même installation → rien ne change', async t => {
  const F = fakeFs({ 'LIBRARY_NO_CLOUD/barlog-install': 'iABC' }); nativeWindow(t, { Filesystem: F });
  const cloud = { link: true, uid: 'u1', dev: 'd1', inst: 'iABC' }; const push = { tok: 'jeton' };
  const app = makeApp(loadBarlog(), { ...emptyData(), cloud, push });
  await app.instCheck();
  assert.equal(app.state.cloud, cloud); assert.equal(app.state.push, push);
});

test('instCheck : données d’un autre téléphone (identifiant différent) → nouvel identifiant d’appareil', async t => {
  const F = fakeFs({ 'LIBRARY_NO_CLOUD/barlog-install': 'iNouveau' }); nativeWindow(t, { Filesystem: F });
  const app = makeApp(loadBarlog(), { ...emptyData(), cloud: { link: true, dev: 'dAncien', inst: 'iAncien' }, push: { tok: 'jetonAncien' } });
  await app.instCheck();
  assert.deepEqual(app.state.cloud, { link: true, inst: 'iNouveau' });
  assert.equal(app.state.push.tok, null);
});

test('instCheck : jeton de notifications déjà réenregistré par ce téléphone pendant cette ouverture → gardé', async t => {
  const F = fakeFs(); nativeWindow(t, { Filesystem: F });
  const app = makeApp(loadBarlog(), { ...emptyData(), acct: { uid: 'u1', profile: { username: 'moi' } }, cloud: { dev: 'dVieux' }, push: { tok: 'jetonVieux' } });
  app.sb = () => new Promise(() => {}); // envoi au serveur sans réponse : seul l'état local compte ici
  app.pushSave('jetonDeCeTelephone');
  await app.instCheck();
  assert.equal(app.state.push.tok, 'jetonDeCeTelephone');
  assert.equal(app.state.cloud.dev, undefined);
});

// ---- Ouverture d'une notification push ----
function pushApp(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = makeApp(loadBarlog(), { ...emptyData(), acct: { uid: 'moi', profile: { username: 'moi' } }, screen: 'tabs', tab: 'today' });
  const asked = []; const opened = [];
  // Le serveur ne renvoie que les notifications de l'utilisateur (RLS) : ici, seulement la n° 42.
  app.sb = () => Promise.resolve({ from: tb => ({ select: () => ({ eq: (c, v) => ({ maybeSingle: () => {
    asked.push(tb + ' ' + c + '=' + v);
    return Promise.resolve({ data: v === '42' ? { kind: 'comment', actor: 'ami', activity_id: 'a9' } : null, error: null }); } }) }) }) });
  app.svOpen = () => opened.push('liste'); app.ntfOpen = x => opened.push(x); app.reqCount = () => {};
  const open = async data => { app._pnOpen = data; app.pushOpen(); t.mock.timers.tick(0); await flush(); await flush(); };
  return { app, asked, opened, open };
}

test('pushOpen : on suit la notification relue sur le serveur, pas le profil ou la séance des données reçues', async t => {
  const { asked, opened, open } = pushApp(t);
  await open({ kind: 'follow', actor: 'escroc', ntf: '42' });
  assert.deepEqual(asked, ['notifications id=42']);
  assert.deepEqual(opened, ['liste', { kind: 'comment', activity_id: 'a9', actor: 'ami' }]);
});

test('pushOpen : intention envoyée par une autre app (notification inconnue ou absente) → seulement la liste', async t => {
  const { asked, opened, open } = pushApp(t);
  await open({ kind: 'follow', actor: 'escroc', ntf: '999' });
  await open({ kind: 'comment', activity: 'x', actor: 'escroc' });
  await open({ kind: 'follow', actor: 'escroc', ntf: '1 or 1=1' });
  assert.deepEqual(asked, ['notifications id=999'], 'identifiant mal formé : aucune requête');
  assert.deepEqual(opened, ['liste', 'liste', 'liste']);
});
