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
  assert.equal(label(app), '▶ Start · 5:00');
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
