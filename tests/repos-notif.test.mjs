// Notifications de fin de repos sur Android (0.51.0, défauts connus du 12 nov.) :
// 1. « Repos terminé » / « Cardio terminé » restaient dans le volet (cancel n'efface que les notifications à venir) ;
// 2. après une réinstallation, « Fin de repos » revenait allumé sans « Alarmes et rappels » (notification en retard),
//    et Health Connect semblait allumé sans autorisation. Choix de Hugo (20 nov.) : redemander au début de la
//    1ʳᵉ séance ; éteindre Health Connect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

// App native simulée : LocalNotifications note ses appels, App garde ses écouteurs, Filesystem en mémoire.
function native(t, { platform = 'android', display = 'granted', exact = 'denied', files = {} } = {}) {
  const calls = [], listeners = {};
  const k = o => o.directory + '/' + o.path;
  const Plugins = {
    LocalNotifications: {
      removeDeliveredNotifications: o => { calls.push(['remove', o.notifications.map(n => n.id)]); return Promise.resolve(); },
      checkPermissions: () => { calls.push(['check']); return Promise.resolve({ display }); },
      requestPermissions: () => { calls.push(['request']); return Promise.resolve({ display: 'granted' }); },
      checkExactNotificationSetting: () => Promise.resolve({ exact_alarm: exact }),
      changeExactNotificationSetting: () => { calls.push(['exactSettings']); return Promise.resolve(); },
      cancel: () => Promise.resolve(), schedule: () => Promise.resolve(),
    },
    App: { addListener: (ev, fn) => { listeners[ev] = fn; } },
    Filesystem: { files,
      readFile: o => k(o) in files ? Promise.resolve({ data: files[k(o)] }) : Promise.reject(new Error('File does not exist')),
      writeFile: o => { files[k(o)] = o.data; return Promise.resolve({ uri: k(o) }); } },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
  return { calls, listeners };
}
const mk = (state) => { const a = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', ...state }); a.renderVals(); return a; };
const removes = calls => calls.filter(c => c[0] === 'remove');

test('« Repos terminé » retirée du volet au retour dans l’app, jamais app en arrière-plan', async t => {
  const { calls, listeners } = native(t);
  const app = mk(); app.appListen();
  listeners.appStateChange({ isActive: false });
  app.restShadeClear();
  assert.equal(removes(calls).length, 0, 'arrière-plan : on garde l’alerte que l’utilisateur attend');
  listeners.appStateChange({ isActive: true });
  assert.deepEqual(removes(calls), [['remove', [1001, 1002]]], 'retour dans l’app : repos et cardio retirés');
});

test('fin du repos vue dans l’app : notification retirée 1,5 s après ; app en arrière-plan : gardée', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const { calls, listeners } = native(t);
  const app = mk({ workout: { name: 'Push', start: 900_000, ex: [] }, restEnd: 1_000_000 - 100, restAlert: false });
  app.appListen();
  app.tick();
  assert.equal(app.state.restAlert, true);
  t.mock.timers.tick(1500);
  assert.deepEqual(removes(calls), [['remove', [1001, 1002]]]);
  // Même chose app en arrière-plan (le JavaScript tourne encore à la fin du repos sur Android) : rien n'est retiré.
  calls.length = 0; listeners.appStateChange({ isActive: false }); calls.length = 0;
  app.setState({ restEnd: Date.now() - 100, restAlert: false });
  app.tick(); t.mock.timers.tick(1500);
  assert.equal(removes(calls).length, 0);
});

test('séance terminée ou abandonnée : plus de « Repos terminé » dans le volet', t => {
  const { calls } = native(t);
  const app = mk({ workout: { name: 'Push', start: 1, ex: [] } });
  const prev = app.state; app.state = { ...app.state, workout: null };
  app.componentDidUpdate({}, prev);
  assert.deepEqual(removes(calls), [['remove', [1001, 1002]]]);
});

test('réinstallation Android : Health Connect éteint, « Fin de repos » à redemander ; même installation ou iPhone : rien', async t => {
  native(t, { files: { 'LIBRARY_NO_CLOUD/barlog-install': 'iNEUF' } });
  const app = mk({ cloud: { inst: 'iVIEUX' }, healthOn: true, restNotif: true });
  await app.instCheck(); await flush();
  assert.equal(app.state.healthOn, false, 'l’autorisation Health Connect disparaît avec la désinstallation');
  assert.equal(app.state.rnAsk, 1);
  const B = loadBarlog();
  assert.ok(B.PK.includes('rnAsk') && B.CB_SKIP.includes('rnAsk'), 'gardé jusqu’à la 1ʳᵉ séance, propre au téléphone');
  const same = mk({ cloud: { inst: 'iNEUF' }, healthOn: true, restNotif: true });
  await same.instCheck(); await flush();
  assert.equal(same.state.healthOn, true); assert.equal(same.state.rnAsk, undefined);
});

test('réinstallation sur iPhone : réglages inchangés', async t => {
  native(t, { platform: 'ios', files: { 'LIBRARY_NO_CLOUD/barlog-install': 'iNEUF' } });
  const app = mk({ cloud: { inst: 'iVIEUX' }, healthOn: true, restNotif: true });
  await app.instCheck(); await flush();
  assert.equal(app.state.healthOn, true); assert.equal(app.state.rnAsk, undefined);
});

test('1ʳᵉ séance après la réinstallation : fenêtre « Autoriser » une seule fois ; Autoriser → notifications puis « Alarmes et rappels »', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls } = native(t, { display: 'granted', exact: 'denied' });
  const hadDoc = 'document' in globalThis; globalThis.document = { visibilityState: 'visible', hidden: false, addEventListener() {}, removeEventListener() {}, querySelector: () => null, documentElement: {} };
  t.after(() => { if (!hadDoc) delete globalThis.document; });
  const app = mk({ restNotif: true, rnAsk: 1 });
  const prev = app.state; app.state = { ...app.state, workout: { name: 'Push', start: 1, ex: [] } };
  app.componentDidUpdate({}, prev);
  t.mock.timers.tick(800); await flush(); await flush();
  assert.equal(app.state.sure, 'rnAsk');
  assert.equal(app.state.rnAsk, null, 'une seule fois');
  const v = app.renderVals();
  assert.equal(v.sureTitle, 'Fin de repos pile à l’heure'); assert.equal(v.sureGoLabel, 'Autoriser'); assert.equal(v.sureNoLabel, 'Plus tard');
  v.sureGo(); await flush(); await flush();
  t.mock.timers.tick(1200); await flush();
  assert.deepEqual(calls.filter(c => c[0] !== 'check' && c[0] !== 'remove'), [['request'], ['exactSettings']], 'notifications demandées, puis la page « Alarmes et rappels »');
});

test('1ʳᵉ séance après la réinstallation, autorisations déjà là (ou « Fin de repos » éteint) : aucune fenêtre', async t => {
  native(t, { display: 'granted', exact: 'granted' });
  const app = mk({ restNotif: true, rnAsk: 1 });
  await app.rnAskCheck(); await flush();
  assert.equal(app.state.sure, undefined); assert.equal(app.state.rnAsk, null);
  const off = mk({ restNotif: false, rnAsk: 1 });
  await off.rnAskCheck();
  assert.equal(off.state.sure, undefined); assert.equal(off.state.rnAsk, null);
});

test('une autre fenêtre est ouverte (ex. « Content de te revoir ») : la demande attend la séance suivante', async t => {
  native(t, { display: 'denied', exact: 'denied' });
  const app = mk({ restNotif: true, rnAsk: 1, sure: 'back' });
  await app.rnAskCheck();
  assert.equal(app.state.sure, 'back'); assert.equal(app.state.rnAsk, 1);
});
