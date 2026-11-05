// Icône de l'écran d'accueil assortie à la couleur d'accent (0.41.0) : Pro, iPhone seulement, interrupteur à part.
// iOS affiche un message à chaque changement d'icône : on ne demande l'icône que quand elle change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const PRO = { plan: 'beta', since: 1, beta: true };

// App native simulée (iOS ou Android) avec un faux plugin BarlogIcon qui note chaque demande.
function env(t, platform = 'ios', answer = () => ({ ok: true })) {
  const calls = [];
  const Plugins = platform === 'ios' ? { BarlogIcon: { set: async o => { calls.push(o.name); return answer(o); } } } : {};
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: platform === 'web' ? {} : { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
  return calls;
}
const app = (state) => { const a = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', ...state }); a.nativeReady = true; return a; };

test('réglage enregistré et suivi par la sauvegarde en ligne, comme la couleur', () => {
  const B = loadBarlog();
  assert.ok(B.PK.includes('iconMatch'));
  assert.ok(B.CB_SET.includes('iconMatch'));
});

test('Pro + interrupteur : l’icône prend la couleur, demandée une seule fois par changement', async t => {
  const calls = env(t);
  const a = app({ pro: PRO, iconMatch: true, accent: '#FF7A1A' });
  a.syncIcon(); await flush();
  assert.deepEqual(calls, ['AppIcon-Orange']);
  a.syncIcon(); await flush();
  assert.deepEqual(calls, ['AppIcon-Orange'], 'même icône : rien de redemandé (sinon iOS afficherait son message à chaque fois)');
  a.state.accent = '#22d3ee'; a.syncIcon(); await flush();
  assert.equal(calls.at(-1), 'AppIcon-Cyan', 'couleur en minuscules acceptée');
  a.state.accent = '#CCFF00'; a.syncIcon(); await flush();
  assert.equal(calls.at(-1), null, 'lime = icône d’origine');
});

test('interrupteur coupé ou Pro absent → icône d’origine', async t => {
  const calls = env(t);
  const a = app({ pro: PRO, iconMatch: true, accent: '#FF3B3B' });
  a.syncIcon(); await flush();
  a.state.iconMatch = false; a.syncIcon(); await flush();
  assert.deepEqual(calls, ['AppIcon-Red', null]);
  const b = app({ pro: null, iconMatch: true, accent: '#FF3B3B' });
  b.syncIcon(); await flush();
  assert.equal(calls.at(-1), null, 'sans Pro, l’icône redevient lime, comme les couleurs');
});

test('échec du natif : message affiché, et on réessaie au prochain appel', async t => {
  let n = 0; const calls = env(t, 'ios', () => (++n === 1 ? { ok: false, why: 'refusée par iOS' } : { ok: true }));
  const a = app({ pro: PRO, iconMatch: true, accent: '#A78BFA' });
  a.renderVals();   // fixe la langue (LANG)
  a.syncIcon(); await flush();
  assert.deepEqual(a.toasts, ['Icône : refusée par iOS']);
  a.syncIcon(); await flush();
  assert.deepEqual(calls, ['AppIcon-Violet', 'AppIcon-Violet']);
});

test('pas d’appel avant la fin du démarrage natif', async t => {
  const calls = env(t);
  const a = app({ pro: PRO, iconMatch: true, accent: '#FFC83D' }); a.nativeReady = false;
  a.syncIcon(); await flush();
  assert.deepEqual(calls, []);
});

test('Profil : interrupteur seulement sur iPhone ; sans Pro, il ouvre la page Pro', t => {
  env(t);
  const free = app({ pro: null, screen: 'tabs', tab: 'profile' });
  const [row] = free.renderVals().iconTgl;
  assert.equal(row.label, 'Icône de la même couleur ✦');
  assert.match(row.sub, /iOS affiche un message/);
  row.onClick();
  assert.equal(free.state.pw && free.state.pw.f, 'icon', 'page Pro « Ton icône »');
  assert.notEqual(free.state.iconMatch, true, 'rien d’activé sans Pro');
  const pro = app({ pro: PRO, screen: 'tabs', tab: 'profile', iconMatch: false });
  const [r2] = pro.renderVals().iconTgl;
  assert.equal(r2.label, 'Icône de la même couleur');
  r2.onClick();
  assert.equal(pro.state.iconMatch, true);
});

test('Android et site : pas d’interrupteur', t => {
  env(t, 'android');
  assert.deepEqual(app({ pro: PRO }).renderVals().iconTgl, []);
});

test('site web : pas d’interrupteur', t => {
  env(t, 'web');
  assert.deepEqual(app({ pro: PRO }).renderVals().iconTgl, []);
});
