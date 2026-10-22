// Imports : CSV Strong / Hevy (parseLifts, mergeLifts), export/import JSON (importData), pesées CSV (importBody).
// Les tests marqués [BUG] décrivent le comportement attendu et ÉCHOUENT aujourd'hui (motif Prove-It).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush, fakeFilePicker } from './harness.mjs';

// Export Strong « à la québécoise » : séparateur ;, virgule décimale, livres, miles, guillemets doublés, CRLF.
const STRONG = [
  'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;Distance;Distance Unit;Seconds;Notes;Workout Notes;RPE',
  '2024-10-26 18:30:00;"Push; lourd";1h 5m;"Bench Press (Barbell)";W;95;lbs;10;0;;0;"";"";',
  '2024-10-26 18:30:00;"Push; lourd";1h 5m;"Bench Press (Barbell)";1;187,5;lbs;5;0;;0;"Bonne ""série""";"";8',
  '2024-10-26 18:30:00;"Push; lourd";1h 5m;"Plank";1;0;lbs;0;0;;60;"";"";',
  '2024-10-28 07:00:00;"Course";30m;"Running";1;0;lbs;0;3,1;mi;1800;"";"";',
].join('\r\n');

test('parseLifts lit un export Strong (;, virgule décimale, lb → kg, mi → km, échauffement W, gainage, cardio)', () => {
  const B = loadBarlog();
  assert.deepEqual(B.parseLifts(STRONG, 'kg'), { src: 'Strong', sessions: [
    { date: new Date(2024, 9, 26, 18, 30).getTime(), name: 'Push; lourd', dur: 65 * 60e3, ex: [
      { name: 'Bench Press', type: 'reps', sets: [{ w: 43.09, r: 10, wu: true }, { w: 85.05, r: 5 }] },
      { name: 'Plank', type: 'time', sets: [{ w: 0, r: 60 }] }] },
    { date: new Date(2024, 9, 28, 7, 0).getTime(), name: 'Course', dur: 30 * 60e3, ex: [
      { name: 'Running', type: 'cardio', sets: [{ w: 0, r: 30, d: 4.99, c: 0 }] }] },
  ] });
});

test('mergeLifts : réimporter le même fichier n’ajoute aucun doublon et garde les séances déjà là', () => {
  const B = loadBarlog();
  const res = B.parseLifts(STRONG, 'kg');
  const day = Date.UTC(2024, 8, 1);
  const s0 = { history: { Squat: [{ date: day, sets: [{ w: 100, r: 5 }] }] }, sessMeta: { [day]: { name: 'Legs' } }, custom: [], exMeta: {} };

  const m1 = B.mergeLifts(s0, res, false); const s1 = { ...s0, ...m1.patch };
  const m2 = B.mergeLifts(s1, res, false);

  assert.deepEqual([m1.n, m1.dup], [2, 0], '1er import : 2 séances');
  assert.deepEqual([m2.n, m2.dup], [0, 2], '2e import : tout est déjà là');
  assert.deepEqual(m2.patch.history, s1.history);
  assert.deepEqual(s1.history.Squat, s0.history.Squat, 'séance existante intacte');
});

test('l’import JSON ne reprend que les données : ni l’identité de sauvegarde, ni le jeton push, ni le Pro d’un autre téléphone', async t => {
  const B = loadBarlog();
  // Téléphone A (Pro, relié à la sauvegarde en ligne) exporte ses données (Profil → Exporter).
  const A = makeApp(B, { ...emptyData(), history: { 'Bench Press': [{ date: 1, sets: [{ w: 80, r: 5 }] }] },
    pro: { plan: 'year', since: 1, test: true }, push: { tok: 'jeton-du-telephone-A', uid: 'u1' },
    cloud: { on: true, uid: 'u1', link: true, dev: 'dTelephoneA', srvAt: 1, n: 1 } });
  let blob; A.shareFile = b => { blob = b; return Promise.resolve(true); };
  A.exportData(); await flush();
  // Téléphone B (gratuit, neuf) l'importe (Profil → Importer).
  const Bt = makeApp(B, { ...emptyData(), pro: null });
  const picker = fakeFilePicker(t);
  Bt.importData(); picker.choose(await blob.text()); await flush();

  assert.ok(Bt.state.history['Bench Press'], 'les séances sont importées');
  assert.notEqual(Bt.state.cloud?.dev, 'dTelephoneA', 'deux téléphones ne partagent jamais le même identifiant de sauvegarde');
  assert.notEqual(Bt.state.push?.tok, 'jeton-du-telephone-A', 'le jeton push de A reste à A');
  assert.equal(Bt.isPro(), false, 'importer un fichier ne donne pas le Pro');
});

test('un fichier JSON malformé est refusé et ne rend pas l’app inutilisable', async t => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), tab: 'today', screen: 'tabs' });
  const picker = fakeFilePicker(t);
  app.importData(); picker.choose(JSON.stringify({ routines: { a: 1 }, history: { 'Bench Press': 'oups' } })); await flush();

  assert.doesNotThrow(() => app.renderVals(), 'l’écran doit encore s’afficher (sinon l’état cassé est sauvegardé et l’app plante à chaque lancement)');
});

test('importBody lit une date américaine non ambiguë (10/26/2024) au bon jour', async t => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData() });
  const picker = fakeFilePicker(t);
  app.importBody(); picker.choose('Date,Weight (lb)\n10/26/2024,180\n'); await flush();

  assert.deepEqual(app.state.body.map(b => new Date(b.date).toDateString()), [new Date(2024, 9, 26).toDateString()]);
});

test('import JSON : une séance réimportée n’est plus considérée comme supprimée (la fusion suivante la garde)', async t => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), gone: { s: { 5: Date.now() }, r: {} } });
  const picker = fakeFilePicker(t);
  app.importData(); picker.choose(JSON.stringify({ routines: [], history: { Squat: [{ date: 5, sets: [{ w: 100, r: 5 }] }] } })); await flush();
  assert.ok(app.state.history.Squat, 'séance importée');
  assert.equal(app.state.gone.s[5], undefined, 'plus marquée comme supprimée');
});

test('import Strong / Hevy : « Incline » ne range que les développés incliné haltères dans Incline DB Press', () => {
  const B = loadBarlog();
  assert.equal(B.mapEx('Incline Bench Press (Dumbbell)'), 'Incline DB Press');
  assert.equal(B.mapEx('Incline Dumbbell Press'), 'Incline DB Press');
  for (const n of ['Incline Curl (Dumbbell)', 'Incline Chest Fly (Dumbbell)', 'Incline Row (Dumbbell)']) assert.notEqual(B.mapEx(n), 'Incline DB Press', n);
});
