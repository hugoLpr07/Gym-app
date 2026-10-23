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

// ── Filtre de mots du serveur (0.36) ──
test('filtre de mots : message clair ; une publication automatique refusée ne reste pas en attente', async () => {
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), lang: 'fr', acct: { uid: 'u1', profile: { username: 'alex', terms_v: 1, default_visibility: 'followers' } },
    sessMeta: { 123: { pub: { vis: 'followers', pending: true, uid: 'u1', note: 'fdp' } } } });
  app.renderVals(); app.hasSess = () => true; app.pubRow = () => ({});
  app.sb = () => Promise.resolve({ from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'mot_interdit', code: 'P0001' } }) }) }) }) });
  app.pubSend(123, 'followers', 'fdp', true); for (let i = 0; i < 4; i++) await flush();
  assert.equal(app.state.sessMeta[123].pub, undefined, 'plus en attente : elle serait refusée à chaque fois');
  assert.ok(app.toasts.includes('Ce texte contient un mot interdit par les conditions d’utilisation'), app.toasts.join(' | '));
});

// ── Modération (0.36) ──
function mqApp(rpc) {
  const B = loadBarlog(); const calls = [];
  const app = makeApp(B, { ...emptyData(), lang: 'fr', screen: 'tabs', acct: { uid: 'h1', profile: { username: 'hugo', terms_v: 1 } } });
  app.sb = () => Promise.resolve({ rpc: async (n, a) => { calls.push([n, a]); return rpc(n, a); } });
  app.renderVals();
  return { app, calls };
}
const report = (id, o = {}) => ({ id, created_at: new Date().toISOString(), reason: 'insulte', reporter_username: 'dave', target_id: 'u2', target_username: 'bob', target_name: 'Bob',
  target_avatar: null, target_suspended: false, activity_id: 'a1', activity_title: 'Push', activity_note: null, activity_hidden: false, comment_id: 'c1', comment_body: 'texte signalé', comment_hidden: false, ...o });

test('modération : invisible pour un compte ordinaire (mod_count = null)', async () => {
  const { app } = mqApp(() => ({ data: null, error: null }));
  app.mqCount(true); await flush(); await flush();
  assert.equal(app.state.mqN, null); assert.equal(app.renderVals().acMqOn, false); assert.equal(app.toasts.length, 0);
});

test('modération : administrateur prévenu à l’ouverture, liste, masquer, suspendre en 2 touches, ignorer', async () => {
  const { app, calls } = mqApp((n, a) => n === 'mod_count' ? { data: 3, error: null } : n === 'mod_reports' ? { data: [report('r1'), report('r2'), report('r3', { comment_id: null })], error: null } : { data: null, error: null });
  app.mqCount(true); await flush(); await flush();
  assert.ok(app.toasts.includes('3 signalements à traiter (Profil → Modération)'), app.toasts.join(' | '));
  let v = app.renderVals(); assert.equal(v.acMqOn, true); assert.equal(v.acMqLabel, 'Modération · 3 à traiter');
  app.setState({ sv: [{ v: 'mq' }] }); app.mqLoad(); await flush(); await flush();
  v = app.renderVals(); assert.equal(v.pList.length, 3);
  assert.match(v.pList[0].txt, /Motif : insulte · Commentaire : « texte signalé »/); assert.match(v.pList[2].txt, /Séance « Push »/);
  assert.equal(v.pList[0].b1Label, 'Masquer'); assert.equal(v.pList[0].b2Label, 'Suspendre'); assert.equal(v.pList[0].b3Label, 'Ignorer');
  v.pList[0].on1(); await flush(); await flush();
  assert.deepEqual(calls.at(-1), ['mod_act', { report: 'r1', act: 'hide' }]);
  v = app.renderVals(); v.pList[0].on2(); await flush();
  assert.notEqual(calls.at(-1)[1] && calls.at(-1)[1].act, 'suspend', '1re touche : rien n’est envoyé');
  assert.equal(app.renderVals().pList[0].b2Label, 'Toucher encore');
  app.renderVals().pList[0].on2(); await flush(); await flush();
  assert.deepEqual(calls.at(-1), ['mod_act', { report: 'r2', act: 'suspend' }]);
  app.renderVals().pList[0].on3(); await flush(); await flush();
  assert.deepEqual(calls.at(-1), ['mod_act', { report: 'r3', act: 'dismiss' }]);
  assert.equal(app.state.mqN, 0); assert.equal(app.renderVals().plState, 'Aucun signalement en attente.');
});

test('compte suspendu : message clair au lieu de l’erreur brute', () => {
  const B = loadBarlog(); const app = makeApp(B, { ...emptyData(), lang: 'fr' }); app.renderVals();
  assert.match(app.acMsg({ message: 'compte_suspendu' }), /Ton compte est suspendu/);
});

// ── Vérification anti-robot (Turnstile) avant l'envoi d'un code (0.36) ──
async function sendCode(t, { key = '', turnstile } = {}) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window'); const hadDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { turnstile } });
  const scripts = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { getElementById: id => id === 'bl-ts' ? { id } : null,
    createElement: () => ({}), head: { appendChild: x => scripts.push(x) } } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; if (hadDoc) Object.defineProperty(globalThis, 'document', hadDoc); else delete globalThis.document; });
  const html = (await import('node:fs')).readFileSync((await import('./harness.mjs')).HTML_PATH, 'utf8').replace("const TS_KEY = '';", "const TS_KEY = '" + key + "';");
  const B = loadBarlog(html); const sent = [];
  const app = makeApp(B, { ...emptyData(), lang: 'fr', acEmail: 'A@b.co' });
  app.sb = () => Promise.resolve({ auth: { signInWithOtp: async o => { sent.push(o); return { error: null }; } } });
  app.renderVals(); app.acSend();
  for (let i = 0; i < 100 && app.state.acBusy; i++) await new Promise(r => setTimeout(r, 2));   // jusqu’à la fin de l’envoi
  return { app, sent, scripts };
}

test('anti-robot désactivé (clé vide) : code demandé sans jeton, Cloudflare jamais contacté', async t => {
  const { sent, scripts } = await sendCode(t);
  assert.deepEqual(sent, [{ email: 'a@b.co', options: { shouldCreateUser: true } }]); assert.equal(scripts.length, 0);
});

test('anti-robot activé : jeton Turnstile joint à la demande, widget retiré ensuite (nouveau jeton à chaque fois)', async t => {
  const removed = [];
  const turnstile = { render: (el, o) => { assert.equal(el.id, 'bl-ts'); assert.equal(o.sitekey, 'cle-test'); setTimeout(() => o.callback('jeton-1'), 0); return 'w1'; }, remove: id => removed.push(id) };
  const { sent, app } = await sendCode(t, { key: 'cle-test', turnstile });
  assert.equal(sent[0].options.captchaToken, 'jeton-1'); assert.deepEqual(removed, ['w1']); assert.equal(app.state.acSent, 'a@b.co');
});

test('anti-robot en échec : aucun code envoyé, message clair', async t => {
  const turnstile = { render: (el, o) => { setTimeout(() => o['error-callback'](), 0); return 'w1'; }, remove: () => {} };
  const { sent, app } = await sendCode(t, { key: 'cle-test', turnstile });
  assert.equal(sent.length, 0); assert.equal(app.state.acBusy, false);
  assert.ok(app.toasts.includes('Vérification anti-robot impossible, réessaie'), app.toasts.join(' | '));
});
