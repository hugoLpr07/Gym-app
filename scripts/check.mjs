#!/usr/bin/env node
// Contrôle de l'app web Barlog avant commit / publication — Node 20+, aucune dépendance, aucun accès réseau.
//   node scripts/check.mjs [dossier de l'app]     (par défaut : le dossier parent de scripts/)
// Code de sortie : 0 = tout est bon, 1 = au moins un contrôle a échoué (message et ligne de Barlog.dc.html affichés).
//
// Reproduit le démarrage réel de l'app par support.js :
//   - parseDcText : gabarit = contenu de <x-dc>…</x-dc> ; code = textContent du premier <script data-dc-script>
//     (<script> est une balise « texte brut » : le navigateur NE décode PAS les entités HTML, on lit donc le texte tel quel) ;
//   - evalDcLogic : new Function('DCLogic', 'StreamableLogic', 'React', code + 'return Component') doit renvoyer une classe.
//   Babel n'est pas utilisé pour ce script (support.js ne s'en sert que pour les <x-import> .jsx) ni embarqué : aucun <x-import> autorisé.
// Puis : premier rendu des données (renderVals) sous Node, et sw.js (syntaxe + fichiers du cache hors ligne).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const ROOT = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const HTML = join(ROOT, 'Barlog.dc.html'), SW = join(ROOT, 'sw.js');
globalThis.fetch = () => { throw new Error('accès réseau pendant le contrôle'); };

let failed = 0; const t0 = performance.now(); const ctx = {};
function step(name, fn) {
  const t = performance.now();
  try { const info = fn(); console.log(`✔ ${name}${info ? ' — ' + info : ''} (${(performance.now() - t).toFixed(0)} ms)`); return true; }
  catch (e) { failed++; console.log(`✖ ${name}\n    ${String(e && e.message || e).split('\n').join('\n    ')}`); return false; }
}
const fail = msg => { throw new Error(msg); };
const lineAt = (s, i) => s.slice(0, i).split('\n').length;

step('Barlog.dc.html lisible', () => {
  if (!existsSync(HTML)) fail(`fichier introuvable : ${HTML}`);
  ctx.html = readFileSync(HTML, 'utf8');
  return `${(ctx.html.length / 1024).toFixed(0)} Ko`;
});

ctx.html && step('Gabarit <x-dc>…</x-dc> présent et fermé (parseDcText)', () => {
  const h = ctx.html; const open = /<x-dc(?:\s[^>]*)?>/.exec(h);
  if (!open) fail('aucune balise <x-dc> : support.js ne trouvera pas l’app (écran vide)');
  const close = h.lastIndexOf('</x-dc>');
  if (close < open.index) fail(`<x-dc> ouvert ligne ${lineAt(h, open.index)} mais jamais fermé par </x-dc>`);
  const tpl = h.slice(open.index + open[0].length, close);
  let holes = 0; // chaque « {{ » doit être fermé par « }} » avant le « {{ » suivant (sinon affiché tel quel)
  for (let i = tpl.indexOf('{{'); i >= 0; i = tpl.indexOf('{{', i + 2)) {
    holes++; const j = tpl.indexOf('}}', i + 2), k = tpl.indexOf('{{', i + 2);
    if (j < 0 || (k >= 0 && k < j)) fail(`liaison « {{ » jamais fermée, ligne ${lineAt(h, open.index + open[0].length + i)}`);
  }
  ctx.closeAt = close;
  return `lignes ${lineAt(h, open.index)}–${lineAt(h, close)}, ${holes} liaisons`;
});

ctx.html && step('Politique de sécurité (CSP) : en tête, empreinte de chaque script intégré, Supabase autorisé', () => {
  const h = ctx.html.replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length));   // commentaires ignorés, positions gardées
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/i.exec(h);
  // Exigée depuis 0.36.0 ; GitHub Actions contrôle aussi main avec ce script : une version plus ancienne passe sans CSP.
  const v = (/const APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/.exec(ctx.html) || []).slice(1).map(Number);
  if (!m && v.length && v[0] === 0 && v[1] < 36) return `absente (version ${v.join('.')}, antérieure à 0.36.0 : toléré)`;
  if (!m) fail('balise <meta http-equiv="Content-Security-Policy"> absente');
  const first = h.search(/<script\b/i);
  if (first >= 0 && first < m.index) fail('la CSP doit précéder tout <script> (sinon elle ne le couvre pas)');
  const csp = Object.fromEntries(m[1].split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v]));
  for (const [k, v] of [['object-src', "'none'"], ['base-uri', "'none'"], ['default-src', "'self'"]]) if (!(csp[k] || []).includes(v)) fail(`CSP : ${k} ${v} manquant`);
  const sb = /SB_URL = '([^']+)'/.exec(ctx.html); if (!sb) fail('SB_URL introuvable');
  if (!(csp['connect-src'] || []).includes(sb[1])) fail(`CSP : connect-src doit autoriser ${sb[1]} (Supabase)`);
  // Scripts exécutés par le navigateur et écrits dans la page (ni src, ni type text/x-dc) : chacun doit avoir son empreinte.
  const inl = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(x => !/\bsrc\s*=/.test(x[1]) && !/type\s*=\s*"text\/x-dc"/.test(x[1]));
  for (const x of inl) {
    const sum = "'sha256-" + createHash('sha256').update(ctx.html.slice(x.index + x[0].indexOf('>') + 1, x.index + x[0].lastIndexOf('</'))).digest('base64') + "'";
    if (!(csp['script-src'] || []).includes(sum)) fail(`script intégré ligne ${lineAt(h, x.index)} modifié : remplacer son empreinte dans script-src par ${sum}`);
  }
  return `${inl.length} script(s) intégré(s), connect-src : ${csp['connect-src'].join(' ')}`;
});

ctx.closeAt && step('Script <script data-dc-script> unique, après le gabarit', () => {
  const h = ctx.html; const tags = [...h.matchAll(/<script\b[^>]*\bdata-dc-script\b[^>]*>/gi)];
  if (tags.length !== 1) fail(`${tags.length} balises <script data-dc-script> (il en faut exactement 1)`);
  const start = tags[0].index + tags[0][0].length;
  if (tags[0].index < ctx.closeAt) fail('le <script data-dc-script> est à l’intérieur de <x-dc>…</x-dc>');
  const end = h.slice(start).search(/<\/script[\s/>]/i);
  if (end < 0) fail('<script data-dc-script> jamais fermé par </script>');
  ctx.js = h.slice(start, start + end); ctx.jsLine = lineAt(h, start);
  if (ctx.js.includes('<!--')) fail(`le script contient « <!-- » (ligne ${ctx.jsLine - 1 + lineAt(ctx.js, ctx.js.indexOf('<!--'))}) : le navigateur peut couper le script ailleurs`);
  return `lignes ${ctx.jsLine}–${ctx.jsLine - 1 + lineAt(ctx.js, ctx.js.length)}`;
});

ctx.html && step('Aucun <x-import> (Babel n’est pas embarqué)', () => {
  const i = ctx.html.search(/<x-import\b/i);
  if (i >= 0) fail(`<x-import> ligne ${lineAt(ctx.html, i)} : support.js chargerait Babel depuis unpkg.com (appel externe). Remettre Babel dans vendor/, window.__resources et sw.js, ou s’en passer`);
});

class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(u, cb) { this.state = { ...this.state, ...(typeof u === 'function' ? u(this.state) : u) }; if (cb) cb(); } forceUpdate() {} renderVals() { return {}; } }
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'Fragment' };

ctx.js != null && step('Script compilé et évalué comme support.js (evalDcLogic) → class Component extends DCLogic', () => {
  try { new vm.Script(`(function (DCLogic, StreamableLogic, React) {${ctx.js}\n})`, { filename: 'Barlog.dc.html', lineOffset: ctx.jsLine - 1 }); }
  catch (e) { fail(`${e.name} : ${e.message}\n` + String(e.stack).split('\n').slice(0, 3).join('\n')); }
  const Cls = new Function('DCLogic', 'StreamableLogic', 'React', ctx.js + '\n;return (typeof Component!=="undefined"&&Component)||undefined;')(DCLogic, DCLogic, React);
  if (typeof Cls !== 'function') fail('le script doit définir `class Component extends DCLogic` (sinon l’app s’affiche sans logique)');
  if (!(Cls.prototype instanceof DCLogic)) fail('Component n’hérite pas de DCLogic');
  ctx.Component = Cls;
  const v = /APP_VERSION\s*=\s*'([^']+)'/.exec(ctx.js);
  if (!v || !/^\d+\.\d+\.\d+$/.test(v[1])) fail('APP_VERSION absente ou pas au format MAJEUR.MINEUR.CORRECTIF');
  return `version ${v[1]}`;
});

ctx.Component && step('Premier rendu des données (renderVals) : Aujourd’hui, Programmes, Progrès, Profil, séance', () => {
  const app = new ctx.Component({});
  for (const tab of ['today', 'programs', 'progress', 'profile']) {
    app.state = { ...app.state, tab, screen: 'tabs' };
    try { app.renderVals(); } catch (e) { fail(`onglet « ${tab} » : ${e.message}\n(si c’est une API du navigateur absente sous Node, la protéger par try/catch ou la simuler ici)`); }
  }
  app.unlockAudio = () => {}; app.start(app.state.routines[0].id, true);
  try { app.renderVals(); } catch (e) { fail(`écran séance : ${e.message}`); }
  return `${Object.keys(app.renderVals()).length} valeurs`;
});

step('sw.js : syntaxe (node --check)', () => {
  if (!existsSync(SW)) fail(`fichier introuvable : ${SW}`);
  const r = spawnSync(process.execPath, ['--check', SW], { encoding: 'utf8' });
  if (r.status !== 0) fail(r.stderr.trim());
});

existsSync(SW) && step('sw.js : chaque fichier du cache hors ligne (CORE) existe', () => {
  const src = readFileSync(SW, 'utf8'); const m = /const CORE\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) fail('liste CORE introuvable dans sw.js');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  const missing = files.filter(f => !existsSync(join(ROOT, f === './' ? 'index.html' : f)));
  if (missing.length) fail(`absents : ${missing.join(', ')} → le cache hors ligne échoue en silence`);
  const res = ctx.html ? [...ctx.html.matchAll(/:\s*'(vendor\/[^']+)'/g)].map(x => x[1]) : [];
  const notCached = res.filter(f => !files.includes('./' + f));
  if (notCached.length) fail(`fichiers vendor/ chargés par l’app mais absents de CORE : ${notCached.join(', ')}`);
  return `${files.length} fichiers, cache ${(/const C\s*=\s*'([^']+)'/.exec(src) || [])[1] || '?'}`;
});

const ms = (performance.now() - t0).toFixed(0);
console.log(failed ? `\n✖ ${failed} contrôle(s) en échec (${ms} ms) — ne pas publier.` : `\n✔ Tout est bon (${ms} ms).`);
process.exit(failed ? 1 : 0);
