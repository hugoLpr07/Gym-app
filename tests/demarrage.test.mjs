// Écran noir au démarrage (0.41.1) : le localStorage, en retard sur barlog-data.json (WebKit peut perdre ses dernières
// écritures quand iOS ferme l'app), contenait encore une séance en cours ; le fichier, plus récent, n'en avait plus.
// L'écran « séance » restait affiché sans séance → rien à l'écran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const T0 = new Date(2026, 10, 4, 18, 0).getTime();
const ROUT = [{ id: 'r1', name: 'Push A', ex: [{ name: 'Bench Press', sets: 3, reps: 6 }] }];
const WORKOUT = { rid: 'r1', name: 'Push A', start: T0, ex: [{ name: 'Bench Press', sets: [{ w: 100, r: 6, done: true }] }] };

// App native simulée : barlog-data.json en mémoire, localStorage en mémoire.
function nativeEnv(t, file) {
  const fsMem = { 'DATA/barlog-data.json': JSON.stringify(file) }; const ls = {};
  const Filesystem = {
    readFile: async o => { const k = o.directory + '/' + o.path; if (!(k in fsMem)) throw new Error('absent'); return { data: fsMem[k] }; },
    writeFile: async o => { fsMem[o.directory + '/' + o.path] = o.data; return {}; },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window'); const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Filesystem } } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } } });
  t.after(() => {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
    if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete globalThis.localStorage;
  });
}
// État juste après componentDidMount : celui du localStorage (séance en cours → écran « séance »).
const boot = async (t, local, file) => {
  nativeEnv(t, file);
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', tab: 'today', ...local, screen: local.workout ? 'workout' : 'tabs' });
  await app.nativeBoot(local); await flush();
  return app;
};

test('séance finie (fichier plus récent) mais encore dans le localStorage → accueil, pas d’écran noir', async t => {
  const app = await boot(t, { routines: ROUT, workout: WORKOUT, savedAt: T0 }, { routines: ROUT, workout: null, savedAt: T0 + 60000 });
  assert.equal(app.state.workout, null);
  assert.equal(app.state.screen, 'tabs');
  assert.equal(app.renderVals().showTabs, true, 'les onglets s’affichent');
});

test('séance en cours dans le fichier plus récent → écran « séance »', async t => {
  const app = await boot(t, { routines: ROUT, workout: null, savedAt: T0 }, { routines: ROUT, workout: WORKOUT, savedAt: T0 + 60000 });
  assert.equal(app.state.screen, 'workout');
  assert.equal(app.renderVals().isWorkout, true);
});

test('localStorage plus récent → on le garde (séance en cours toujours affichée)', async t => {
  const app = await boot(t, { routines: ROUT, workout: WORKOUT, savedAt: T0 + 60000 }, { routines: ROUT, workout: null, savedAt: T0 });
  assert.equal(app.state.screen, 'workout');
  assert.deepEqual(app.state.workout, WORKOUT);
});

test('filet de sécurité : écran « séance » sans séance → retour à l’accueil', async t => {
  nativeEnv(t, { routines: ROUT, workout: null, savedAt: T0 });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', routines: ROUT, workout: null, screen: 'workout', tab: 'progress' });
  app.setState = function (u) { this.state = { ...this.state, ...(typeof u === 'function' ? u(this.state) : u) }; };
  app.componentDidUpdate({}, { ...app.state });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(app.state.screen, 'tabs');
  assert.equal(app.state.tab, 'today');
});
