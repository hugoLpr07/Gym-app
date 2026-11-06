// Notifications push : inscription du téléphone (Android par Firebase ; iPhone par Apple depuis 0.42.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

// App native simulée : plateforme et plugins au choix.
function nativeWindow(t, platform, Plugins) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
}

// Faux plugin PushNotifications : retient les appels ; l'iPhone n'a pas de canaux (createChannel « unimplemented »).
function fakePN(platform, receive = 'granted') {
  const calls = { channel: 0, register: 0, on: {} };
  const PN = {
    createChannel: () => { calls.channel++; return platform === 'ios' ? Promise.reject(new Error('Not available on iOS')) : Promise.resolve(); },
    checkPermissions: () => Promise.resolve({ receive }),
    requestPermissions: () => Promise.resolve({ receive }),
    register: () => { calls.register++; return Promise.resolve(); },
    addListener: (ev, fn) => { calls.on[ev] = fn; return Promise.resolve({ remove() {} }); },
  };
  return { PN, calls };
}

// Supabase simulé : garde les lignes envoyées à push_tokens.
function fakeSb(app) {
  const rows = [];
  app.sb = () => Promise.resolve({ from: table => ({ upsert: (row, opt) => { rows.push({ table, row, opt }); return Promise.resolve({ error: null }); } }) });
  return rows;
}

const acct = { uid: 'u1', profile: { username: 'moi' } };

for (const [platform, token] of [['ios', 'A1B2C3D4'.repeat(8)], ['android', 'fcm-jeton-du-samsung-0123456789']]) {
  test(`${platform} : connecté → permission, inscription, jeton enregistré avec la plateforme « ${platform} »`, async t => {
    const { PN, calls } = fakePN(platform); nativeWindow(t, platform, { PushNotifications: PN });
    const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct });
    const rows = fakeSb(app);
    app.renderVals();   // applique la langue (LANG) comme au premier affichage
    assert.equal(app.pushPl(), PN);
    app.pushInit(); await flush(); await flush();
    assert.equal(calls.register, 1);
    assert.equal(calls.channel, platform === 'android' ? 1 : 0, 'canal « social » : Android seulement');
    assert.equal(app.state.push.denied, false);
    calls.on.registration({ value: token }); await flush();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].table, 'push_tokens');
    assert.deepEqual({ ...rows[0].row, updated_at: undefined }, { user_id: 'u1', token, platform, lang: 'fr', prefs: {}, updated_at: undefined });
    assert.equal(app.state.push.tok, token);
    // Profil → Compte : l'interrupteur « Notifications push » est affiché.
    assert.equal(app.renderVals().pnOn, true);
  });
}

test('iPhone : notifications refusées → message qui parle de l’iPhone, pas d’Android ; rien n’est enregistré', async t => {
  const { PN, calls } = fakePN('ios', 'denied'); nativeWindow(t, 'ios', { PushNotifications: PN });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct });
  const rows = fakeSb(app);
  app.pushInit(); await flush(); await flush();
  assert.equal(calls.register, 0); assert.equal(rows.length, 0);
  assert.equal(app.state.push.denied, true);
  assert.match(app.renderVals().pnSub, /^Bloquées par l’iPhone : /);
});

test('version web (pas d’app native) : pas de notifications push', t => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {} });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct });
  assert.equal(app.pushPl(), null);
  assert.equal(app.renderVals().pnOn, false);
});

// ── Notification de modération (0.43.0) : toucher → écran « Modération » ; compteur à jour ──
// Supabase simulé : mod_count renvoie `count` (null = compte ordinaire), mod_reports la liste ; le reste répond vide.
function fakeModSb(app, count) {
  const rpc = [];
  const chain = () => { const p = new Proxy(function () {}, { get: (_, k) => k === 'then' ? (ok, ko) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok, ko) : () => p, apply: () => p }); return p; };
  app.sb = () => Promise.resolve({
    rpc: name => { rpc.push(name);
      if (name === 'mod_count') return Promise.resolve({ data: count, error: null });
      if (name === 'mod_reports') return Promise.resolve(count == null ? { data: null, error: { message: 'not_admin' } } : { data: Array.from({ length: count }, (_, i) => ({ id: 'r' + i })), error: null });
      return Promise.resolve({ data: 0, error: null }); },
    from: () => chain(),
  });
  return rpc;
}
const settle = () => new Promise(r => setTimeout(r, 10));   // promesses + setTimeout(0) de l'app

test('modération : notification touchée par l’administrateur → onglet Profil, écran « Modération » ouvert, compteur à jour', async () => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct, tab: 'today', screen: 'tabs', sv: [] });
  const rpc = fakeModSb(app, 2); app.renderVals();
  app._pnOpen = { kind: 'report' }; app.pushOpen(); await settle();
  assert.equal(app.state.tab, 'profile');
  assert.deepEqual(app.state.sv.map(v => v.v), ['mq']);
  assert.equal(app.state.mqN, 2);
  assert.ok(rpc.includes('mod_reports'), 'la liste des signalements est chargée');
  assert.equal(app.toasts.length, 0, 'pas de message « N signalements à traiter » en plus');
});

test('modération : compte ordinaire (le serveur ne confirme pas) → le Fil et les notifications, jamais l’écran « Modération »', async () => {
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct, tab: 'today', screen: 'tabs', sv: [] });
  const rpc = fakeModSb(app, null); app.renderVals();
  app._pnOpen = { kind: 'report' }; app.pushOpen(); await settle();
  assert.equal(app.state.tab, 'feed');
  assert.deepEqual(app.state.sv.map(v => v.v), ['ntf']);
  assert.ok(!rpc.includes('mod_reports'));
});

test('modération : notification reçue app ouverte → compteur mis à jour ; écran ouvert → liste rechargée ; retour dans l’app → compteur', async t => {
  const { PN, calls } = fakePN('ios'); nativeWindow(t, 'ios', { PushNotifications: PN });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct, mqN: 1 });
  let rpc = fakeModSb(app, 3); app.renderVals();
  app.pushListen();
  calls.on.pushNotificationReceived({ data: { kind: 'report' } }); await settle();
  assert.equal(app.state.mqN, 3);
  rpc = fakeModSb(app, 4); app.setState({ sv: [{ v: 'mq' }] });
  calls.on.pushNotificationReceived({ data: { kind: 'report' } }); await settle();
  assert.ok(rpc.includes('mod_reports')); assert.equal(app.state.mqN, 4); assert.equal(app.state.mq.items.length, 4);
  // Une notification sociale ne touche pas au compteur de modération.
  rpc = fakeModSb(app, 9); calls.on.pushNotificationReceived({ data: { kind: 'kudo' } }); await settle();
  assert.ok(!rpc.includes('mod_count') && !rpc.includes('mod_reports'));
  // Retour dans l'app : seulement pour un compte déjà connu comme administrateur.
  rpc = fakeModSb(app, 5); app.setState({ sv: [] }); app.mqRefresh(); await settle();
  assert.equal(app.state.mqN, 5);
  app.setState({ mqN: null }); rpc = fakeModSb(app, 6); app.mqRefresh(); await settle();
  assert.equal(rpc.length, 0, 'compte ordinaire : aucun appel au retour dans l’app');
});
