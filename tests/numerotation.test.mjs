// Numéro des séries après un échauffement (W, 1, 2… et non W, 2, 3) et séparateur des milliers en français (0.40.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const T0 = new Date(2026, 9, 15, 12, 0, 0).getTime();
const BENCH = [{ w: 40, r: 8, warm: true, done: true }, { w: 60, r: 5, warm: true, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: false }];
const live = (lang, focus) => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang, screen: 'workout', now: T0, focus, restEnd: T0 + 90000, restTotal: 90,
    workout: { rid: null, name: 'Push', start: T0, ex: [{ name: 'Bench Press', sets: BENCH.map(x => ({ ...x })) }] } });
  app.renderVals();   // fixe LANG
  const calls = []; app.liveAct = () => ({ start: p => { calls.push(p); return Promise.resolve({ ok: true }); }, stop: () => Promise.resolve() });
  app._laKey = 'x'; app.syncLive();
  return { app, next: calls[0] && calls[0].next };
};

test('séance en cours : les échauffements ne comptent pas dans les numéros, écran verrouillé compris', t => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const { app, next } = live('fr', { ei: 0, si: 3 });
  assert.deepEqual(app.renderVals().wEx[0].sets.map(x => x.num), ['W', 'W', '1', '2']);
  assert.equal(next, 'Bench Press · série 2', 'Live Activity / notification Android : même numéro que l’écran');
  assert.equal(live('fr', { ei: 0, si: 1 }).next, 'Bench Press · échauffement');
  assert.equal(live('en', { ei: 0, si: 2 }).next, 'Bench Press · set 1');
});

test('volume : « 12 800 kg » en français (pas « 12,800 », qui se lit 12,8), « 12,800 » en anglais', () => {
  const D = new Date(2026, 9, 20, 18, 0).getTime();
  const data = lang => ({ ...emptyData(), lang, unit: 'kg', screen: 'session', openSess: D, tab: 'progress', progView: 'sessions', now: D + 3600000,
    history: { Squat: [{ date: D, sets: [{ w: 60, r: 5, wu: true }, ...Array(8).fill({ w: 120, r: 5 })] }, { date: D - 7 * 864e5, sets: [{ w: 115, r: 5 }] }],
      'Leg Press': [{ date: D, sets: Array(4).fill({ w: 200, r: 10 }) }] }, sessMeta: { [D]: { name: 'Legs A', dur: 3720000 } } });
  const fr = makeApp(loadBarlog(), data('fr')).renderVals();
  const vol = v => v.sdStats.find(x => /Vol/.test(x.label)).value;
  assert.equal(vol(fr), '12\u00a0800', 'détail de la séance');
  assert.match(fr.sessList[0].meta, /12\u00a0800 kg/, 'liste des séances');
  assert.equal(vol(makeApp(loadBarlog(), data('en')).renderVals()), '12,800');
});
