// Records (PR) : un poids jamais soulevé est un record, peu importe les reps (0.46.1).
// Avant : seul le 1RM estimé comptait → 125 × 2 après 115 × 5 (133,3 < 134,2) n'était pas un record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const T0 = new Date(2026, 10, 16, 18, 0, 0).getTime();
const D1 = new Date(2026, 10, 9, 18, 0, 0).getTime();
const texts = n => n == null || typeof n !== 'object' ? (n == null || n === false ? [] : [String(n)]) : (n.children || []).flatMap(texts);

function start(t, sets) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T0 });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', autoRest: false, now: T0,
    history: { 'Bench Press': [{ date: D1, sets: [{ w: 60, r: 10, wu: true }, { w: 115, r: 5 }, { w: 110, r: 5 }] }] },
    screen: 'workout', workout: { rid: null, name: 'Push', start: T0, ex: [{ name: 'Bench Press', sets: sets.map(([w, r]) => ({ w, r, done: false })) }] } });
  const check = si => { t.mock.timers.tick(400); app.check(0, si); return app.state.workout.ex[0].sets[si].isPR; };
  return { app, check };
}

test('poids jamais soulevé avec moins de reps = record ; refaire le même poids ne l’est plus', t => {
  const { app, check } = start(t, [[125, 2], [125, 2], [120, 3]]);
  assert.equal(check(0), true, '125 × 2 après 115 × 5 : poids jamais soulevé');
  const pop = texts(app.prEl(app.state.prFx));
  assert.ok(pop.some(x => /^(Charge max|Heaviest weight)  ·  \+10 kg$/.test(x)), 'la célébration montre le poids gagné, pas un 1RM estimé en baisse : ' + pop.join(' | '));
  assert.equal(check(1), false, '125 × 2 une 2ᵉ fois : déjà soulevé');
  assert.equal(check(2), false, '120 × 3 : ni plus lourd ni meilleur 1RM estimé');
  app.finish();
  assert.deepEqual(app.state.summary.prs.map(p => [p.name, p.w, p.r]), [['Bench Press', 125, 2]], 'résumé de fin');
  assert.deepEqual(app.pubRow(T0, 'followers', '').prs, [{ ex: 'Bench Press', w: 125, r: 2 }], 'publication sur le fil');
  assert.deepEqual(app.wgMore(T0).rec[0], ['Bench Press', T0, 125, 2], 'widget Derniers records');
});

test('1RM estimé battu à un poids plus léger : toujours un record (règle d’avant inchangée)', t => {
  const { app, check } = start(t, [[110, 8], [100, 5]]);
  assert.equal(check(0), true, '110 × 8 (139,3) bat 115 × 5 (134,2)');
  assert.ok(texts(app.prEl(app.state.prFx)).some(x => x.startsWith('e1RM ')), 'la célébration montre le 1RM estimé');
  assert.equal(check(1), false);
  assert.deepEqual(app.pubRow(T0, 'followers', '').prs, [], 'rien publié avant « Finir »');
});

test('un échauffement ou une série à 0 rep ne fait pas de record de poids', t => {
  const { app, check } = start(t, [[130, 0], [125, 2]]);
  app.toggleWarm(0, 1);
  assert.equal(check(1), false, 'échauffement');
  app.toggleWarm(0, 1);
  assert.equal(check(1), false, 'décochée'); assert.equal(check(1), true, 'recochée en série de travail : record');
  assert.equal(check(0), false, '130 × 0 : rien de soulevé (1RM estimé 130 < 134,2, pas de record de poids)');
});
