// Widgets v3 (0.45.0) : données brutes des widgets Pro (régularité, records, 1RM estimé, muscles, poids),
// page Pro, lien d'un widget touché sans Pro (iPhone et Android).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime(); // jeudi 15 oct. 2026, 12 h ; lundi = 12 oct.
const d = (m, j, h = 9) => new Date(2026, m, j, h).getTime();

function nativeWindow(t, platform, Plugins) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
}

// Développé couché : 1ᵉʳ oct. (1ʳᵉ fois = record), 8 oct. (record), 12 oct. (pas de record), 14 oct. (record).
// Squat le 13 oct. (1ʳᵉ fois = record ; l'échauffement à 200 kg ne compte pas), gainage chronométré le même jour
// (même séance : une seule date), séance du 2 juin (dans les 20 semaines) et du 20 mai (avant).
const history = () => ({
  'Bench Press': [
    { date: d(9, 1), sets: [{ w: 80, r: 5 }] },
    { date: d(9, 8), sets: [{ w: 60, r: 8, wu: true }, { w: 85, r: 5 }] },
    { date: d(9, 12), sets: [{ w: 82, r: 5 }] },
    { date: d(9, 14, 18), sets: [{ w: 90, r: 4 }, { w: 80, r: 6 }] },
  ],
  'Squat': [{ date: d(9, 13), sets: [{ w: 200, r: 1, wu: true }, { w: 100, r: 5 }, { w: 100, r: 5 }] }],
  'Plank': [{ date: d(9, 13), sets: [{ w: 0, r: 60 }] }, { date: d(5, 2), sets: [{ w: 0, r: 45 }] }, { date: d(4, 20), sets: [{ w: 0, r: 30 }] }],
});
const body = () => [
  { date: new Date(2026, 8, 10).getTime(), w: 80 }, // avant les 30 jours
  { date: new Date(2026, 9, 1).getTime(), w: 79.5 },
  { date: new Date(2026, 9, 5).getTime(), waist: 82 }, // mesure sans poids
  { date: new Date(2026, 9, 14).getTime(), w: 79, hk: { w: 1 } }, // pesée de Santé
];

function setup(t, extra = {}, platform = 'ios') {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T0 });
  const sent = [];
  nativeWindow(t, platform, { BarlogWidget: { update: o => { sent.push(JSON.parse(o.data)); return Promise.resolve(); } } });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', pro: { plan: 'life' }, now: T0, history: history(), body: body(),
    exMeta: { Plank: { type: 'time' } }, routines: [{ id: 'r1', name: 'Push', ex: [{ name: 'Bench Press', sets: 3 }] }], ...extra });
  app.renderVals(); t.mock.timers.tick(900);
  return { app, sent, w: sent.at(-1) };
}

test('Widgets v3 : régularité (20 semaines), records, 1RM estimé, muscles de la semaine, pesées', t => {
  const { w } = setup(t);
  assert.equal(w.v, 3);
  assert.deepEqual([w.u, w.bu], ['kg', 'kg']);
  assert.deepEqual(w.hist, [d(5, 2), d(9, 1), d(9, 8), d(9, 12), d(9, 13), d(9, 14, 18)],
    'débuts de séance depuis le lundi 1ᵉʳ juin (20 semaines), sans doublon, sans le 20 mai');
  assert.deepEqual(w.rec, [['Bench Press', d(9, 14, 18), 90, 4], ['Squat', d(9, 13), 100, 5], ['Bench Press', d(9, 8), 85, 5]],
    '3 derniers records, le plus récent en premier ; ni échauffement ni exercice chronométré');
  assert.equal(w.e1Week, '2026-10-12');
  assert.deepEqual(w.e1, [
    ['Bench Press', [null, null, null, null, null, null, null, null, null, 93.3, 99.2, 102], [90, 4]],
    ['Squat', [null, null, null, null, null, null, null, null, null, null, null, 116.7], [100, 5]],
  ], '1RM estimé par semaine (12, la plus ancienne d’abord), exercice le plus fait en premier, meilleure série');
  assert.equal(w.musWeek, '2026-10-12');
  assert.equal(w.mus.length, 8);
  assert.deepEqual(Object.fromEntries(w.mus), { Pectoraux: 3, Quadriceps: 2, Fessiers: 2, Dos: 1, Ischios: 1, Triceps: 1.5, Épaules: 1.5, Biceps: 0 },
    'séries de travail depuis lundi (secondaire = ½), une fois par groupe (squat : lombaires et ischios secondaires → Dos 1, Ischios 1)');
  assert.deepEqual(w.mus.map(m => m[1]), [...w.mus.map(m => m[1])].sort((a, b) => b - a), 'du plus travaillé au moins travaillé');
  assert.deepEqual(w.bw, [[new Date(2026, 9, 1).getTime(), 79.5], [new Date(2026, 9, 14).getTime(), 79]], 'pesées des 30 derniers jours, Santé comprise');
  assert.deepEqual(w.bwLast, [new Date(2026, 9, 14).getTime(), 79]);
  assert.equal(w.tx.unlock, 'Touche pour débloquer');
  assert.equal(w.tx.lastDone, 'Dernière fois', 'textes v2 toujours là');
  assert.equal(w.tx.mon.length, 12);
  assert.ok(JSON.stringify(w).length < 65536, 'sous la limite des plugins iPhone et Android (64 Ko)');
});

test('Widgets v3 : tous les exercices des programmes au choix (sauf chronométrés et cardio), après ceux faits ces 12 semaines', t => {
  const routines = [
    { id: 'r1', name: 'Push', ex: [{ name: 'Bench Press', sets: 3 }, { name: 'Overhead Press', sets: 3 }, { name: 'Plank', sets: 3 }] },
    { id: 'r2', name: 'Jambes', ex: [{ name: 'Leg Press', sets: 3 }, { name: 'Overhead Press', sets: 2 }, { name: 'Running', sets: 1 }, { name: 'Squat', sets: 5 }] },
  ];
  const { app, w } = setup(t, { routines });
  assert.deepEqual(w.e1.map(e => e[0]), ['Bench Press', 'Squat', 'Overhead Press', 'Leg Press'],
    'faits d’abord (le plus fait = défaut), puis ceux des programmes, une seule fois, sans gainage ni course');
  assert.deepEqual(w.e1[2], ['Overhead Press', []], 'jamais fait ces 12 semaines : pas de données');
  const a = app.wgMore(T0);
  app.state = { ...app.state, routines: [...routines, { id: 'r3', name: 'Dos', ex: [{ name: 'Barbell Row', sets: 3 }] }] };
  assert.equal(app.wgMore(T0).e1.at(-1)[0], 'Barbell Row', 'programme modifié → liste refaite');
  assert.notEqual(app.wgMore(T0), a);
});

test('Widgets v3 : beaucoup d’exercices dans les programmes → toujours sous 64 Ko', t => {
  const ex = Array.from({ length: 200 }, (_, i) => ({ name: 'Exercice personnalisé numéro ' + i, sets: 3 }));
  const history = {};
  ex.slice(0, 120).forEach((e, i) => { history[e.name] = Array.from({ length: 12 }, (_, k) => ({ date: d(9, 14, 9) - k * 7 * 864e5, sets: [{ w: 100 + i, r: 5 }] })); });
  const { w } = setup(t, { routines: [{ id: 'r1', name: 'Tout', ex }], history });
  assert.equal(w.e1.length, 150, 'au plus 150 exercices');
  assert.ok(JSON.stringify(w).length < 65536, 'taille : ' + JSON.stringify(w).length);
});

test('Widgets v3 : livres pour les charges, kilos pour le corps, anglais', t => {
  const { w } = setup(t, { unit: 'lb', bodyU: 'kg', lang: 'en' });
  assert.deepEqual([w.u, w.bu], ['lb', 'kg']);
  assert.deepEqual(w.rec[0], ['Bench Press', d(9, 14, 18), 198.5, 4], '90 kg → 198,5 lb (comme dans l’app : demi-livre)');
  assert.equal(w.e1[0][1][11], 224.9, '1RM 102 kg → 224,9 lb');
  assert.deepEqual(w.bwLast, [new Date(2026, 9, 14).getTime(), 79]);
  assert.equal(w.mus[0][0], 'Chest');
  assert.deepEqual([w.tx.unlock, w.tx.rec, w.tx.dec], ['Tap to unlock', 'PR', '.']);
});

test('Widgets v3 : rien à montrer → listes vides, pas de plantage', t => {
  const { w } = setup(t, { history: {}, body: [] });
  assert.deepEqual([w.hist, w.rec, w.bw, w.bwLast], [[], [], [], null]);
  assert.deepEqual(w.e1, [['Bench Press', []]], 'exercice du programme proposé, sans données');
  assert.ok(w.mus.every(m => m[1] === 0));
});

test('Widgets v3 : calcul gardé en mémoire, refait quand l’historique ou le jour change ; rien sur le site', t => {
  const { app } = setup(t);
  const a = app.wgMore(T0); assert.equal(app.wgMore(T0 + 1000), a, 'même jour, mêmes données → pas de nouveau calcul');
  app.state = { ...app.state, history: { ...app.state.history } }; assert.notEqual(app.wgMore(T0), a, 'nouvel historique → recalcul');
  const b = app.wgMore(T0); assert.notEqual(app.wgMore(T0 + 86400000), b, 'nouveau jour → recalcul');
  delete globalThis.window;
  const web = makeApp(loadBarlog(), { ...emptyData(), history: history(), now: T0 });
  web.renderVals(); assert.equal(web._wgV, undefined, 'site : pas de plugin, pas de calcul');
});

test('Page Pro : widgets sur iPhone (accueil et verrouillé) et Android (accueil), plus de « Bientôt »', t => {
  for (const [platform, label] of [['ios', 'Widgets écran d’accueil et verrouillé'], ['android', 'Widgets écran d’accueil']]) {
    nativeWindow(t, platform, {});
    const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr' });
    app.need('widget'); const v = app.renderVals();
    const labels = v.pwPerks.map(p => p.label);
    assert.ok(labels.includes(label), platform + ' : ' + labels.join(' | '));
    assert.ok(!labels.some(l => /Bientôt/.test(l)));
  }
});

test('Lien d’un widget touché sans Pro : iPhone et Android → page Pro ; tout autre lien ignoré', t => {
  for (const [platform, url] of [['ios', 'com.hugoleperlier.barlog://pro'], ['android', 'com.hugo.barlog://pro']]) {
    const on = {};
    nativeWindow(t, platform, { App: { addListener: (k, f) => { on[k] = f; } } });
    const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', pro: null });
    let asked = []; app.need = f => asked.push(f);
    app.appListen(); app.appListen();
    assert.equal(typeof on.appUrlOpen, 'function', platform + ' : liens écoutés');
    assert.equal(typeof on.backButton, platform === 'android' ? 'function' : 'undefined', 'bouton retour : Android seulement');
    for (const bad of ['https://evil.example//pro', 'com.hugoleperlier.barlog://profile', 'com.autre.app://pro', '', undefined]) on.appUrlOpen({ url: bad });
    on.appUrlOpen(null);
    assert.deepEqual(asked, [], 'liens inconnus ignorés');
    on.appUrlOpen({ url });
    assert.deepEqual(asked, ['widget']);
    app.state = { ...app.state, pro: { plan: 'life' } }; app.isPro = () => true;
    on.appUrlOpen({ url }); assert.deepEqual(asked, ['widget'], 'déjà Pro → rien');
  }
});
