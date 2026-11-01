// Lancer une séance d'un programme : reps du programme, poids et colonne « PRÉC. » de la dernière fois (0.40.0).
// Progression proposée seulement si toutes les séries demandées ont été réussies au même poids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const D1 = new Date(2026, 9, 27, 18, 0).getTime();
const B = loadBarlog();
const app = (history, extra = {}) => makeApp(B, { ...emptyData(), lang: 'fr', unit: 'kg', pro: true, history, ...extra });
const last = sets => ({ 'Incline DB Press': [{ date: D1, sets }] });
const x5 = (w, r = 5) => Array.from({ length: 5 }, () => ({ w, r }));

test('séance du programme : reps du programme, poids et « PRÉC. » de la dernière fois', () => {
  const a = app(last([{ w: 30, r: 10 }, { w: 30, r: 9 }, { w: 30, r: 7 }]),
    { routines: [{ id: 'r1', name: 'Push', ex: [{ name: 'Incline DB Press', sets: 3, reps: 10 }] }] });
  a.start('r1', true);
  const ex = a.state.workout.ex[0];
  assert.deepEqual(ex.sets.map(x => x.r), [10, 10, 10], 'reps du programme, pas celles de la dernière fois');
  assert.deepEqual(ex.sets.map(x => x.w), [30, 30, 30], 'poids de la dernière fois');
  assert.deepEqual(ex.sets.map(x => [x.pw, x.pr]), [[30, 10], [30, 9], [30, 7]], 'colonne « PRÉC. »');
  assert.equal(ex.up, false);
  assert.deepEqual(a.mkEx('Incline DB Press', 3, null, a.state.history).sets.map(x => x.r), [10, 9, 7], 'hors programme : reps de la dernière fois');
});

test('progression : toutes les séries demandées réussies au même poids → +2,5 kg ; sinon rien', () => {
  const a = app({});
  const mk = (sets, n = 5) => a.mkEx('Incline DB Press', n, 5, last(sets));
  let ex = mk(x5(25));
  assert.equal(ex.up, true);
  assert.deepEqual(ex.sets.map(x => [x.w, x.r]), x5(27.5).map(x => [x.w, x.r]));
  assert.equal(mk([...x5(25).slice(0, 4), { w: 25, r: 4 }]).up, false, 'une série à 4 reps');
  assert.equal(mk([{ w: 22.5, r: 5 }, { w: 22.5, r: 5 }, ...x5(25).slice(0, 3)]).up, false, 'poids différents');
  assert.equal(mk(x5(25).slice(0, 4)).up, false, '4 séries sur 5');
  assert.equal(mk([...x5(25), { w: 20, r: 8 }]).up, true, 'série en plus après le programme : ignorée');
  ex = app({}, { pro: false }).mkEx('Incline DB Press', 5, 5, last(x5(25)));
  assert.equal(ex.up, true); assert.equal(ex.sets[0].w, 25, 'sans Pro : proposition floutée, poids inchangé');
});

test('échauffement (W) de la dernière fois : gardé tel quel, ne compte pas parmi les séries demandées', () => {
  const a = app({});
  const ex = a.mkEx('Incline DB Press', 5, 5, last([{ w: 10, r: 12, wu: true }, ...x5(25).slice(0, 4)]));
  assert.deepEqual(ex.sets.map(x => [x.warm, x.w, x.r]), [[true, 10, 12], [false, 27.5, 5], [false, 27.5, 5], [false, 27.5, 5], [false, 27.5, 5]]);
  assert.equal(a.mkEx('Incline DB Press', 5, 5, last([{ w: 10, r: 12, wu: true }, ...x5(25).slice(0, 3)])).up, false);
});

test('unilatéral et chronométré : valeur du programme des deux côtés / en secondes', () => {
  const a = app({}, { exMeta: { 'Incline DB Press': { type: 'uni' }, Plank: { type: 'time' } } });
  const u = a.mkEx('Incline DB Press', 2, 10, last([{ w: 20, r: 8, l: 8, rr: 9 }, { w: 20, r: 7, l: 7, rr: 8 }]));
  assert.deepEqual(u.sets.map(x => [x.r, x.r2]), [[10, 10], [10, 10]]);
  const t = a.mkEx('Plank', 3, 45, { Plank: [{ date: D1, sets: [{ w: 0, r: 30 }, { w: 0, r: 30 }, { w: 0, r: 25 }] }] });
  assert.deepEqual(t.sets.map(x => x.r), [45, 45, 45]); assert.equal(t.up, false);
});

test('en livres : augmentation de 2,5 lb, boutons −/+ du poids aussi de 2,5 lb', () => {
  const a = app(last(x5(55 / 2.20462)), { unit: 'lb', routines: [{ id: 'r1', name: 'Push', ex: [{ name: 'Incline DB Press', sets: 5, reps: 5 }] }] });
  a.start('r1', true);
  assert.equal(String(a.dispW(a.state.workout.ex[0].sets[0].w)), '57.5');
  const v = a.renderVals().wEx[0];
  assert.equal(v.upVal, '+2.5 lb');
  assert.deepEqual([v.sets[0].wmL, v.sets[0].wpL], ['−2.5', '+2.5']);
  v.sets[0].wPlus();
  assert.equal(String(a.dispW(a.state.workout.ex[0].sets[0].w)), '60');
  v.sets[0].wMinus(); v.sets[0].wMinus();
  assert.equal(String(a.dispW(a.state.workout.ex[0].sets[0].w)), '55');
});
