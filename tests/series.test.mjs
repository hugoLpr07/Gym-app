// Retirer une série pendant la séance (ex. « + Ajouter une série » touché par erreur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime();
const start = (t, ex, extra = {}) => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const B = loadBarlog();
  return makeApp(B, { ...emptyData(), screen: 'workout', now: T0, workout: { rid: null, name: 'Push', start: T0, ex }, ...extra });
};
const sets = (app, ei = 0) => app.state.workout.ex[ei].sets;

test('série ajoutée par erreur : retirée, les séries faites restent, le focus revient à la série à faire', t => {
  const app = start(t, [{ name: 'Bench Press', sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: false }] },
    { name: 'Overhead Press', sets: [{ w: 40, r: 8, done: false }] }], { focus: { ei: 0, si: 2 } });
  app.addSet(0);
  assert.equal(sets(app).length, 4); assert.deepEqual(app.state.focus, { ei: 0, si: 3 });
  const row = app.renderVals().wEx[0].sets[3];
  assert.equal(row.active, true); assert.equal(typeof row.onDel, 'function', 'bouton « Retirer la série » sur la série en cours');
  row.onDel();
  assert.equal(sets(app).length, 3);
  assert.deepEqual(sets(app).map(x => x.done), [true, true, false]);
  assert.deepEqual(app.state.focus, { ei: 0, si: 2 }, 'retour à la 3ᵉ série, pas à l’exercice suivant');
  assert.equal(app.renderVals().wEx[0].progress, '2/3');
});

test('retirer une série au milieu : le maintien en cours sur une série plus bas la suit et la coche à la fin', t => {
  const app = start(t, [{ name: 'Plank', sets: [{ w: 0, r: 20, done: false }, { w: 0, r: 30, done: false }, { w: 0, r: 40, done: false }] }], { focus: { ei: 0, si: 1 } });
  app.setState({ hold: { ei: 0, si: 2, side: null, start: T0, end: T0 + 40000 } });
  app.delSet(0, 1);
  assert.deepEqual(sets(app).map(x => x.r), [20, 40]);
  assert.deepEqual(app.state.focus, { ei: 0, si: 1 }, 'focus sur la série suivante à faire');
  assert.equal(app.state.hold.si, 1, 'le maintien vise toujours la série de 40 s');
  for (let i = 0; i < 41000 / 250; i++) { t.mock.timers.tick(250); app.tick(); }
  assert.equal(app.state.hold, null); assert.deepEqual(sets(app).map(x => x.done), [false, true]);
});

test('retirer la série dont le maintien tourne l’arrête ; une série d’un autre exercice ne touche ni focus ni maintien', t => {
  const app = start(t, [{ name: 'Plank', sets: [{ w: 0, r: 20, done: false }, { w: 0, r: 30, done: false }] }, { name: 'Bench Press', sets: [{ w: 60, r: 8, done: false }, { w: 60, r: 8, done: false }] }],
    { focus: { ei: 0, si: 1 }, hold: { ei: 0, si: 1, side: null, start: T0, end: T0 + 30000 } });
  app.delSet(1, 0);
  assert.equal(sets(app, 1).length, 1);
  assert.deepEqual(app.state.focus, { ei: 0, si: 1 }); assert.equal(app.state.hold.si, 1);
  app.delSet(0, 1);
  assert.equal(app.state.hold, null, 'maintien arrêté');
  assert.deepEqual(app.state.focus, { ei: 0, si: 0 }, 'focus sur la dernière série restante à faire');
  app.delSet(0, 0);
  assert.equal(sets(app).length, 0);
  assert.deepEqual(app.state.focus, { ei: 1, si: 0 }, 'plus rien dans cet exercice : focus sur le suivant');
  app.addSet(0);
  assert.equal(sets(app).length, 1, 'on peut rajouter une série à un exercice vidé');
});
