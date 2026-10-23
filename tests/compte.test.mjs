// Compte : suppression complète par le serveur (0.36).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const acct = { uid: 'u1', email: 'a@b.c', profile: { username: 'alex' } };

// Faux client Supabase : réponse de la fonction « delete-account » choisie par le test ; journal des appels.
function client(fn) {
  const calls = [];
  const c = {
    functions: { invoke: async (name, o) => { calls.push('invoke ' + name + ' ' + (o && o.method)); return fn(); } },
    rpc: async n => { calls.push('rpc ' + n); return { error: null }; },
    storage: { from: b => ({ list: async () => { calls.push('list ' + b); return { data: [{ name: 'x' }], error: null }; },
      remove: async p => { calls.push('remove ' + b + ' ' + p.join(',')); return { error: null }; } }) },
    auth: { signOut: async o => { calls.push('signOut ' + (o && o.scope)); return {}; } },
  };
  return { c, calls };
}
const httpErr = status => ({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status } } });

async function del(fn, state = {}) {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), lang: 'fr', acct, cloud: { on: true, link: true, uid: 'u1' }, ...state });
  const k = client(fn); app.sb = () => Promise.resolve(k.c);
  app.renderVals();   // fixe LANG (français)
  app.acDelete(); app.sureGo();
  for (let i = 0; i < 6; i++) await flush();
  return { app, calls: k.calls };
}

test('suppression : le serveur efface tout (fonction delete-account), puis déconnexion de ce téléphone', async () => {
  const { app, calls } = await del(() => ({ data: { ok: true, files: 3 }, error: null }));
  assert.deepEqual(calls, ['invoke delete-account POST', 'signOut local']);
  assert.equal(app.state.acct, null); assert.equal(app.state.acBusy, false);
  assert.equal(app.state.cloud.link, false, 'plus d’envoi de sauvegarde vers ce compte');
  assert.ok(app.toasts.includes('Compte supprimé'));
});

test('suppression : compte déjà supprimé (réponse précédente perdue) → terminé comme un succès', async () => {
  const { app, calls } = await del(() => ({ data: { ok: true, gone: true }, error: null }));
  assert.deepEqual(calls, ['invoke delete-account POST', 'signOut local']);
  assert.equal(app.state.acct, null);
});

test('suppression : serveur sans la fonction (404) → ancien chemin (fichiers d’ici puis delete_account)', async () => {
  const { app, calls } = await del(() => httpErr(404));
  assert.deepEqual(calls, ['invoke delete-account POST', 'list avatars', 'remove avatars u1/x', 'list backups', 'remove backups u1/x', 'rpc delete_account', 'signOut local']);
  assert.equal(app.state.acct, null);
});

test('suppression interrompue (500) : compte gardé, message clair, on peut réessayer', async () => {
  const { app, calls } = await del(() => httpErr(500));
  assert.deepEqual(calls, ['invoke delete-account POST']);
  assert.deepEqual(app.state.acct, acct); assert.equal(app.state.acBusy, false);
  assert.equal(app.state.cloud.link, true, 'sauvegarde en ligne rebranchée');
  assert.ok(app.toasts.some(t => /Suppression interrompue/.test(t)), app.toasts.join(' | '));
});

test('suppression sans réseau : « Pas de connexion internet », compte gardé', async () => {
  const { app } = await del(() => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: {} } }));
  assert.deepEqual(app.state.acct, acct);
  assert.ok(app.toasts.includes('Pas de connexion internet'), app.toasts.join(' | '));
});

// ── Conditions d'utilisation (0.36) ──
function profClient(log) {
  return {
    from: t => ({
      insert: row => { log.push(['insert', t, row]); const r = Promise.resolve({ error: null }); r.select = () => ({ maybeSingle: async () => ({ data: row, error: null }) }); return r; },
      update: p => ({ eq: async () => { log.push(['update', t, p]); return { error: null }; } }),
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
  };
}
function acctApp(profile, extra = {}) {
  const B = loadBarlog(); const log = [];
  const app = makeApp(B, { ...emptyData(), lang: 'fr', acct: { uid: 'u1', email: 'a@b.c', profile }, ...extra });
  app.sb = () => Promise.resolve(profClient(log));
  app.renderVals();
  return { app, log };
}

test('création du profil : impossible sans accepter les conditions ; acceptées → terms_v envoyé au serveur', async () => {
  const { app, log } = acctApp(null, { acUser: 'alex', acName: 'Alex' });
  app.acCreate(); await flush();
  assert.equal(log.length, 0);
  assert.match(app.state.acE.m, /conditions d’utilisation/);
  app.renderVals().acTermsClick(); app.acCreate(); for (let i = 0; i < 4; i++) await flush();
  assert.equal(log[0][1], 'profiles'); assert.equal(log[0][2].terms_v, 1);
  assert.equal(app.state.acct.profile.username, 'alex');
});

test('compte existant sans les conditions : commenter les demande d’abord, puis envoie le commentaire', async () => {
  const { app, log } = acctApp({ username: 'alex', default_visibility: 'followers' }, { cmt: { id: 'a1', text: 'Bravo !' } });
  app.cmtSend(); await flush();
  assert.equal(app.state.sure, 'terms'); assert.equal(log.length, 0, 'rien n’est envoyé avant l’acceptation');
  const v = app.renderVals();
  assert.equal(v.sureGoLabel, 'J’accepte'); assert.equal(v.sureNoLabel, 'Plus tard'); assert.equal(v.sureLinkOn, true);
  app.sureGo(); for (let i = 0; i < 6; i++) await flush();
  assert.deepEqual(log.map(x => [x[0], x[1]]), [['update', 'profiles'], ['insert', 'comments']]);
  assert.deepEqual(log[0][2], { terms_v: 1 });
  assert.equal(app.termsOk(), true);
});

test('publication en arrière-plan (auto, en attente) : rien ne part tant que les conditions ne sont pas acceptées', async () => {
  const { app, log } = acctApp({ username: 'alex', default_visibility: 'followers' });
  app.hasSess = () => true;
  app.pubSend(123, 'followers', '', true); await flush();
  assert.equal(log.length, 0); assert.equal(app.state.sure, undefined, 'pas de fenêtre pour un envoi automatique');
  app.pubSend(123, 'followers', ''); await flush();
  assert.equal(app.state.sure, 'terms', 'publier à la main demande les conditions');
});
