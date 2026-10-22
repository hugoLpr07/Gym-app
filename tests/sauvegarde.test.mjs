// Sauvegarde en ligne : fusion (cbMerge), restauration (cbRestore), envoi (cbUp).
// Les tests marqués [BUG] décrivent le comportement attendu et ÉCHOUENT aujourd'hui (motif Prove-It).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const T = d => Date.UTC(2026, 9, d, 18); // dates fixes : 2026-10-d 18:00 UTC
const set = (w, r) => ({ w, r });

test('cbMerge garde tout ce qui existe d’un côté ou de l’autre (ce téléphone l’emporte en cas de doublon)', () => {
  const B = loadBarlog(); const app = makeApp(B, emptyData());
  const local = { ...emptyData(),
    history: { 'Bench Press': [{ date: T(3), sets: [set(80, 5)] }, { date: T(10), sets: [set(85, 5)] }] },
    routines: [{ id: 'r1', name: 'Push (modifiée ici)', ex: [] }],
    custom: [{ name: 'Zercher Squat', group: 'Legs', custom: true }],
    body: [{ date: T(10), w: 80 }], sessMeta: { [T(10)]: { name: 'Push ici' } } };
  const backup = {
    history: { 'Bench Press': [{ date: T(1), sets: [set(75, 5)] }, { date: T(10), sets: [set(999, 1)] }], Squat: [{ date: T(2), sets: [set(100, 5)] }] },
    routines: [{ id: 'r1', name: 'Push (ancienne)', ex: [] }, { id: 'r2', name: 'Pull', ex: [] }],
    custom: [{ name: 'Zercher Squat', group: 'Custom', custom: true }, { name: 'Sled Push', group: 'Custom', custom: true }],
    body: [{ date: T(10), w: 81, bf: 18 }, { date: T(1), w: 82 }], sessMeta: { [T(10)]: { name: 'Push sauvegarde' }, [T(1)]: { name: 'Push 1' } } };

  const o = app.cbMerge(local, backup);

  assert.deepEqual(o.history['Bench Press'].map(x => x.date), [T(1), T(3), T(10)], 'séances des deux côtés, triées');
  assert.deepEqual(o.history['Bench Press'][2].sets, [set(85, 5)], 'même date : la séance de ce téléphone gagne');
  assert.deepEqual(o.history.Squat.map(x => x.date), [T(2)]);
  assert.deepEqual(o.routines.map(r => r.name), ['Push (modifiée ici)', 'Pull']);
  assert.deepEqual(o.custom.map(x => x.name), ['Zercher Squat', 'Sled Push']);
  assert.deepEqual(o.body, [{ date: T(1), w: 82 }, { date: T(10), w: 80, bf: 18 }], 'pesées fusionnées champ par champ');
  assert.deepEqual([o.sessMeta[T(10)].name, o.sessMeta[T(1)].name], ['Push ici', 'Push 1']);
});

test('cbRestore « Remplacer » demande confirmation, puis remplace l’historique sans toucher la séance en cours, les pesées Santé ni le Pro', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const B = loadBarlog();
  const backup = { history: { Squat: [{ date: T(2), sets: [set(100, 5)] }] }, routines: [{ id: 'rB', name: 'Legs', ex: [] }], custom: [],
    body: [{ date: T(2), w: 81 }], sessMeta: {}, exMeta: {}, unit: 'lb', pro: { plan: 'life', test: true } };
  const workout = { rid: null, name: 'En cours', start: T(20), ex: [] };
  const app = makeApp(B, { ...emptyData(), pro: null, unit: 'kg', workout, screen: 'workout',
    history: { 'Bench Press': [{ date: T(3), sets: [set(80, 5)] }] },
    body: [{ date: T(5), w: 79, hk: { w: 1 } }, { date: T(6), w: 78 }],
    acct: { uid: 'u1', profile: { username: 'test' } }, cbAsk: { path: 'u1/b1.gz', n: 1 } });
  app.sb = () => Promise.resolve({});                         // frontière réseau simulée
  app.cbFetch = () => Promise.resolve(structuredClone(backup));
  let uploads = 0; app.cbUp = () => { uploads++; return Promise.resolve(); }; app.pullWeights = () => {};

  app.cbRestore('replace');
  assert.equal(app.state.cbAsk.arm, true, '1er toucher : confirmation demandée');
  assert.ok(app.state.history['Bench Press'], 'rien n’est remplacé avant la confirmation');

  app.cbRestore('replace');
  await flush();
  assert.deepEqual(Object.keys(app.state.history), ['Squat']);
  assert.deepEqual(app.state.workout, workout, 'séance en cours gardée');
  assert.equal(app.state.screen, 'workout');
  assert.deepEqual(app.state.body.map(b => b.date), [T(2), T(5)], 'pesée Santé gardée, pesée manuelle locale remplacée');
  assert.equal(app.state.unit, 'lb', 'réglages repris de la sauvegarde');
  assert.equal(app.isPro(), false, 'restaurer ne redonne pas le Pro');
  t.mock.timers.tick(500);
  assert.equal(uploads, 1, 'la sauvegarde est renvoyée après restauration');
});

test('cbMerge garde les deux blocs d’un exercice fait deux fois dans la même séance', () => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), autoRest: false, libCtx: 'workout' });
  app.start(null, true);                                       // séance libre
  app.pick('Bench Press'); app.pick('Bench Press');            // la bibliothèque n'empêche pas le doublon
  app.updW(w => { w.ex.forEach((e, i) => e.sets.forEach(x => { x.w = i ? 60 : 100; x.r = i ? 12 : 5; x.done = true; })); });
  app.finish();
  const start = app.state.summary.start;
  const setsOf = st => st.history['Bench Press'].filter(x => x.date === start).flatMap(x => x.sets);
  assert.equal(setsOf(app.state).length, 6, 'avant fusion : 2 blocs × 3 séries');

  const merged = app.cbMerge(app.state, { history: {}, routines: [] }); // sauvegarde d'un autre téléphone

  assert.equal(setsOf(merged).length, 6, 'après fusion : aucune série perdue');
});

test('une séance supprimée sur ce téléphone ne revient pas à la fusion suivante', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const B = loadBarlog();
  const backup = { history: { Squat: [{ date: T(2), sets: [set(100, 5)] }] }, routines: [], sessMeta: { [T(2)]: { name: 'Legs' } } };
  const app = makeApp(B, { ...emptyData(), history: structuredClone(backup.history), sessMeta: structuredClone(backup.sessMeta) });
  app.deleteSession(T(2)); app.deleteSession(T(2));           // 2 touchers (confirmation)
  assert.equal(app.state.history.Squat, undefined, 'supprimée localement');

  const merged = app.cbMerge(app.state, backup);               // sauvegarde d'avant la suppression (autre téléphone)

  assert.equal(merged.history.Squat, undefined, 'la séance supprimée ne doit pas réapparaître');
});

test('[BUG] cbUp : deux téléphones qui envoient en même temps ne suppriment jamais la sauvegarde courante (meta.path)', { todo: 'à corriger au lot D3' }, async () => {
  const B = loadBarlog();
  const old = new Date(Date.now() - 3600e3).toISOString();
  const store = { files: new Map([['u1/b1000000000.gz', new Blob(['{}'])]]), meta: { user_id: 'u1', path: 'u1/b1000000000.gz', prev_path: null, device: 'dA', updated_at: old } };
  const client = hooks => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: store.meta && { ...store.meta }, error: null }) }) }),
      upsert: row => ({ select: () => ({ maybeSingle: async () => { store.meta = { ...row, updated_at: new Date().toISOString() }; return { data: { updated_at: store.meta.updated_at }, error: null }; } }) }),
    }),
    storage: { from: () => ({
      upload: async (p, b) => { store.files.set(p, b); return { error: null }; },
      download: async p => (store.files.has(p) ? { data: store.files.get(p), error: null } : { data: null, error: new Error('absent') }),
      list: async uid => { if (hooks.beforeList) await hooks.beforeList(); return { data: [...store.files.keys()].filter(k => k.startsWith(uid + '/')).map(k => ({ name: k.slice(uid.length + 1) })) }; },
      remove: async rm => { rm.forEach(k => store.files.delete(k)); return { error: null }; },
    }) },
  });
  const phone = (dev, hooks) => { const a = makeApp(B, { ...emptyData(), pro: { plan: 'year' }, acct: { uid: 'u1', profile: { username: 't' } },
    cloud: { on: true, uid: 'u1', link: true, dev, srvAt: Date.parse(old) }, history: { Squat: [{ date: T(dev === 'dA' ? 1 : 2), sets: [set(100, 5)] }] } });
    a.sb = () => Promise.resolve(client(hooks)); return a; };
  let reached, release; const atList = new Promise(r => { reached = r; }); const go = new Promise(r => { release = r; });
  const A = phone('dA', { beforeList: () => { reached(); return go; } });
  const Bp = phone('dB', {});

  const runA = A.cbUp();                     // A envoie, puis s'arrête juste avant son ménage
  await atList;
  await new Promise(r => setTimeout(r, 3));  // horodatage de fichier différent
  await Bp.cbUp();                           // B fusionne l'envoi de A et envoie à son tour
  release(); await runA;                     // A fait son ménage avec une vue périmée

  assert.equal(A.state.cloud.err ?? null, null); assert.equal(Bp.state.cloud.err ?? null, null);
  assert.ok(store.files.has(store.meta.path), `le fichier désigné par backups_meta.path (${store.meta.path}) doit exister`);
});

test('cbMerge : une routine supprimée ici ne revient pas, une routine identique (même nom, mêmes exercices) n’est pas en double', () => {
  const B = loadBarlog();
  const app = makeApp(B, emptyData());
  const r = (id, name) => ({ id, name, ex: [{ name: 'Squat', sets: 3, reps: 5 }] });
  const st = { history: {}, routines: [r('a1', 'Jambes')], body: [], gone: { r: { old1: Date.now() } } };
  const merged = app.cbMerge(st, { history: {}, routines: [r('old1', 'Ancienne'), r('b2', 'Jambes'), r('c3', 'Bras')] });
  assert.deepEqual(merged.routines.map(x => x.name), ['Jambes', 'Bras']);
});

test('données d’exemple : jamais envoyées dans la sauvegarde, effacées par une vraie sauvegarde', () => {
  const B = loadBarlog();
  const app = makeApp(B, emptyData());
  const st = { ...emptyData(), history: { Squat: [{ date: T(1), demo: 1, sets: [set(60, 5)] }] }, routines: [], body: [] };
  assert.deepEqual(app.cbData(st).history, {}, 'rien de fictif dans la sauvegarde');
  const merged = app.cbMerge(st, { history: { Squat: [{ date: T(2), sets: [set(100, 5)] }] }, routines: [] });
  assert.deepEqual(merged.history.Squat.map(x => x.date), [T(2)], 'seule la vraie séance reste');
});
