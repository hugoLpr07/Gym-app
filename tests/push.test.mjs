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
