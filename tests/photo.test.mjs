// Photo de profil (0.51.0) : fenêtre de recadrage (glisser, pincer, curseur de zoom) avant l'envoi, et sur iPhone le
// sélecteur de photos d'Apple (plugin BarlogPhoto) à la place de la grille du plugin Camera (toutes les photos, sans albums).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBarlog, makeApp, emptyData, flush } from './harness.mjs';

const ACCT = { uid: 'u1', email: 'a@b.c', profile: { username: 'alex', terms_v: 1, default_visibility: 'followers' } };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} : ${a} ≠ ${b}`);

// Navigateur simulé : Image (dimensions choisies par le test), adresses blob, canvas qui note drawImage, fetch, plugins.
function browser(t, { w = 1600, h = 1200, plugins = null, platform = 'ios' } = {}) {
  const log = { draws: [], revoked: [], fetched: [] };
  const saved = {};
  const put = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }); };
  put('Image', class { set src(u) { this._u = u; queueMicrotask(() => { this.naturalWidth = w; this.naturalHeight = h; (w > 0 ? this.onload : this.onerror)(); }); } });
  let n = 0;
  put('URL', { createObjectURL: () => 'blob:photo-' + (++n), revokeObjectURL: u => log.revoked.push(u) });
  put('document', { createElement: k => k === 'canvas'
    ? { getContext: () => ({ fillRect() {}, drawImage: (...a) => log.draws.push(a.slice(1)) }), toBlob: cb => cb('JPEG640') }
    : { click() {}, setAttribute() {} } });
  put('fetch', async u => { log.fetched.push(u); return { blob: async () => 'BLOB:' + u }; });
  put('window', plugins ? { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins, convertFileSrc: u => u } } : {});
  t.after(() => { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  return log;
}

// Supabase simulé : note l'envoi dans avatars/ et la mise à jour du profil.
function fakeSb(app) {
  const calls = [];
  const c = {
    storage: { from: b => ({ upload: async (p, body) => { calls.push(['upload', b, p, body]); return { error: null }; },
      list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    from: tb => ({ update: v => ({ eq: async (k, id) => { calls.push(['update', tb, v.avatar, id]); return { error: null }; } }) }),
  };
  app.sb = () => Promise.resolve(c);
  return calls;
}

const mk = (state) => { const a = makeApp(loadBarlog(), { ...emptyData(), lang: 'fr', acct: ACCT, ...state }); a.renderVals(); return a; };   // renderVals règle LANG

test('calcul : au départ, le plus grand carré centré (comme avant) ; zoom borné ; jamais de vide dans le cercle', () => {
  const B = loadBarlog();
  const c = B.avcFix({ w: 1600, h: 1200, z: 1, cx: NaN, cy: NaN });
  assert.deepEqual(B.avcRect(c), { x: 200, y: 0, s: 1200 }, 'même carré que l’ancien découpage automatique');
  near(B.avcMax(c), 3.75, 'carré d’au moins 320 px de l’image');
  assert.equal(B.avcMax({ w: 4000, h: 3000 }), 5, 'zoom limité à 5');
  assert.equal(B.avcMax({ w: 300, h: 200 }), 1, 'petite image : pas de zoom');
  assert.equal(B.avcFix({ ...c, z: 9 }).z, 3.75);
  assert.equal(B.avcFix({ ...c, z: 0.2 }).z, 1);
  const far = B.avcRect(B.avcFix({ ...c, z: 2, cx: 5000, cy: -50 }));
  assert.deepEqual(far, { x: 1000, y: 0, s: 600 }, 'carré ramené dans l’image');
});

test('calcul : glisser déplace la photo avec le doigt ; pincer zoome autour du point entre les doigts', () => {
  const B = loadBarlog();
  const c = B.avcFix({ w: 1600, h: 1200, z: 1, cx: NaN, cy: NaN });
  // Doigt vers la droite d'un dixième du cadre → la photo suit : on voit plus de sa partie gauche.
  near(B.avcMove(c, 0.5, 0.5, 0.6, 0.5, 1).cx, 800 - 0.1 * 1200);
  near(B.avcMove(c, 0.5, 0.5, 2, 0.5, 1).cx, 600, 'bord gauche de l’image : arrêt');
  near(B.avcMove(c, 0.5, 0.5, 0.5, 0.9, 1).cy, 600, 'photo 4:3 au zoom 1 : pas de déplacement vertical possible');
  // Pincer ×2 autour du coin haut gauche du cercle (0.25, 0.25) : ce point de la photo reste sous les doigts.
  const z = B.avcMove(c, 0.25, 0.25, 0.25, 0.25, 2);
  near(z.z, 2);
  const pt = (k, fx, fy) => [k.cx + (fx - 0.5) * (1200 / k.z), k.cy + (fy - 0.5) * (1200 / k.z)];
  assert.deepEqual(pt(z, 0.25, 0.25).map(Math.round), pt(c, 0.25, 0.25).map(Math.round));
  near(B.avcMove(z, 0.5, 0.5, 0.5, 0.5, 100).z, 3.75, 'zoom maximal');
});

test('photo choisie → fenêtre de recadrage ; « Utiliser » sans toucher envoie le carré centré en 640 px', async t => {
  const log = browser(t, { plugins: null });
  const app = mk();
  const calls = fakeSb(app);
  app.avSet('FICHIER'); await flush();
  const v = app.renderVals();
  assert.equal(v.avcOn, true);
  assert.equal(v.avcImg, "url('blob:photo-1')");
  assert.deepEqual([v.avcW, v.avcH, v.avcL, v.avcT], ['133.33%', '100%', '-16.67%', '0%'], 'photo 4:3 qui couvre le cercle, centrée');
  assert.equal(v.avcZoomOn, true); assert.equal(v.avcZv, 0);
  assert.equal(calls.length, 0, 'rien n’est envoyé avant « Utiliser »');
  v.avcGo(); await flush(); await flush();
  assert.deepEqual(log.draws, [[200, 0, 1200, 1200, 0, 0, 640, 640]]);
  assert.equal(app.state.avCrop, null, 'fenêtre fermée');
  assert.deepEqual(log.revoked, ['blob:photo-1'], 'image libérée');
  assert.equal(calls[0][0], 'upload'); assert.equal(calls[0][1], 'avatars'); assert.match(calls[0][2], /^u1\/\d+\.jpg$/); assert.equal(calls[0][3], 'JPEG640');
  assert.deepEqual(calls[1], ['update', 'profiles', calls[0][2], 'u1']);
  assert.equal(app.state.acct.profile.avatar, calls[0][2]);
  assert.equal(app.state.avBusy, false);
  assert.deepEqual(app.toasts, ['Photo mise à jour']);
});

test('recadrage : glisser, pincer à deux doigts et curseur de zoom changent le carré envoyé', async t => {
  const log = browser(t);
  const app = mk(); fakeSb(app);
  app.avSet('FICHIER'); await flush();
  const box = { getBoundingClientRect: () => ({ left: 10, top: 100, width: 300, height: 300 }) };
  const area = { setPointerCapture() {}, querySelector: q => q === '[data-avc]' ? box : null };
  const ev = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, currentTarget: area });
  const p = app.renderVals().avcPtr;
  // Un doigt glisse de 30 px vers la droite (un dixième du cadre de 300 px).
  p.down(ev(1, 160, 250)); p.move(ev(1, 190, 250)); p.up(ev(1, 190, 250));
  near(app.state.avCrop.cx, 680);
  p.move(ev(1, 400, 250)); near(app.state.avCrop.cx, 680, 'doigt levé : un déplacement de la souris sans clic ne bouge rien');
  // Deux doigts écartés du double autour du centre du cadre (160, 250).
  p.down(ev(1, 110, 250)); p.down(ev(2, 210, 250));
  p.move(ev(1, 60, 250)); p.move(ev(2, 260, 250));
  p.up(ev(1, 60, 250)); p.up(ev(2, 260, 250));
  near(app.state.avCrop.z, 2, 'écart 100 → 150 puis 200 px : ×2');
  near(app.state.avCrop.cx, 680, 'zoom autour du point entre les doigts');
  assert.equal(app.renderVals().avcZv, Math.round(100 * Math.log(2) / Math.log(3.75)));
  // Curseur tout à droite = zoom maximal, autour du centre.
  app.renderVals().avcZoom({ target: { value: '100' } });
  near(app.state.avCrop.z, 3.75); near(app.state.avCrop.cx, 680);
  app.renderVals().avcGo(); await flush(); await flush();
  const s = 1200 / 3.75;
  assert.deepEqual(log.draws[0].map(x => Math.round(x)), [Math.round(680 - s / 2), Math.round(600 - s / 2), Math.round(s), Math.round(s), 0, 0, 640, 640]);
});

test('« Annuler » et le bouton retour d’Android ferment le recadrage sans rien envoyer', async t => {
  const log = browser(t);
  const app = mk(); const calls = fakeSb(app);
  app.avSet('FICHIER'); await flush();
  app.renderVals().avcNo();
  assert.equal(app.state.avCrop, null); assert.equal(app.renderVals().avcOn, false);
  app.avSet('FICHIER'); await flush();
  assert.equal(app.goBack(), true);
  assert.equal(app.state.avCrop, null);
  await flush();
  assert.deepEqual(log.revoked, ['blob:photo-1', 'blob:photo-2']);
  assert.equal(calls.length, 0); assert.equal(app.state.avBusy, undefined);
});

test('image illisible : message sous la photo, pas de fenêtre', async t => {
  browser(t, { w: 0, h: 0 });
  const app = mk();
  app.avSet('FICHIER'); await flush();
  assert.equal(app.state.avCrop, undefined);
  assert.deepEqual(app.state.acE, { k: 'av', m: 'Image illisible' });
});

test('iPhone, galerie : sélecteur d’Apple (BarlogPhoto), pas la grille du plugin Camera ; annuler = rien', async t => {
  const asked = [];
  let answer = { ok: true, webPath: 'capacitor://localhost/_capacitor_file_/tmp/barlog-photo-1.jpg' };
  const plugins = {
    BarlogPhoto: { pick: async o => { asked.push(['pick', o]); return answer; } },
    Camera: { takePhoto: async o => { asked.push(['takePhoto', o]); return { webPath: 'cam.jpg' }; }, chooseFromGallery: async () => { asked.push(['gallery']); return { results: [] }; } },
  };
  const log = browser(t, { plugins });
  const app = mk();
  app.avPick(); await flush(); await flush();
  assert.deepEqual(asked, [['pick', { side: 1600 }]]);
  assert.deepEqual(log.fetched, [answer.webPath]);
  assert.equal(app.state.avCrop.w, 1600, 'fenêtre de recadrage ouverte');
  app.avCropEnd();
  answer = { ok: false, cancel: true }; app.avPick(); await flush(); await flush();
  assert.equal(app.state.avCrop, null); assert.equal(app.state.acE, null, 'annuler : aucun message');
  answer = { ok: false, why: 'photo illisible' }; app.avPick(); await flush(); await flush();
  assert.deepEqual(app.state.acE, { k: 'av', m: 'Photo impossible : photo illisible' });
  // Appareil photo : toujours le plugin Camera, en 1600 px (proportions gardées) pour rester net quand on zoome.
  asked.length = 0; app.setState({ acE: null }); app.avPick(true); await flush(); await flush();
  assert.deepEqual(asked, [['takePhoto', { quality: 90, targetWidth: 1600, targetHeight: 1600, correctOrientation: true }]]);
  assert.ok(app.state.avCrop, 'photo prise → recadrage aussi');
});

test('Android (pas de BarlogPhoto) : galerie = sélecteur du plugin Camera, comme avant', async t => {
  const asked = [];
  const plugins = { Camera: { takePhoto: async () => null, chooseFromGallery: async o => { asked.push(o); return { results: [{ webPath: 'g.jpg' }] }; } } };
  browser(t, { plugins, platform: 'android' });
  const app = mk();
  app.avPick(); await flush(); await flush();
  assert.deepEqual(asked, [{ allowMultipleSelection: false, limit: 1 }]);
  assert.ok(app.state.avCrop);
  app.avPick(); await flush();
  assert.equal(asked.length, 1, 'recadrage ouvert : pas de 2ᵉ sélecteur');
});

test('recadrage fermé en changeant d’écran ou en se déconnectant', async t => {
  browser(t);
  const app = mk({ screen: 'tabs', tab: 'profile' });
  app.avSet('FICHIER'); await flush();
  const prev = app.state;
  app.state = { ...app.state, tab: 'feed' };
  app.componentDidUpdate({}, prev);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(app.state.avCrop, null);
  app.avSet('FICHIER'); await flush(); assert.ok(app.state.avCrop);
  const prev2 = app.state;
  app.state = { ...app.state, acct: null };
  app.componentDidUpdate({}, prev2);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(app.state.avCrop, null, 'déconnecté : fenêtre fermée');
});
