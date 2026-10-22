// Harnais de test Barlog : charge le VRAI code de Barlog.dc.html sous Node (>= 20), sans navigateur ni dépendance npm.
//
// Il reproduit exactement ce que fait support.js au lancement de l'app :
//   1. parseDcText / parseDcDocument : le code = texte du premier <script data-dc-script> (balise « raw text » :
//      aucune entité HTML décodée, fin au premier « </script »).
//   2. evalDcLogic : new Function('DCLogic', 'StreamableLogic', 'React', src + 'return Component').
//      (Babel n'intervient PAS ici : support.js ne s'en sert que pour les <x-import> .jsx.)
// On ajoute seulement un « return { ... } » qui expose aussi quelques fonctions de haut niveau (parseLifts…).
//
// Emplacement de Barlog.dc.html, dans l'ordre : variable BARLOG_HTML, ../Barlog.dc.html (si ce dossier est copié
// dans Gym-app/tests/), variable GYM_APP, puis ~/Desktop/Gym-app.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = process.env.BARLOG_HTML
  || (existsSync(join(HERE, '..', 'Barlog.dc.html')) ? join(HERE, '..', 'Barlog.dc.html')
    : join(process.env.GYM_APP || join(homedir(), 'Desktop', 'Gym-app'), 'Barlog.dc.html'));

// Garde-fou : aucun test ne doit toucher le réseau (Supabase, Firebase…). Les frontières réseau se simulent.
globalThis.fetch = () => { throw new Error('Réseau interdit dans les tests Barlog : simuler la frontière (ex. app.sb).'); };

/** Texte du premier <script data-dc-script>, comme support.js. Renvoie aussi sa 1re ligne dans le fichier HTML. */
export function extractDcScript(html) {
  const open = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(html);
  if (!open) throw new Error('Barlog.dc.html : aucun <script data-dc-script>');
  const start = open.index + open[0].length;
  const end = html.slice(start).search(/<\/script[\s/>]/i);
  if (end < 0) throw new Error('Barlog.dc.html : <script data-dc-script> jamais fermé');
  return { js: html.slice(start, start + end), line: html.slice(0, start).split('\n').length };
}

/** Faux DCLogic, calqué sur StreamableLogic de support.js : l'état de la logique est mis à jour TOUT DE SUITE
 *  (comme __setLogicState), le rappel est appelé après (ici immédiatement). Pas de componentDidUpdate
 *  → ni sauvegarde locale ni envoi en ligne déclenchés par les tests. */
export class FakeDCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    if (cb) cb();
  }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() { return {}; }
}

/** React minimal : seul createElement est utilisé par le script (carte du corps). */
export const FakeReact = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'Fragment' };

// Symboles de haut niveau exposés aux tests. S'il en manque un (renommé), seul le test qui s'en sert échoue.
const EXPOSE = ['Component', 'PK', 'CB_SKIP', 'CB_SET', 'KG_LB', 'DAY', 'APP_VERSION', 'LIB', 'e1', 'nSess', 'bodyOut',
  'csvRows', 'parseDT', 'parseDur', 'numV', 'mapEx', 'parseLifts', 'mergeLifts', 'autoType'];

/** Charge une copie neuve du code (≈ 3 ms) : chaque test a ses propres variables de module (LANG, ACC…). */
export function loadBarlog(html = readFileSync(HTML_PATH, 'utf8')) {
  const { js } = extractDcScript(html);
  const ret = '\n;return {' + EXPOSE.map(n => `${JSON.stringify(n)}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ') + '};';
  // eslint-disable-next-line no-new-func — même évaluation que support.js (evalDcLogic)
  const mod = new Function('DCLogic', 'StreamableLogic', 'React', js + ret)(FakeDCLogic, FakeDCLogic, FakeReact);
  return new Proxy(mod, {
    get(o, k) {
      if (typeof k === 'string' && EXPOSE.includes(k) && o[k] === undefined)
        throw new Error(`« ${k} » introuvable dans Barlog.dc.html (renommé ou supprimé ?) : adapter harness.mjs / le test.`);
      return o[k];
    },
  });
}

/** Données vides mais valides (sans les séances de démonstration de initial()). */
export const emptyData = () => ({ routines: [], history: {}, sessMeta: {}, custom: [], exMeta: {}, body: [],
  lastRoutineId: null, workout: null, focus: null, onboarded: true });

/** Instance de Component prête à tester. Frontières neutralisées : réseau (sb), toasts, vibrations, sons. */
export function makeApp(B, state = {}, props = {}) {
  const app = new B.Component(props);
  app.state = { ...app.state, ...state };
  app.toasts = [];
  app.flash = msg => { app.toasts.push(msg); };
  app.buzz = () => {};
  app.tone = () => {};
  app.unlockAudio = () => {};
  app.sb = () => Promise.reject(new Error('Supabase interdit dans les tests : remplacer app.sb dans le test.'));
  return app;
}

/** Laisse s'exécuter toutes les promesses en attente. */
export const flush = () => new Promise(r => setImmediate(r));

/** Faux sélecteur de fichier pour importData / importLifts / importBody (document.createElement('input')). */
export function fakeFilePicker(t) {
  const had = 'document' in globalThis; const prev = globalThis.document;
  const input = { click() {} };
  globalThis.document = { createElement: () => input };
  t.after(() => { if (had) globalThis.document = prev; else delete globalThis.document; });
  return { choose(text) { input.files = [{ text: () => Promise.resolve(text) }]; input.onchange(); } };
}
