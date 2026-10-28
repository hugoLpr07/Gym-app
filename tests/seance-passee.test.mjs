// Séance passée (« Modifier ») : ajouter une série oubliée avant « Finir », un exercice, retirer une série (0.39.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData } from './harness.mjs';

const D1 = new Date(2026, 9, 20, 18, 0).getTime(), D2 = new Date(2026, 9, 24, 18, 0).getTime(), D3 = new Date(2026, 9, 27, 18, 0).getTime();
const open = (history, extra = {}) => makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', unit: 'kg', editBuf: {}, history,
  sessMeta: { [D2]: { name: 'Push', dur: 3600000 } }, screen: 'session', openSess: D2, sessEdit: true, ...extra });
const on = (app, d, n = 0) => app.state.history[n === 0 ? 'Bench Press' : n].filter(x => x.date === d);

test('série oubliée : ajoutée (copie de la dernière), comptée dans la publication, mise à jour en quittant avec ‹', async () => {
  const app = open({ 'Bench Press': [{ date: D1, sets: [{ w: 95, r: 5 }] }, { date: D2, sets: [{ w: 60, r: 10, wu: true }, { w: 100, r: 5, rpe: 8 }, { w: 100, r: 5 }] }] },
    { acct: { uid: 'u1', profile: { username: 'hugo', default_visibility: 'followers' } } });
  app.state.sessMeta[D2].pub = { vis: 'followers', at: 1, id: 'a1' };
  app.renderVals().sdEx[0].onAddSet();
  assert.deepEqual(on(app, D2)[0].sets[3], { w: 100, r: 5 }, 'copie sans RPE ni échauffement');
  app.renderVals().sdEx[0].sets[3].onW({ target: { value: '105' } });
  assert.equal(on(app, D2)[0].sets[3].w, 105);
  assert.equal(on(app, D1)[0].sets.length, 1, 'les autres séances ne bougent pas');
  const row = app.pubRow(D2, 'followers', '');
  assert.equal(row.sets, 3); assert.deepEqual(row.prs, [{ ex: 'Bench Press', w: 105, r: 5 }]);
  const sent = []; app.pubSend = (...a) => sent.push(a);
  app.renderVals().sessBack();
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(sent, [[D2, 'followers', undefined, true]], 'publication renvoyée');
  assert.ok(app.toasts.includes('Séance mise à jour'));
  assert.equal(app.state.sessEdit, false); assert.equal(app.state.openSess, null);
});

test('retirer une série ; un exercice vidé quitte la séance ; la dernière série de la séance reste', () => {
  const app = open({ 'Bench Press': [{ date: D2, sets: [{ w: 100, r: 5 }, { w: 100, r: 4 }] }], 'Cable Fly': [{ date: D2, sets: [{ w: 20, r: 12 }] }] });
  let v = app.renderVals(); const fly = v.sdEx.findIndex(x => x.name === 'Cable Fly');
  v.sdEx[fly].sets[0].onDel();
  assert.equal(app.state.history['Cable Fly'], undefined, 'plus aucune entrée : exercice retiré');
  v = app.renderVals(); assert.deepEqual(v.sdEx.map(x => x.name), ['Bench Press']);
  assert.equal(v.sdEx[0].sets[0].delOn, true);
  v.sdEx[0].sets[0].onDel();
  assert.deepEqual(on(app, D2)[0].sets, [{ w: 100, r: 4 }]);
  assert.equal(app.renderVals().sdEx[0].sets[0].delOn, false, '« Supprimer » sert à retirer toute la séance');
});

test('ajouter un exercice : bibliothèque, préremplie avec la fois d’avant, rangée par date, retour à la séance', () => {
  const app = open({ 'Bench Press': [{ date: D2, sets: [{ w: 100, r: 5 }] }],
    'Back Squat': [{ date: D1, sets: [{ w: 60, r: 5, wu: true }, { w: 120, r: 5, rir: 2 }] }, { date: D3, sets: [{ w: 125, r: 5 }] }] });
  app.renderVals().sdAddEx();
  assert.equal(app.state.screen, 'library'); assert.equal(app.state.libCtx, 'session');
  assert.match(app.renderVals().libCtxLabel, /^à Push · /);
  app.goBack(); assert.equal(app.state.screen, 'session', 'retour sans rien ajouter');
  app.renderVals().sdAddEx(); app.pick('Back Squat');
  assert.deepEqual(app.state.history['Back Squat'].map(x => x.date), [D1, D2, D3]);
  assert.deepEqual(app.state.history['Back Squat'][1].sets, [{ w: 120, r: 5 }], 'série de travail de la fois d’avant');
  assert.equal(app.state.screen, 'session'); assert.equal(app.state.sessEdit, true);
  assert.deepEqual(app.renderVals().sdEx.map(x => x.name).sort(), ['Back Squat', 'Bench Press']);
  assert.equal(app.mkEx('Back Squat', 1, null, app.state.history).sets[0].w, 125, 'la prochaine séance part toujours de la plus récente');
  app.renderVals().sdAddEx(); app.pick('Deadlift');
  assert.deepEqual(app.state.history.Deadlift, [{ date: D2, sets: [{ w: 0, r: 8 }] }], 'jamais fait : valeurs à saisir');
});

test('exercice deux fois dans la séance : chaque saisie ne touche que le sien', () => {
  const app = open({ 'Bench Press': [{ date: D2, sets: [{ w: 100, r: 5 }] }, { date: D2, sets: [{ w: 60, r: 12 }] }] });
  const v = app.renderVals(); assert.equal(v.sdEx.length, 2);
  v.sdEx[1].sets[0].onW({ target: { value: '70' } });
  assert.deepEqual(on(app, D2).map(x => x.sets[0].w), [100, 70]);
  app.renderVals().sdEx[1].onAddSet();
  assert.deepEqual(on(app, D2).map(x => x.sets.length), [1, 2]);
  assert.equal(app.renderVals().sdEx[1].sets[1].wDisp, '70');
});

test('séance d’exemple : l’exercice ajouté l’est aussi (jamais envoyé en ligne)', () => {
  const app = open({ 'Bench Press': [{ date: D2, demo: 1, sets: [{ w: 100, r: 5 }] }] });
  app.renderVals().sdAddEx(); app.pick('Deadlift');
  assert.equal(app.state.history.Deadlift[0].demo, 1);
});
