// Vrais achats Barlog Pro (0.44.0, plan 3.4) : RevenueCat dans l'app native, droit du serveur sur le site.
// Le plugin RevenueCat est simulé (aucun réseau, aucune boutique).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBarlog, makeApp, emptyData, flush, HTML_PATH } from './harness.mjs';

const HTML = readFileSync(HTML_PATH, 'utf8');
const KEYS = "const RC_KEYS = { ios: '', android: '' }";
const withKeys = (html = HTML) => { assert.ok(html.includes(KEYS), 'RC_KEYS introuvable'); return html.replace(KEYS, "const RC_KEYS = { ios: 'appl_essai', android: 'goog_essai' }"); };
const DAY = 86_400_000;
const acct = { uid: '00000000-0000-4000-8000-00000000000a', email: 'moi@test.local', profile: { username: 'moi' } };

// App native simulée (plateforme + plugins) ; site simulé (adresse).
function nativeWindow(t, platform, Plugins) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const opened = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
    value: { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins }, open: u => opened.push(u) } });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window; });
  return opened;
}
function site(t, href) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: new URL(href) });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location; });
}

// Faux RevenueCat : offre « default » (mensuel avec essai d'1 semaine, annuel avec essai d'1 mois, à vie), client en mémoire.
function fakeRC(o = {}) {
  const calls = [];
  const ci = ent => ({ entitlements: { active: ent ? { pro: ent } : {}, all: {} }, managementURL: 'https://apps.apple.com/account/subscriptions' });
  const intro = (unit, n) => ({ price: 0, priceString: '0,00 $', cycles: 1, period: 'P' + n + unit[0], periodUnit: unit, periodNumberOfUnits: n });
  const pk = (type, id, price, priceString, i) => ({ identifier: '$rc_' + type.toLowerCase(), packageType: type, product: { identifier: id, price, priceString, currencyCode: 'CAD', introPrice: i || null } });
  const R = {
    configure: a => { calls.push(['configure', a.apiKey, a.appUserID || null]); o.user = a.appUserID || o.user || null; return Promise.resolve(); },
    isAnonymous: () => Promise.resolve({ isAnonymous: !o.user }),
    addCustomerInfoUpdateListener: cb => { R.listener = cb; return Promise.resolve('l1'); },
    getCustomerInfo: () => { calls.push(['info']); return Promise.resolve({ customerInfo: ci(o.ent) }); },
    logIn: a => { calls.push(['logIn', a.appUserID]); o.user = a.appUserID; return Promise.resolve({ customerInfo: ci(o.ent), created: false }); },
    logOut: () => { calls.push(['logOut']); o.user = null; return Promise.resolve({ customerInfo: ci(null) }); },
    getOfferings: () => { calls.push(['offres']); return o.offErr ? Promise.reject(new Error('panne')) : Promise.resolve({ current: { identifier: 'default', availablePackages: [
      pk('MONTHLY', 'barlog_pro_monthly', 4.99, '4,99 $', intro('WEEK', 1)), pk('ANNUAL', 'barlog_pro_yearly', 29.99, '29,99 $', intro('MONTH', 1)), pk('LIFETIME', 'barlog_pro_lifetime', 79.99, '79,99 $')] } }); },
    checkTrialOrIntroductoryPriceEligibility: a => { calls.push(['essai', a.productIdentifiers.join(',')]); return Promise.resolve({ barlog_pro_monthly: { status: 1 }, barlog_pro_yearly: { status: 2 } }); },
    purchasePackage: a => { const id = a.aPackage.product.identifier; calls.push(['achat', id]); if (o.buyErr) return Promise.reject(o.buyErr);
      o.ent = { identifier: 'pro', isActive: true, productIdentifier: id, expirationDateMillis: /lifetime/.test(id) ? null : Date.now() + 30 * DAY, willRenew: true, isSandbox: true };
      return Promise.resolve({ customerInfo: ci(o.ent) }); },
    restorePurchases: () => { calls.push(['restaurer']); return Promise.resolve({ customerInfo: ci(o.ent) }); },
  };
  return { R, calls, o };
}
// Supabase simulé : appels de la fonction pro-sync, ligne pro_entitlements.
function fakeSb(app, row, err) {
  const invoked = [];
  app.sb = () => Promise.resolve({
    functions: { invoke: (name, opt) => { invoked.push(name + ' ' + opt.method); return Promise.resolve({ data: { ok: true }, error: null }); } },
    from: table => ({ select: () => ({ maybeSingle: () => Promise.resolve(err ? { data: null, error: { message: 'relation "' + table + '" does not exist' } } : { data: row, error: null }) }) }),
  });
  return invoked;
}
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

test('achats pas encore ouverts (clés vides) : Pro offert pendant la bêta, même au compte administrateur ; « Bientôt disponible »', async t => {
  const { R, calls } = fakeRC(); nativeWindow(t, 'ios', { Purchases: R });
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct, mqN: 0 });
  app.renderVals(); app.proEval(); app.rcBoot(); await settle();
  assert.equal(app.state.pro.beta, true, 'l’administrateur garde le Pro offert tant que les achats ne sont pas ouverts');
  assert.equal(calls.length, 0, 'plugin jamais configuré sans clé');
  app.need(null); await settle();
  const v = app.renderVals();
  assert.equal(v.pwCta, 'Bientôt disponible'); assert.equal(v.pwCtaOp, 0.5); v.pwBuy(); await settle();
  assert.equal(calls.length, 0);
});

test('bêta + achats ouverts : les testeurs gardent le Pro offert ; le compte administrateur voit le vrai écran d’achat', async t => {
  const { R } = fakeRC(); nativeWindow(t, 'ios', { Purchases: R });
  const B = loadBarlog(withKeys());
  const tester = makeApp(B, { ...emptyData(), lang: 'fr', acct, mqN: null });
  tester.renderVals(); tester.proEval(); tester.rcBoot(); await settle();
  assert.equal(tester.state.pro.beta, true);
  const admin = makeApp(B, { ...emptyData(), lang: 'fr', acct, mqN: 2, pro: { plan: 'beta', since: 1, beta: true } });
  admin.renderVals(); admin.proEval(); admin.rcBoot(); await settle();
  assert.equal(admin.state.pro, null, 'administrateur : pas de Pro offert, il peut acheter (achats de test gratuits)');
});

test('page des prix (iPhone) : prix de la boutique, essai seulement si on y a droit, textes d’Apple, liens Conditions et Confidentialité', async t => {
  const { R, calls } = fakeRC(); nativeWindow(t, 'ios', { Purchases: R });
  const app = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr', acct, mqN: 0 });
  app.renderVals(); app.proEval(); app.rcBoot(); await settle();
  assert.equal(calls.length, 0, 'RevenueCat pas démarré tant que la page des prix n’est pas ouverte');
  app.need('backup'); assert.equal(app.renderVals().pwCta, 'Chargement des offres…');
  await settle();
  assert.deepEqual(calls[0], ['configure', 'appl_essai', acct.uid], 'connecté : configuré directement au nom du compte');
  assert.ok(calls.some(c => c[0] === 'essai' && c[1] === 'barlog_pro_monthly,barlog_pro_yearly'));
  let v = app.renderVals();
  assert.deepEqual(v.pwPlans.map(p => [p.name, p.price, p.per.replace(/[\u00a0\u202f]/g, ' '), p.badge]), [['Mensuel', '4,99 $', 'par mois', ''], ['Annuel', '29,99 $', '2,50 $ / mois', '−50 %'], ['À vie', '79,99 $', 'une fois', '']]);
  assert.equal(v.pwCta, 'Essayer 1 mois gratuitement'); assert.equal(v.pwCtaOp, 1);
  assert.match(v.pwFine, /^Gratuit pendant 1 mois, puis 29,99 \$ \/ an, payé par ton compte Apple\. Abonnement à renouvellement automatique.*au moins 24 h avant la fin de la période en cours/);
  assert.equal(v.pwRestoreOn, true); assert.equal(v.pwTermsLabel, 'Conditions d’utilisation'); assert.equal(v.pwPrivLabel, 'Confidentialité');
  v.pwPlans[0].onClick(); v = app.renderVals();
  assert.equal(v.pwCta, 'S’abonner · 4,99 $ / mois', 'essai du mensuel déjà utilisé (Apple : ineligible) → pas de promesse d’essai');
  assert.equal(v.pwFine.startsWith('4,99 $ / mois, payé par ton compte Apple.'), true);
  v.pwPlans[2].onClick(); v = app.renderVals();
  assert.equal(v.pwCta, 'Acheter · 79,99 $'); assert.match(v.pwFine, /Paiement unique de 79,99 \$ par ton compte Apple, sans abonnement/);
});

test('achat réussi → Pro de la boutique, page fermée, serveur prévenu (pro-sync) ; Profil : « Gérer » ouvre la page des abonnements', async t => {
  const { R, calls } = fakeRC(); const opened = nativeWindow(t, 'ios', { Purchases: R });
  const app = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr', acct, mqN: 0 });
  const invoked = fakeSb(app);
  app.renderVals(); app.proEval(); app.rcBoot(); await settle();
  let after = 0; app.need('backup', () => { after++; }); await settle();
  app.renderVals().pwBuy(); await settle(); await new Promise(r => setTimeout(r, 80));
  assert.deepEqual(calls.filter(c => c[0] === 'achat'), [['achat', 'barlog_pro_yearly']]);
  assert.equal(app.state.pro.src, 'store'); assert.equal(app.state.pro.plan, 'year'); assert.equal(app.isPro(), true);
  assert.equal(app.state.pw, null); assert.equal(after, 1, 'l’action demandée reprend après l’achat');
  assert.ok(app.toasts.includes('Bienvenue dans Barlog Pro !'));
  assert.deepEqual(invoked, ['pro-sync POST']);
  const v = app.renderVals();
  assert.equal(v.proTitle, 'Pro actif · Annuel'); assert.equal(v.proBtn, 'Gérer'); assert.match(v.proSub, /^Se renouvelle le /);
  v.proCardClick(); assert.deepEqual(opened, ['https://apps.apple.com/account/subscriptions']);
  app.setState({ sure: 'del' });
  assert.match(app.renderVals().sureText, /Ton abonnement Barlog Pro n’est pas annulé pour autant : gère-le dans les réglages de ton compte Apple\./);
});

test('achat annulé → rien (page ouverte, aucun message) ; paiement en attente → message ; restaurer sans achat → message', async t => {
  const f = fakeRC({ buyErr: Object.assign(new Error('Purchase was cancelled.'), { code: '1' }) }); nativeWindow(t, 'ios', { Purchases: f.R });
  const app = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr', acct, mqN: 0 }); fakeSb(app);
  app.renderVals(); app.proEval(); app.rcBoot(); await settle();
  app.need(null); await settle(); app.renderVals().pwBuy(); await settle();
  assert.ok(app.state.pw, 'page des prix toujours ouverte'); assert.equal(app.state.pwBusy, false); assert.deepEqual(app.toasts, []); assert.equal(app.isPro(), false);
  f.o.buyErr = Object.assign(new Error('pending'), { data: { code: 20 } });
  app.renderVals().pwBuy(); await settle();
  assert.deepEqual(app.toasts, ['Paiement en attente : Barlog Pro s’activera dès qu’il sera confirmé']);
  app.renderVals().pwRestore(); await settle();
  assert.equal(app.toasts[1], 'Aucun achat Barlog Pro trouvé sur ce compte Apple');
});

test('« À vie » restauré → Pro pour toujours (✓, pas de « Gérer ») ; offre introuvable → « Réessayer »', async t => {
  const f = fakeRC({ offErr: true, ent: { identifier: 'pro', isActive: true, productIdentifier: 'barlog_pro_lifetime', expirationDateMillis: null, willRenew: false } });
  nativeWindow(t, 'ios', { Purchases: f.R });
  const app = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr', acct, mqN: 0 }); const invoked = fakeSb(app);
  app.renderVals(); app.need(null); await settle();
  let v = app.renderVals(); assert.equal(v.pwCta, 'Réessayer'); assert.equal(v.pwCtaOp, 1);
  v.pwRestore(); await settle();
  assert.deepEqual(app.state.pro, { plan: 'life', src: 'store', until: null, renew: false });
  assert.ok(app.toasts.includes('Achats restaurés : Barlog Pro est actif')); assert.deepEqual(invoked, ['pro-sync POST']);
  v = app.renderVals(); assert.equal(v.proTitle, 'Pro actif · À vie'); assert.equal(v.proBtn, '✓'); assert.equal(v.proSub, 'Merci ! Toutes les fonctions sont débloquées.');
  app.setState({ sure: 'del' }); assert.doesNotMatch(app.renderVals().sureText, /Barlog Pro/, 'achat à vie : rien à annuler');
});

test('compte : connexion d’un compte Pro (acheté ailleurs) → RevenueCat démarré à son nom ; déconnexion → logOut, Pro retiré', async t => {
  const f = fakeRC({ ent: { identifier: 'pro', isActive: true, productIdentifier: 'barlog_pro_monthly', expirationDateMillis: Date.now() + 5 * DAY, willRenew: true } });
  nativeWindow(t, 'android', { Purchases: f.R });
  const B = loadBarlog(withKeys().replace('const BETA = true;', 'const BETA = false;'));
  const app = makeApp(B, { ...emptyData(), lang: 'fr' }); fakeSb(app, { pro_until: null });
  app.renderVals(); app.rcLogin(acct.uid); app.setState({ acct }); await settle();
  assert.deepEqual(f.calls.slice(0, 2), [['configure', 'goog_essai', acct.uid], ['info']]);
  assert.equal(app.state.pro.plan, 'month');
  app.rcLogin(acct.uid); await settle(); assert.equal(f.calls.filter(c => c[0] === 'configure' || c[0] === 'logIn').length, 1, 'une seule fois par compte');
  app.acOut(); await settle();
  assert.ok(f.calls.some(c => c[0] === 'logOut')); assert.equal(app.state.pro, null);
});

test('page des prix ouverte avant la connexion : à la connexion, même client RevenueCat (logIn) et serveur prévenu si Pro', async t => {
  const f = fakeRC(); nativeWindow(t, 'ios', { Purchases: f.R });
  const app = makeApp(loadBarlog(withKeys().replace('const BETA = true;', 'const BETA = false;')), { ...emptyData(), lang: 'fr' }); const invoked = fakeSb(app, null);
  app.renderVals(); app.need(null); await settle();
  assert.deepEqual(f.calls[0], ['configure', 'appl_essai', null]);
  app.renderVals().pwBuy(); await settle();   // achat sans compte (identifiant anonyme)
  assert.equal(app.state.pro.src, 'store'); assert.deepEqual(invoked, [], 'sans compte : rien au serveur');
  app.setState({ acct }); app.rcLogin(acct.uid); await settle();
  assert.ok(f.calls.some(c => c[0] === 'logIn' && c[1] === acct.uid)); assert.deepEqual(invoked, ['pro-sync POST'], 'achat rattaché au compte → serveur prévenu');
});

test('confidentialité : sans achat, RevenueCat n’est jamais contacté (démarrage, connexion d’un compte sans Pro)', async t => {
  const f = fakeRC(); nativeWindow(t, 'ios', { Purchases: f.R });
  const app = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr' }); fakeSb(app, null);
  app.renderVals(); app.proEval(); app.rcBoot(); app.setState({ acct, mqN: null }); app.rcLogin(acct.uid); await settle();
  assert.deepEqual(f.calls, []); assert.equal(app.state.pro.beta, true);
  const g = makeApp(loadBarlog(withKeys()), { ...emptyData(), lang: 'fr', acct }); fakeSb(g, null, true);
  g.rcLogin(acct.uid); await settle(); assert.deepEqual(f.calls, [], 'serveur injoignable : RevenueCat pas démarré pour autant');
});

test('Android : essai proposé par Google sans vérification à part ; annulation expliquée pour Google Play', async t => {
  const { R, calls } = fakeRC(); nativeWindow(t, 'android', { Purchases: R });
  const app = makeApp(loadBarlog(withKeys().replace('const BETA = true;', 'const BETA = false;')), { ...emptyData(), lang: 'fr' });
  app.renderVals(); app.need(null); await settle();
  assert.equal(calls.some(c => c[0] === 'essai'), false);
  let v = app.renderVals(); assert.equal(v.pwCta, 'Essayer 1 mois gratuitement');
  assert.match(v.pwFine, /payé par ton compte Google Play\..*avant la fin de la période en cours, dans Google Play → Abonnements\.$/);
  v.pwPlans[0].onClick(); assert.equal(app.renderVals().pwCta, 'Essayer 7 jours gratuitement');
});

test('démarrage hors ligne : dernier Pro de la boutique gardé tant qu’il n’a pas expiré ; RevenueCat a le dernier mot', async t => {
  const f = fakeRC(); nativeWindow(t, 'ios', { Purchases: f.R });
  const B = loadBarlog(withKeys().replace('const BETA = true;', 'const BETA = false;'));
  const live = { plan: 'year', src: 'store', until: Date.now() + DAY, renew: true };
  const a = makeApp(B, { ...emptyData(), pro: live }); a.proEval(); assert.deepEqual(a.state.pro, live);
  const b = makeApp(B, { ...emptyData(), pro: { ...live, until: Date.now() - 1 } }); b.proEval(); assert.equal(b.state.pro, null);
  a.rcBoot(); await settle(); assert.equal(a.state.pro, null, 'RevenueCat : plus de droit (abonnement annulé) → Pro retiré');
  f.R.listener({ entitlements: { active: { pro: { isActive: true, productIdentifier: 'barlog_pro_lifetime', expirationDateMillis: null } } } });
  assert.equal(a.state.pro.plan, 'life', 'achat arrivé app ouverte (écouteur RevenueCat)');
});

test('vrai site : on n’achète pas (« Disponible dans l’app »), le Pro simulé disparaît, le Pro acheté dans l’app est reconnu une fois connecté', async t => {
  delete globalThis.window; site(t, 'https://hugolpr07.github.io/Gym-app/');
  const B = loadBarlog();
  const app = makeApp(B, { ...emptyData(), lang: 'fr' });
  const prev = globalThis.localStorage; t.after(() => { if (prev) globalThis.localStorage = prev; else delete globalThis.localStorage; });
  globalThis.localStorage = { getItem: () => JSON.stringify({ ...emptyData(), pro: { plan: 'year', test: true } }), setItem() {}, removeItem() {} };
  app.nativeBoot = () => Promise.resolve(); app.pushListen = () => {}; app.checkUpdate = () => {}; app.loadMedia = () => {};
  globalThis.window = { navigator: {}, addEventListener() {}, matchMedia: () => ({ matches: false }) }; globalThis.document = globalThis.document || { addEventListener() {}, visibilityState: 'visible' };
  try { app.componentDidMount(); } finally { clearInterval(app.iv); }
  delete globalThis.window;
  app.renderVals(); assert.equal(app.state.pro, null, 'au démarrage du vrai site, le Pro simulé disparaît');
  app.need(null); let v = app.renderVals();
  assert.equal(v.pwCta, 'Disponible dans l’app iPhone et Android'); assert.equal(v.pwCtaOp, 0.5); assert.equal(v.pwRestoreOn, false);
  assert.match(v.pwFine, /Déjà Pro \? Connecte-toi ici au même compte Barlog\./);
  v.pwBuy(); assert.equal(app.state.pro, null);
  const c = { from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { pro_until: null }, error: null }) }) }) };
  app.proSrvLoad(c); await settle();
  assert.deepEqual(app.state.pro, { plan: 'app', src: 'server', until: null });
  v = app.renderVals(); assert.equal(v.proTitle, 'Pro actif · acheté dans l’app'); assert.equal(v.proBtn, '✓');
  const old = { from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { pro_until: new Date(Date.now() - DAY).toISOString() }, error: null }) }) }) };
  app.proSrvLoad(old); await settle(); assert.equal(app.state.pro, null, 'droit expiré → plus de Pro');
  app.proSrvSet({ until: null });
  const down = { from: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'panne' } }) }) }) };
  app.proSrvLoad(down); await settle(); assert.equal(app.state.pro.src, 'server', 'serveur injoignable → droit déjà connu gardé');
  app.proOut(); assert.equal(app.state.pro, null, 'déconnexion → plus de Pro sur le site');
});

test('site de test (/dev/) : achats simulés toujours possibles', async t => {
  delete globalThis.window; site(t, 'https://hugolpr07.github.io/Gym-app/dev/');
  const app = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr' });
  app.renderVals(); app.need(null); const v = app.renderVals();
  assert.equal(v.pwCta, 'S’abonner · 29,99 $ / an (test)'); assert.equal(v.pwRestoreOn, true);
  v.pwBuy(); assert.equal(app.state.pro.test, true); assert.equal(app.state.pro.plan, 'year');
});
