// Cardio (0.47.0) : plus facile à trouver dans la bibliothèque, minutes prévues décomptées par le minuteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const T0 = new Date(2026, 10, 17, 12, 0, 0).getTime();
const lib = (state = {}) => { const B = loadBarlog(); return makeApp(B, { ...emptyData(), screen: 'library', libCtx: 'workout', libQuery: '', libGroup: 'All', ...state }); };
const found = (app, q) => { app.setState({ libQuery: q }); return app.renderVals().libList.map(l => l.name); };

test('recherche : autres noms anglais et français, sans accents', () => {
  const app = lib();
  assert.ok(found(app, 'treadmill').includes('Running'));
  assert.ok(found(app, 'Stationary bike').includes('Cycling'));
  assert.ok(found(app, 'elliptical machine').includes('Elliptical'));
  assert.ok(found(app, 'velo').includes('Cycling'), 'vélo sans accent');
  assert.ok(found(app, 'tapis roulant').includes('Running'));
  assert.ok(found(app, 'rameur').includes('Rowing machine'));
  assert.deepEqual(found(app, 'cardio').sort(), ['Cycling', 'Elliptical', 'Jump rope', 'Rowing machine', 'Running', 'Stair climber', 'Walking']);
  assert.deepEqual(found(app, 'bench'), ['Bench Press'], 'la musculation ne change pas');
  assert.ok(!found(app, 'barbell row').includes('Rowing machine'));
});

test('filtre Cardio juste après « Tous »', () => {
  const g = lib().renderVals().groups.map(x => x.name);
  assert.deepEqual(g.slice(0, 2), ['All', 'Cardio']);
});

test('créer « Treadmill » depuis « Tous » : rangé dans Cardio, type cardio', () => {
  const app = lib({ libQuery: 'Treadmill', workout: { rid: null, name: 'Libre', start: T0, ex: [] } });
  assert.equal(app.renderVals().createGroup, 'Cardio');
  app.createCustom();
  assert.deepEqual(app.state.custom, [{ name: 'Treadmill', group: 'Cardio', custom: true }]);
  assert.equal(app.meta('Treadmill').type, 'cardio');
  const b = lib({ libQuery: 'Cable Fly' }); assert.equal(b.renderVals().createGroup, 'Custom', 'le reste va toujours dans Perso');
});

test('créer un nom non reconnu dans le filtre Cardio : enregistré comme cardio', () => {
  const app = lib({ libQuery: 'Ski erg', libGroup: 'Cardio', workout: { rid: null, name: 'Libre', start: T0, ex: [] } });
  app.createCustom();
  assert.equal(app.state.custom[0].group, 'Cardio');
  assert.equal(app.meta('Ski erg').type, 'cardio');
  assert.equal(app.state.workout.ex[0].sets[0].d, 0, 'série cardio (min, distance, kcal)');
});

test('ligne « dernière » de la bibliothèque : minutes et distance du cardio, plus de « 0 lb × 20 »', () => {
  const app = lib({ unit: 'kg', history: { Running: [{ date: T0 - 86400000, sets: [{ w: 0, r: 20, d: 5, c: 0 }] }], Plank: [{ date: T0 - 86400000, sets: [{ w: 0, r: 60 }] }], 'Pull-up': [{ date: T0 - 86400000, sets: [{ w: 0, r: 8 }] }] } });
  const meta = n => app.renderVals().libList.find(l => l.name === n).meta;
  assert.match(meta('Running'), / · last 20 min · 5 km$/);
  assert.match(meta('Plank'), / · last 60 s$/);
  assert.match(meta('Pull-up'), / · last 8 reps$/);
});

// ── Minuteur ──
const run = (t, r, extra = {}) => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  return makeApp(B, { ...emptyData(), screen: 'workout', now: T0, unit: 'kg',
    workout: { rid: null, name: 'Cardio', start: T0, ex: [{ name: 'Running', target: null, sets: [{ w: 0, r, d: 0, c: 0, done: false }, { w: 0, r, d: 0, c: 0, done: false }] }] }, ...extra });
};
const wait = (t, app, ms) => { for (let i = 0; i < ms / 250; i++) { t.mock.timers.tick(250); app.tick(); } };
const set = (app, i = 0) => app.state.workout.ex[0].sets[i];
const label = app => app.renderVals().wEx[0].sets[0].holdLabel;

test('minutes prévues : le minuteur descend, puis enregistre les minutes et coche la série', t => {
  const app = run(t, 5);
  assert.equal(label(app), '▶ Timer 5:00');
  app.cardioRun(0, 0);
  assert.equal(set(app).goal, 5);
  wait(t, app, 60000);
  assert.equal(label(app), '■ Stop · 4:00');
  assert.equal(set(app).done, false);
  wait(t, app, 240500);
  assert.equal(set(app).run, null); assert.equal(set(app).r, 5); assert.equal(set(app).done, true);
});

test('arrêter avant la fin garde le temps fait ; reprendre finit le décompte', t => {
  const app = run(t, 5);
  app.cardioRun(0, 0); wait(t, app, 120000); app.cardioRun(0, 0);
  assert.equal(set(app).r, 2); assert.equal(set(app).done, false);
  assert.equal(label(app), '▶ Resume · 3:00');
  app.cardioRun(0, 0); wait(t, app, 180500);
  assert.equal(set(app).r, 5); assert.equal(set(app).done, true);
});

test('pendant le décompte, +1′ ajoute une minute au minuteur (pas au temps fait)', t => {
  const app = run(t, 5);
  app.cardioRun(0, 0); wait(t, app, 60000);
  app.renderVals().wEx[0].sets[0].wPlus();
  assert.equal(set(app).goal, 6); assert.equal(label(app), '■ Stop · 5:00');
  wait(t, app, 300500);
  assert.equal(set(app).r, 6); assert.equal(set(app).done, true);
});

test('sans minutes prévues : chrono qui monte, comme avant', t => {
  const app = run(t, 0);
  assert.equal(label(app), '▶ Start stopwatch');
  app.cardioRun(0, 0); assert.equal(set(app).goal, null);
  wait(t, app, 360000);
  assert.equal(label(app), '■ Stop · 6:00'); assert.equal(set(app).done, false);
});

test('deux boutons : « Minuteur » décompte, « Chrono » monte même avec des minutes prévues', t => {
  const app = run(t, 5);
  const row = () => app.renderVals().wEx[0].sets[0];
  assert.equal(row().hasHold2, true); assert.equal(row().hold2Label, '▶ Stopwatch');
  row().onHold2({ stopPropagation() {} });
  assert.equal(set(app).goal, null);
  assert.equal(row().hasHold2, false, 'un seul bouton pendant la course');
  wait(t, app, 360000);
  assert.equal(label(app), '■ Stop · 6:00'); assert.equal(set(app).done, false, 'pas d’arrêt à 5 min');
  app.cardioRun(0, 0);
  assert.equal(set(app).r, 6); assert.equal(row().hasHold2, false, 'reprendre : un seul bouton');
  app.setState({ workout: { ...app.state.workout, ex: [{ name: 'Running', target: null, sets: [{ w: 0, r: 0, d: 0, c: 0, done: false }] }] } });
  assert.equal(row().hasHold2, false, 'sans minutes : seulement le chrono'); assert.equal(label(app), '▶ Start stopwatch');
});

test('écran verrouillé : compte à rebours jusqu’à la fin prévue', t => {
  const app = run(t, 5);
  const calls = []; app.liveAct = () => ({ start: p => { calls.push(p); return Promise.resolve({ ok: true }); }, stop: () => { calls.push('stop'); return Promise.resolve(); } });
  app.cardioRun(0, 0); app.syncLive();
  assert.equal(calls[0].mode, 'down'); assert.equal(calls[0].start, T0); assert.equal(calls[0].end, T0 + 5 * 60000);
  assert.equal(calls[0].title, 'Cardio'); assert.equal(calls[0].next, 'Running · set 1');
});

test('notification de fin (réglage Fin de repos) : prévue à la fin, annulée à l’arrêt', async t => {
  const app = run(t, 5, { restNotif: true });
  const out = []; const LN = { cancel: () => { out.push('cancel'); return Promise.resolve(); }, schedule: o => { out.push(o.notifications[0]); return Promise.resolve(); } };
  app.nat = () => ({ LocalNotifications: LN });
  app.cardioRun(0, 0); app.syncCardioNotif(); await flush();
  const n = out.find(x => x.id === 1002);
  assert.ok(n, 'notification prévue'); assert.equal(n.schedule.at.getTime(), T0 + 5 * 60000); assert.equal(n.body, 'Running · 5 min');
  out.length = 0; app.cardioRun(0, 0); app.syncCardioNotif(); await flush();
  assert.deepEqual(out, ['cancel'], 'arrêtée : rien de prévu');
});

// ── Unité de distance (Profil → Distance) ──
test('distance : km ou mi choisi à part, sinon suit kg / lb ; toujours enregistrée en km', () => {
  const B = loadBarlog(); const PK = B.PK, CB_SET = B.CB_SET;
  assert.ok(PK.includes('distU'), 'réglage gardé sur le téléphone'); assert.ok(CB_SET.includes('distU'), 'et dans la sauvegarde en ligne');
  const mk = st => makeApp(B, { ...emptyData(), screen: 'workout', ...st,
    workout: { rid: null, name: 'C', start: T0, ex: [{ name: 'Running', target: null, sets: [{ w: 0, r: 30, d: 5, c: 0, done: false }] }] } });
  const lb = mk({ unit: 'lb' }); assert.equal(lb.renderVals().wEx[0].h2, 'MI', 'lb sans choix → miles');
  const kg = mk({ unit: 'kg' }); assert.equal(kg.renderVals().wEx[0].h2, 'KM', 'kg sans choix → km');
  const a = mk({ unit: 'lb', distU: 'km' });
  assert.equal(a.renderVals().wEx[0].h2, 'KM'); assert.equal(a.cardioTxt({ r: 30, d: 5 }), '30 min · 5 km');
  a.typeC(0, 0, 'd', '10'); assert.equal(a.state.workout.ex[0].sets[0].d, 10, 'km saisis tels quels');
  const m = mk({ unit: 'kg', distU: 'mi' });
  assert.equal(m.renderVals().wEx[0].h2, 'MI'); assert.equal(m.cardioTxt({ r: 30, d: 1.60934 }), '30 min · 1 mi');
  m.typeC(0, 0, 'd', '2'); assert.ok(Math.abs(m.state.workout.ex[0].sets[0].d - 3.21868) < 1e-9, 'miles convertis en km');
  const v = m.renderVals(); assert.equal(v.miBg, '#24242B'); v.setKm(); assert.equal(m.state.distU, 'km');
});

// ── Retirer un exercice de la séance ──
const three = (extra = {}) => { const B = loadBarlog(); return makeApp(B, { ...emptyData(), screen: 'workout', exSheet: 1, ...extra,
  workout: { rid: null, name: 'S', start: T0, ex: [
    { name: 'Bench Press', ss: true, sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: false }] },
    { name: 'Barbell Row', ss: false, sets: [{ w: 80, r: 8, done: false }] },
    { name: 'Cycling', sets: [{ w: 0, r: 10, d: 0, c: 0, done: false }] }], ...(extra.w || {}) } }); };
const names = app => app.state.workout.ex.map(e => e.name);

test('retirer un exercice sans série cochée : tout de suite, menu fermé, superset défait', () => {
  const app = three({ focus: { ei: 2, si: 0 } });
  const v = app.renderVals(); assert.equal(v.sheetCanRm, true); assert.equal(v.sheetRmLabel, 'Remove exercise');
  v.sheetRm();
  assert.deepEqual(names(app), ['Bench Press', 'Cycling']);
  assert.equal(app.state.workout.ex[0].ss, false, 'Bench n’est plus lié à Cycling'); assert.equal(app.state.exSheet, null);
  assert.deepEqual(app.state.focus, { ei: 1, si: 0 }, 'le focus suit Cycling');
  assert.deepEqual(app.toasts, ['Exercise removed']);
});

test('retirer un exercice avec des séries cochées : deuxième touche demandée', () => {
  const app = three({ exSheet: 0, focus: { ei: 0, si: 1 } });
  app.rmEx(0);
  assert.equal(names(app).length, 3, 'première touche : rien de retiré'); assert.equal(app.renderVals().sheetRmLabel, 'Tap again to remove');
  app.rmEx(0);
  assert.deepEqual(names(app), ['Barbell Row', 'Cycling']); assert.deepEqual(app.state.focus, { ei: 0, si: 0 });
});

test('retirer le milieu d’un superset de trois garde le lien entre les deux autres', () => {
  const app = three();
  app.setState({ workout: { ...app.state.workout, ex: app.state.workout.ex.map((e, i) => ({ ...e, ss: i < 2 })) } });
  app.rmEx(1);
  assert.deepEqual(names(app), ['Bench Press', 'Cycling']); assert.equal(app.state.workout.ex[0].ss, true);
});

test('retirer un cardio en cours arrête son chrono (écran verrouillé)', () => {
  const app = three();
  app.cardioRun(2, 0); assert.ok(app.state.workout.ex[2].sets[0].run);
  const calls = []; app.liveAct = () => ({ start: p => { calls.push(p); return Promise.resolve({ ok: true }); }, stop: () => { calls.push('stop'); return Promise.resolve(); } });
  app.rmEx(2); app._laKey = 'x'; app.syncLive();
  assert.deepEqual(calls, ['stop']);
});

test('menu « ••• » d’une routine : pas de bouton Retirer (la routine a déjà sa croix)', () => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), screen: 'routine', editId: 'r1', rSheet: 0, routines: [{ id: 'r1', name: 'A', ex: [{ name: 'Squat', sets: 3, reps: 5 }] }] });
  const v = app.renderVals(); assert.equal(v.sheetOn, true, "menu ouvert"); assert.equal(v.sheetCanRm, false);
});

// ── Progrès → Séances : carte « Cardio de la semaine » (0.48.0, gratuite) ──
const DAY = 86400000; // T0 = mardi 17 nov. 2026 ; la semaine commence le lundi 16
const PRO = { plan: 'beta', since: 1, beta: true };
const prog = (t, extra = {}) => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  return makeApp(B, { ...emptyData(), tab: 'progress', screen: 'tabs', progView: 'sessions', unit: 'kg', pro: PRO, ...extra });
};
const HIST = {
  Running: [{ date: T0 - 7 * DAY, sets: [{ w: 0, r: 25, d: 4, c: 0 }] }, { date: T0 - DAY, sets: [{ w: 0, r: 20, d: 5, c: 0 }] }, { date: T0 - 3600000, sets: [{ w: 0, r: 12.5, d: 2.4, c: 0 }] }],
  Cycling: [{ date: T0 - DAY, sets: [{ w: 0, r: 30, d: 10, c: 0 }] }],
  'Rowing machine': [{ date: T0 - 8 * DAY, sets: [{ w: 0, r: 15, d: 0, c: 0 }] }],
  'Bench Press': [{ date: T0 - DAY, sets: [{ w: 100, r: 5 }] }],
};

test('carte cardio cachée sans aucun cardio dans l’historique', (t) => {
  const v = prog(t, { history: { 'Bench Press': HIST['Bench Press'] } }).renderVals();
  assert.equal(v.cardioOn, false);
});

test('carte cardio : minutes, km et séances de la semaine (lundi → dimanche), barres de 8 semaines', (t) => {
  const v = prog(t, { history: HIST }).renderVals();
  assert.equal(v.cardioOn, true);
  assert.deepEqual(v.cardioTiles.map(x => [x.label, x.value]), [['Minutes', '63'], ['Distance (km)', '17.4'], ['Sessions', '2']], '20 + 30 + 12,5 min ; 5 + 10 + 2,4 km ; 2 séances (Running + Cycling le même jour = 1), sans le développé couché');
  assert.deepEqual(v.cardioBars.map(b => b.count), ['0', '0', '0', '0', '0', '0', '40', '63'], 'semaine passée : 25 + 15 min');
  assert.equal(v.cardioBars[7].h, '72px'); assert.equal(v.cardioBars[7].labelColor, '#FFFFFF');
  assert.equal(v.cardioBars[0].bg, '#33333C');
});

test('carte cardio en milles quand la distance est réglée en mi (ou en lb sans réglage)', (t) => {
  const a = prog(t, { history: HIST, unit: 'lb' }).renderVals();
  assert.deepEqual(a.cardioTiles[1], { label: 'Distance (mi)', value: '10.8' });
  t.mock.timers.reset();
  const b = prog(t, { history: HIST, unit: 'lb', distU: 'km' }).renderVals();
  assert.equal(b.cardioTiles[1].value, '17.4');
});

test('carte cardio gratuite : visible et chiffrée sans Pro (Régularité reste floutée)', (t) => {
  const v = prog(t, { history: HIST, pro: null }).renderVals();
  assert.equal(v.cardioOn, true); assert.equal(v.lkCardio, undefined, 'pas de cadenas');
  assert.equal(v.cardioTiles[0].value, '63');
  assert.equal(v.lkReg.on, true);
});
