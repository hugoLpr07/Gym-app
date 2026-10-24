// Maintien par côté (ex. GHD Hold per side) : le côté droit attend qu'on le lance, le temps de changer de côté.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime();
const EX = 'GHD Hold (per side)';
const start = t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), screen: 'workout', now: T0,
    workout: { rid: null, name: 'Dos', start: T0, ex: [{ name: EX, sets: [{ w: 0, r: 30, r2: 25, done: false }] }] } });
  app.buzz = () => {}; app.tone = () => {}; app.unlockAudio = () => {};
  return app;
};
const wait = (t, app, ms) => { for (let i = 0; i < ms / 250; i++) { t.mock.timers.tick(250); app.tick(); } };
const set = app => app.state.workout.ex[0].sets[0];
const label = app => app.renderVals().wEx[0].sets[0].holdLabel;

test('maintien par côté : le droit ne démarre pas tout seul après le gauche', t => {
  const app = start(t);
  app.holdToggle(0, 0);
  assert.equal(app.state.hold.side, 'l');
  wait(t, app, 31000);
  assert.equal(app.state.hold.side, 'r');
  assert.equal(app.state.hold.wait, true, 'droit en attente');
  assert.match(label(app), /^▶ \S+ 0:25$/, 'le bouton propose de lancer le côté droit');
  wait(t, app, 60000); // le temps de changer de côté : rien ne bouge
  assert.equal(app.state.hold.wait, true); assert.equal(set(app).done, false);
  const calls = []; app.liveAct = () => ({ start: p => { calls.push(p); return Promise.resolve({ ok: true }); }, stop: () => { calls.push('stop'); return Promise.resolve(); } });
  app._laKey = 'x'; app.syncLive();
  assert.deepEqual(calls, ['stop'], 'aucun chrono sur l’écran verrouillé pendant l’attente');
  app.holdToggle(0, 0); // lancé à la main
  assert.equal(app.state.hold.wait, false);
  wait(t, app, 24000);
  assert.equal(set(app).done, false, 'droit encore en cours');
  wait(t, app, 2000);
  assert.equal(app.state.hold, null); assert.equal(set(app).done, true);
  assert.equal(set(app).r, 30); assert.equal(set(app).r2, 25);
});

test('maintien par côté : arrêter le gauche plus tôt garde son temps et attend le droit', t => {
  const app = start(t);
  app.holdToggle(0, 0);
  wait(t, app, 20000);
  app.holdToggle(0, 0);
  assert.equal(set(app).r, 20, 'temps du gauche enregistré');
  assert.equal(app.state.hold.side, 'r'); assert.equal(app.state.hold.wait, true);
  wait(t, app, 30000);
  assert.equal(app.state.hold.wait, true, 'toujours en attente'); assert.equal(set(app).r2, 25);
  app.holdToggle(0, 0); wait(t, app, 10000); app.holdToggle(0, 0); // droit arrêté à 10 s
  assert.equal(app.state.hold, null); assert.equal(set(app).r2, 10);
});

test('maintien sans côté : inchangé (s’arrête et coche la série à la fin)', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), screen: 'workout', now: T0,
    workout: { rid: null, name: 'Gainage', start: T0, ex: [{ name: 'Plank', sets: [{ w: 0, r: 20, done: false }] }] } });
  app.buzz = () => {}; app.tone = () => {}; app.unlockAudio = () => {};
  app.holdToggle(0, 0); assert.equal(app.state.hold.side, null);
  wait(t, app, 21000);
  assert.equal(app.state.hold, null); assert.equal(app.state.workout.ex[0].sets[0].done, true);
});
